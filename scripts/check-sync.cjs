#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/sync.js'), 'utf8');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const item = label => [{ id: label, title: label, url: 'https://example.com' }];
function server() {
  const docs = {};
  let revision = 0;
  const api = { docs, offline: false, calls: [], beforePush: null,
    put(key, value) {
      docs[key] = { rev: ++revision, updatedAt: revision, payload: value === undefined ? '' : JSON.stringify(value) };
    },
    async fetch(url, opts) {
      api.calls.push({ url, ...copy({ method: opts.method, body: opts.body }) });
      if (api.offline) throw new Error('offline');
      let body;
      if (url.endsWith('/auth/login')) body = { token: 'secret-token', user: { email: 'test@example.com', userId: 'u1' } };
      else if (opts.method === 'GET') body = { docs: copy(docs), serverTime: revision };
      else {
        if (api.beforePush) { const cb = api.beforePush; api.beforePush = null; await cb(); }
        const { ops } = JSON.parse(opts.body);
        body = { results: ops.map(op => {
          if ((docs[op.key]?.rev || 0) !== op.baseRev) return { key: op.key, conflict: true, serverDoc: copy(docs[op.key]) };
          if (op.payload === '') api.put(op.key, undefined); else api.put(op.key, JSON.parse(op.payload));
          return { key: op.key, newRev: docs[op.key].rev };
        }), serverTime: revision };
      }
      return { ok: true, status: 200, json: async () => body };
    }
  };
  return api;
}
function client(api, initial = {}, shared) {
  const store = shared || copy(initial);
  const options = { failBackups: false };
  const sandbox = { console, AbortController, setTimeout: () => 1, clearTimeout() {},
    fetch: (...args) => api.fetch(...args),
    chrome: { storage: { local: {
      async get(keys) { return copy(Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]]))); },
      async set(values) {
        if (options.failBackups && 'lt.syncbackups' in values) throw new Error('quota');
        Object.assign(store, copy(values));
      },
      async remove(keys) { keys.forEach(key => delete store[key]); }
    } } }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'sync.js' });
  return { sync: sandbox.LT_SYNC, store, options };
}
const login = c => c.sync.login('test@example.com', 'test-password');
const pending = c => c.sync.getState().conflicts['lt.items'];
const choose = (c, choice) => { const p = pending(c); return c.sync.resolveConflict('lt.items', choice, p.rev, p.local); };
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('first login preserves both copies and persists recovery without credentials', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local'), 'lt.schema': 5 });
  assert.equal((await login(c)).ok, true);
  assert.deepEqual(c.store['lt.items'], item('local'));
  assert.equal(c.sync.getState().status, 'conflict');
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'cloud');
  const backup = await c.sync.getBackup(c.sync.getState().backups[0].id);
  assert.deepEqual(copy(backup.items), item('local'));
  assert.equal(backup.schema, 5);
  assert(!JSON.stringify(backup).includes('secret-token'));
  assert(!JSON.stringify(c.store['lt.syncbackups']).includes('test-password'));
  const reloaded = client(s, {}, c.store);
  await reloaded.sync.init(); await reloaded.sync.syncNow();
  assert(pending(reloaded)); assert.deepEqual(reloaded.store['lt.items'], item('local'));
});

test('cloud choice saves local backup; restore logs out and does not alter cloud', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local'), 'lt.schema': 5 });
  await login(c); const id = c.sync.getState().backups[0].id;
  assert.equal((await choose(c, 'cloud')).ok, true);
  assert.deepEqual(c.store['lt.items'], item('cloud'));
  const calls = s.calls.length;
  assert.equal((await c.sync.restoreBackup(id)).ok, true);
  assert.deepEqual(c.store['lt.items'], item('local'));
  assert.equal(c.sync.getState().loggedIn, false);
  await c.sync.syncNow(); assert.equal(s.calls.length, calls);
  const beforeRestore = await c.sync.getBackup(c.sync.getState().backups[0].id);
  assert.deepEqual(copy(beforeRestore.items), item('cloud'));
});

test('local choice uploads with CAS and retains displaced cloud copy', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local') }); await login(c);
  assert.equal((await choose(c, 'local')).ok, true);
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'local');
  const entry = c.sync.getState().backups.find(b => b.reason === 'cloud-copy');
  assert.deepEqual(copy((await c.sync.getBackup(entry.id)).items), item('cloud'));
  assert.equal(pending(c), undefined);
});

test('changed cloud preview requires another choice', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local') }); await login(c);
  s.put('lt.items', item('new-cloud'));
  assert.equal((await choose(c, 'cloud')).error, 'sync.err.stale');
  assert.deepEqual(c.store['lt.items'], item('local'));
  assert.equal(JSON.parse(pending(c).payload)[0].id, 'new-cloud');
});

test('changed local preview cannot be overwritten by a stale choice', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local') }); await login(c);
  const old = pending(c);
  await c.sync.writeLocal('lt.items', item('new-local'));
  assert.equal((await c.sync.resolveConflict('lt.items', 'cloud', old.rev, old.local)).error, 'sync.err.stale');
  assert.deepEqual(c.store['lt.items'], item('new-local'));
});

test('two devices changing the same document never auto-resolve by clock', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const a = client(s, { 'lt.items': item('base') }), b = client(s, { 'lt.items': item('base') });
  await login(a); await login(b);
  await a.sync.writeLocal('lt.items', item('a')); await a.sync.syncNow();
  await b.sync.writeLocal('lt.items', item('b')); await b.sync.syncNow();
  assert.equal(b.sync.getState().status, 'conflict');
  assert.deepEqual(b.store['lt.items'], item('b'));
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'a');
});

test('push race preserves local data and records conflict without retry', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  await c.sync.writeLocal('lt.items', item('local'));
  s.beforePush = () => s.put('lt.items', item('racing-device'));
  await c.sync.syncNow();
  assert(pending(c)); assert.deepEqual(c.store['lt.items'], item('local'));
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'racing-device');
});

test('race after explicit local choice does not force an overwrite', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local') }); await login(c);
  s.beforePush = () => s.put('lt.items', item('racing-device'));
  assert.equal((await choose(c, 'local')).error, 'sync.err.stale');
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'racing-device');
});

test('clean remote updates and deletions retain recovery data', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  s.put('lt.items', item('updated')); await c.sync.syncNow();
  assert.deepEqual(c.store['lt.items'], item('updated'));
  assert.deepEqual(copy((await c.sync.getBackup(c.sync.getState().backups[0].id)).items), item('base'));
  s.put('lt.items', undefined); await c.sync.syncNow();
  assert(!('lt.items' in c.store));
  assert.deepEqual(copy((await c.sync.getBackup(c.sync.getState().backups[0].id)).items), item('updated'));
});

test('remote deletion with a local edit requires a choice', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  await c.sync.writeLocal('lt.items', item('local')); s.put('lt.items', undefined);
  await c.sync.syncNow(); assert(pending(c)); assert.deepEqual(c.store['lt.items'], item('local'));
});

test('backup quota failure blocks initial sync and remote replacement', async () => {
  const s = server(); s.put('lt.items', item('cloud'));
  const c = client(s, { 'lt.items': item('local') }); c.options.failBackups = true;
  assert.equal((await login(c)).error, 'sync.err.backup');
  assert.deepEqual(c.store['lt.items'], item('local')); assert.equal(c.sync.isLoggedIn(), false);
  c.options.failBackups = false; await login(c); await choose(c, 'cloud');
  s.put('lt.items', item('next')); c.options.failBackups = true;
  assert.equal((await c.sync.syncNow()).error, 'sync.err.backup');
  assert.deepEqual(c.store['lt.items'], item('cloud'));
});

test('malformed cloud payload does not advance cursor or replace local content', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  const cursor = c.store['lt.syncmeta'].lastServerTime;
  s.put('lt.items', item('next')); s.docs['lt.items'].payload = '{broken';
  assert.equal((await c.sync.syncNow()).error, 'sync.err.response');
  assert.equal(c.store['lt.syncmeta'].lastServerTime, cursor);
  assert.deepEqual(c.store['lt.items'], item('base'));
});

test('offline edits are retained and checked on reconnect', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  s.offline = true; await c.sync.writeLocal('lt.items', item('offline'));
  assert.equal((await c.sync.syncNow()).error, 'sync.err.offline');
  s.offline = false; s.put('lt.items', item('other-device'));
  await c.sync.syncNow(); assert(pending(c)); assert.deepEqual(c.store['lt.items'], item('offline'));
});

test('reset requires fresh comparison rather than automatic upload', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  await c.sync.resetLocalSyncState(); s.put('lt.items', item('other'));
  await c.sync.syncNow(); assert(pending(c)); assert.deepEqual(c.store['lt.items'], item('base'));
});

test('backup ring is bounded and deleted backup cannot be restored', async () => {
  const s = server(); const c = client(s, { 'lt.items': item('base') });
  for (let n = 0; n < 5; n++) { await login(c); await c.sync.logout(); }
  assert.equal(c.sync.getState().backups.length, 3);
  const id = c.sync.getState().backups[0].id; await c.sync.deleteBackup(id);
  assert.equal((await c.sync.restoreBackup(id)).error, 'sync.err.backup_missing');
});

test('edits queued during sync are preserved for review against the new revision', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  await c.sync.writeLocal('lt.items', item('first'));
  let unblock, entered;
  const ready = new Promise(resolve => entered = resolve);
  s.beforePush = async () => { entered(); await new Promise(resolve => unblock = resolve); };
  const syncing = c.sync.syncNow(); await ready;
  const writing = c.sync.writeLocal('lt.items', item('second'));
  unblock(); await syncing; await writing;
  assert.deepEqual(c.store['lt.items'], item('second')); assert(c.store['lt.syncmeta'].docs['lt.items'].dirtyAt);
  await c.sync.syncNow(); assert(pending(c));
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'first');
  await choose(c, 'local'); assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'second');
});

test('object key order alone does not create a conflict', async () => {
  const s = server(); s.put('lt.items', [{ title: 'same', id: 'same' }]);
  const c = client(s, { 'lt.items': [{ id: 'same', title: 'same' }] }); await login(c);
  assert.equal(pending(c), undefined);
});

test('queued edit based on old UI preserves an incoming cloud update for review', async () => {
  const s = server(); s.put('lt.items', item('base'));
  const c = client(s, { 'lt.items': item('base') }); await login(c);
  s.put('lt.items', item('cloud-update'));
  const originalFetch = s.fetch.bind(s);
  let unblock, entered;
  const ready = new Promise(resolve => entered = resolve);
  s.fetch = async (...args) => {
    entered(); await new Promise(resolve => unblock = resolve);
    s.fetch = originalFetch;
    return originalFetch(...args);
  };
  const syncing = c.sync.syncNow(); await ready;
  const writing = c.sync.writeLocal('lt.items', item('local-edit'));
  unblock(); await syncing; await writing;
  assert.deepEqual(c.store['lt.items'], item('local-edit'));
  assert.equal(JSON.parse(pending(c).payload)[0].id, 'cloud-update');
  assert.equal(JSON.parse(s.docs['lt.items'].payload)[0].id, 'cloud-update');
});

test('registration supports immediate activation and pending verification', async () => {
  const immediate = server(); const original = immediate.fetch;
  immediate.fetch = (url, opts) => original(url.endsWith('/auth/register') ? url.replace('/auth/register', '/auth/login') : url, opts);
  const a = client(immediate);
  assert.equal((await a.sync.register('test@example.com', 'test-password')).ok, true);
  assert.equal(a.sync.getState().loggedIn, true);
  const pendingApi = { fetch: async () => ({ ok: true, status: 200, json: async () => ({ email: 'test@example.com' }) }) };
  const b = client(pendingApi);
  assert.equal((await b.sync.register('test@example.com', 'test-password')).verify, true);
  assert.equal(b.sync.getState().loggedIn, false);
});

test('account deletion keeps local data and signs out only on server success', async () => {
  const api = server(), c = client(api, { 'lt.items': item('keep-local') });
  await login(c);
  const original = api.fetch;
  let allow = false;
  api.fetch = async (url, opts) => {
    if (!url.endsWith('/auth/account')) return original(url, opts);
    assert.equal(opts.method, 'DELETE');
    assert.equal(JSON.parse(opts.body).password, 'confirm-password');
    return allow ? { status: 204, ok: true } : { status: 401, ok: false, json: async () => ({error:'invalid credentials'}) };
  };
  assert.equal((await c.sync.deleteRemoteData('confirm-password')).ok, false);
  assert.equal(c.sync.getState().loggedIn, true);
  allow = true;
  assert.equal((await c.sync.deleteRemoteData('confirm-password')).ok, true);
  assert.equal(c.sync.getState().loggedIn, false);
  assert.deepEqual(c.store['lt.items'], item('keep-local'));
});

(async () => {
  for (const { name, fn } of tests) { await fn(); console.log('PASS', name); }
  console.log(`Sync safety: ${tests.length} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });

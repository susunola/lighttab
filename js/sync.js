/* LightTab sync: revision conflicts require a user choice. Backups stay on this device.
 * Cloud API remains /v1/sync with baseRev; no automatic last-write-wins retries.
 * Shared Web Locks serialize sync, local saves and recovery across new-tab pages.
 */
(() => {
  'use strict';
  if (!window.LT_API_BASE) window.LT_API_BASE = 'https://lighttab.atomwangnus.com';
  const SYNC_BASE = window.LT_API_BASE;
  const SYNC_KEYS = ['lt.settings', 'lt.items', 'lt.wallpaper', 'lt.todos', 'lt.prompts'];
  const AUTH_KEY = 'lt.auth';
  const META_KEY = 'lt.syncmeta';
  const BACKUPS_KEY = 'lt.syncbackups';
  const SNAPSHOT_KEYS = [...SYNC_KEYS, 'lt.schema'];
  const BACKUP_LIMIT = 3;
  const DEBOUNCE_MS = 1500;
  const hasChromeStorage = !!(window.chrome && chrome.storage && chrome.storage.local);
  const freshMeta = () => ({ lastServerTime: 0, docs: {}, conflicts: {}, initial: true });
  const S = { auth: null, meta: freshMeta(), backups: [], status: 'idle', lastSyncAt: 0,
    lastError: '', pendingVerifyEmail: '', listeners: [], remoteApply: null, timer: 0 };
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  // Object key order is not a user-visible difference (sanitizers may reorder properties).
  const encode = value => value === undefined || value === null ? '' : JSON.stringify(value, (key, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.keys(val).sort().map(name => [name, val[name]])) : val);
  function emit() { for (const cb of S.listeners) { try { cb(); } catch {} } }

  async function sGet(keys) {
    if (hasChromeStorage) return chrome.storage.local.get(keys);
    const out = {};
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value !== null) out[key] = JSON.parse(value);
    }
    return out;
  }
  async function sSet(values) {
    if (hasChromeStorage) return chrome.storage.local.set(values);
    for (const [key, value] of Object.entries(values)) localStorage.setItem(key, JSON.stringify(value));
  }
  async function sRemove(keys) {
    if (hasChromeStorage) return chrome.storage.local.remove(keys);
    keys.forEach(key => localStorage.removeItem(key));
  }
  async function loadState() {
    const data = await sGet([AUTH_KEY, META_KEY, BACKUPS_KEY]);
    S.auth = data[AUTH_KEY] || null;
    S.meta = data[META_KEY] || freshMeta();
    S.meta.docs ||= {};
    S.meta.conflicts ||= {};
    // Old metadata has no initial flag. Known revisions can still be used safely.
    if (S.meta.initial === undefined) S.meta.initial = !Object.keys(S.meta.docs).length;
    S.backups = Array.isArray(data[BACKUPS_KEY]) ? data[BACKUPS_KEY] : [];
  }
  const saveMeta = () => sSet({ [META_KEY]: S.meta });
  let queue = Promise.resolve();
  function exclusive(fn) {
    const run = async () => {
      await loadState();
      return fn();
    };
    // Native lock works across extension pages; fallback also supports the offline VM harness.
    const task = () => window.navigator?.locks
      ? window.navigator.locks.request('lighttab-sync-data', run) : run();
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  }
  async function refreshUI() {
    if (S.remoteApply) await S.remoteApply();
  }
  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  async function request(path, opts = {}, withAuth = true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (withAuth && S.auth?.token) headers.Authorization = 'Bearer ' + S.auth.token;
      const response = await fetch(SYNC_BASE + path, { method: opts.method || 'GET', headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: controller.signal });
      if (response.status === 204) return null;
      let data;
      try { data = await response.json(); } catch { throw new Error('sync.err.response'); }
      if (!response.ok) throw new HttpError(response.status, data.error || 'sync.err.response');
      return data;
    } catch (error) {
      if (error instanceof HttpError || error.message === 'sync.err.response') throw error;
      throw new HttpError(0, 'network unreachable');
    } finally { clearTimeout(timer); }
  }
  function friendlyAuthError(err) {
    const raw = String(err && err.message || err);
    const m = raw.toLowerCase();
    // Server-side English text -> i18n key (app.js resolves it in the current language); unknown text passes through.
    const map = [
      ['invalid email or password', 'sync.err.invalid'],
      ['password must be at least 8 characters', 'sync.err.pass_short'],
      ['invalid email address', 'sync.err.email_invalid'],
      ['email address does not exist', 'sync.err.email_missing'],
      ['email already registered', 'sync.err.email_registered'],
      ['email not verified', 'sync.err.email_unverified'],
      ['rate limited', 'sync.err.rate'],
      ['network unreachable', 'sync.err.network']
    ];
    for (const [k, v] of map) { if (m.includes(k)) return v; }
    return raw;
  }

  async function backup(reason, override = {}) {
    const data = { ...await sGet(SNAPSHOT_KEYS), ...override };
    // Undefined represents a missing/deleted document and is excluded by JSON serialization.
    const entry = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      createdAt: Date.now(), reason, data: clone(data) };
    const next = [entry, ...S.backups].slice(0, BACKUP_LIMIT);
    try { await sSet({ [BACKUPS_KEY]: next }); }
    catch { throw new Error('sync.err.backup'); }
    S.backups = next;
    return entry;
  }
  function readDoc(key, doc) {
    if (!doc || !Number.isInteger(doc.rev) || doc.rev < 0) throw new Error('sync.err.response');
    if (doc.payload === '' || doc.payload === null) return undefined;
    if (typeof doc.payload !== 'string') throw new Error('sync.err.response');
    let value;
    try { value = JSON.parse(doc.payload); } catch { throw new Error('sync.err.response'); }
    if (key === 'lt.settings' && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('sync.err.response');
    if (['lt.items', 'lt.todos', 'lt.prompts'].includes(key) && !Array.isArray(value)) throw new Error('sync.err.response');
    return value;
  }
  function conflict(key, doc, local) {
    // Persist both previews so reload/offline does not lose the unresolved choice.
    S.meta.conflicts[key] = { rev: doc.rev, payload: doc.payload, local: encode(local), updatedAt: doc.updatedAt || 0 };
  }
  async function applyPull(pull) {
    if (!pull || !pull.docs || typeof pull.docs !== 'object' || Array.isArray(pull.docs)) throw new Error('sync.err.response');
    // Validate the entire response before advancing the cursor or changing any document.
    const decoded = {};
    for (const key of SYNC_KEYS) if (pull.docs[key]) decoded[key] = readDoc(key, pull.docs[key]);
    const local = await sGet(SYNC_KEYS);
    const replacements = {};
    for (const key of SYNC_KEYS) {
      const doc = pull.docs[key];
      if (!doc) continue;
      const meta = S.meta.docs[key] || { rev: 0, dirtyAt: 0 };
      if (encode(local[key]) === encode(decoded[key])) {
        S.meta.docs[key] = { rev: doc.rev, dirtyAt: 0 };
        delete S.meta.conflicts[key];
      } else if (S.meta.conflicts[key] ||
        ((S.meta.initial || !meta.rev) && local[key] !== undefined) ||
        (meta.dirtyAt && doc.rev !== meta.rev)) {
        conflict(key, doc, local[key]);
      } else if (!meta.dirtyAt) {
        replacements[key] = decoded[key];
        S.meta.docs[key] = { rev: doc.rev, dirtyAt: 0 };
      }
      // A dirty local document based on the same revision remains queued for upload.
    }
    if (Object.keys(replacements).length) {
      await backup('before-cloud'); // If saving the backup fails, no local content is replaced.
      await writeDocuments(replacements);
    }
    S.meta.initial = false;
    S.meta.lastServerTime = pull.serverTime || S.meta.lastServerTime || 0;
    await saveMeta();
    return Object.keys(replacements).length > 0;
  }
  async function writeDocuments(data) {
    const values = {}, removed = [];
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) removed.push(key); else values[key] = value;
    }
    if (Object.keys(values).length) await sSet(values);
    if (removed.length) await sRemove(removed);
  }
  async function pushDirty() {
    const local = await sGet(SYNC_KEYS);
    const ops = SYNC_KEYS.filter(key => S.meta.docs[key]?.dirtyAt && !S.meta.conflicts[key])
      .map(key => ({ key, baseRev: S.meta.docs[key].rev || 0, payload: encode(local[key]) }));
    if (!ops.length) return;
    const response = await request('/v1/sync', { method: 'POST', body: { ops } });
    if (!Array.isArray(response?.results)) throw new Error('sync.err.response');
    for (const op of ops) {
      const result = response.results.find(item => item.key === op.key);
      if (!result) throw new Error('sync.err.response');
      if (result.conflict) {
        readDoc(op.key, result.serverDoc);
        conflict(op.key, result.serverDoc, local[op.key]);
      } else if (Number.isInteger(result.newRev) && result.newRev > 0) {
        S.meta.docs[op.key] = { rev: result.newRev, dirtyAt: 0 };
      } else throw new Error('sync.err.response');
    }
    // Do not advance the pull cursor from a push: it might skip concurrent changes to other keys.
    await saveMeta();
  }
  function settledStatus() {
    return Object.keys(S.meta.conflicts).length ? 'conflict' : 'idle';
  }
  async function syncRound() {
    if (!S.auth?.token) return;
    S.status = 'syncing'; S.lastError = ''; emit();
    let changed = false;
    try {
      const since = S.meta.initial ? 0 : S.meta.lastServerTime || 0;
      changed = await applyPull(await request('/v1/sync?since=' + since));
      await pushDirty();
      S.lastSyncAt = Date.now();
      S.status = settledStatus();
      return { ok: true };
    } catch (error) {
      if (error.status === 401) {
        S.auth = null;
        await sSet({ [AUTH_KEY]: null });
        S.lastError = 'sync.err.expired'; S.status = 'error';
      } else {
        S.lastError = error.status === 0 ? 'sync.err.offline' : error.message;
        S.status = error.status === 0 ? 'offline' : 'error';
      }
      return { ok: false, error: S.lastError };
    } finally {
      if (changed) await refreshUI();
      emit();
    }
  }
  function syncNow() { return exclusive(syncRound); }
  function scheduleSync() {
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { S.timer = 0; syncNow().catch(reportError); }, DEBOUNCE_MS);
  }
  function reportError(error) { S.lastError = error.message; S.status = 'error'; emit(); }
  function writeLocal(key, value) {
    // Clone at invocation, before another UI edit can mutate the object while it is queued.
    const copy = clone(value);
    const baseRev = S.meta.docs[key]?.rev || 0;
    return exclusive(async () => {
      const old = (await sGet([key]))[key];
      if (encode(old) === encode(copy)) return;
      if (S.auth?.token && SYNC_KEYS.includes(key)) {
        if (baseRev !== (S.meta.docs[key]?.rev || 0)) {
          // The editor was based on data from before an in-flight cloud update.
          // Preserve that update and require a choice instead of silently uploading stale UI state.
          await backup('before-local');
          conflict(key, { rev: S.meta.docs[key]?.rev || 0, payload: encode(old) }, copy);
        }
        S.meta.docs[key] = { rev: S.meta.docs[key]?.rev || 0, dirtyAt: Date.now() || 1 };
        if (S.meta.conflicts[key]) S.meta.conflicts[key].local = encode(copy);
        // Mark dirty before content is saved. A failed save may cause a harmless extra sync.
        await saveMeta();
      }
      await sSet({ [key]: copy });
      if (S.auth?.token && SYNC_KEYS.includes(key)) { S.status = settledStatus(); scheduleSync(); emit(); }
    });
  }
  function login(email, password) {
    return exclusive(async () => {
      try {
        const data = await request('/auth/login', { method: 'POST', body: { email, password } }, false);
        if (!data?.token || !data.user?.email || !data.user?.userId) throw new Error('sync.err.response');
        await backup('before-login');
        S.auth = { token: data.token, email: data.user.email, userId: data.user.userId };
        S.meta = freshMeta();
        const local = await sGet(SYNC_KEYS);
        for (const key of SYNC_KEYS) if (local[key] !== undefined) S.meta.docs[key] = { rev: 0, dirtyAt: Date.now() || 1 };
        await sSet({ [AUTH_KEY]: S.auth, [META_KEY]: S.meta });
        S.pendingVerifyEmail = '';
        await syncRound();
        return { ok: true };
      } catch (error) {
        await loadState();
        if (error.status === 403) S.pendingVerifyEmail = email;
        emit();
        return { ok: false, verifyPending: error.status === 403, error: friendlyAuthError(error) };
      }
    });
  }
  async function register(email, password) {
    try {
      const d = await request('/auth/register', { method: 'POST', body: { email, password } }, false);
      // Some deployments activate registrations immediately; use the normal safe login flow.
      if (d.token && d.user) return login(email, password);
      // Verification-enabled deployments return a pending registration.
      S.pendingVerifyEmail = d.email || email;
      emit();
      return { ok: true, verify: true, email: d.email || email };
    } catch (err) {
      return { ok: false, error: friendlyAuthError(err) };
    }
  }
  async function resend(email) {
    try {
      await request('/auth/resend', { method: 'POST', body: { email } }, false);
      S.pendingVerifyEmail = email;
      emit();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: friendlyAuthError(err) };
    }
  }
  function logout() {
    return exclusive(async () => {
      clearTimeout(S.timer);
      // Attempt revocation first; local sign-out still works offline.
      if (S.auth?.token) { try { await request('/auth/logout', { method: 'POST' }); } catch (_) {} }
      S.auth = null; S.meta = freshMeta(); S.pendingVerifyEmail = '';
      await sSet({ [AUTH_KEY]: null, [META_KEY]: S.meta });
      S.status = 'idle'; S.lastError = ''; S.lastSyncAt = 0; emit();
    });
  }
  function resolveConflict(key, choice, expectedRev, expectedLocal) {
    return exclusive(async () => {
      try {
        if (!S.auth?.token || !['local', 'cloud'].includes(choice) || !SYNC_KEYS.includes(key)) throw new Error('sync.err.stale');
        const pending = S.meta.conflicts[key];
        const local = (await sGet([key]))[key];
        if (!pending || pending.rev !== expectedRev || encode(local) !== expectedLocal) throw new Error('sync.err.stale');
        // Re-read cloud before accepting a preview. Another device may have edited it meanwhile.
        const pull = await request('/v1/sync?since=0');
        const doc = pull?.docs?.[key];
        const remote = readDoc(key, doc);
        if (doc.rev !== expectedRev || doc.payload !== pending.payload) {
          conflict(key, doc, local); await saveMeta(); throw new Error('sync.err.stale');
        }
        await backup('before-choice');
        if (choice === 'cloud') {
          await writeDocuments({ [key]: remote });
          S.meta.docs[key] = { rev: doc.rev, dirtyAt: 0 };
        } else {
          // Preserve the cloud copy locally before replacing it. CAS prevents a stale overwrite.
          await backup('cloud-copy', { [key]: remote });
          const response = await request('/v1/sync', { method: 'POST', body: {
            ops: [{ key, baseRev: doc.rev, payload: encode(local) }]
          } });
          const result = response?.results?.find(item => item.key === key);
          if (result?.conflict) {
            readDoc(key, result.serverDoc);
            conflict(key, result.serverDoc, local); await saveMeta(); throw new Error('sync.err.stale');
          }
          if (!Number.isInteger(result?.newRev) || result.newRev <= 0) throw new Error('sync.err.response');
          S.meta.docs[key] = { rev: result.newRev, dirtyAt: 0 };
        }
        delete S.meta.conflicts[key]; await saveMeta();
        S.status = settledStatus(); S.lastError = '';
        if (choice === 'cloud') await refreshUI();
        return { ok: true };
      } catch (error) {
        S.lastError = error.status === 0 ? 'sync.err.offline' : error.message;
        S.status = Object.keys(S.meta.conflicts).length ? 'conflict' : 'error';
        return { ok: false, error: S.lastError };
      } finally { emit(); }
    });
  }
  function getBackup(id) {
    return exclusive(async () => {
      const entry = S.backups.find(item => item.id === id);
      if (!entry) throw new Error('sync.err.backup_missing');
      const result = { app: 'LightTab', exportedAt: new Date(entry.createdAt).toISOString(), schema: entry.data['lt.schema'] || 1 };
      for (const key of SYNC_KEYS) if (entry.data[key] !== undefined) result[key.slice(3)] = clone(entry.data[key]);
      return result;
    });
  }
  function restoreBackup(id) {
    return exclusive(async () => {
      try {
        const entry = S.backups.find(item => item.id === id);
        if (!entry) throw new Error('sync.err.backup_missing');
        const data = clone(entry.data);
        await backup('before-restore');
        clearTimeout(S.timer);
        S.auth = null; S.meta = freshMeta();
        await sSet({ [AUTH_KEY]: null, [META_KEY]: S.meta });
        await writeDocuments(Object.fromEntries(SNAPSHOT_KEYS.map(key => [key, data[key]])));
        S.status = 'idle'; S.lastError = ''; S.lastSyncAt = 0;
        await refreshUI();
        return { ok: true };
      } catch (error) { return { ok: false, error: error.message }; }
      finally { emit(); }
    });
  }
  function deleteBackup(id) {
    return exclusive(async () => {
      S.backups = S.backups.filter(item => item.id !== id);
      await sSet({ [BACKUPS_KEY]: S.backups }); emit();
    });
  }
  function resetLocalSyncState() {
    return exclusive(async () => {
      // A reset is a fresh comparison, never an instruction to silently overwrite either side.
      S.meta = freshMeta();
      const local = await sGet(SYNC_KEYS);
      for (const key of SYNC_KEYS) if (local[key] !== undefined) S.meta.docs[key] = { rev: 0, dirtyAt: Date.now() || 1 };
      await saveMeta(); S.status = 'idle'; S.lastSyncAt = 0; emit(); return { ok: true };
    });
  }
  function deleteRemoteData(password) {
    return exclusive(async () => {
      await loadState();
      if (!S.auth?.token || !password) return { ok: false, error: 'sync.err_email_pass' };
      clearTimeout(S.timer);
      try {
        await request('/auth/account', { method: 'DELETE', body: { password } });
        S.auth = null; S.meta = freshMeta(); S.pendingVerifyEmail = '';
        await sSet({ [AUTH_KEY]: null, [META_KEY]: S.meta });
        S.status = 'idle'; S.lastError = ''; S.lastSyncAt = 0; emit();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.status === 404 || err.status === 405 ? 'sync.err.backend_delete' : friendlyAuthError(err) };
      }
    });
  }
  function getState() {
    return { loggedIn: !!S.auth?.token, email: S.auth?.email || '', status: S.status,
      lastSyncAt: S.lastSyncAt, lastError: S.lastError, pendingVerifyEmail: S.pendingVerifyEmail,
      conflicts: clone(S.meta.conflicts), backups: S.backups.map(entry => ({ id: entry.id,
        createdAt: entry.createdAt, reason: entry.reason,
        counts: ['items', 'todos', 'prompts'].map(name => entry.data['lt.' + name]?.length || 0) })) };
  }
  window.LT_SYNC = {
    configure(opts) {
      if (typeof opts?.remoteApply === 'function') S.remoteApply = opts.remoteApply;
      if (typeof opts?.onChange === 'function') S.listeners.push(opts.onChange);
    },
    async init() {
      await exclusive(async () => { S.status = settledStatus(); emit(); });
      if (S.auth?.token) syncNow().catch(reportError);
    },
    writeLocal, login, register, resend, logout, syncNow, resolveConflict,
    getBackup, restoreBackup, deleteBackup, resetLocalSyncState, deleteRemoteData, getState,
    isLoggedIn() { return !!S.auth?.token; }
  };
})();

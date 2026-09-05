/* LightTab - sync.js
   Cloud sync: local-first with whole-document LWW (last-write-wins).
   - Zero network requests while logged out; behaviour is identical to pure local mode.
   - Once logged in: local edits are debounced and pushed, pull first then push; conflicts resolve by LWW
   (local mtime vs server mtime). Exception: the FIRST sync after a login is server-first — keys the
   server already has overwrite local unconditionally (local has no trustworthy edit timestamps before
   a session exists, so LWW cannot be applied). The token lives in chrome.storage.local (lt.auth) and
   is never synced; sync metadata lives in lt.syncmeta. Exposes window.LT_SYNC; app.js injects the
   Store adapter and subscribes.
*/
(() => {
  'use strict';

  // Single source of truth for the backend origin. sync.js loads before app.js (see the script order in
  // newtab.html), so it hangs the value on window for the app.js wallpaper library to reuse.
  if (!window.LT_API_BASE) window.LT_API_BASE = 'https://lighttab.atomwangnus.com';
  const SYNC_BASE = window.LT_API_BASE;
  const SYNC_KEYS = ['lt.settings', 'lt.items', 'lt.wallpaper', 'lt.todos', 'lt.prompts'];
  const AUTH_KEY = 'lt.auth';
  const META_KEY = 'lt.syncmeta';
  const DEBOUNCE_MS = 1500;

  const hasChromeStorage = !!(window.chrome && chrome.storage && chrome.storage.local);

  // ---------- storage adapter (same fallback semantics as the Store in app.js) ----------
  async function sGet(keys) {
    if (hasChromeStorage) {
      const r = await chrome.storage.local.get(keys);
      return r;
    }
    const out = {};
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (v != null) { try { out[k] = JSON.parse(v); } catch { out[k] = undefined; } }
    }
    return out;
  }
  async function sSet(obj) {
    if (hasChromeStorage) await chrome.storage.local.set(obj);
    else for (const k in obj) localStorage.setItem(k, JSON.stringify(obj[k]));
  }
  async function sRemove(keys) {
    if (hasChromeStorage) await chrome.storage.local.remove(keys);
    else keys.forEach(k => localStorage.removeItem(k));
  }

  // ---------- State ----------
  const S = {
    auth: null,                              // { token, email, userId } | null
    meta: { lastServerTime: 0, docs: {} },   // docs: { key: { rev, dirtyAt } }
    status: 'idle',                          // idle | syncing | offline | error
    lastSyncAt: 0,
    lastError: '',
    pendingVerifyEmail: '',                  // email awaiting verification after signup (drives the resend hint)
    listeners: [],                           // state-change callbacks (UI refresh)
    remoteApply: null,                       // callback fired after a remote pull overwrites local data
    timer: 0,
    inFlight: false
  };

  function emit() { for (const cb of S.listeners) { try { cb(); } catch {} } }

  // Server clock calibration: the local clock can drift from the server, so every LWW comparison goes
  // through nowServer() (local clock + offset). The offset comes from the serverTime field in the response
  // body (milliseconds, preferred), falling back to the Date response header (second precision).
  // Caveat: RTT is ignored, so the error is usually sub-second - fine for whole-document LWW at human
  // edit frequency. With neither source available it degrades to the raw local clock (self-consistent on
  // one device; across devices the server updatedAt wins).
  let serverOffset = 0;
  function nowServer() { return Date.now() + serverOffset; }
  function noteServerTime(st) {
    const t = Number(st);
    if (Number.isFinite(t) && t > 0) serverOffset = t - Date.now();
  }

  class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function request(path, opts = {}, withAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (withAuth && S.auth && S.auth.token) headers['Authorization'] = 'Bearer ' + S.auth.token;
    let res;
    try {
      res = await fetch(SYNC_BASE + path, {
        method: opts.method || 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      throw new HttpError(0, 'network unreachable');
    }
    // Responses without a serverTime field calibrate off the Date header (second precision, fallback only).
    try {
      const dh = res.headers.get('Date');
      if (dh) { const t = Date.parse(dh); if (Number.isFinite(t)) serverOffset = t - Date.now(); }
    } catch {}
    if (res.status === 204) return null;
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new HttpError(res.status, data.error || ('HTTP ' + res.status));
    return data;
  }

  // TODO: map by code once the backend returns structured error codes. For now we lowercase and substring-match,
  // which tolerates small wording changes on the server (case/punctuation tweaks no longer leak raw English through).
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

  // ---------- Auth ----------
  async function loadAuth() {
    const r = await sGet([AUTH_KEY]);
    S.auth = r[AUTH_KEY] || null;
  }
  async function loadMeta() {
    const r = await sGet([META_KEY]);
    S.meta = r[META_KEY] || { lastServerTime: 0, docs: {} };
    if (!S.meta.docs || typeof S.meta.docs !== 'object') S.meta.docs = {};
  }
  async function saveAuth() { await sSet({ [AUTH_KEY]: S.auth }); }
  async function saveMeta() { await sSet({ [META_KEY]: S.meta }); }

  async function login(email, password) {
    try {
      const d = await request('/auth/login', { method: 'POST', body: { email, password } }, false);
      S.auth = { token: d.token, email: d.user.email, userId: d.user.userId };
      S.pendingVerifyEmail = '';
      await saveAuth();
      // First login: mark every existing local document dirty so the push stage of the first sync uploads it.
      // (The first pull is server-first: keys the server already has overwrite local and clear dirty; keys it
      // lacks are filled in here.)
      const local = await sGet(SYNC_KEYS);
      const now = nowServer();
      for (const key of SYNC_KEYS) {
        if (local[key] === undefined) continue;   // never push an empty document for a key local has never written
        const meta = S.meta.docs[key] || { rev: 0, dirtyAt: 0 };
        meta.dirtyAt = now;
        S.meta.docs[key] = meta;
      }
      await saveMeta();
      emit();
      await syncNow(true);   // first full sync right after login
      return { ok: true };
    } catch (err) {
      if (err && err.status === 403) {
        // Email not verified yet: prompt the user to check the inbox or resend.
        S.pendingVerifyEmail = email;
        emit();
        return { ok: false, verifyPending: true, error: friendlyAuthError(err) };
      }
      return { ok: false, error: friendlyAuthError(err) };
    }
  }
  async function register(email, password) {
    try {
      const d = await request('/auth/register', { method: 'POST', body: { email, password } }, false);
      // Registering no longer logs you straight in: it enters the email-verification flow.
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
  async function logout() {
    try { if (S.auth) await request('/auth/logout', { method: 'POST' }); } catch {}
    S.auth = null;
    S.meta = { lastServerTime: 0, docs: {} };
    S.pendingVerifyEmail = '';
    await saveAuth();
    await saveMeta();
    S.status = 'idle'; S.lastError = ''; S.lastSyncAt = 0;
    emit();
  }

  // ---------- Local write hook (called from Store.set in app.js) ----------
  function onLocalWrite(key) {
    if (!S.auth) return;                    // not logged in, nothing to track
    if (!SYNC_KEYS.includes(key)) return;
    if (!S.meta.docs[key]) S.meta.docs[key] = { rev: 0, dirtyAt: 0 };
    S.meta.docs[key].dirtyAt = nowServer();   // stamp dirty with calibrated server time so clock drift cannot lose the LWW
    saveMeta();
    scheduleSync();
  }

  function scheduleSync() {
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(() => { S.timer = 0; syncNow(false); }, DEBOUNCE_MS);
  }

  // ---------- Main sync flow (pull, then push) ----------
  async function syncNow(first) {
    if (!S.auth || !S.auth.token) return;
    // An edit landed while the previous round was still on the wire: re-arm the debounce
    // instead of dropping it, otherwise that edit would wait for some unrelated future write.
    if (S.inFlight) { scheduleSync(); return; }
    S.inFlight = true;
    S.status = 'syncing';
    emit();
    try {
      const since = first ? 0 : (S.meta.lastServerTime || 0);
      const pull = await request('/v1/sync?since=' + since);
      await applyPull(pull, first);
      await pushDirty();
      S.lastSyncAt = Date.now();
      S.lastError = '';
      S.status = 'idle';
    } catch (err) {
      if (err && err.status === 401) {
        // Token expired or revoked: log out silently and ask the user to sign in again.
        S.auth = null;
        await saveAuth();
        S.status = 'error';
        S.lastError = 'sync.err.expired';
      } else if (err && err.status === 0) {
        S.status = 'offline';
        S.lastError = 'sync.err.offline';
      } else {
        S.status = 'error';
        S.lastError = String(err && err.message || err);
      }
    }
    S.inFlight = false;
    emit();
  }

  // Pull remote changes into local storage. On the first sync the server wins (an existing doc overwrites
  async function applyPull(pull, first) {
    let changed = false;
    const docs = (pull && pull.docs) || {};
    for (const key of SYNC_KEYS) {
      const doc = docs[key];
      if (!doc) continue;
      const meta = S.meta.docs[key] || { rev: 0, dirtyAt: 0 };
      if (!first && meta.dirtyAt && meta.dirtyAt >= doc.updatedAt) {
        // Local has newer unpushed edits: local wins, skip (the push stage will overwrite the server).
        meta.rev = doc.rev;
        S.meta.docs[key] = meta;
        continue;
      }
      // Server wins (or first sync, server-first): write back locally.
      if (doc.payload != null && doc.payload !== '') {
        let val;
        try { val = JSON.parse(doc.payload); } catch { continue; }
        await sSet({ [key]: val });
        changed = true;
      }
      S.meta.docs[key] = { rev: doc.rev, dirtyAt: 0 };
    }
    if (pull && pull.serverTime) { noteServerTime(pull.serverTime); S.meta.lastServerTime = pull.serverTime; }
    await saveMeta();
    if (changed && S.remoteApply) { try { await S.remoteApply(); } catch {} }
  }

  // Push locally dirty documents; on conflict, LWW decides whether to re-push over the server or take theirs.
  async function pushDirty() {
    const ops = [];
    const pushedAt = {}; // dirtyAt snapshot per key, taken when the payload was read
    for (const key of SYNC_KEYS) {
      const meta = S.meta.docs[key];
      if (!meta || !meta.dirtyAt) continue;
      const r = await sGet([key]);
      const val = r[key];
      const payload = (val === undefined || val === null) ? '' : JSON.stringify(val);
      pushedAt[key] = meta.dirtyAt;
      ops.push({ key, baseRev: meta.rev || 0, payload });
    }
    if (!ops.length) return;
    const push = await request('/v1/sync', { method: 'POST', body: { ops } });
    let changed = false;
    for (const res of (push.results || [])) {
      const meta = S.meta.docs[res.key] || { rev: 0, dirtyAt: 0 };
      if (res.conflict) {
        const sd = res.serverDoc;
        if (sd && meta.dirtyAt >= sd.updatedAt) {
          // Local wins: re-push using serverDoc.rev as the new baseRev.
          const retryDirtyAt = meta.dirtyAt;
          const r = await sGet([res.key]);
          const payload = JSON.stringify(r[res.key]);
          const retry = await request('/v1/sync', { method: 'POST', body: { ops: [{ key: res.key, baseRev: sd.rev, payload }] } });
          const rr = (retry.results || [])[0];
          if (rr && !rr.conflict && rr.newRev != null) {
            // Clear the dirty flag only if nothing was edited while the re-push was in flight.
            if (meta.dirtyAt === retryDirtyAt) meta.dirtyAt = 0;
            meta.rev = rr.newRev;
            S.meta.docs[res.key] = meta;
          }
          // Still conflicting after a re-push: keep dirtyAt and retry next round.
        } else if (sd) {
          // Server wins: overwrite local.
          if (sd.payload != null && sd.payload !== '') {
            try { await sSet({ [res.key]: JSON.parse(sd.payload) }); changed = true; } catch {}
          }
          // An edit that landed mid-flight (after the LWW check above) stays dirty for the next round.
          if (meta.dirtyAt === pushedAt[res.key]) meta.dirtyAt = 0;
          meta.rev = sd.rev;
          S.meta.docs[res.key] = meta;
        }
      } else if (res.newRev != null) {
        // Clear the dirty flag only if nothing was edited while the push was in flight — a newer
        // dirtyAt marks a local edit the server never saw, and clearing it would also disarm the
        // LWW guard in applyPull, letting the older server doc overwrite that edit next round.
        if (meta.dirtyAt === pushedAt[res.key]) meta.dirtyAt = 0;
        meta.rev = res.newRev;
        S.meta.docs[res.key] = meta;
      }
    }
    if (push.serverTime) { noteServerTime(push.serverTime); S.meta.lastServerTime = push.serverTime; }
    await saveMeta();
    if (changed && S.remoteApply) { try { await S.remoteApply(); } catch {} }
  }

  // ---------- Public API ----------
  function getState() {
    return {
      loggedIn: !!(S.auth && S.auth.token),
      email: S.auth ? S.auth.email : '',
      status: S.status,
      lastSyncAt: S.lastSyncAt,
      lastError: S.lastError,
      pendingVerifyEmail: S.pendingVerifyEmail
    };
  }

  window.LT_SYNC = {
    configure(opts) {
      if (opts && typeof opts.remoteApply === 'function') S.remoteApply = opts.remoteApply;
      if (opts && typeof opts.onChange === 'function') S.listeners.push(opts.onChange);
    },
    async init() {
      await loadAuth();
      await loadMeta();
      emit();
      if (S.auth && S.auth.token) {
        // Existing session: run one silent background sync (must not block first paint).
        syncNow(false);
      }
    },
    onLocalWrite,
    login, register, resend, logout, syncNow,
    getState,
    isLoggedIn() { return !!(S.auth && S.auth.token); }
  };
})();

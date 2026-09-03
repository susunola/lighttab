/* LightTab - sync.js
   云同步：本地优先 + 整文档 LWW（last-write-wins）。
   - 未登录时零网络请求，行为与纯本地完全一致
   - 登录后：本地修改防抖推送，先拉后推；冲突按「本地修改时间 vs 服务器修改时间」LWW
   - token 存 chrome.storage.local（lt.auth），不参与同步；同步元数据存 lt.syncmeta
   暴露 window.LT_SYNC，由 app.js 注入 Store 读写适配并订阅状态变化。
*/
(() => {
  'use strict';

  const SYNC_BASE = 'https://lighttab.atomwangnus.com';
  const SYNC_KEYS = ['lt.settings', 'lt.items', 'lt.wallpaper', 'lt.todos', 'lt.prompts'];
  const AUTH_KEY = 'lt.auth';
  const META_KEY = 'lt.syncmeta';
  const DEBOUNCE_MS = 1500;

  const hasChromeStorage = !!(window.chrome && chrome.storage && chrome.storage.local);

  // ---------- storage 适配（与 app.js Store 同一套降级语义） ----------
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

  // ---------- 状态 ----------
  const S = {
    auth: null,                              // { token, email, userId } | null
    meta: { lastServerTime: 0, docs: {} },   // docs: { key: { rev, dirtyAt } }
    status: 'idle',                          // idle | syncing | offline | error
    lastSyncAt: 0,
    lastError: '',
    pendingVerifyEmail: '',                  // 注册后待验证的邮箱（用于「重发/去登录」提示）
    listeners: [],                           // 状态变化回调（UI 刷新）
    remoteApply: null,                       // 远程覆盖本地后的 UI 刷新回调
    timer: 0,
    inFlight: false
  };

  function emit() { for (const cb of S.listeners) { try { cb(); } catch {} } }

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
    if (res.status === 204) return null;
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new HttpError(res.status, data.error || ('HTTP ' + res.status));
    return data;
  }

  function friendlyAuthError(err) {
    const m = String(err && err.message || err);
    // 服务器返回英文错误文案 → 映射为 i18n key，由 app.js 按当前语言取词；未知文案原样返回
    const map = {
      'invalid email or password': 'sync.err.invalid',
      'password must be at least 8 characters': 'sync.err.pass_short',
      'invalid email address': 'sync.err.email_invalid',
      'email address does not exist': 'sync.err.email_missing',
      'email already registered': 'sync.err.email_registered',
      'email not verified': 'sync.err.email_unverified',
      'rate limited, try again later': 'sync.err.rate',
      'network unreachable': 'sync.err.network'
    };
    return map[m] || m;
  }

  // ---------- 认证 ----------
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
      emit();
      await syncNow(true);   // 登录后立即首轮同步
      return { ok: true };
    } catch (err) {
      if (err && err.status === 403) {
        // 邮箱未验证：提示查收/重发验证邮件
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
      // 注册不再直接登录：进入邮箱验证流程
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

  // ---------- 本地写入 hook（由 app.js 的 Store.set 调用） ----------
  function onLocalWrite(key) {
    if (!S.auth) return;                    // 未登录不追踪
    if (!SYNC_KEYS.includes(key)) return;
    if (!S.meta.docs[key]) S.meta.docs[key] = { rev: 0, dirtyAt: 0 };
    S.meta.docs[key].dirtyAt = Date.now();
    saveMeta();
    scheduleSync();
  }

  function scheduleSync() {
    if (S.timer) clearTimeout(S.timer);
    S.timer = setTimeout(() => { S.timer = 0; syncNow(false); }, DEBOUNCE_MS);
  }

  // ---------- 同步主流程（先拉后推） ----------
  async function syncNow(first) {
    if (!S.auth || !S.auth.token) return;
    if (S.inFlight) return;
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
        // token 过期/失效：静默登出，提示重新登录
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

  // 拉取远端变更写回本地；first 时服务器优先（有 doc 覆盖本地，无 doc 留待 push 推本地）
  async function applyPull(pull, first) {
    let changed = false;
    const docs = (pull && pull.docs) || {};
    for (const key of SYNC_KEYS) {
      const doc = docs[key];
      if (!doc) continue;
      const meta = S.meta.docs[key] || { rev: 0, dirtyAt: 0 };
      if (!first && meta.dirtyAt && meta.dirtyAt >= doc.updatedAt) {
        // 本地有更新的未推送修改：本地胜，跳过（push 阶段会覆盖服务器）
        meta.rev = doc.rev;
        S.meta.docs[key] = meta;
        continue;
      }
      // 服务器胜（或首次同步服务器优先）：写回本地
      if (doc.payload != null && doc.payload !== '') {
        let val;
        try { val = JSON.parse(doc.payload); } catch { continue; }
        await sSet({ [key]: val });
        changed = true;
      }
      S.meta.docs[key] = { rev: doc.rev, dirtyAt: 0 };
    }
    if (pull && pull.serverTime) S.meta.lastServerTime = pull.serverTime;
    await saveMeta();
    if (changed && S.remoteApply) { try { await S.remoteApply(); } catch {} }
  }

  // 推送本地 dirty 文档；冲突时按 LWW 决定本地覆盖重推或服务器覆盖
  async function pushDirty() {
    const ops = [];
    for (const key of SYNC_KEYS) {
      const meta = S.meta.docs[key];
      if (!meta || !meta.dirtyAt) continue;
      const r = await sGet([key]);
      const val = r[key];
      const payload = (val === undefined || val === null) ? '' : JSON.stringify(val);
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
          // 本地胜：以 serverDoc.rev 为 baseRev 重推覆盖
          const r = await sGet([res.key]);
          const payload = JSON.stringify(r[res.key]);
          const retry = await request('/v1/sync', { method: 'POST', body: { ops: [{ key: res.key, baseRev: sd.rev, payload }] } });
          const rr = (retry.results || [])[0];
          if (rr && !rr.conflict && rr.newRev != null) {
            S.meta.docs[res.key] = { rev: rr.newRev, dirtyAt: 0 };
          }
          // 极端情况重推仍冲突：保留 dirtyAt，下轮再试
        } else if (sd) {
          // 服务器胜：覆盖本地
          if (sd.payload != null && sd.payload !== '') {
            try { await sSet({ [res.key]: JSON.parse(sd.payload) }); changed = true; } catch {}
          }
          S.meta.docs[res.key] = { rev: sd.rev, dirtyAt: 0 };
        }
      } else if (res.newRev != null) {
        S.meta.docs[res.key] = { rev: res.newRev, dirtyAt: 0 };
      }
    }
    if (push.serverTime) S.meta.lastServerTime = push.serverTime;
    await saveMeta();
    if (changed && S.remoteApply) { try { await S.remoteApply(); } catch {} }
  }

  // ---------- 对外 API ----------
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
        // 已有会话：后台静默同步一次（不阻塞首屏）
        syncNow(false);
      }
    },
    onLocalWrite,
    login, register, resend, logout, syncNow,
    getState,
    isLoggedIn() { return !!(S.auth && S.auth.token); }
  };
})();

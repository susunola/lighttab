/* LightTab - app.js
   Single-file logic: storage / wallpaper / clock / search / icon grid / settings / drag & drop.
   Uses native HTML5 drag and drop. Zero external dependencies.
*/
(() => {
  'use strict';

  // ---------- i18n (js/i18n.js exposes window.LT_I18N; this file loads after it) ----------
  const t = (k, v) => (window.LT_I18N ? window.LT_I18N.t(k, v) : k);
  const lang = () => (window.LT_I18N ? window.LT_I18N.getLang() : 'zh');
  const isEn = () => lang() === 'en';
  function engName(e) { return t('eng.' + e.id) || e.name; }

  // ---------- Constants ----------
  // ENGINES: `id` is the stable key used for storage and for the i18n lookup `eng.<id>`.
  // `name` is only an English fallback for when the i18n layer is unavailable.
  const ENGINES = [
    { id: 'baidu',    name: 'Baidu',  url: 'https://www.baidu.com/s?wd={q}',                            color: '#2932e1' },
    { id: 'bing',     name: 'Bing',   url: 'https://www.bing.com/search?q={q}',                          color: '#008373' },
    { id: 'google',   name: 'Google', url: 'https://www.google.com/search?q={q}',                        color: '#4285F4' },
    { id: 'sogou',    name: 'Sogou',  url: 'https://www.sogou.com/web?query={q}',                        color: '#fb6f19' },
    { id: 'github',   name: 'GitHub', url: 'https://github.com/search?q={q}&type=repositories',          color: '#1f2937' },
    { id: 'bilibili', name: 'B 站',   url: 'https://search.bilibili.com/all?keyword={q}',                color: '#fb7299' },
    // AI chats: Doubao / ChatGPT are auto-filled and submitted by the content script (js/inject-ai.js).
    // The prompt never travels in the URL: in extension mode it goes through lt.pending.<nonce>
    // (the URL only carries lt_auto=1&lt_k=<nonce>); preview mode falls back to a plaintext ?q=.
    { id: 'doubao',   name: 'Doubao AI', url: 'https://www.doubao.com/chat/',                      color: '#3d8cff', ai: true, injected: true },
    { id: 'openai',   name: 'ChatGPT', url: 'https://chatgpt.com/',                               color: '#10a37f', ai: true, injected: true },
    // WorkBuddy uses the official task deep link (workbuddy://task?action=start&prompt=...):
    // it launches the desktop client and pre-fills the prompt into a new task draft.
    { id: 'wbai',     name: 'WorkBuddy', url: 'workbuddy://task?action=start&prompt={q}',        color: '#22d3ee', ai: true, deeplink: true }
  ];

  const WALLPAPERS = [
    { id: 'midnight', name: 'Dusk Blue',    css: 'linear-gradient(135deg,#0b1426 0%,#152a4f 45%,#1c3d6e 100%)' },
    { id: 'aurora',   name: 'Aurora',       css: 'linear-gradient(135deg,#0f1c3a 0%,#1e3a6e 50%,#2d5f8f 100%)' },
    { id: 'violet',   name: 'Night Violet', css: 'linear-gradient(135deg,#0f0a26 0%,#2b1b54 50%,#432e7a 100%)' },
    { id: 'teal',     name: 'Teal',         css: 'linear-gradient(135deg,#0a1e25 0%,#0e3239 50%,#15525b 100%)' },
    { id: 'graphite', name: 'Graphite',     css: 'linear-gradient(135deg,#0e1117 0%,#1f242e 50%,#2a3038 100%)' },
    { id: 'rose',     name: 'Dusk Red',     css: 'linear-gradient(135deg,#1a0f1a 0%,#3d1b2e 50%,#5a2540 100%)' }
  ];

  const DEFAULT_SITES = [
    { id: nid(), title: 'GitHub',         url: 'https://github.com',            color: '#181717' },
    { id: nid(), title: 'GitHub',     url: 'https://github.com',         color: '#1f2937' },
    { id: nid(), title: 'ChatGPT',    url: 'https://chatgpt.com',        color: '#10a37f' },
    { id: nid(), title: 'Gmail',      url: 'https://mail.google.com',    color: '#EA4335' },
    { id: nid(), title: 'X',              url: 'https://x.com',                 color: '#000000' },
    { id: nid(), title: 'Reddit',         url: 'https://www.reddit.com',        color: '#FF4500' },
    { id: nid(), title: 'Wikipedia',      url: 'https://en.wikipedia.org',      color: '#000000' },
    { id: nid(), title: 'Notion',         url: 'https://www.notion.so',         color: '#000000' },
    { id: nid(), title: 'Figma',          url: 'https://www.figma.com',         color: '#F24E1E' },
    { id: nid(), title: 'Stack Overflow', url: 'https://stackoverflow.com',     color: '#F58025' }
  ];

  const DEFAULT_SETTINGS = {
    engine: 'baidu',
    name: '',
    lang: 'zh',
    // Theme: 'dark' | 'light' | 'system' (follow the OS scheme).
    theme: 'dark',
    wallpaper: WALLPAPERS[0],
    // Daily Bing wallpaper auto-rotate: when on, one Bing daily image from the local pool is
    // applied per calendar day. Manual picks always win for the rest of that day.
    wallRotate: false,
    // Groups: array of { id, name }. Empty = grouping disabled (group bar hidden, and the
    // shortcut dialog does not show the group dropdown).
    groups: [],
    // Free canvas layout: { wclock/wcal/wtodo/search/grid: {x,y,w} }.
    // null = fall back to the default two-column flow layout.
    layout: null
  };

  // Built-in prompt templates.
  //   name    display name
  //   tmpl    prompt body; {q} is the slot for whatever the user types
  //   hint    input placeholder shown once the template is selected
  //   targets which engines to launch to
  //   wb      only applies when targets includes 'wbai' - extra WorkBuddy deep-link
  //           parameters (expertId / model / mode / cwd)
  const DEFAULT_PROMPTS = [
    { id: nid(), name: 'Translate to English', tmpl: 'Please translate the following into natural, fluent English, preserving the original tone and formatting:\n\n{q}', hint: 'Paste the text to translate…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'Translate to Chinese', tmpl: 'Please translate the following into natural, fluent Chinese, preserving the original tone and formatting:\n\n{q}', hint: 'Paste the text to translate…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'Polish writing', tmpl: 'You are a senior editor. Polish the text below so it reads tighter and clearer, then briefly list the main changes you made:\n\n{q}', hint: 'Paste the text to polish…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'Explain code', tmpl: 'Explain what the code below does, section by section. Call out potential bugs and concrete improvements:\n\n{q}', hint: 'Paste code…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'Weekly report', tmpl: 'Turn the raw work log below into a structured weekly report with four sections: Done / In progress / Risks / Next week:\n\n{q}', hint: 'Paste your work log for the week…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'Summarize', tmpl: 'Condense the content below into a bullet list — one point per line, ordered by importance:\n\n{q}', hint: 'Paste a long article or meeting notes…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'WorkBuddy task', tmpl: 'Help me complete the following task. First outline a plan, then execute it step by step; cite evidence for any external facts:\n\n{q}', hint: 'Describe the task for WorkBuddy…', targets: ['wbai'] }
  ];

  // ---------- Utilities ----------
  function nid() { return 's_' + Math.random().toString(36).slice(2, 10); }
  function hostnameOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }
  function normalizeUrl(raw) {
    let u = (raw || '').trim();
    if (!u) return null;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const x = new URL(u);
      if (!/^https?:$/.test(x.protocol)) return null;
      return x.toString();
    } catch { return null; }
  }
  function pickColor(seed) {
    const palette = [
      '#6366f1', '#0ea5e9', '#06b6d4', '#14b8a6',
      '#22c55e', '#eab308', '#f97316', '#ef4444',
      '#ec4899', '#a855f7', '#8b5cf6', '#3b82f6'
    ];
    let h = 0;
    for (const c of seed || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return palette[h % palette.length];
  }
  function inkOn(bg) {
    const c = (bg || '').replace('#', '');
    if (c.length < 6) return '#1f2937';
    const r = parseInt(c.substr(0, 2), 16);
    const g = parseInt(c.substr(2, 2), 16);
    const b = parseInt(c.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 156 ? '#1f2937' : '#fff';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  // Does the input look like a URL? An explicit scheme always counts; a bare domain may carry a
  // path/query/hash (github.com/susunola). Search phrases containing spaces are never misread as URLs.
  function looksLikeUrl(q) {
    return /^https?:\/\//i.test(q) || /^[^\s]+\.[a-z]{2,}([/?#]\S*)?$/i.test(q);
  }
  // Wallpaper URL allow-list (guards against CSS injection): only data:image/ and https: are accepted,
  // and quotes / backslashes / newlines are rejected outright.
  function sanitizeWallpaperUrl(v) {
    if (typeof v !== 'string' || !v) return null;
    if (/['"\\\r\n]/.test(v)) return null;
    if (/^data:image\//i.test(v) || /^https:/i.test(v)) return v;
    return null;
  }
  // Custom per-card icon guard: only local base64 raster images (data:image/png|jpeg|webp|gif),
  // length-capped at 128 KiB so an icon can never bloat storage / cloud-sync / export payloads.
  // Everything else (remote URLs, svg data:, oversized blobs) is rejected outright.
  function sanitizeIconDataUrl(v) {
    if (typeof v !== 'string' || !v || v.length > 128 * 1024) return null;
    if (/['"\\\r\n]/.test(v)) return null;
    if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) return null;
    return v;
  }
  // Whether focus currently sits in a text-entry element (input / textarea / select / contenteditable).
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function greetingFor(d) {
    const h = d.getHours();
    if (h >= 5 && h < 11) return t('greet.morning');
    if (h >= 11 && h < 13) return t('greet.noon');
    if (h >= 13 && h < 18) return t('greet.afternoon');
    if (h >= 18 && h < 23) return t('greet.evening');
    return t('greet.night');
  }
  function chipFor(d) {
    const h = d.getHours();
    if (h >= 5 && h < 11) return t('chip.morning');
    if (h >= 11 && h < 13) return t('chip.noon');
    if (h >= 13 && h < 18) return t('chip.afternoon');
    if (h >= 18 && h < 23) return t('chip.evening');
    return t('chip.night');
  }
  const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const EN_MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const EN_WEEKS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const EN_WEEKS_S = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dateLine(d) {
    if (isEn()) {
      return `${EN_WEEKS_S[d.getDay()]}, ${EN_MONTHS_S[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    }
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
  }
  function chipDate(d) {
    if (isEn()) return `${EN_MONTHS_S[d.getMonth()]} ${d.getDate()}`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  // Chinese lunar date (needs window.LT_LUNAR from js/lunar.js; degrades silently to '' when absent).
  function lunarLine(d) {
    if (!window.LT_LUNAR) return '';
    const lu = window.LT_LUNAR.toLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (!lu) return '';
    if (isEn()) {
      const mo = window.LT_LUNAR.monthNameEn(lu.month, lu.isLeap);
      const da = window.LT_LUNAR.dayNameEn(lu.day);
      const an = window.LT_LUNAR.animalYearEn(lu.year);
      return `Lunar ${mo} ${da} · Year of the ${an}`;
    }
    const gz = window.LT_LUNAR.ganzhiYear(lu.year);
    const an = window.LT_LUNAR.animalYear(lu.year);
    const mo = window.LT_LUNAR.monthName(lu.month, lu.isLeap);
    const da = window.LT_LUNAR.dayName(lu.day);
    return `农历 ${mo}${da} · ${gz}${an}年`;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // ---------- Store (chrome.storage.local, with a localStorage fallback) ----------
  // Data-model schema version: +1 on any structural change (added / renamed / reinterpreted field), then update MIGRATIONS.
  const SCHEMA_VERSION = 3;
  const K = { settings: 'lt.settings', items: 'lt.items', wallpaper: 'lt.wallpaper', todos: 'lt.todos', prompts: 'lt.prompts', walllib: 'lt.walllib', rot: 'lt.rot', schema: 'lt.schema' };
  // Key prefix for the temporary prompt channel: lt.pending.<nonce> = { p, t }. Hands the prompt
  // to the content script across tabs without ever putting it in the URL.
  const PENDING_PREFIX = 'lt.pending.';
  const PENDING_TTL = 30 * 60 * 1000; // unconsumed for 30 minutes = orphaned
  const hasChromeStorage = !!(window.chrome && chrome.storage && chrome.storage.local);
  // Friendly per-key message shown when a write fails. Stores i18n keys, resolved at render time.
  const KEY_TIPS = {
    [K.wallpaper]: 'store.wallpaper',
    [K.settings]: 'store.settings',
    [K.items]: 'store.items',
    [K.todos]: 'store.todos',
    [K.prompts]: 'store.prompts'
  };

  const Store = {
    async getAll() {
      if (hasChromeStorage) {
        const r = await chrome.storage.local.get([K.settings, K.items, K.wallpaper, K.todos, K.prompts, K.schema]);
        return { settings: r[K.settings], items: r[K.items], wallpaper: r[K.wallpaper], todos: r[K.todos], prompts: r[K.prompts], schema: r[K.schema] };
      }
      return {
        settings: readJSON(K.settings),
        items: readJSON(K.items),
        wallpaper: readJSON(K.wallpaper),
        todos: readJSON(K.todos),
        prompts: readJSON(K.prompts),
        schema: readJSON(K.schema)
      };
    },
    async set(key, val) {
      try {
        if (hasChromeStorage) await chrome.storage.local.set({ [key]: val });
        else localStorage.setItem(key, JSON.stringify(val));
        // Cloud sync: mark dirty after writing a data key (the sync module ignores this while logged out).
        if (window.LT_SYNC) window.LT_SYNC.onLocalWrite(key);
      } catch (err) {
        console.warn('[LightTab] save failed', key, err);
        // A failed write must not block the main flow, but the user has to know (wallpaper dataURLs hit the quota first).
        const tip = t(KEY_TIPS[key] || 'store.generic');
        try { showToast(tip, null, null, 4200); } catch {}
      }
    }
  };
  function readJSON(k) {
    const v = localStorage.getItem(k);
    if (v == null) return undefined;
    try { return JSON.parse(v); } catch { return undefined; }
  }
  // Direct chrome.storage.local / localStorage access that deliberately skips Store.set, so pure-local
  // caches (Bing wallpaper pool, daily-rotate bookkeeping) never get marked dirty for cloud sync or export.
  async function localRawGet(k) {
    try {
      if (hasChromeStorage) return (await chrome.storage.local.get(k))[k];
      return readJSON(k);
    } catch { return undefined; }
  }
  async function localRawSet(k, v) {
    try {
      if (hasChromeStorage) await chrome.storage.local.set({ [k]: v });
      else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { console.warn('[LightTab] local write failed', k, e); }
  }

  // ---------- State ----------
  // Group view (session only, never persisted): VIEW_ALL = all / VIEW_NONE = ungrouped / anything else = a group id.
  const VIEW_ALL = '__all__';
  const VIEW_NONE = '__ungrouped__';
  const state = {
    settings: structuredClone(DEFAULT_SETTINGS),
    items: [],
    wallpaper: null, // {type:'gradient'|'image', value}
    todos: [],
    prompts: [],
    view: VIEW_ALL
  };
  let currentEngine = ENGINES[0];
  let activePrompt = null; // template picked and waiting to launch (session only, not persisted)
  let clockTimer = null;
  let pendingIcon = null; // unsaved custom card icon (dataURL) held by the shortcut modal until Save

  // ---------- Wallpaper ----------
  function applyWallpaper(wp) {
    const el = document.getElementById('wallpaper');
    el.classList.toggle('bg-light', !!(wp && wp.type === 'image' && wp.light));
    if (!wp || !wp.type) {
      el.style.background = WALLPAPERS[0].css;
      return;
    }
    if (wp.type === 'image' && sanitizeWallpaperUrl(wp.value)) {
      el.style.background = `center/cover no-repeat url("${sanitizeWallpaperUrl(wp.value)}")`;
    } else if (wp.type === 'gradient' && wp.value) {
      el.style.background = wp.value;
    } else {
      // An invalid image URL also falls back to the default gradient.
      el.style.background = WALLPAPERS[0].css;
    }
  }
  function pickWallpaperFromData(data) {
    // Both the import and read paths go through the allow-list; an invalid image URL falls back to the gradient.
    if (data && data.type === 'image' && sanitizeWallpaperUrl(data.value)) {
      return { ...data, value: sanitizeWallpaperUrl(data.value) };
    }
    if (data && data.type === 'gradient' && data.value) return data;
    // Legacy compatibility: nothing saved -> fall back to the default gradient.
    return { type: 'gradient', value: WALLPAPERS[0].css };
  }
  async function setWallpaper(wp) {
    state.wallpaper = wp;
    applyWallpaper(wp);
    await Store.set(K.wallpaper, wp);
  }

  // ---------- Wallpaper library (Bing daily images, proxied by the backend to work around CORS) ----------
  // The backend origin is shared with sync.js via window.LT_API_BASE (sync.js loads first and defines it);
  // the literal here is a defensive fallback in case the load order ever changes.
  const WALL_LIB_BASE = window.LT_API_BASE || 'https://lighttab.atomwangnus.com';
  let wallLibImages = null;    // [{url,title,copyright}] of the current pool (null = not loaded yet)
  let wallLibSavedAt = 0;      // ms epoch of the last successful fetch (drives the once-a-day silent refresh)

  // Gradient swatch rendering (top level so bindSettings and the wallpaper library can both reuse it).
  function renderSwatches() {
    const swEl = document.getElementById('swatches');
    if (!swEl) return;
    const currentId = state.wallpaper?.type === 'gradient'
      ? WALLPAPERS.findIndex(w => w.css === state.wallpaper.value)
      : -1;
    swEl.innerHTML = WALLPAPERS.map((w, i) => `
      <div class="swatch ${i === currentId ? 'active' : ''}" data-i="${i}" style="background:${w.css}">
        <span class="label">${t('wp.' + w.id)}</span>
      </div>
    `).join('') + (state.wallpaper?.type === 'image' && sanitizeWallpaperUrl(state.wallpaper.value) ? `
      <div class="swatch active" data-i="img" style="background:center/cover url('${sanitizeWallpaperUrl(state.wallpaper.value)}')">
        <span class="label">${t('wp.custom')}</span>
      </div>
    ` : '');
    swEl.querySelectorAll('.swatch').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.i === 'img') return;
        const w = WALLPAPERS[+el.dataset.i];
        setWallpaper({ type: 'gradient', value: w.css });
        markManualPickToday(); // a manual pick wins for the rest of this calendar day
        renderSwatches();
      });
    });
  }

  // Wallpaper-library cache lives in lt.walllib (chrome.storage.local), deliberately NOT in the synced /
  // exported key set: it is a pure convenience pool that each device refetches on its own.
  async function loadWallLibCache() {
    try {
      const raw = await localRawGet(K.walllib);
      if (raw && Array.isArray(raw.images)) {
        const imgs = raw.images.filter(im => im && sanitizeWallpaperUrl(im.url));
        if (imgs.length) {
          wallLibSavedAt = Number(raw.savedAt) || 0;
          return imgs;
        }
      }
    } catch { /* fall through */ }
    return null;
  }
  async function saveWallLibCache(images) {
    wallLibSavedAt = Date.now();
    await localRawSet(K.walllib, { savedAt: wallLibSavedAt, images });
  }

  async function fetchWallLib(opts) {
    const o = opts || {};
    const btn = document.getElementById('btn-wall-fetch');
    const tip = document.getElementById('wall-lib-tip');
    if (!o.silent && btn) btn.disabled = true;
    if (!o.silent && tip) tip.textContent = t('wall.loading');
    try {
      const res = await fetch(WALL_LIB_BASE + '/v1/wallpapers?idx=0&n=8&mkt=' + (isEn() ? 'en-US' : 'zh-CN'));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      wallLibImages = (data.images || []).filter(im => im && sanitizeWallpaperUrl(im.url));
      if (wallLibImages.length) await saveWallLibCache(wallLibImages);
      renderWallLibGrid();
      if (!o.silent && tip) tip.textContent = t('wall.got', { n: wallLibImages.length });
    } catch (e) {
      // Offline / backend hiccup: fall back to the last cached pool so the grid and the daily rotate
      // still have something to work with. The failure is only surfaced on an explicit user fetch.
      const cached = await loadWallLibCache();
      wallLibImages = cached;
      renderWallLibGrid();
      if (!o.silent && tip) {
        tip.textContent = cached
          ? t('wall.got_cached', { n: cached.length })
          : t('wall.fail', { err: (e && e.message) || e });
      }
    } finally {
      if (!o.silent && btn) btn.disabled = false;
    }
  }

  function renderWallLibGrid() {
    const grid = document.getElementById('wall-lib-grid');
    if (!grid) return;
    if (!wallLibImages || !wallLibImages.length) { grid.innerHTML = ''; return; }
    const cur = state.wallpaper && state.wallpaper.type === 'image' ? state.wallpaper.value : '';
    grid.innerHTML = wallLibImages.map(im => `
      <div class="wall-thumb ${im.url === cur ? 'active' : ''}" data-url="${escapeHtml(im.url)}" title="${escapeHtml(im.copyright || im.title || '')}">
        <img src="${escapeHtml(im.url)}" alt="${escapeHtml(im.title || '')}" loading="lazy">
        <span class="wall-thumb-copy">${escapeHtml(im.title || im.copyright || '')}</span>
      </div>
    `).join('');
    grid.querySelectorAll('.wall-thumb').forEach(el => {
      el.addEventListener('click', async () => {
        await setWallpaper({ type: 'image', value: el.dataset.url });
        markManualPickToday(); // a manual pick wins for the rest of this calendar day
        renderSwatches();
        renderWallLibGrid();
        showToast(t('toast.wall_applied'));
      });
    });
  }

  // ---------- Wallpaper daily auto-rotate (local bookkeeping only; never synced/exported) ----------
  // Contract: when the user enables it in Settings, exactly one Bing pool image is applied per calendar
  // day. Any manual pick (gradient swatch / library thumb / upload / reset) marks today as "decided",
  // so an auto-rotate never overrides a choice the user made this same day.
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  async function rotRead() {
    const r = await localRawGet(K.rot);
    return (r && typeof r === 'object') ? r : null;
  }
  async function markManualPickToday() {
    try { await localRawSet(K.rot, { date: todayStr() }); } catch { /* best effort */ }
  }
  // Pure picker (exported for offline smoke): prefer the first pool image that differs from the current
  // one so two consecutive days never show the same photo; fall back to pool[0]; null when pool is empty.
  function pickRotateCandidate(pool, currentUrl) {
    const arr = Array.isArray(pool) ? pool : [];
    const hit = arr.find(im => im && im.url && im.url !== currentUrl);
    return hit || arr[0] || null;
  }
  async function maybeAutoRotate() {
    try {
      if (!state.settings.wallRotate) return;
      const today = todayStr();
      const rot = await rotRead();
      if (rot && rot.date === today) return; // already rotated or manually picked today
      // Make sure a pool exists: silent network attempt, cached pool as fallback. Failures leave the
      // guard unset, so the next boot / day rollover simply retries.
      if (!Array.isArray(wallLibImages) || !wallLibImages.length) {
        await fetchWallLib({ silent: true });
      }
      const pool = Array.isArray(wallLibImages) ? wallLibImages : [];
      if (!pool.length) return;
      const cur = (state.wallpaper && state.wallpaper.type === 'image') ? state.wallpaper.value : '';
      const next = pickRotateCandidate(pool, cur);
      if (!next || !next.url) return;
      await setWallpaper({ type: 'image', value: next.url });
      await localRawSet(K.rot, { date: today, url: next.url });
      renderSwatches();
      renderWallLibGrid(); // keep the modal's active markers honest if it happens to be open
      // Keep the pool fresh for the coming days: one silent background refresh per ~18h window,
      // never blocking the apply above and never retried while the pool is already loaded.
      if (wallLibImages.length && Date.now() - (wallLibSavedAt || 0) > 18 * 3600 * 1000) {
        fetchWallLib({ silent: true });
      }
    } catch (e) {
      console.warn('[LightTab] wallpaper auto-rotate failed', e);
    }
  }

  // ---------- Clock / greeting ----------
  function startClock() {
    const hhmmEl = document.getElementById('clock-hhmm');
    const secEl = document.getElementById('clock-sec');
    const dateEl = document.getElementById('clock-date');
    const lunarEl = document.getElementById('clock-lunar');
    const greetEl = document.getElementById('clock-greet');
    const chipEl = document.getElementById('date-chip');
    let lastMinute = -1, lastHour = -1, lastDay = '';

    function tick() {
      const d = new Date();
      const hh = d.getHours();
      const mm = d.getMinutes();
      const ss = pad2(d.getSeconds());
      // Seconds tick every second; hh:mm, greeting and the date chip only touch the DOM when their own period rolls over.
      secEl.textContent = ss;
      if (hh * 60 + mm !== lastMinute) {
        lastMinute = hh * 60 + mm;
        hhmmEl.textContent = `${pad2(hh)}:${pad2(mm)}`;
      }
      if (hh !== lastHour) {
        lastHour = hh;
        const sep = isEn() ? ', ' : '，';
        const nm = state.settings.name ? `${sep}${state.settings.name}` : '';
        greetEl.textContent = `${greetingFor(d)}${nm}`;
        chipEl.textContent = `${chipDate(d)} · ${chipFor(d)}`;
      }
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        dateEl.textContent = dateLine(d);
        if (lunarEl) lunarEl.textContent = lunarLine(d);
        // Runs on boot (lastDay starts empty) and again on every midnight rollover, so a tab left open
        // across days still rotates the wallpaper. Guarded internally by settings + the today marker.
        maybeAutoRotate();
      }
    }
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  // ---------- Search engines ----------
  function setEngine(id) {
    const e = ENGINES.find(x => x.id === id) || ENGINES[0];
    currentEngine = e;
    const btn = document.getElementById('engine-btn');
    btn.querySelector('.eng-name').textContent = engName(e);
    btn.querySelector('.eng-dot').style.background = `linear-gradient(135deg, ${e.color}, ${shade(e.color, 30)})`;
    document.getElementById('q').placeholder = t('search.placeholder_engine', { engine: engName(e) });
  }
  function shade(hex, percent) {
    const c = hex.replace('#', '');
    const num = parseInt(c, 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function renderEngineList() {
    const ul = document.getElementById('engine-list');
    ul.innerHTML = ENGINES.map((e, i) => `
      <li data-id="${e.id}" class="${e.id === currentEngine.id ? 'active' : ''}">
        <span class="eng-dot" style="background:${e.color}"></span>
        <span>${engName(e)}</span>
        <span class="eng-key">${i + 1}</span>
      </li>
    `).join('');
  }
  // Open the result page: navigate in the current tab by default (no stray blank tabs); hold Cmd/Ctrl for a new tab.
  function openResult(url, ev) {
    if (ev && (ev.metaKey || ev.ctrlKey)) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.href = url;
    }
  }
  function submitSearch(rawQuery, ev) {
    const q = (rawQuery || '').trim();
    // A template is active: the typed text launches to the template targets instead of running a plain search.
    if (activePrompt) {
      if (!q) { showToast(t('ai.enter'), null, null, 3000); document.getElementById('q').focus(); return; }
      launchPrompt(activePrompt, q, ev);
      return;
    }
    if (!q) return;

    // AI engines: WorkBuddy opens via deep link with a pre-filled draft; Doubao / ChatGPT auto-send through the nonce channel.
    if (currentEngine.ai) {
      if (currentEngine.deeplink) {
        window.open(deepLinkUrl(currentEngine, q, null), '_blank');
        showToast(t('ai.wb_launched'), null, null, 3600);
        return;
      }
      if (currentEngine.injected) {
        launchPrompt(null, q, ev); // single engine: keep the same-tab navigation semantics
        return;
      }
      if (!currentEngine.copyOnly) {
        const u = currentEngine.url.replace('{q}', encodeURIComponent(q));
        if (u && u !== currentEngine.url) openResult(u, ev);
      }
      copyText(q);
      showToast(t('ai.copied'), null, null, 3200);
      return;
    }

    if (looksLikeUrl(q)) {
      const url = normalizeUrl(q);
      if (url) { openResult(url, ev); return; }
    }
    const u = currentEngine.url.replace('{q}', encodeURIComponent(q));
    openResult(u, ev);
  }

  // ---------- AI launch: nonce channel + concurrent multi-target ----------
  // Flow: newtab writes the prompt to lt.pending.<nonce> (TTL 30 min) -> the URL only carries lt_k=<nonce>
  // -> the content script on the target site (inject-ai.js) reads it back from extension storage
  // -> the URL is cleaned after sending. Deliberately NOT read-once: concurrent targets share one
  // nonce, so deleting on read would break siblings. Replay protection is the post-send URL cleanup
  // plus the TTL orphan sweep on boot.
  function sweepPending() {
    const now = Date.now();
    const drop = [];
    // raw may already be an object (chrome.storage deserializes for us) or a JSON string (localStorage).
    const collect = (pairs) => {
      for (const [k, raw] of pairs) {
        try {
          const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!rec || typeof rec.p !== 'string' || (now - (rec.t || 0)) > PENDING_TTL) drop.push(k);
        } catch (_) { drop.push(k); } // structurally corrupted leftovers get swept too
      }
    };
    if (hasChromeStorage) {
      chrome.storage.local.get(null).then(all => {
        const pairs = Object.entries(all).filter(([k]) => k.startsWith(PENDING_PREFIX));
        collect(pairs);
        if (drop.length) chrome.storage.local.remove(drop);
      }).catch(() => {});
    } else {
      const pairs = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PENDING_PREFIX)) pairs.push([k, localStorage.getItem(k)]);
      }
      collect(pairs);
      drop.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
    }
  }
  async function putPending(promptText) {
    const nonce = 'n_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    try {
      if (hasChromeStorage) await chrome.storage.local.set({ [PENDING_PREFIX + nonce]: { p: promptText, t: Date.now() } });
      else localStorage.setItem(PENDING_PREFIX + nonce, JSON.stringify({ p: promptText, t: Date.now() }));
      return nonce;
    } catch (err) {
      console.warn('[LightTab] failed to write pending, falling back to a plaintext URL', err);
      return null;
    }
  }
  // URL for injected engines: extension mode carries a nonce (no plaintext); without storage it falls back to a plaintext ?q= (preview mode).
  function injectedUrl(e, text, nonce) {
    if (!e || !e.url) return null;
    if (nonce) return e.url + '?lt_auto=1&lt_k=' + encodeURIComponent(nonce);
    return e.url + '?q=' + encodeURIComponent(text) + '&lt_auto=1';
  }
  // WorkBuddy deep link: pre-filled prompt + optional extra params (expertId/model/mode/cwd). The official protocol caps prompt length.
  function deepLinkUrl(e, text, wb) {
    const cap = String(text || '').slice(0, 7500);
    let u = (e.url || '').replace('{q}', encodeURIComponent(cap));
    if (wb && typeof wb === 'object') {
      const p = [];
      if (wb.expertId) p.push('expertId=' + encodeURIComponent(wb.expertId));
      if (wb.model) p.push('model=' + encodeURIComponent(wb.model));
      if (wb.mode) p.push('mode=' + encodeURIComponent(wb.mode));
      if (wb.cwd) p.push('cwd=' + encodeURIComponent(wb.cwd));
      if (p.length) u += (u.indexOf('?') === -1 ? '?' : '&') + p.join('&');
    }
    return u;
  }
  // Launch entry point: tpl is a template object (tmpl/targets/wb), or null to send the content straight to the current engine.
  // Deep-link targets (workbuddy://) must call window.open synchronously inside the user gesture, so they go first; web targets then use the storage nonce and open concurrently.
  async function launchPrompt(tpl, content, ev) {
    let text;
    if (tpl) {
      const tmpl = typeof tpl.tmpl === 'string' ? tpl.tmpl : '';
      text = tmpl.indexOf('{q}') !== -1 ? tmpl.replace(/\{q\}/g, content || '') : tmpl;
    } else {
      text = content || '';
    }
    if (!text.trim()) return showToast(t('ai.empty'), null, null, 2600);
    let targetIds = tpl ? (tpl.targets || []) : [currentEngine.id];
    targetIds = targetIds.filter(id => ENGINES.some(x => x.id === id));
    if (!targetIds.length) {
      if (tpl) targetIds = [currentEngine.id];
      if (!targetIds.length) return showToast(t('ai.no_target'));
    }
    const engs = targetIds.map(id => ENGINES.find(x => x.id === id)).filter(Boolean);
    const deeplinks = engs.filter(x => x.deeplink);
    const webs = engs.filter(x => !x.deeplink);
    let dlN = 0, webN = 0, blocked = false;
    for (const e of deeplinks) { try { window.open(deepLinkUrl(e, text, tpl && tpl.wb), '_blank'); dlN++; } catch (_) {} }
    if (webs.length) {
      const nonce = hasChromeStorage ? await putPending(text) : null;
      if (webs.length === 1) {
        // Single target: keep openResult semantics (same tab, or new tab with Cmd/Ctrl).
        const u = injectedUrl(webs[0], text, nonce);
        if (u) { openResult(u, ev); webN++; }
      } else {
        const useTabs = !!(nonce && window.chrome && chrome.tabs);
        for (let i = 0; i < webs.length; i++) {
          const u = injectedUrl(webs[i], text, nonce);
          if (!u) continue;
          if (useTabs) {
            try { chrome.tabs.create({ url: u, active: dlN === 0 && i === 0 }); webN++; } catch (_) {}
          } else {
            try { const w = window.open(u, '_blank', 'noopener'); if (!w) blocked = true; else webN++; } catch (_) { blocked = true; }
          }
        }
      }
    }
    if (!webN && !dlN) return showToast(t('ai.fail'));
    const names = engs.map(x => engName(x)).join(' · ');
    if (webN && dlN) showToast(t('ai.wb_multi', { n: webN }));
    else if (dlN) showToast(t('ai.wb_launched'), null, null, 3600);
    else showToast(t('ai.launched', { n: webN, names }), null, null, blocked ? 4200 : 2600);
    if (blocked) setTimeout(() => showToast(t('ai.blocked'), null, null, 3200), blocked ? 2600 : 0);
    if (tpl) { tpl.lastUsedAt = Date.now(); savePrompts(); }
    sparkFx();
    sweepPending();
    clearActiveTemplate();
  }

  // ---------- Launch animation signature: scattering sparks (the LightTab visual signature) ----------
  function sparkFx() {
    const anchor = document.getElementById('search');
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const colors = ['#a78bfa', '#c4b5fd', '#22d3ee', '#7dd3fc', '#f0abfc'];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const ang = Math.random() * Math.PI * 2;
      const dist = 42 + Math.random() * 120;
      s.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      s.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      s.style.color = colors[i % colors.length];
      s.style.left = `${cx}px`;
      s.style.top = `${cy}px`;
      document.body.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
      setTimeout(() => s.remove(), 950);
    }
  }

  // ---------- Prompt template UI: active chip + the "/" palette ----------
  function clearActiveTemplate() {
    activePrompt = null;
    const chip = document.getElementById('tpl-chip');
    if (chip) chip.hidden = true;
    setEngine(currentEngine.id); // restore the default placeholder text
    const q = document.getElementById('q');
    if (q) q.value = '';
  }
  function renderTemplateChip(p) {
    const chip = document.getElementById('tpl-chip');
    if (!p || !chip) return;
    chip.innerHTML = '';
    const nm = document.createElement('span');
    nm.className = 'tpl-name';
    nm.textContent = p.name || t('tpl.default');
    nm.title = p.name || t('tpl.default');
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'tpl-x';
    x.setAttribute('aria-label', t('tpl.cancel'));
    x.textContent = '×';
    x.addEventListener('click', () => { clearActiveTemplate(); document.getElementById('q').focus(); });
    chip.append(nm, x);
    chip.hidden = false;
  }
  function chooseTemplate(p) {
    if (!p) return;
    closePalette(false);
    // No {q} slot = fixed-command template: it fires on selection, no further input needed.
    if (p.tmpl.indexOf('{q}') === -1) { launchPrompt(p, ''); return; }
    activePrompt = p;
    renderTemplateChip(p);
    const q = document.getElementById('q');
    q.placeholder = p.hint || t('tpl.enter_hint');
    q.value = '';
    q.focus();
  }
  // Palette: opened with "/", supports filtering and keyboard selection.
  let palItems = [], palIdx = 0;
  function paletteRows() {
    const inp = document.getElementById('palette-q');
    const kw = (inp ? inp.value : '').trim().toLowerCase();
    const src = state.prompts.filter(p => p && typeof p.tmpl === 'string');
    if (!kw) {
      // No query: recently used float to the top (lastUsedAt desc; the sort is stable so unused ones keep their original order).
      return src.slice().sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    }
    return src.filter(p =>
      (p.name || '').toLowerCase().includes(kw) ||
      (p.hint || '').toLowerCase().includes(kw) ||
      (p.tmpl || '').toLowerCase().includes(kw));
  }
  function renderPalette() {
    palItems = paletteRows();
    if (palIdx > palItems.length - 1) palIdx = Math.max(0, palItems.length - 1);
    const ul = document.getElementById('palette-list');
    ul.innerHTML = palItems.map((p, i) => {
      const dots = (p.targets || []).map(id => {
        const e = ENGINES.find(x => x.id === id);
        return e ? `<i class="p-dot" style="background:${e.color}" title="${escapeHtml(engName(e))}"></i>` : '';
      }).join('');
      const preview = (p.tmpl || '').replace(/\{q\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 46);
      return `
        <li class="${i === palIdx ? 'active' : ''}" data-i="${i}">
          <span class="p-name">${escapeHtml(p.name)}</span>
          <span class="p-dots">${dots || `<span class="p-nodots">${t('tpl.no_target')}</span>`}</span>
          <span class="p-preview">${escapeHtml(preview || p.hint || '')}</span>
        </li>`;
    }).join('');
    document.getElementById('palette-empty').hidden = palItems.length > 0;
    const act = ul.querySelector('li.active');
    if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function openPalette() {
    const p = document.getElementById('palette');
    if (p.hidden === false) return;
    p.hidden = false;
    document.getElementById('engine-list').hidden = true;
    document.getElementById('palette-q').value = '';
    palIdx = 0;
    renderPalette();
    document.getElementById('palette-q').focus();
  }
  function closePalette(refocus) {
    const p = document.getElementById('palette');
    if (!p || p.hidden) return;
    p.hidden = true;
    if (refocus !== false) document.getElementById('q').focus();
  }
  function bindPalette() {
    const inp = document.getElementById('palette-q');
    inp.addEventListener('input', () => { palIdx = 0; renderPalette(); });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); palIdx = Math.min(palIdx + 1, palItems.length - 1); renderPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); palIdx = Math.max(palIdx - 1, 0); renderPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = palItems[palIdx]; if (it) chooseTemplate(it); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      e.stopPropagation();
    });
    document.getElementById('palette-list').addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      const it = palItems[+li.dataset.i];
      if (it) chooseTemplate(it);
    });
    document.getElementById('palette-close').addEventListener('click', () => closePalette());
    document.getElementById('tpl-open').addEventListener('click', () => {
      const p = document.getElementById('palette');
      if (p.hidden) openPalette(); else closePalette();
    });
  }
  // Template manager (Settings -> Templates): row list + inline editor.
  let promptEditingId = null;
  async function savePrompts() {
    await Store.set(K.prompts, state.prompts);
  }
  function renderPromptManager() {
    const box = document.getElementById('prompt-manage');
    if (!box) return;
    const rows = state.prompts.map(p => `
      <div class="prompt-row ${promptEditingId === p.id ? 'open' : ''}" data-id="${p.id}">
        <div class="pr-main">
          <span class="pr-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
          <span class="pr-tmpl" title="${escapeHtml(p.tmpl || '')}">${escapeHtml((p.tmpl || '').slice(0, 40))}</span>
          <span class="pr-tags">${(p.targets || []).map(id => {
            const e = ENGINES.find(x => x.id === id);
            return e ? `<span class="ptag" style="--pc:${e.color};background:${e.color}20;color:${e.color}">${escapeHtml(engName(e))}</span>` : '';
          }).join('') || `<span class="ptag dim">${t('tpl.no_target')}</span>`}</span>
          <span class="pr-acts">
            <button class="btn ghost sm" data-act="edit">${t('prompt.edit')}</button>
            <button class="btn ghost sm danger" data-act="del">${t('prompt.del')}</button>
          </span>
        </div>
        ${promptEditingId === p.id ? promptEditorHtml(p) : ''}
      </div>`).join('');
    box.innerHTML = (state.prompts.length
      ? rows
      : `<div class="pr-empty">${t('prompt.empty')}</div>`)
      + (promptEditingId === 'new' ? promptEditorHtml(null) : '');
    box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const row = b.closest('.prompt-row');
      const id = row ? row.dataset.id : null;
      if (b.dataset.act === 'edit') { promptEditingId = promptEditingId === id ? null : id; renderPromptManager(); }
      if (b.dataset.act === 'del') {
        const p = state.prompts.find(x => x.id === id);
        if (p && confirm(t('toast.prompt_del_confirm', { name: p.name }))) {
          state.prompts = state.prompts.filter(x => x.id !== id);
          promptEditingId = null;
          savePrompts();
          renderPromptManager();
          showToast(t('toast.prompt_deleted'));
        }
      }
    }));
    if (promptEditingId) bindPromptEditor();
  }
  function promptEditorHtml(p) {
    const pv = p || { name: '', tmpl: '', hint: '', targets: [], wb: {} };
    const tg = pv.targets || [];
    const wb = pv.wb || {};
    return `
      <div class="prompt-editor" data-edit-id="${promptEditingId}">
        <label class="pe-field"><span class="pe-lbl">${t('prompt.name')}</span>
          <input class="pe-name" type="text" maxlength="24" placeholder="${escapeHtml(t('prompt.name_ph'))}" value="${escapeHtml(pv.name || '')}"></label>
        <label class="pe-field"><span class="pe-lbl">${t('prompt.tmpl_label')}</span>
          <textarea class="pe-tmpl" rows="3" maxlength="4000" placeholder="${escapeHtml(t('prompt.tmpl_ph')).replace(/\n/g, '&#10;')}">${escapeHtml(pv.tmpl || '')}</textarea></label>
        <label class="pe-field"><span class="pe-lbl">${t('prompt.hint_label')}</span>
          <input class="pe-hint" type="text" maxlength="60" placeholder="${escapeHtml(t('prompt.hint_ph'))}" value="${escapeHtml(pv.hint || '')}"></label>
        <div class="pe-field"><span class="pe-lbl">${t('prompt.targets')}</span>
          <div class="pe-targets">${ENGINES.map(e => `
            <label class="pe-t"><input type="checkbox" value="${e.id}" ${tg.includes(e.id) ? 'checked' : ''}>
            <span class="ptag" style="--pc:${e.color};background:${e.color}20;color:${e.color}">${escapeHtml(engName(e))}</span></label>`).join('')}
          </div>
        </div>
        <div class="wb-fields" ${tg.includes('wbai') ? '' : 'hidden'}>
          <span class="pe-lbl">${t('prompt.wb_label')}</span>
          <div class="wb-grid">
            <input class="pe-wb" data-wbk="expertId" placeholder="expertId" value="${escapeHtml(wb.expertId || '')}">
            <input class="pe-wb" data-wbk="model" placeholder="model" value="${escapeHtml(wb.model || '')}">
            <input class="pe-wb" data-wbk="mode" placeholder="mode" value="${escapeHtml(wb.mode || '')}">
            <input class="pe-wb" data-wbk="cwd" placeholder="cwd" value="${escapeHtml(wb.cwd || '')}">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-act="cancel">${t('prompt.cancel')}</button>
          <button type="button" class="btn primary" data-act="save">${t('prompt.save')}</button>
        </div>
      </div>`;
  }
  function bindPromptEditor() {
    const ed = document.querySelector('#prompt-manage .prompt-editor');
    if (!ed) return;
    ed.querySelector('[data-act="cancel"]').addEventListener('click', () => { promptEditingId = null; renderPromptManager(); });
    ed.querySelector('[data-act="save"]').addEventListener('click', () => savePromptEditor(ed));
    ed.querySelectorAll('.pe-targets input').forEach(cb => cb.addEventListener('change', () => {
      const wf = ed.querySelector('.wb-fields');
      if (wf) wf.hidden = !ed.querySelector('.pe-targets input[value="wbai"]').checked;
    }));
  }
  function savePromptEditor(ed) {
    const id = ed.dataset.editId;
    const name = (ed.querySelector('.pe-name').value || '').trim();
    const tmpl = ed.querySelector('.pe-tmpl').value;
    const hint = (ed.querySelector('.pe-hint').value || '').trim();
    if (!name) return showToast(t('toast.prompt_name_required'));
    if (!tmpl.trim()) return showToast(t('toast.prompt_tmpl_required'));
    const targets = [...ed.querySelectorAll('.pe-targets input:checked')].map(x => x.value).slice(0, 4);
    const wbOn = targets.includes('wbai');
    const wb = wbOn ? {} : null;
    if (wb) {
      ed.querySelectorAll('.pe-wb').forEach(inp => {
        const v = inp.value.trim();
        if (v) wb[inp.dataset.wbk] = v;
      });
    }
    const rec = { name: name.slice(0, 24), tmpl: tmpl.slice(0, 4000), hint: hint.slice(0, 60), targets, wb };
    if (id === 'new') {
      if (state.prompts.length >= 30) return showToast(t('toast.prompt_limit'));
      state.prompts.push({ id: nid(), ...rec });
    } else {
      const p = state.prompts.find(x => x.id === id);
      if (p) Object.assign(p, rec);
    }
    promptEditingId = null;
    savePrompts();
    renderPromptManager();
    showToast(t(id === 'new' ? 'toast.prompt_added' : 'toast.prompt_saved'));
  }

  // ---------- Icon grid ----------
  // Whether a shortcut belongs to the current view (all / ungrouped / a specific group).
  function inView(it) {
    if (state.view === VIEW_ALL) return true;
    if (state.view === VIEW_NONE) return !(it.group || '');
    return (it.group || '') === state.view;
  }
  function renderGrid() {
    const grid = document.getElementById('grid');
    const list = state.view === VIEW_ALL ? state.items : state.items.filter(inView);
    if (!list.length) {
      const hint = state.view === VIEW_ALL
        ? t('grid.empty')
        : t('grid.empty_view');
      grid.innerHTML = `<div class="grid-empty">${hint}</div>`;
      return;
    }
    grid.innerHTML = list.map(it => cardHtml(it)).join('');
    bindCardEvents();
    // Canvas mode: right after rendering, apply (col, row) to the cards and assign coordinates to any new ones.
    if (canvasRoot() && canvasRoot().classList.contains('canvas') && canvasEligible()) {
      applyCardCanvas();
    }
  }
  // ---------- Icon rendering (fully local, zero network requests) ----------
  // Match chain: full host -> host without "www." -> known brand apex-domain suffix
  // -> otherwise a brand-coloured letter tile. See js/icondb.js (simple-icons CC0 paths + brand colours).
  const iconCache = new Map(); // hostname → icon | null
  function iconFor(url) {
    let host = hostnameOf(url);
    if (!host) return null;
    // ICONDB is read-only at runtime, so cache lookups per hostname instead of scanning every suffix on each render.
    if (iconCache.has(host)) return iconCache.get(host);
    const I = window.LT_ICONDB || {};
    let res = I[host] || null;
    if (!res && host.startsWith('www.')) host = host.slice(4);
    if (!res) res = I[host] || null;
    if (!res) {
      for (const key of Object.keys(I)) {
        if (host !== key && host.endsWith('.' + key)) { res = I[key]; break; }
      }
    }
    iconCache.set(host, res);
    return res;
  }
  function cardHtml(it) {
    const host = hostnameOf(it.url) || it.title;
    const icon = iconFor(it.url);
    const customIcon = sanitizeIconDataUrl(it.icon);
    let bg, ink, ico;
    if (customIcon) {
      // User-uploaded image wins over the brand icon; the tile keeps the card colour underneath so
      // transparent PNGs still read as a coloured tile (same look as brand tiles).
      bg = it.color || pickColor(host);
      ico = `<img class="logo-img" src="${customIcon}" alt="" draggable="false">`;
    } else if (icon) {
      bg = icon.c;
      ico = `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="${inkOn(icon.c)}" d="${icon.d}"/></svg>`;
    } else {
      bg = it.color || pickColor(host);
      // Letter fallback: CJK titles use their first character, otherwise the first letter of the hostname, uppercased.
      let letter = (it.title || '').trim().charAt(0);
      if (!/[\u4e00-\u9fa5]/.test(letter)) {
        const h = hostnameOf(it.url);
        letter = (h && h[0] ? h[0] : '?').toUpperCase();
      }
      ico = `<span class="ini">${escapeHtml(letter)}</span>`;
    }
    ink = inkOn(bg);
    const safeTitle = escapeHtml(it.title);
    return `
      <a class="card" href="${escapeHtml(it.url)}" data-id="${it.id}" draggable="true" target="_blank" rel="noopener" title="${safeTitle}">
        <div class="ico" style="background:${bg};color:${ink}">
          ${ico}
        </div>
        <div class="title">${safeTitle}</div>
        <div class="card-actions">
          <span class="mini edit" data-act="edit" title="${t('card.edit')}">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </span>
          <span class="mini del" data-act="del" title="${t('card.del')}">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
          </span>
        </div>
      </a>
    `;
  }

  function bindCardEvents() {
    document.querySelectorAll('#grid a.card').forEach(a => {      a.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: t('ctx.open'), action: () => window.open(a.href, '_blank', 'noopener') },
          { label: t('ctx.copy'), action: () => copyToClipboard(a.href) },
          { sep: true },
          { label: t('ctx.edit'), action: () => openSiteModal(a.dataset.id) },
          { label: t('ctx.del'), danger: true, action: () => deleteItem(a.dataset.id) }
        ]);
      });
      a.querySelector('.edit')?.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        openSiteModal(a.dataset.id);
      });
      a.querySelector('.del')?.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        deleteItem(a.dataset.id);
      });
    });
    // drag & drop
    let dragId = null;
    document.querySelectorAll('#grid a.card').forEach(a => {
      a.addEventListener('dragstart', e => {
        // Dragging a link onto the address bar would open it, so suppress the default link-drag visuals.
        if (e.target.closest('.card-actions')) { e.preventDefault(); return; }
        dragId = a.dataset.id;
        a.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch {}
      });
      a.addEventListener('dragend', () => {
        a.classList.remove('dragging');
        document.querySelectorAll('.card.drag-over').forEach(n => n.classList.remove('drag-over'));
        dragId = null;
      });
      a.addEventListener('dragover', e => {
        if (!dragId || dragId === a.dataset.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.card.drag-over').forEach(n => n.classList.remove('drag-over'));
        a.classList.add('drag-over');
      });
      a.addEventListener('dragleave', () => a.classList.remove('drag-over'));
      a.addEventListener('drop', async e => {
        e.preventDefault();
        if (!dragId || dragId === a.dataset.id) return;
        const rect = a.getBoundingClientRect();
        // The grid flows horizontally across columns, so use the horizontal midpoint to pick insert-before vs insert-after.
        const before = (e.clientX - rect.left) < rect.width / 2;
        // Reordering only happens between cards visible in the current view, so reorder the visible subset first.
        const scope = state.items.filter(inView);
        const fromIdx = scope.findIndex(x => x.id === dragId);
        const toIdx0 = scope.findIndex(x => x.id === a.dataset.id);
        if (fromIdx < 0 || toIdx0 < 0) return;
        const [moved] = scope.splice(fromIdx, 1);
        let toIdx = scope.findIndex(x => x.id === a.dataset.id);
        if (!before) toIdx += 1;
        scope.splice(toIdx, 0, moved);
        if (state.view === VIEW_ALL) {
          // "All" view: the visible subset is the whole set, so write it straight back.
          state.items = scope;
        } else {
          // Group / ungrouped view: rewrite the visible slots in the new order and leave hidden items anchored in place.
          let k = 0;
          state.items = state.items.map(it => inView(it) ? scope[k++] : it);
        }
        await Store.set(K.items, state.items);
        syncUI();
      });
    });
  }

  async function deleteItem(id) {
    const idx = state.items.findIndex(x => x.id === id);
    if (idx < 0) return;
    const removed = state.items.splice(idx, 1)[0];
    await Store.set(K.items, state.items);
    syncUI();
    // Undo: each closure captures the item and index at deletion time, so repeated deletes each restore correctly.
    showToast(t('toast.deleted'), t('toast.undo'), async () => {
      state.items.splice(Math.min(idx, state.items.length), 0, removed);
      await Store.set(K.items, state.items);
      syncUI();
    }, 5000);
  }

  // ---------- Context menu ----------
  let menuEl;
  function openContextMenu(x, y, items) {
    if (!menuEl) menuEl = document.getElementById('context-menu');
    menuEl.innerHTML = items.map((it, i) => {
      if (it.sep) return '<div class="sep"></div>';
      return `<div class="item ${it.danger ? 'danger' : ''}" data-i="${i}">${escapeHtml(it.label)}</div>`;
    }).join('');
    menuEl.style.left = '0px'; menuEl.style.top = '0px';
    menuEl.hidden = false;
    const r = menuEl.getBoundingClientRect();
    const maxX = window.innerWidth - r.width - 8;
    const maxY = window.innerHeight - r.height - 8;
    menuEl.style.left = Math.min(x, maxX) + 'px';
    menuEl.style.top = Math.min(y, maxY) + 'px';
    menuEl.onclick = (e) => {
      const row = e.target.closest('.item');
      if (!row) return;
      const act = items[+row.dataset.i];
      if (act && act.action) act.action();
      closeContextMenu();
    };
  }
  function closeContextMenu() {
    if (menuEl) menuEl.hidden = true;
  }
  document.addEventListener('click', e => {
    if (menuEl && !menuEl.hidden && !menuEl.contains(e.target)) closeContextMenu();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeContextMenu(); });

  // ---------- Modal (shortcut) ----------
  // Group dropdown: the whole row hides when there are no groups; otherwise it preselects the item's own group or the current view's group.
  function fillGroupSelect(sel) {
    sel.innerHTML = `<option value="">${t('group.ungrouped')}</option>` +
      state.settings.groups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  }
  function openSiteModal(id) {
    const modal = document.getElementById('modal-site');
    const titleEl = document.getElementById('site-modal-title');
    const form = document.getElementById('site-form');
    form.reset();
    const row = document.getElementById('f-group-row');
    const sel = document.getElementById('f-group');
    row.hidden = state.settings.groups.length === 0;
    let it = null;
    if (id) {
      it = state.items.find(x => x.id === id);
      if (!it) return;
      titleEl.textContent = t('site.edit');
      form.elements['title'].value = it.title;
      form.elements['url'].value = it.url;
      form.dataset.editId = id;
    } else {
      titleEl.textContent = t('site.add');
      delete form.dataset.editId;
    }
    if (!row.hidden) {
      fillGroupSelect(sel);
      // Preselect: editing keeps the original group; adding uses the currently viewed group, or ungrouped.
      let cur = '';
      if (id) {
        cur = (state.items.find(x => x.id === id) || {}).group || '';
      } else if (state.view !== VIEW_ALL && state.view !== VIEW_NONE) {
        cur = state.view;
      }
      sel.value = state.settings.groups.some(g => g.id === cur) ? cur : '';
    }
    // Custom icon state: start from the item's stored icon when editing, empty when adding.
    pendingIcon = id ? (sanitizeIconDataUrl(it.icon) || null) : null;
    const iconInput = document.getElementById('f-icon');
    if (iconInput) iconInput.value = '';
    renderIconPreview();
    modal.hidden = false;
    setTimeout(() => form.elements['title'].focus(), 30);
  }
  // Live "what will this card look like" tile in the shortcut modal: uploaded image wins; otherwise the
  // brand icon (or letter tile) is derived from whatever URL / title is currently typed.
  function renderIconPreview() {
    const box = document.getElementById('f-icon-preview');
    const rmBtn = document.getElementById('f-icon-remove');
    if (!box) return;
    box.style.background = '';
    box.style.color = '';
    if (pendingIcon) {
      box.innerHTML = `<img src="${pendingIcon}" alt="" draggable="false">`;
      if (rmBtn) rmBtn.hidden = false;
      return;
    }
    const url = normalizeUrl(document.getElementById('f-url').value.trim());
    const host = url ? hostnameOf(url) : '';
    const icon = url ? iconFor(url) : null;
    if (icon) {
      box.innerHTML = `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="${inkOn(icon.c)}" d="${icon.d}"/></svg>`;
      box.style.background = icon.c;
    } else if (host) {
      const titleVal = document.getElementById('f-title').value.trim();
      let letter = (titleVal || '').charAt(0) || host.charAt(0);
      if (letter && /[a-zA-Z]/.test(letter)) letter = letter.toUpperCase();
      const bg = pickColor(host);
      box.innerHTML = `<span class="ini">${escapeHtml(letter)}</span>`;
      box.style.background = bg;
      box.style.color = inkOn(bg);
    } else {
      box.innerHTML = '<span class="ini">?</span>';
      box.style.color = '';
    }
    if (rmBtn) rmBtn.hidden = true;
  }
  function bindSiteForm() {
    const modal = document.getElementById('modal-site');
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.hidden = true));
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
    const form = document.getElementById('site-form');
    // Custom card icon: upload (square-crop + compress to a small PNG/JPG dataURL), live preview,
    // remove-to-revert. Nothing is persisted until Save; Cancel simply drops the pending icon.
    const iconInput = document.getElementById('f-icon');
    if (iconInput) iconInput.addEventListener('change', async () => {
      const f = iconInput.files && iconInput.files[0];
      iconInput.value = ''; // allow re-selecting the same file next time
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) return showToast(t('toast.image_too_big'));
      try {
        pendingIcon = await compressIconSquare(f, 160);
        renderIconPreview();
      } catch (err) {
        console.warn('[LightTab] icon upload failed', err);
        showToast(t('toast.icon_invalid'));
      }
    });
    const rmIconBtn = document.getElementById('f-icon-remove');
    if (rmIconBtn) rmIconBtn.addEventListener('click', () => {
      pendingIcon = null;
      renderIconPreview();
    });
    ['f-url', 'f-title'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderIconPreview);
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = form.elements['title'].value.trim();
      const url = normalizeUrl(form.elements['url'].value);
      if (!title) return showToast(t('toast.name_required'));
      if (!url) return showToast(t('toast.url_invalid'));
      const group = document.getElementById('f-group').value || '';
      const editId = form.dataset.editId;
      const icon = sanitizeIconDataUrl(pendingIcon) || undefined;
      if (editId) {
        const it = state.items.find(x => x.id === editId);
        if (it) { it.title = title; it.url = url; it.group = group; it.icon = icon; }
      } else {
        state.items.push({ id: nid(), title, url, group, icon });
      }
      await Store.set(K.items, state.items);
      modal.hidden = true;
      syncUI();
    });
  }

  // ---------- Groups ----------
  // Refresh grid and group bar together (called after any add / edit / delete / drag).
  function syncUI() {
    renderGrid();
    renderGroupBar();
  }
  function groupCount(fn) { return state.items.filter(fn).length; }
  function renderGroupBar() {
    const bar = document.getElementById('group-bar');
    bar.hidden = false; // the group bar is always visible (with no groups it only shows the "new group" entry)
    const gs = state.settings.groups;
    // No groups yet: keep only the "new group" entry so the first group is always reachable.
    if (!gs.length) {
      bar.innerHTML = `<button type="button" class="gchip add" data-g="add">${t('group.new')}</button>`;
      return;
    }
    const chip = (g, label, count, extra) => `
      <button type="button" class="gchip ${state.view === g ? 'active' : ''} ${extra || ''}" data-g="${g}">
        ${label}<span class="gcnt">${count}</span>
      </button>`;
    let html = chip(VIEW_ALL, t('group.all'), state.items.length);
    html += chip(VIEW_NONE, t('group.ungrouped'), groupCount(it => !(it.group || '')));
    for (const g of gs) html += chip(g.id, escapeHtml(g.name), groupCount(it => (it.group || '') === g.id));
    html += `<button type="button" class="gchip add" data-g="add">${t('group.new')}</button>`;
    if (state.view !== VIEW_ALL && state.view !== VIEW_NONE) {
      html += `<button type="button" class="gchip del" data-g="del">${t('group.del')}</button>`;
    }
    bar.innerHTML = html;
  }
  // Group bar interaction: bound once via event delegation (re-renders do not rebind).
  function bindGroupBar() {
    const bar = document.getElementById('group-bar');
    bar.addEventListener('click', async e => {
      const chip = e.target.closest('.gchip[data-g]');
      if (!chip) return;
      const g = chip.dataset.g;
      if (g === 'add') { startAddGroup(chip); return; }
      if (g === 'del') { deleteGroup(state.view); return; }
      state.view = g;
      renderGrid();
      renderGroupBar();
    });
    bar.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); } });
  }
  // New group: the chip turns into an inline input - Enter confirms, Esc cancels, blur submits.
  function startAddGroup(btn) {
    const input = document.createElement('input');
    input.className = 'gchip-input';
    input.placeholder = t('group.name_ph');
    input.maxLength = 16;
    btn.replaceWith(input);
    input.focus();
    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      input.remove();
      if (!name) { renderGroupBar(); return; }
      if (state.settings.groups.some(x => x.name === name)) {
        showToast(t('toast.group_exists'));
        renderGroupBar();
        return;
      }
      state.settings.groups.push({ id: nid(), name });
      await Store.set(K.settings, state.settings);
      // Jump straight into the new group so items can be added to it right away.
      state.view = state.settings.groups[state.settings.groups.length - 1].id;
      syncUI();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; input.remove(); renderGroupBar(); }
    });
    input.addEventListener('blur', commit);
  }
  // Delete a group: its shortcuts move to "ungrouped" - no data is lost.
  async function deleteGroup(id) {
    const g = state.settings.groups.find(x => x.id === id);
    if (!g) return;
    const n = groupCount(it => (it.group || '') === id);
    if (!confirm(t('toast.group_del_confirm', { name: g.name, n }))) return;
    state.settings.groups = state.settings.groups.filter(x => x.id !== id);
    state.items.forEach(it => { if ((it.group || '') === id) it.group = ''; });
    state.view = VIEW_ALL;
    await Store.set(K.settings, state.settings);
    await Store.set(K.items, state.items);
    syncUI();
    showToast(t('toast.group_deleted', { name: g.name }));
  }

  // ---------- Data export / import ----------
  function exportPayload() {
    return {
      app: 'LightTab',
      version: '1.18.0',
      exportedAt: new Date().toISOString(),
      schema: SCHEMA_VERSION,
      settings: state.settings,
      items: state.items,
      wallpaper: state.wallpaper,
      todos: state.todos,
      prompts: state.prompts
    };
  }
  function doExport() {
    try {
      const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      a.href = url;
      a.download = `LightTab-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(t('toast.export_ok'));
    } catch (err) {
      console.warn('[LightTab] export failed', err);
      showToast(t('toast.export_fail'));
    }
  }
  async function doImport(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return showToast(t('toast.import_not_json')); }
    if (!data || typeof data !== 'object') return showToast(t('toast.import_bad'));
    if (data.app && data.app !== 'LightTab') return showToast(t('toast.import_not_lighttab'));
    const hasLocal = state.items.length || state.todos.length || state.prompts.length;
    if (hasLocal && !confirm(t('toast.import_confirm'))) return;
    const migrated = migrateSchema({
      settings: data.settings || {},
      items: data.items || [],
      wallpaper: data.wallpaper,
      todos: data.todos,
      prompts: data.prompts,
      schema: data.schema || 1
    });
    // Validate every imported field so JSON from any source can never break the page.
    state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), migrated.settings || {});
    if (!ENGINES.some(x => x.id === state.settings.engine)) state.settings.engine = 'baidu';
    if (!Array.isArray(state.settings.groups)) state.settings.groups = [];
    setLangOnly(state.settings.lang);
    const gids = new Set(state.settings.groups.map(g => g.id));
    state.items = Array.isArray(migrated.items)
      ? migrated.items
          .filter(it => it && typeof it.url === 'string')
          .map(it => ({ id: it.id || nid(), title: String(it.title || '').slice(0, 32) || t('toast.unnamed'), url: it.url, group: gids.has(it.group) ? it.group : '', icon: sanitizeIconDataUrl(it.icon) || undefined }))
      : [];
    state.wallpaper = pickWallpaperFromData(migrated.wallpaper);
    state.todos = Array.isArray(migrated.todos)
      ? migrated.todos.filter(it => it && typeof it.text === 'string').map(it => ({ id: it.id || nid(), text: it.text, done: !!it.done }))
      : [];
    // Templates: validate one by one (tmpl must be a string; targets keep only known engines) and drop bad entries.
    const validTarget = id => ENGINES.some(x => x.id === id);
    state.prompts = Array.isArray(migrated.prompts)
      ? migrated.prompts
          .filter(p => p && typeof p.tmpl === 'string')
          .map(p => ({
            id: p.id || nid(),
            name: String(p.name || '').slice(0, 24) || t('toast.unnamed_tpl'),
            tmpl: p.tmpl.slice(0, 4000),
            hint: typeof p.hint === 'string' ? p.hint.slice(0, 60) : '',
            targets: Array.isArray(p.targets) ? p.targets.filter(validTarget).slice(0, 4) : [],
            wb: p.wb && typeof p.wb === 'object' ? p.wb : null
          }))
      : structuredClone(DEFAULT_PROMPTS);
    state.view = VIEW_ALL;
    await Store.set(K.settings, state.settings);
    await Store.set(K.items, state.items);
    await Store.set(K.wallpaper, state.wallpaper);
    await Store.set(K.todos, state.todos);
    await Store.set(K.prompts, state.prompts);
    Store.set(K.schema, SCHEMA_VERSION);
    applyWallpaper(state.wallpaper);
    setEngine(state.settings.engine);
    startClock(); // refresh greeting/name (clock text is throttled per hour, so an import must force a redraw)
    document.getElementById('modal-set').hidden = true;
    syncUI();
    renderTodos();
    showToast(t('toast.import_done', { items: state.items.length, todos: state.todos.length }));
    reinitCanvas(); // an import may bring in or clear layout coordinates, so resync the canvas
  }
  // Import from bookmarks: uses the optional "bookmarks" permission, requested on first click.
  async function importBookmarks() {
    // Only detect preview mode (no extension APIs here). chrome.bookmarks simply does not exist until the
    // permission is granted, which is handled by the request branch below.
    if (!window.chrome || !chrome.permissions) {
      showToast(t('toast.bookmarks_unavailable'));
      return;
    }
    let granted = true;
    // chrome.bookmarks exists once granted; otherwise request it first, inside the user gesture.
    if (!chrome.bookmarks) {
      try { granted = await chrome.permissions.request({ permissions: ['bookmarks'] }); } catch { granted = false; }
    }
    if (!granted) { showToast(t('toast.bookmarks_denied')); return; }
    const tree = await chrome.bookmarks.getTree();
    const targetGroup = (state.view !== VIEW_ALL && state.view !== VIEW_NONE) ? state.view : '';
    const seen = new Set(state.items.map(it => normalizeUrl(it.url) || it.url));
    const hits = [];
    let dup = 0;
    (function walk(nodes) {
      for (const n of nodes) {
        if (n.url) {
          const u = normalizeUrl(n.url);
          if (!u) continue;
          if (seen.has(u)) { dup++; continue; }
          seen.add(u);
          let title = (n.title || '').trim();
          if (!title) { const h = hostnameOf(u); title = h.split('.')[0] || t('toast.bookmark_fallback'); }
          hits.push({ id: nid(), title: title.slice(0, 32), url: u, color: pickColor(u), group: targetGroup });
        } else if (n.children) {
          walk(n.children);
        }
      }
    })(tree);
    if (!hits.length) {
      showToast(dup ? t('toast.bookmarks_dup', { n: dup }) : t('toast.bookmarks_empty'));
      return;
    }
    state.items.push(...hits);
    await Store.set(K.items, state.items);
    syncUI();
    showToast(t('toast.bookmarks_done', { n: hits.length }) + (dup ? t('toast.bookmarks_dup_suffix', { n: dup }) : '') + (targetGroup ? t('toast.bookmarks_group') : ''));
  }

  // ---------- Modal (settings / wallpaper) ----------
  function bindSettings() {
    const modal = document.getElementById('modal-set');
    const tabs = modal.querySelectorAll('.tab');
    const panes = modal.querySelectorAll('.tab-pane');

    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.hidden = true));
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
    tabs.forEach(tb => tb.addEventListener('click', () => {
      tabs.forEach(x => x.classList.toggle('active', x === tb));
      const key = tb.dataset.tab;
      panes.forEach(p => p.hidden = p.dataset.pane !== key);
      if (key === 'prompt') renderPromptManager(); // re-sync on every visit to the Templates pane
    }));
    document.getElementById('f-upload').addEventListener('change', onUpload);
    document.getElementById('btn-reset-wall').addEventListener('click', () => {
      setWallpaper({ type: 'gradient', value: WALLPAPERS[0].css });
      markManualPickToday(); // a manual pick wins for the rest of this calendar day
      renderSwatches();
      showToast(t('toast.wall_reset'));
    });
    document.getElementById('btn-wall-fetch').addEventListener('click', fetchWallLib);
    document.getElementById('btn-reset-all').addEventListener('click', resetAll);
    // Template manager (Settings -> Templates): the "new template" button.
    document.getElementById('btn-prompt-add').addEventListener('click', () => {
      promptEditingId = promptEditingId === 'new' ? null : 'new';
      renderPromptManager();
      const ed = document.querySelector('#prompt-manage .prompt-editor');
      if (ed) { ed.scrollIntoView({ block: 'nearest' }); ed.querySelector('.pe-name').focus(); }
    });

    // Data management: export JSON / import JSON / import from bookmarks (optional permission, requested on click).
    document.getElementById('btn-export').addEventListener('click', doExport);
    const fImport = document.getElementById('f-import');
    document.getElementById('btn-import').addEventListener('click', () => fImport.click());
    fImport.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) doImport(f);
      e.target.value = '';
    });
    document.getElementById('btn-import-bookmarks').addEventListener('click', importBookmarks);

    // General
    const nameInput = document.getElementById('f-name');
    const engineSel = document.getElementById('f-engine');
    const langSel = document.getElementById('f-lang');
    engineSel.innerHTML = ENGINES.map(e => `<option value="${e.id}">${engName(e)}</option>`).join('');
    nameInput.addEventListener('change', async () => {
      state.settings.name = nameInput.value.trim();
      await Store.set(K.settings, state.settings);
      startClock();
    });
    engineSel.addEventListener('change', async () => {
      state.settings.engine = engineSel.value;
      await Store.set(K.settings, state.settings);
      setEngine(state.settings.engine);
    });
    if (langSel) langSel.addEventListener('change', async () => {
      state.settings.lang = langSel.value === 'en' ? 'en' : 'zh';
      await Store.set(K.settings, state.settings);
      applyCurrentLang();
    });
    const themeSel = document.getElementById('f-theme');
    if (themeSel) themeSel.addEventListener('change', async () => {
      const v = THEME_OPTIONS.includes(themeSel.value) ? themeSel.value : 'dark';
      state.settings.theme = v;
      await Store.set(K.settings, state.settings);
      applyTheme(); // flips the whole page instantly — no toast needed
    });
    // Wallpaper daily auto-rotate toggle (Wallpaper pane). Turning it on clears today's marker so the
    // very first rotate applies immediately instead of being blocked by an earlier manual pick.
    const wallRotCb = document.getElementById('f-wall-rotate');
    if (wallRotCb) wallRotCb.addEventListener('change', async () => {
      state.settings.wallRotate = !!wallRotCb.checked;
      await Store.set(K.settings, state.settings);
      if (wallRotCb.checked) {
        await localRawSet(K.rot, null);
        showToast(t('toast.wall_rotate_on'));
        maybeAutoRotate();
      }
    });

    document.getElementById('btn-wall').addEventListener('click', () => openSet('wall'));
    document.getElementById('btn-set').addEventListener('click', () => openSet('gen'));

    function openSet(tab) {
      const tabBtn = modal.querySelector(`.tab[data-tab="${tab}"]`);
      tabBtn.click();
      nameInput.value = state.settings.name || '';
      engineSel.value = state.settings.engine;
      if (langSel) langSel.value = state.settings.lang || 'zh';
      applyTheme(); // keep the theme select in sync with state (covers remote sync changes)
      renderSwatches();
      renderWallLibGrid();
      const wallRotCb = document.getElementById('f-wall-rotate');
      if (wallRotCb) wallRotCb.checked = !!state.settings.wallRotate;
      if (tab === 'wall' && wallLibImages === null) fetchWallLib(); // warm the pool (cached fallback when offline)
      modal.hidden = false;
    }
  }
  // ---------- Cloud sync settings panel ----------
  function syncStatusText(st) {
    switch (st.status) {
      case 'syncing': return t('sync.status.syncing');
      case 'offline': return t('sync.status.offline');
      case 'error': return st.lastError ? t(st.lastError) : t('sync.status.error');
      default: return st.lastSyncAt ? t('sync.status.synced') : t('sync.status.pending');
    }
  }
  function fmtSyncTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  }
  function syncShowErr(msg) {
    const el = document.getElementById('sync-err');
    if (el) { el.textContent = msg; el.hidden = false; }
  }
  function renderSyncPanel() {
    const panel = document.getElementById('sync-panel');
    if (!panel || !window.LT_SYNC) return;
    const st = window.LT_SYNC.getState();
    if (!st.loggedIn) {
      const pending = st.pendingVerifyEmail;
      const pendingTip = pending
        ? `<p class="form-tip sync-verify-tip">${t('sync.verify_sent_panel', { email: `<b>${escapeHtml(pending)}</b>` })}</p>`
        : '';
      panel.innerHTML = `
        ${pendingTip}
        <p class="form-tip">${t('sync.desc')}</p>
        <label><span>${t('sync.email')}</span><input id="sync-email" type="email" autocomplete="email" placeholder="you@example.com"${pending ? ` value="${escapeHtml(pending)}"` : ''}></label>
        <label><span>${t('sync.pass')}</span><input id="sync-pass" type="password" autocomplete="current-password" placeholder="${t('sync.pass_ph')}"></label>
        <div class="sync-err" id="sync-err" hidden></div>
        <div class="sync-actions">
          <button type="button" class="btn primary" data-sync="login">${t('sync.login')}</button>
          <button type="button" class="btn ghost" data-sync="register">${t('sync.register')}</button>
          ${pending ? `<button type="button" class="btn ghost" data-sync="resend">${t('sync.resend')}</button>` : ''}
        </div>`;
    } else {
      const dot = st.status === 'syncing' ? 'busy' : (st.status === 'error' || st.status === 'offline' ? 'warn' : 'ok');
      panel.innerHTML = `
        <div class="sync-row">
          <span class="data-label">${t('sync.logged_in')}</span>
          <span class="sync-email">${escapeHtml(st.email)}</span>
        </div>
        <div class="sync-status">
          <span class="dot ${dot}"></span>
          <span>${escapeHtml(syncStatusText(st))}</span>
          ${st.lastSyncAt ? `<span class="sync-time">${fmtSyncTime(st.lastSyncAt)}</span>` : ''}
        </div>
        <div class="sync-actions">
          <button type="button" class="btn ghost sm" data-sync="now">${t('sync.now')}</button>
          <button type="button" class="btn ghost sm" data-sync="logout">${t('sync.logout')}</button>
        </div>`;
    }
  }
  function bindSyncPanel() {
    const panel = document.getElementById('sync-panel');
    if (!panel || !window.LT_SYNC) return;
    panel.addEventListener('click', async e => {
      const btn = e.target.closest('[data-sync]');
      if (!btn) return;
      const action = btn.dataset.sync;
      const errEl = document.getElementById('sync-err');
      if (action === 'login' || action === 'register') {
        const email = (document.getElementById('sync-email').value || '').trim();
        const pass = document.getElementById('sync-pass').value;
        if (!email) { syncShowErr(t('sync.err_email')); return; }
        if (pass.length < 8) { syncShowErr(t('sync.err_pass')); return; }
        btn.disabled = true;
        const r = action === 'login'
          ? await window.LT_SYNC.login(email, pass)
          : await window.LT_SYNC.register(email, pass);
        btn.disabled = false;
        if (!r.ok) {
          if (r.verifyPending) {
            renderSyncPanel();  // pending-verification state: email pre-filled + resend button
            syncShowErr(t(r.error));
          } else {
            syncShowErr(t(r.error));  // keep the input, just surface the error
          }
          return;
        }
        if (r.verify) {
          showToast(t('sync.verify_sent_toast'));
          renderSyncPanel();
          return;
        }
        if (errEl) errEl.hidden = true;
        showToast(t('sync.login_success'));
      } else if (action === 'resend') {
        const email = (document.getElementById('sync-email').value || '').trim();
        if (!email) { syncShowErr(t('sync.err_email')); return; }
        btn.disabled = true;
        const r = await window.LT_SYNC.resend(email);
        btn.disabled = false;
        if (!r.ok) { syncShowErr(t(r.error)); return; }
        showToast(t('sync.resend_sent'));
      } else if (action === 'logout') {
        await window.LT_SYNC.logout();
        showToast(t('sync.logged_out'));
      } else if (action === 'now') {
        window.LT_SYNC.syncNow(false);
      }
      renderSyncPanel();
    });
    panel.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.target.id === 'sync-email' || e.target.id === 'sync-pass')) {
        e.preventDefault();
        const btn = panel.querySelector('[data-sync="login"]');
        if (btn) btn.click();
      }
    });
  }

  async function onUpload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return showToast(t('toast.image_too_big'));
    const dataUrl = await compressImage(f, 2560, 0.82);
    const light = await isLightImage(dataUrl);
    await setWallpaper({ type: 'image', value: dataUrl, light });
    markManualPickToday(); // an upload is a manual pick: no auto-rotate for the rest of this day
    renderSwatches(); // a re-render already carries the active state - no manual class clearing, no reopening the modal
    showToast(t('toast.wall_applied'));
  }
  // Estimate overall image brightness (downsampled); light images get a stronger scrim.
  function isLightImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = 48, h = 27;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let lum = 0, n = 0;
        try {
          const d = ctx.getImageData(0, 0, w, h).data;
          for (let i = 0; i < d.length; i += 4) {
            lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            n++;
          }
          lum = n ? lum / n : 0;
        } catch (err) { lum = 0; }
        resolve(lum > 160);
      };
      img.onerror = () => resolve(false);
      img.src = dataUrl;
    });
  }
  function compressImage(file, maxW, quality) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          let w = img.width, h = img.height;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }
  // Square centre-crop any image to `size`x`size` as PNG (transparency kept). Photo-like PNGs that would
  // exceed the 128 KiB icon budget are re-baked onto white as JPEG so the stored icon stays small.
  function compressIconSquare(file, size) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          if (!side || !size) return reject(new Error('bad image'));
          const c = document.createElement('canvas');
          c.width = size; c.height = size;
          const ctx = c.getContext('2d');
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          let url = c.toDataURL('image/png');
          if (url.length > 96 * 1024) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
            url = c.toDataURL('image/jpeg', 0.85);
          }
          resolve(url);
        };
        img.onerror = () => reject(new Error('decode failed'));
        img.src = fr.result;
      };
      fr.onerror = () => reject(new Error('read failed'));
      fr.readAsDataURL(file);
    });
  }

  // ---------- Toast ----------
  let toastTimer = 0; // auto-hide timer of the previous toast; cancelled by the next one so an old timer cannot close a new message
  function showToast(text, actionLabel, action, ttl) {
    const box = document.getElementById('toast');
    box.innerHTML = `<span>${escapeHtml(text)}</span>` +
      (actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : '');
    box.hidden = false;
    if (actionLabel) {
      box.querySelector('button').addEventListener('click', () => {
        action && action();
        box.hidden = true;
      });
    }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = 0; }
    if (ttl) toastTimer = setTimeout(() => { box.hidden = true; toastTimer = 0; }, ttl);
  }
  function copyText(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.style.cssText = 'position:fixed;opacity:0';
    ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  function copyToClipboard(text) {
    copyText(text);
    showToast(t('toast.copied'));
  }

  // ---------- To-do widget ----------
  function renderTodos() {
    const list = document.getElementById('todo-list');
    const countEl = document.getElementById('todo-count');
    const done = state.todos.filter(it => it.done).length;
    countEl.textContent = done + '/' + state.todos.length;
    if (!state.todos.length) {
      list.innerHTML = `<li class="todo-empty">${t('todo.empty')}</li>`;
      return;
    }
    const delLabel = escapeHtml(t('todo.del'));
    list.innerHTML = state.todos.map(it => `
      <li class="todo-item ${it.done ? 'done' : ''}" data-id="${it.id}">
        <span class="t-check"></span>
        <span class="t-text">${escapeHtml(it.text)}</span>
        <span class="t-del" title="${delLabel}">×</span>
      </li>
    `).join('');
  }
  async function saveTodos() {
    await Store.set(K.todos, state.todos);
  }
  function bindTodo() {
    const form = document.getElementById('todo-form');
    const input = document.getElementById('todo-input');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      state.todos.unshift({ id: nid(), text, done: false });
      input.value = '';
      await saveTodos();
      renderTodos();
    });
    document.getElementById('todo-list').addEventListener('click', async e => {
      const item = e.target.closest('.todo-item');
      if (!item) return;
      const todo = state.todos.find(it => it.id === item.dataset.id);
      if (!todo) return;
      if (e.target.closest('.t-del')) {
        state.todos = state.todos.filter(it => it.id !== todo.id);
      } else {
        todo.done = !todo.done;
      }
      await saveTodos();
      renderTodos();
    });
    renderTodos();
  }

  // ---------- Calendar widget (fully local month view with lunar days; zero network) ----------
  const calCursor = { y: 0, m: 0 }; // currently displayed year/month; 0 = follow today
  function renderCalendar() {
    const title = document.getElementById('cal-title');
    const grid = document.getElementById('cal-grid');
    if (!title || !grid) return;
    const now = new Date();
    if (!calCursor.y) { calCursor.y = now.getFullYear(); calCursor.m = now.getMonth() + 1; }
    const y = calCursor.y, m = calCursor.m;
    title.textContent = isEn() ? `${EN_MONTHS[m - 1]} ${y}` : `${y}年${m}月`;
    const startDow = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(y, m, 0).getDate();
    const isThisMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<span class="cal-cell empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      let lday = '';
      if (window.LT_LUNAR) {
        const lu = window.LT_LUNAR.toLunar(y, m, d);
        if (lu) lday = isEn() ? window.LT_LUNAR.dayNameEn(lu.day) : window.LT_LUNAR.dayName(lu.day);
      }
      const isToday = isThisMonth && d === now.getDate();
      const cls = 'cal-cell' + (isToday ? ' today' : '');
      cells.push(`<span class="${cls}"><b>${d}</b><i>${lday}</i></span>`);
    }
    grid.innerHTML = cells.join('');
  }
  function bindCalendar() {
    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    if (!prev || !next) return;
    prev.addEventListener('click', () => { calCursor.m--; if (calCursor.m < 1) { calCursor.m = 12; calCursor.y--; } renderCalendar(); });
    next.addEventListener('click', () => { calCursor.m++; if (calCursor.m > 12) { calCursor.m = 1; calCursor.y++; } renderCalendar(); });
  }

  // ---------- Reset ----------
  async function resetAll() {
    if (!confirm(t('toast.reset_confirm'))) return;
    state.settings = structuredClone(DEFAULT_SETTINGS);
    setLangOnly(state.settings.lang);
    applyTheme();
    state.items = structuredClone(DEFAULT_SITES).map(x => ({ ...x, id: nid(), group: '' }));
    state.wallpaper = { type: 'gradient', value: WALLPAPERS[0].css };
    state.todos = [];
    state.prompts = structuredClone(DEFAULT_PROMPTS);
    state.view = VIEW_ALL;
    await Store.set(K.settings, state.settings);
    await Store.set(K.items, state.items);
    await Store.set(K.wallpaper, state.wallpaper);
    await Store.set(K.todos, state.todos);
    await Store.set(K.prompts, state.prompts);
    applyWallpaper(state.wallpaper);
    setEngine(state.settings.engine);
    syncUI();
    startClock();
    renderTodos();
    document.getElementById('modal-set').hidden = true;
    showToast(t('toast.reset_done'));
    reinitCanvas(); // reset clears layout coordinates, back to the default canvas
  }

  // ---------- Schema migrations ----------
  // Procedure for a structural change: bump SCHEMA_VERSION, add a single-step function to MIGRATIONS, and old data upgrades level by level on read.
  const MIGRATIONS = {
    // v1 -> v2: groups (a settings.groups array plus a group field on every shortcut; empty string = ungrouped).
    1: (d) => {
      const s = d.settings || {};
      if (!Array.isArray(s.groups)) s.groups = [];
      d.settings = s;
      d.items = (d.items || []).map(it => {
        const c = { ...it };
        if (typeof c.group !== 'string') c.group = '';
        return c;
      });
      return d;
    },
    // v2 -> v3: prompt library (lt.prompts). Existing users get the built-in set injected; an empty array means the user cleared it, so do not re-inject.
    2: (d) => {
      if (d.prompts == null) d.prompts = DEFAULT_PROMPTS.map(p => ({ ...p, id: nid() }));
      return d;
    }
  };
  function migrateSchema(data) {
    const from = Number(data.schema) || 1;
    let cur = { ...data };
    let v = from;
    while (v < SCHEMA_VERSION) {
      const step = MIGRATIONS[v];
      if (!step) break;
      cur = step(cur);
      v++;
    }
    if (v < SCHEMA_VERSION) {
      console.warn('[LightTab] migration stalled at schema', v, '/', SCHEMA_VERSION);
    }
    cur.schema = SCHEMA_VERSION;
    return cur;
  }

  // Read storage -> migrate -> populate in-memory state. Read-only (never writes); also reused after a cloud-sync pull.
  async function loadDataIntoState() {
    const raw = await Store.getAll();
    const data = migrateSchema(raw);
    state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), data.settings || {});
    state.items = (data.items && data.items.length) ? data.items : structuredClone(DEFAULT_SITES);
    state.wallpaper = pickWallpaperFromData(data.wallpaper);
    state.todos = Array.isArray(data.todos) ? data.todos : [];
    // Templates: an empty array is legitimate (the user deleted them all); only undefined falls back to the default set.
    state.prompts = Array.isArray(data.prompts) ? data.prompts : structuredClone(DEFAULT_PROMPTS);
    return { raw, data };
  }

  // After a cloud pull overwrites local data: refresh in-memory state, re-render data-driven UI without
  // rebinding events, and surface a single toast.
  // (sync.js only calls remoteApply when something was actually overwritten, so idle polling stays silent.)
  async function reloadFromStorage() {
    await loadDataIntoState();
    setLangOnly(state.settings.lang);
    applyTheme();
    applyWallpaper(state.wallpaper);
    setEngine(state.settings.engine);
    renderEngineList();
    syncUI();
    renderTodos();
    renderCalendar();
    startClock(); // greeting/name may have been updated remotely
    maybeAutoRotate(); // a remote settings flip may have just enabled the daily rotate
    const nameInput = document.getElementById('f-name');
    if (nameInput) nameInput.value = state.settings.name || '';
    const engineSel = document.getElementById('f-engine');
    if (engineSel) engineSel.value = state.settings.engine;
    showToast(t('sync.applied'));
  }

  // ---------- Free canvas layout (draggable blocks) ----------
  const BLOCK_DEFS = [
    { key: 'wclock', sel: '.wclock' },
    { key: 'wcal',   sel: '.wcal' },
    { key: 'wtodo',  sel: '#todo-widget' },
    { key: 'search', sel: '#search' },
    { key: 'grid',   sel: '#grid-wrap' }
  ];
  const CANVAS_MIN_W = 1024;
  const DRAG_THRESHOLD = 6;
  const DRAG_INTERACTIVE = 'input,button,a,select,textarea,.card,.gchip,.todo-item,.cal-nav-btn,.cal-cell,.engine-list,.menu,.palette,[data-act]';

  function blockEls() {
    return BLOCK_DEFS.map(b => ({ ...b, el: document.querySelector(b.sel) })).filter(b => b.el);
  }
  function canvasRoot() { return document.querySelector('.layout'); }
  function canvasEligible() { return window.innerWidth > CANVAS_MIN_W; }
  function getLayout() {
    const l = state.settings && state.settings.layout;
    return (l && typeof l === 'object') ? l : null;
  }

  function applyCanvas() {
    const root = canvasRoot();
    const l = getLayout();
    if (!root || !l) return;
    root.classList.add('canvas');
    for (const b of blockEls()) {
      const c = l[b.key];
      if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;
      b.el.style.left = c.x + 'px';
      b.el.style.top = c.y + 'px';
      b.el.style.width = c.w ? c.w + 'px' : '';
    }
    applyCardCanvas();
    refreshCanvasHeight();
  }

  function leaveCanvas() {
    const root = canvasRoot();
    if (!root) return;
    root.classList.remove('canvas');
    root.style.height = '';
    for (const b of blockEls()) {
      b.el.style.left = ''; b.el.style.top = ''; b.el.style.width = '';
    }
    clearCardCanvas();
  }

  // First entry into canvas mode: measure the current flow positions and freeze them as coordinates, so switching to absolute positioning causes zero jump.
  function captureLayout() {
    const root = canvasRoot();
    if (!root) return null;
    const rr = root.getBoundingClientRect();
    const layout = {};
    for (const b of blockEls()) {
      const r = b.el.getBoundingClientRect();
      layout[b.key] = {
        x: Math.round(r.left - rr.left),
        y: Math.round(r.top - rr.top),
        w: Math.round(r.width)
      };
    }
    // Card grid coordinates: on first entry, map the current flow positions to (col, row).
    // With no cells (extremely narrow window, or no cards) captureCardLayout returns an empty object.
    layout.cards = captureCardLayout();
    state.settings.layout = layout;
    Store.set(K.settings, state.settings);
    return layout;
  }

  function refreshCanvasHeight() {
    const root = canvasRoot();
    if (!root || !root.classList.contains('canvas')) return;
    let maxBottom = 0;
    const rr = root.getBoundingClientRect();
    for (const b of blockEls()) {
      const r = b.el.getBoundingClientRect();
      const bottom = r.bottom - rr.top;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    // Cards are absolutely positioned inside #grid, so take the max of the grid-wrap bottom and each card's bottom.
    const grid = document.getElementById('grid');
    const gridWrap = document.getElementById('grid-wrap');
    if (grid && gridWrap) {
      const gw = gridWrap.getBoundingClientRect();
      const cards = grid.querySelectorAll('.card');
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        const bottom = (r.bottom - rr.top);
        if (bottom > maxBottom) maxBottom = bottom;
      }
      // Count grid-wrap's own bottom too (covers having no cards but a custom grid-wrap height).
      const gwb = gw.bottom - rr.top;
      if (gwb > maxBottom) maxBottom = gwb;
    }
    root.style.height = (maxBottom + 90) + 'px';
  }

  // ---------- Canvas mode: free card dragging with snap-to-grid ----------
  // In canvas mode cards are absolutely positioned; their (col, row) grid coordinates live in layout.cards[id].
  // Cell size is derived from the #grid container width, matching the CSS repeat(auto-fill, minmax(118px, 1fr)).
  const CARD_MIN_W = 118;
  const CARD_GAP = 13;
  const CARD_GRID_PADDING = 0; // #grid itself has no padding

  function getCardLayout() {
    const l = getLayout();
    return (l && l.cards && typeof l.cards === 'object') ? l.cards : {};
  }
  function setCardLayoutMap(map) {
    const l = getLayout();
    if (!l) return;
    l.cards = map;
  }

  // Max column count the grid can hold, matching CSS auto-fill: floor((W + gap) / (minW + gap)).
  function getCardCols(gridW) {
    return Math.max(1, Math.floor((gridW + CARD_GAP) / (CARD_MIN_W + CARD_GAP)));
  }
  // Single track width (under auto-fill, 1fr splits the remaining space evenly) - matches the real CSS column width.
  function getCardTrackW(gridW) {
    const cols = getCardCols(gridW);
    return (gridW - (cols - 1) * CARD_GAP) / cols;
  }

  // Cell size: column width is derived from the container width, because once cards are absolutely positioned
  // they shrink to their content width and offsetWidth is useless. Row height comes from the first card (height is content-driven, unaffected by positioning).
  function getCardCellSize() {
    const grid = document.getElementById('grid');
    if (!grid) return null;
    const gridW = grid.clientWidth;
    if (!gridW) return null;
    const first = grid.querySelector('.card');
    const cardH = first ? first.offsetHeight : 0;
    if (!cardH) return null;
    const cardW = getCardTrackW(gridW);
    return { cardW, cardH, stepX: cardW + CARD_GAP, stepY: cardH + CARD_GAP };
  }

  // Map each visible card's visual row/column inside #grid back to (col, row) and persist it.
  function captureCardLayout() {
    const grid = document.getElementById('grid');
    if (!grid) return {};
    const cell = getCardCellSize();
    if (!cell) return {};
    const visible = Array.from(grid.querySelectorAll('.card'));
    if (!visible.length) return {};
    const gridRect = grid.getBoundingClientRect();
    const map = {};
    for (const c of visible) {
      const r = c.getBoundingClientRect();
      const col = Math.max(0, Math.round((r.left - gridRect.left) / cell.stepX));
      const row = Math.max(0, Math.round((r.top - gridRect.top) / cell.stepY));
      map[c.dataset.id] = { col, row };
    }
    return map;
  }

  // On first canvas entry, or when some cards lack coordinates, assign (col, row) in visible order.
  function assignInitialCardLayout() {
    const grid = document.getElementById('grid');
    if (!grid) return {};
    const cell = getCardCellSize();
    if (!cell) return {};
    const visible = Array.from(grid.querySelectorAll('.card'));
    const cols = getCardCols(grid.clientWidth);
    const map = getCardLayout();
    // Existing coordinates are marked occupied; missing ones take the first free cell, scanning column by column then row by row.
    const occupied = new Set();
    for (const id in map) {
      const p = map[id];
      if (p && typeof p.col === 'number' && typeof p.row === 'number') {
        occupied.add(p.col + ',' + p.row);
      }
    }
    function nextFree(fromCol, fromRow) {
      let col = fromCol, row = fromRow;
      while (occupied.has(col + ',' + row)) {
        col++;
        if (col >= cols) { col = 0; row++; }
      }
      return { col, row };
    }
    let cur = { col: 0, row: 0 };
    for (const c of visible) {
      const id = c.dataset.id;
      if (map[id] && typeof map[id].col === 'number' && typeof map[id].row === 'number') continue;
      cur = nextFree(cur.col, cur.row);
      map[id] = { col: cur.col, row: cur.row };
      occupied.add(cur.col + ',' + cur.row);
    }
    return map;
  }

  // Apply layout.cards to the DOM (only for cards visible in canvas mode).
  function applyCardCanvas() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const cell = getCardCellSize();
    if (!cell) return;
    const map = assignInitialCardLayout();
    setCardLayoutMap(map);
    for (const c of grid.querySelectorAll('.card')) {
      const id = c.dataset.id;
      const p = map[id];
      if (!p) continue;
      c.style.width = cell.cardW + 'px';
      c.style.left = (p.col * cell.stepX) + 'px';
      c.style.top = (p.row * cell.stepY) + 'px';
      // Disable HTML5 drag in canvas mode: it fights pointer dragging and could open the link via the address bar.
      c.setAttribute('draggable', 'false');
    }
    injectCardDragHandles();
    refreshCanvasHeight();
  }

  function clearCardCanvas() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    for (const c of grid.querySelectorAll('.card')) {
      c.style.left = '';
      c.style.top = '';
      c.style.width = '';
    }
  }

  // Inject a small drag handle into canvas-mode cards (top-left, revealed on hover).
  function injectCardDragHandles() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    for (const c of grid.querySelectorAll('.card')) {
      if (c.querySelector('.card-drag-handle')) continue;
      const h = document.createElement('span');
      h.className = 'card-drag-handle';
      h.title = t('drag.card');
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
      c.appendChild(h);
    }
  }

  // Canvas mode: pointer-drag a card, snap it to the nearest cell, and swap with whatever card already sits there.
  function bindCardCanvasDrag() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    let active = null;
    let dragMoved = false; // whether this press turned into a drag (used to suppress the follow-up click)

    function onPointerDown(e) {
      if (!canvasEligible() || e.button !== 0) return;
      const card = e.target.closest('.card');
      if (!card) return;
      // Only the edit/delete buttons opt out of dragging; icon, title and blank space are all draggable - a movement threshold separates click from drag.
      if (e.target.closest('.card-actions')) return;
      const rr = grid.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      dragMoved = false;
      active = {
        card,
        id: card.dataset.id,
        baseX: r.left - rr.left,
        baseY: r.top - rr.top,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId
      };
      // Do not preventDefault yet, so a plain click can still open the link.
    }

    function onPointerMove(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      if (!active.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        active.moved = true;
        dragMoved = true;
        active.card.classList.add('card-dragging');
        try { active.card.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      } else {
        e.preventDefault();
      }
      const rr = grid.getBoundingClientRect();
      let nx = Math.round(active.baseX + dx);
      let ny = Math.round(active.baseY + dy);
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      active.card.style.left = nx + 'px';
      active.card.style.top = ny + 'px';
    }

    function onPointerUp(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const { card, id, moved } = active;
      active = null;
      card.classList.remove('card-dragging');
      try { card.releasePointerCapture(e.pointerId); } catch {}
      if (!moved) { dragMoved = false; return; }
      e.preventDefault();

      const cell = getCardCellSize();
      if (!cell) return;
      const r = card.getBoundingClientRect();
      const rr = grid.getBoundingClientRect();
      let col = Math.max(0, Math.round((r.left - rr.left) / cell.stepX));
      let row = Math.max(0, Math.round((r.top - rr.top) / cell.stepY));
      // Swap with whatever card occupies the target cell, so neither ends up overlapping.
      const map = getCardLayout();
      let swapId = null;
      for (const otherId in map) {
        if (otherId === id) continue;
        const p = map[otherId];
        if (p && p.col === col && p.row === row) { swapId = otherId; break; }
      }
      if (swapId) {
        map[swapId] = map[id] || { col: 0, row: 0 };
      }
      map[id] = { col, row };
      setCardLayoutMap(map);
      // Re-apply positions for every visible card, including the swapped one.
      applyCardCanvas();
      Store.set(K.settings, state.settings);
    }

    // Suppress the click that follows a drag, otherwise finishing a drag would open the link.
    function onClickCapture(e) {
      if (!dragMoved) return;
      if (!e.target.closest('.card')) return;
      e.preventDefault();
      e.stopPropagation();
      dragMoved = false;
    }

    grid.addEventListener('pointerdown', onPointerDown);
    grid.addEventListener('pointermove', onPointerMove);
    grid.addEventListener('pointerup', onPointerUp);
    grid.addEventListener('pointercancel', onPointerUp);
    grid.addEventListener('click', onClickCapture, true);
  }

  function injectDragHandles() {
    for (const b of blockEls()) {
      if (b.el.querySelector('.drag-handle')) continue;
      const h = document.createElement('span');
      h.className = 'drag-handle';
      h.title = t('drag.block');
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
      b.el.appendChild(h);
    }
  }

  function bindBlockDrag() {
    const root = canvasRoot();
    if (!root) return;
    let active = null;

    function onPointerDown(e) {
      if (!canvasEligible() || e.button !== 0) return;
      const handle = e.target.closest('.drag-handle');
      const block = blockEls().find(b => b.el === e.target.closest('.widget, #search, #grid-wrap'));
      if (!block) return;
      // Outside the handle: only blank areas start a drag (interactive elements keep normal click behaviour).
      if (!handle && e.target.closest(DRAG_INTERACTIVE)) return;
      e.preventDefault();
      const rr = root.getBoundingClientRect();
      const r = block.el.getBoundingClientRect();
      active = {
        block,
        baseX: r.left - rr.left,
        baseY: r.top - rr.top,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId
      };
      block.el.classList.add('block-dragging');
      try { block.el.setPointerCapture(e.pointerId); } catch {}
    }

    function onPointerMove(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      if (!active.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      active.moved = true;
      const rootW = root.clientWidth;
      const w = active.block.el.offsetWidth;
      let nx = Math.round(active.baseX + dx);
      let ny = Math.round(active.baseY + dy);
      nx = Math.max(0, Math.min(nx, rootW - w));
      ny = Math.max(0, ny);
      active.block.el.style.left = nx + 'px';
      active.block.el.style.top = ny + 'px';
    }

    function onPointerUp(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const { block, moved } = active;
      active = null;
      block.el.classList.remove('block-dragging');
      try { block.el.releasePointerCapture(e.pointerId); } catch {}
      if (!moved) return; // below the threshold: treat as a click and do not persist coordinates
      const l = getLayout();
      if (!l) return;
      const rr = root.getBoundingClientRect();
      const r = block.el.getBoundingClientRect();
      l[block.key] = {
        x: Math.round(r.left - rr.left),
        y: Math.round(r.top - rr.top),
        w: Math.round(r.width)
      };
      Store.set(K.settings, state.settings);
      refreshCanvasHeight();
    }

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
  }

  // Switch between flow and canvas based on window width and layout data (idempotent; reused after import/reset).
  function reinitCanvas() {
    leaveCanvas();
    if (!canvasEligible()) return;
    if (getLayout()) applyCanvas();
    else { captureLayout(); applyCanvas(); }
  }

  function initCanvasLayout() {
    injectDragHandles();
    bindBlockDrag();
    bindCardCanvasDrag();

    if (window.ResizeObserver) {
      // Several observed targets can fire in the same frame; coalesce with rAF to avoid re-measuring repeatedly.
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => { rafId = 0; refreshCanvasHeight(); });
      });
      blockEls().forEach(b => ro.observe(b.el));
      const grid = document.getElementById('grid');
      if (grid) ro.observe(grid);
    }

    window.addEventListener('resize', () => {
      if (!canvasEligible()) { leaveCanvas(); return; }
      if (getLayout()) {
        if (!canvasRoot().classList.contains('canvas')) applyCanvas();
        else refreshCanvasHeight();
      }
    });

    reinitCanvas();
  }

  // ---------- Language switching ----------
  function setLangOnly(l) {
    const v = (l === 'en') ? 'en' : 'zh';
    if (window.LT_I18N) window.LT_I18N.setLang(v);
    const sel = document.getElementById('f-lang');
    if (sel) sel.value = v;
  }
  function applyCurrentLang() {
    setLangOnly(state.settings.lang);
    renderSwatches();
    renderEngineList();
    renderGroupBar();
    renderGrid();
    renderTodos();
    renderCalendar();
    renderPromptManager();
    setEngine(state.settings.engine);
    startClock();
    if (window.LT_SYNC) renderSyncPanel();
  }

  // ---------- Theme (dark / light / system) ----------
  // Settings store 'dark' | 'light' | 'system'; the DOM attribute html[data-theme] is always
  // 'dark' | 'light' so every CSS light-mode override can key off [data-theme="light"].
  const THEME_OPTIONS = ['dark', 'light', 'system'];
  function resolveTheme(pref) {
    if (pref === 'light') return 'light';
    if (pref === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark'; // 'dark' and any unknown value fall back to the default dark theme
  }
  let themeMQBound = false;
  function bindThemeMQ() {
    if (themeMQBound || !window.matchMedia || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    if (!mq || typeof mq.addEventListener !== 'function') return;
    themeMQBound = true;
    mq.addEventListener('change', () => {
      // Only live-follow the OS while the user actually asked for 'system'.
      if ((state.settings && state.settings.theme) === 'system') applyTheme();
    });
  }
  function applyTheme() {
    const pref = (state.settings && state.settings.theme) || 'dark';
    document.documentElement.dataset.theme = resolveTheme(pref);
    const sel = document.getElementById('f-theme');
    if (sel && sel.value !== pref) sel.value = pref;
    bindThemeMQ();
  }

  // ---------- Boot ----------
  async function boot() {
    const { raw, data } = await loadDataIntoState();
    setLangOnly(state.settings.lang);
    applyTheme();
    // If migration changed the version, write back: schema plus every key the migration filled in or rewrote, keeping disk and memory consistent.
    if ((Number(raw.schema) || 1) !== SCHEMA_VERSION) {
      Store.set(K.schema, SCHEMA_VERSION);
      if (data.settings !== undefined) Store.set(K.settings, data.settings);
      if (data.items !== undefined) Store.set(K.items, data.items);
      if (data.wallpaper !== undefined) Store.set(K.wallpaper, data.wallpaper);
      if (data.todos !== undefined) Store.set(K.todos, data.todos);
      if (data.prompts !== undefined) Store.set(K.prompts, data.prompts);
    }

    applyWallpaper(state.wallpaper);
    setEngine(state.settings.engine);
    renderEngineList();
    syncUI();
    bindGroupBar();
    startClock();
    renderCalendar();
    bindCalendar();
    bindTodo();

    // Search
    const form = document.getElementById('search-form');
    const qEl = document.getElementById('q');
    form.addEventListener('submit', e => { e.preventDefault(); submitSearch(qEl.value, e); });
    document.getElementById('search-go').addEventListener('click', e => submitSearch(qEl.value, e));
    // Esc while a template is active: drop the template and go back to plain search.
    qEl.addEventListener('keydown', e => {
      if (e.key === 'Escape' && activePrompt) { e.stopPropagation(); clearActiveTemplate(); qEl.focus(); }
    });
    const engineBtn = document.getElementById('engine-btn');
    engineBtn.addEventListener('click', e => {
      e.stopPropagation();
      const list = document.getElementById('engine-list');
      const open = list.hidden;
      list.hidden = !open;
      engineBtn.setAttribute('aria-expanded', String(open));
    });
    document.getElementById('engine-list').addEventListener('click', e => {
      const li = e.target.closest('li');
      if (!li) return;
      setEngine(li.dataset.id);
      state.settings.engine = li.dataset.id;
      Store.set(K.settings, state.settings);
      renderEngineList();
      document.getElementById('engine-list').hidden = true;
      engineBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', e => {
      const list = document.getElementById('engine-list');
      if (!list.hidden && !e.target.closest('#search')) list.hidden = true;
    });

    // Keyboard shortcuts (never steal keys while focus is in a text-entry element).
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.hidden = true);
        document.getElementById('engine-list').hidden = true;
        closePalette(false);
        if (activePrompt && isTypingTarget(document.activeElement)) {
          const qq = document.getElementById('q');
          if (document.activeElement === qq) clearActiveTemplate();
        }
      }
      const typing = isTypingTarget(document.activeElement);
      if (e.key === '/') {
        // Template palette: "/" opens it when focus is outside inputs, or in an empty search box (with text present it is just a character).
        const ae = document.activeElement;
        const emptyQ = ae && ae.id === 'q' && !ae.value;
        const openable = !typing || emptyQ;
        if (openable && !document.querySelector('.modal:not([hidden])')) {
          e.preventDefault();
          const pal = document.getElementById('palette');
          if (pal.hidden) openPalette(); else closePalette();
        }
      }
      if (/^[1-9]$/.test(e.key) && !typing) {
        const idx = +e.key - 1;
        if (ENGINES[idx]) {
          setEngine(ENGINES[idx].id);
          state.settings.engine = ENGINES[idx].id;
          Store.set(K.settings, state.settings);
          renderEngineList();
        }
      }
    });

    bindSiteForm();
    bindPalette();
    bindSettings();
    sweepPending(); // sweep expired / corrupted pending leftovers on boot

    // Cloud sync init, last: the migration write-back has landed and every event is bound.
    if (window.LT_SYNC) {
      window.LT_SYNC.configure({ remoteApply: reloadFromStorage, onChange: renderSyncPanel });
      bindSyncPanel();
      renderSyncPanel();
      window.LT_SYNC.init();
    }

    // Floating add button
    document.getElementById('add-float').addEventListener('click', () => openSiteModal(null));

    // Free canvas layout (draggable blocks): initialised last, once every block has rendered.
    initCanvasLayout();

    // Self-check
    if (!hasChromeStorage) {
      // Only warn on the first run.
      // Delay so it does not block first paint.
      setTimeout(() => {
        const tip = document.createElement('div');
        tip.className = 'boot-tip';
        tip.textContent = t('boot.preview');
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 4000);
      }, 600);
    }
  }

  // Pure-function exports for the offline assertions in scripts/smoke.cjs
  // (same convention as window.LT_LUNAR / window.LT_SYNC).
  window.LT_PURE = { looksLikeUrl, sanitizeWallpaperUrl, sanitizeIconDataUrl, hostnameOf, iconFor, resolveTheme, todayStr, pickRotateCandidate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

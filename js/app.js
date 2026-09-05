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
    // The factory default is a bundled render (procedurally generated, zero licensing surface);
    // entries with `img` are bundled files, entries with `css` are gradients.
    { id: 'dusk',     name: 'Dusk Mountain', img: 'assets/wallpaper-dusk.jpg' },
    { id: 'midnight', name: 'Dusk Blue',    css: 'linear-gradient(135deg,#0b1426 0%,#152a4f 45%,#1c3d6e 100%)' },
    { id: 'aurora',   name: 'Aurora',       css: 'linear-gradient(135deg,#0f1c3a 0%,#1e3a6e 50%,#2d5f8f 100%)' },
    { id: 'violet',   name: 'Night Violet', css: 'linear-gradient(135deg,#0f0a26 0%,#2b1b54 50%,#432e7a 100%)' },
    { id: 'teal',     name: 'Teal',         css: 'linear-gradient(135deg,#0a1e25 0%,#0e3239 50%,#15525b 100%)' },
    { id: 'graphite', name: 'Graphite',     css: 'linear-gradient(135deg,#0e1117 0%,#1f242e 50%,#2a3038 100%)' },
    { id: 'rose',     name: 'Dusk Red',     css: 'linear-gradient(135deg,#1a0f1a 0%,#3d1b2e 50%,#5a2540 100%)' }
  ];
  // What a fresh profile (or an unreadable saved wallpaper) gets.
  const BUNDLED_WALL = { type: 'image', value: 'assets/wallpaper-dusk.jpg', light: false };

  const DEFAULT_SITES = [
    { id: nid(), title: 'GitHub',         url: 'https://github.com',            color: '#181717' },
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
    engine: 'google',
    name: '',
    // Top-right profile avatar: a local raster dataURL (data:image/png|jpeg|webp|gif;base64,…).
    // Empty = show the name initial, or a default person glyph when no name is set.
    avatar: '',
    lang: 'zh',
    // Theme: 'dark' | 'light' | 'system' (follow the OS scheme).
    theme: 'dark',
    wallpaper: { ...BUNDLED_WALL },
    // Daily Bing wallpaper auto-rotate: when on, one Bing daily image from the local pool is
    // applied per calendar day. Manual picks always win for the rest of that day.
    wallRotate: false,
    // Groups: array of { id, name }. Empty = grouping disabled (group bar hidden, and the
    // shortcut dialog does not show the group dropdown).
    groups: [],
    // Free canvas layout: { wclock/wcal/wtodo/search/grid: {x,y,w} }.
    // null = fall back to the default two-column flow layout.
    layout: null,
    // Left-column widgets the user kept. Removing one hides it in both the flow and canvas layouts;
    // removing all three collapses the whole left column so the icon grid spans the full width.
    // Lives inside settings on purpose — it then rides along with export / import / cloud sync for free.
    widgets: { wclock: true, wcal: true, wtodo: true, wmovie: true, wweather: false },
    // Per-widget placement: 'left' keeps the widget as a left-column card, 'top' lifts it into the
    // stack above the search box (centred, card chrome dropped — the phone-launcher look).
    // Only the clock rides up top by default — that slot wants a glanceable time + date line, not a
    // month grid. Calendar, to-do and movie stay left-column cards; all can still be lifted from Settings.
    widgetPos: { wclock: 'top', wcal: 'left', wtodo: 'left', wmovie: 'left', wweather: 'left' },
    // Weather widget (opt-in, Open-Meteo): null until the user picks a city in Settings → General,
    // then { name, lat, lon, last: { temp, rh, code, hi, lo }, fetchedAt }. Lives inside settings so
    // it rides along with export / import / cloud sync for free.
    weather: null
  };
  // Left-column widget ids, in render order. Single source of truth for visibility + settings UI.
  const WIDGETS = ['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather'];

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
  // Only hex colours are ever produced locally (pickColor / DEFAULT_SITES / icondb); anything else
  // (e.g. a crafted import or sync payload) is dropped before it reaches a style="" attribute.
  function safeColor(c) {
    return (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : null;
  }
  // Does the input look like a URL? An explicit scheme always counts; a bare domain may carry a
  // path/query/hash (github.com/susunola). Search phrases containing spaces are never misread as URLs.
  function looksLikeUrl(q) {
    return /^https?:\/\//i.test(q) || /^[^\s]+\.[a-z]{2,}([/?#]\S*)?$/i.test(q);
  }
  // Wallpaper URL allow-list (guards against CSS injection): data:image/, https: and bundled
  // assets/ paths are accepted; quotes / backslashes / newlines are rejected outright.
  function sanitizeWallpaperUrl(v) {
    if (typeof v !== 'string' || !v) return null;
    if (/['"\\\r\n]/.test(v)) return null;
    if (/^data:image\//i.test(v) || /^https:/i.test(v) || /^assets\/[\w.-]+$/.test(v)) return v;
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
  // The slot above the search box wants one glanceable line, not the full date + lunar + ganzhi
  // sentence the left-column card shows. Mirrors the launcher convention: 9月4日 星期五 七月廿三.
  function compactDateLine(d) {
    if (isEn()) {
      const wk = EN_WEEKS_S[d.getDay()];
      const base = `${wk}, ${EN_MONTHS_S[d.getMonth()]} ${d.getDate()}`;
      if (!window.LT_LUNAR) return base;
      const lu = window.LT_LUNAR.toLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
      // "Sep 5 · Lunar 7/24" — a bare ordinal ("Sep 5 24th") reads as part of the Gregorian date.
      return lu ? `${base} · Lunar ${lu.month}/${lu.day}` : base;
    }
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    const base = `${d.getMonth() + 1}月${d.getDate()}日 星期${week}`;
    if (!window.LT_LUNAR) return base;
    const lu = window.LT_LUNAR.toLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (!lu) return base;
    return `${base} ${window.LT_LUNAR.monthName(lu.month, lu.isLeap)}${window.LT_LUNAR.dayName(lu.day)}`;
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
  const SCHEMA_VERSION = 4;
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
    // Anything unreadable (missing type, disallowed image URL, empty gradient) falls back to the bundled default.
    if (!wp || !wp.type
      || (wp.type === 'image' && !sanitizeWallpaperUrl(wp.value))
      || (wp.type === 'gradient' && !wp.value)) wp = BUNDLED_WALL;
    el.classList.toggle('bg-light', !!(wp.type === 'image' && wp.light));
    if (wp.type === 'image') {
      el.style.background = `center/cover no-repeat url("${sanitizeWallpaperUrl(wp.value)}")`;
    } else {
      el.style.background = wp.value;
    }
  }
  function pickWallpaperFromData(data) {
    // Both the import and read paths go through the allow-list; an invalid image URL falls back to the bundled default.
    if (data && data.type === 'image' && sanitizeWallpaperUrl(data.value)) {
      return { ...data, value: sanitizeWallpaperUrl(data.value) };
    }
    if (data && data.type === 'gradient' && data.value) return data;
    // Legacy compatibility: nothing saved -> fall back to the bundled default.
    return { ...BUNDLED_WALL };
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
  let wallLibSource = 'bing';  // current wallpaper source: bing | wallhaven | unsplash

  // Preset swatch rendering (top level so bindSettings and the wallpaper library can both reuse it).
  function renderSwatches() {
    const swEl = document.getElementById('swatches');
    if (!swEl) return;
    const currentId = state.wallpaper?.type === 'gradient'
      ? WALLPAPERS.findIndex(w => w.css && w.css === state.wallpaper.value)
      : WALLPAPERS.findIndex(w => w.img && w.img === state.wallpaper.value);
    swEl.innerHTML = WALLPAPERS.map((w, i) => `
      <div class="swatch ${i === currentId ? 'active' : ''}" data-i="${i}" style="background:${w.img ? `center/cover url('${w.img}')` : w.css}">
        <span class="label">${t('wp.' + w.id)}</span>
      </div>
    `).join('') + (state.wallpaper?.type === 'image' && sanitizeWallpaperUrl(state.wallpaper.value) && currentId === -1 ? `
      <div class="swatch active" data-i="img" style="background:center/cover url('${sanitizeWallpaperUrl(state.wallpaper.value)}')">
        <span class="label">${t('wp.custom')}</span>
      </div>
    ` : '');
    swEl.querySelectorAll('.swatch').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.i === 'img') return;
        const w = WALLPAPERS[+el.dataset.i];
        setWallpaper(w.img ? { type: 'image', value: w.img, light: false } : { type: 'gradient', value: w.css });
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
    // The tip now carries live status text — flag it so applyStatic (called by renderMovie
    // and friends) does not revert it to the static label.
    if (tip) tip.setAttribute('data-i18n-dyn', '');
    if (!o.silent && btn) btn.disabled = true;
    if (!o.silent && tip) tip.textContent = t('wall.loading');
    try {
      const src = wallLibSource || 'bing';
      const params = new URLSearchParams({ source: src, idx: '0', n: '8' });
      if (src === 'bing') params.set('mkt', isEn() ? 'en-US' : 'zh-CN');
      const res = await fetch(WALL_LIB_BASE + '/v1/wallpapers?' + params.toString());
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

  // Source capability: query the backend for which wallpaper sources are available and sync the
  // selector. Unsplash is only offered when the server has an LT_UNSPLASH_KEY configured (its Source
  // API is deprecated and the official API needs a key), so we hide that option otherwise.
  async function syncWallSources() {
    const sel = document.getElementById('f-wall-src');
    if (!sel) return;
    let list = ['bing', 'wallhaven'];
    try {
      const res = await fetch(WALL_LIB_BASE + '/v1/wallpapers/sources');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sources) && data.sources.length) list = data.sources;
      }
    } catch { /* keep defaults when offline */ }
    const unsplashOpt = sel.querySelector('option[value="unsplash"]');
    if (unsplashOpt) unsplashOpt.hidden = !list.includes('unsplash');
    if (unsplashOpt && !list.includes('unsplash') && sel.value === 'unsplash') {
      sel.value = 'bing';
      wallLibSource = 'bing';
    }
    if (sel.value !== wallLibSource) sel.value = wallLibSource;
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

  // ---------- Plum blossom (bottom-right): rotate wallpaper + show an inspirational quote ----------
  const QUOTES = [
    { zh: '宝剑锋从磨砺出，梅花香自苦寒来。', en: 'A sword\'s edge comes from whetting; plum-blossom fragrance from bitter cold.', src: { zh: '《警世贤文》', en: 'Warnings to the World' } },
    { zh: '路漫漫其修远兮，吾将上下而求索。', en: 'The road ahead is long and far; I shall search high and low.', src: { zh: '屈原《离骚》', en: 'Qu Yuan · Li Sao' } },
    { zh: '天行健，君子以自强不息。', en: 'As heaven moves with vigor, the noble never cease to strengthen themselves.', src: { zh: '《周易》', en: 'Book of Changes' } },
    { zh: '不积跬步，无以至千里。', en: 'Without small steps, one cannot cover a thousand miles.', src: { zh: '《荀子·劝学》', en: 'Xunzi' } },
    { zh: '千里之行，始于足下。', en: 'A thousand-mile journey begins with a single step.', src: { zh: '《老子》', en: 'Laozi' } },
    { zh: '长风破浪会有时，直挂云帆济沧海。', en: 'A time will come to ride the wind and cleave the waves; I\'ll hoist my sail and cross the vast sea.', src: { zh: '李白《行路难》', en: 'Li Bai' } },
    { zh: '会当凌绝顶，一览众山小。', en: 'When I stand on the summit, all other peaks look small.', src: { zh: '杜甫《望岳》', en: 'Du Fu' } },
    { zh: '纸上得来终觉浅，绝知此事要躬行。', en: 'What comes from books is shallow; true mastery comes from doing.', src: { zh: '陆游《冬夜读书示子聿》', en: 'Lu You' } },
    { zh: '山重水复疑无路，柳暗花明又一村。', en: 'Where hills and streams seem to block the way, a new village blooms beyond the willows.', src: { zh: '陆游《游山西村》', en: 'Lu You' } },
    { zh: '千磨万击还坚劲，任尔东西南北风。', en: 'Battered by a thousand blows, I stand firm against winds from every quarter.', src: { zh: '郑板桥《竹石》', en: 'Zheng Xie' } },
    { zh: '少壮不努力，老大徒伤悲。', en: 'Idle in youth, grieving in old age.', src: { zh: '《长歌行》', en: 'The Long Ballad' } },
    { zh: '星光不问赶路人，时光不负有心人。', en: 'The stars do not question the traveler; time rewards the devoted.', src: { zh: '佚名', en: 'Anonymous' } },
  ];
  // Pure picker (exported for offline smoke): pick an index different from the previous one when possible.
  function pickQuoteIndex(len, prevIdx) {
    const n = Math.max(0, Number(len) || 0);
    if (n === 0) return -1;
    if (n === 1) return 0;
    let i = Math.floor(Math.random() * n);
    if (i === prevIdx) i = (i + 1) % n;
    return i;
  }
  let quoteIndex = -1;
  let quoteTimer = 0;
  function showQuote(q) {
    const el = document.getElementById('quote');
    if (!el || !q) return;
    const en = isEn();
    const text = en ? q.en : q.zh;
    const src = q.src ? (en ? (q.src.en || q.src.zh) : (q.src.zh || q.src.en)) : '';
    el.innerHTML = `<div class="quote-text">“${escapeHtml(text)}”</div>` +
      (src ? `<div class="quote-src">— ${escapeHtml(src)}</div>` : '');
    el.classList.remove('quote-out');
    el.hidden = false;
    // Restart the entrance animation on every new quote.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    if (quoteTimer) { clearTimeout(quoteTimer); quoteTimer = 0; }
    quoteTimer = setTimeout(() => {
      el.classList.add('quote-out');
      quoteTimer = setTimeout(() => { el.hidden = true; el.classList.remove('quote-out'); quoteTimer = 0; }, 360);
    }, 4200);
  }
  async function rotateWallpaperAndQuote() {
    const btn = document.getElementById('btn-plum');
    if (btn) { btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
    // Ensure a pool exists (silent network attempt, cached pool as fallback).
    if (!Array.isArray(wallLibImages) || !wallLibImages.length) {
      await fetchWallLib({ silent: true });
    }
    const pool = Array.isArray(wallLibImages) ? wallLibImages : [];
    if (pool.length) {
      const cur = (state.wallpaper && state.wallpaper.type === 'image') ? state.wallpaper.value : '';
      const next = pickRotateCandidate(pool, cur);
      if (next && next.url) {
        await setWallpaper({ type: 'image', value: next.url });
        markManualPickToday();
        renderSwatches();
        renderWallLibGrid();
      }
    }
    // Show a quote regardless of whether the wallpaper changed (e.g. empty pool while offline).
    if (QUOTES.length) {
      quoteIndex = pickQuoteIndex(QUOTES.length, quoteIndex);
      showQuote(QUOTES[quoteIndex]);
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
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${clockIsTop() ? 't' : 'l'}`;
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        // Lifted above the search box: one compact line. Left-column card: the full date + lunar pair.
        const top = clockIsTop();
        dateEl.textContent = top ? compactDateLine(d) : dateLine(d);
        if (lunarEl) lunarEl.textContent = top ? '' : lunarLine(d);
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
    btn.querySelector('.eng-logo-wrap').innerHTML = engLogoHtml(e);
    document.getElementById('q').placeholder = t('search.placeholder_engine', { engine: engName(e) });
  }
  // Engine logos: reuse the brand-icon library where an entry exists (Baidu, Google, GitHub,
  // bilibili, Doubao, ChatGPT); engines without one (Bing, Sogou, WorkBuddy) get a
  // brand-coloured letter tile — the same fallback language as the icon grid.
  const ENG_ICON_HOST = {
    baidu: 'baidu.com', google: 'google.com', github: 'github.com',
    bilibili: 'bilibili.com', doubao: 'doubao.com', openai: 'openai.com'
  };
  function engLogoHtml(e) {
    const host = ENG_ICON_HOST[e.id];
    const icon = host ? iconFor('https://' + host) : null;
    // No brand tile behind these glyphs (unlike the card grid), so single-colour marks
    // take the brand colour itself when it is bright enough, otherwise the menu's text colour.
    if (icon) return `<span class="eng-logo">${iconGlyphHtml(icon, menuGlyphColor(icon.c) || 'currentColor')}</span>`;
    return `<span class="eng-logo eng-letter" style="background:${e.color}">${escapeHtml(engName(e).trim().charAt(0))}</span>`;
  }
  function renderEngineList() {
    const ul = document.getElementById('engine-list');
    if (!ul) return;
    ul.innerHTML = ENGINES.map((e, i) => {
      // WorkBuddy is a desktop deep link rather than a website, so show whether it is actually up.
      let badge = '';
      if (e.id === 'wbai' && wbStatus.checked) {
        badge = wbStatus.running
          ? `<span class="eng-state on" title="${escapeHtml(t('wb.running', { v: wbStatus.version || '?' }))}"></span>`
          : `<span class="eng-state off" title="${escapeHtml(t('wb.not_running'))}"></span>`;
      }
      return `
      <li data-id="${e.id}" class="${e.id === currentEngine.id ? 'active' : ''}">
        ${engLogoHtml(e)}
        <span>${engName(e)}</span>${badge}
        <span class="eng-key">${i + 1}</span>
      </li>
    `;
    }).join('');
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
    // Only AI engines can receive a prompt (injected chat or deep link); a plain search engine
    // would get a malformed URL with a literal "{q}".
    targetIds = targetIds.filter(id => ENGINES.some(x => x.id === id && x.ai));
    if (!targetIds.length) {
      // A template with no targets configured falls back to the current engine (AI engines only);
      // a template whose targets are all invalid/removed gets the explicit no-target toast.
      if (tpl && !(tpl.targets || []).length && currentEngine.ai) targetIds = [currentEngine.id];
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
    // The deep link already fired synchronously inside the gesture (never gate that on a network
    // round-trip). Confirm out-of-band: if the probe still cannot see WorkBuddy a moment later the
    // link most likely went nowhere - say so instead of leaving a false "launched".
    if (dlN) verifyWorkBuddyLaunch();
    if (tpl) { tpl.lastUsedAt = Date.now(); window.LT_PROMPTS.savePrompts(); }
    sparkFx();
    sweepPending();
    window.LT_PROMPTS.clearActiveTemplate();
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

  // Prompt template UI lives in js/prompts.js (window.LT_PROMPTS; loaded before this file).

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
    // The grid's last cell is always the add tile (iTab convention) — a button, not an <a>, so
    // the card context-menu / HTML5-reorder bindings (which only touch `#grid a.card`) skip it.
    const addTile = `<button type="button" class="card card-add" data-id="__add__" title="${escapeHtml(t('site.add'))}">` +
      `<div class="ico"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>` +
      `<div class="title">${escapeHtml(t('site.add'))}</div></button>`;
    if (!list.length) {
      const hint = state.view === VIEW_ALL
        ? t('grid.empty')
        : t('grid.empty_view');
      grid.innerHTML = `<div class="grid-empty">${hint}</div>` + addTile;
    } else {
      grid.innerHTML = list.map(it => cardHtml(it)).join('') + addTile;
    }
    bindCardEvents();
    grid.querySelector('.card-add').addEventListener('click', () => openSiteModal(null));
    // Canvas mode: right after rendering, apply (col, row) to the cards and assign coordinates to any new ones.
    const C = window.LT_CANVAS;
    if (C.canvasRoot() && C.canvasRoot().classList.contains('canvas') && C.canvasEligible()) {
      C.applyCardCanvas();
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
  // Render the inner glyph markup for an ICONDB entry. Three entry shapes are supported, all vector
  // (crisp at any tile size) and all fully local:
  //   1. { d, c }            monochrome simple-icons path, auto-inked against the brand tile `c`
  //   2. { p: [{d,f}], c }   multi-colour brand logo — each sub-path carries its own literal fill,
  //                          `c` is only the tile background (usually #FFFFFF for corporate marks)
  //   3. { tx, c, f }        wordmark tile — some brands (51CTO, 小鹅通, 艾威教育…) *are* set type;
  //                          drawing them as text is more faithful than a hand-traced silhouette
  // ICONDB is static, authored data — never user input — so the markup below is not sanitised.
  function iconGlyphHtml(icon, glyphColor) {
    if (icon.p) {
      const paths = icon.p.map((s) => `<path fill="${s.f}" d="${s.d}"/>`).join('');
      return `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
    }
    if (icon.tx) {
      // Shrink the type as the wordmark gets longer so 51CTO / 小鹅通 both fit the same tile.
      const n = [...icon.tx].length;
      const size = n <= 1 ? 14 : n === 2 ? 11 : n === 3 ? 7.6 : n <= 5 ? 5.8 : 4.6;
      return `<svg class="logo logo-tx" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="12.6" fill="${icon.f || inkOn(icon.c)}" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeHtml(icon.tx)}</text></svg>`;
    }
    return `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="${glyphColor || inkOn(icon.c)}" d="${icon.d}"/></svg>`;
  }
  // A brand colour only works as a bare glyph when it is bright enough for the (dark) menu panel;
  // near-black marks (GitHub) fall back to currentColor so they follow the theme's text colour.
  function menuGlyphColor(hex) {
    const n = parseInt(String(hex || '').replace('#', ''), 16);
    if (Number.isNaN(n)) return null;
    const L = 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return L >= 60 ? hex : null;
  }
  function cardHtml(it) {
    const host = hostnameOf(it.url) || it.title;
    const icon = iconFor(it.url);
    const customIcon = sanitizeIconDataUrl(it.icon);
    let bg, ink, ico, customCls = '';
    if (customIcon) {
      // User-uploaded image wins over the brand icon. The tile background defaults to a CSS-picked
      // neutral (theme-aware) so uploaded logos — usually white-bg corporate marks or transparent
      // marks — read as the visual focus instead of competing with a saturated host colour. Users
      // can still set it.color (e.g. via import) for an explicit coloured frame.
      customCls = ' has-custom-icon';
      bg = safeColor(it.color);
      ico = `<img class="logo-img" src="${customIcon}" alt="" draggable="false">`;
    } else if (icon) {
      bg = icon.c;
      ico = iconGlyphHtml(icon);
    } else {
      bg = safeColor(it.color) || pickColor(host);
      // Letter fallback: CJK titles use their first character, otherwise the first letter of the hostname, uppercased.
      let letter = (it.title || '').trim().charAt(0);
      if (!/[\u4e00-\u9fa5]/.test(letter)) {
        const h = hostnameOf(it.url);
        letter = (h && h[0] ? h[0] : '?').toUpperCase();
      }
      ico = `<span class="ini">${escapeHtml(letter)}</span>`;
    }
    ink = bg ? inkOn(bg) : '#1f2937';
    const safeTitle = escapeHtml(it.title);
    const bgStyle = bg ? `background:${bg};` : '';
    // Only http(s) links are renderable — an imported/synced record could otherwise carry a javascript: URL.
    const safeHref = /^https?:\/\//i.test(it.url || '') ? it.url : '#';
    return `
      <a class="card" href="${escapeHtml(safeHref)}" data-id="${escapeHtml(it.id)}" draggable="true" target="_blank" rel="noopener" title="${safeTitle}">
        <div class="ico${customCls}" style="${bgStyle}color:${ink}">
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
      state.settings.groups.map(g => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)}</option>`).join('');
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
      box.innerHTML = iconGlyphHtml(icon);
      box.style.background = icon.c;
      box.style.color = inkOn(icon.c);
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
      <button type="button" class="gchip ${state.view === g ? 'active' : ''} ${extra || ''}" data-g="${escapeHtml(g)}">
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
      version: '1.19.0',
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
    state.settings.avatar = sanitizeIconDataUrl(state.settings.avatar) || '';
    state.settings.widgets = normalizeWidgets(state.settings.widgets);
    state.settings.widgetPos = normalizeWidgetPos(state.settings.widgetPos);
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
    applyTheme(); // an import may carry a different theme
    setEngine(state.settings.engine);
    renderEngineList(); // refresh the engine dropdown's active highlight
    startClock(); // refresh greeting/name (clock text is throttled per hour, so an import must force a redraw)
    document.getElementById('modal-set').hidden = true;
    syncUI();
    renderTodos();
    renderMovie(); // an import may switch the language, which the movie card renders in
    renderSwatches(); // refresh wallpaper labels/active state in the (possibly new) language
    applyWidgets(); // an import may bring in a different left-column widget selection
    renderAvatar(); // an import may carry a different name / avatar
    showToast(t('toast.import_done', { items: state.items.length, todos: state.todos.length }));
    window.LT_CANVAS.reinitCanvas(); // an import may bring in or clear layout coordinates, so resync the canvas
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
      if (key === 'prompt') window.LT_PROMPTS.renderPromptManager(); // re-sync on every visit to the Templates pane
    }));
    document.getElementById('f-upload').addEventListener('change', onUpload);
    document.getElementById('btn-reset-wall').addEventListener('click', () => {
      setWallpaper({ ...BUNDLED_WALL });
      markManualPickToday(); // a manual pick wins for the rest of this calendar day
      renderSwatches();
      showToast(t('toast.wall_reset'));
    });
    document.getElementById('btn-wall-fetch').addEventListener('click', fetchWallLib);
    const wallSrcSel = document.getElementById('f-wall-src');
    if (wallSrcSel) wallSrcSel.addEventListener('change', () => {
      wallLibSource = wallSrcSel.value || 'bing';
      wallLibImages = null; // clear the previous source's pool so the grid doesn't show stale thumbs
      renderWallLibGrid();
      fetchWallLib();
    });
    syncWallSources();
    document.getElementById('btn-reset-all').addEventListener('click', resetAll);
    // Template manager (Settings -> Templates): the "new template" button.
    document.getElementById('btn-prompt-add').addEventListener('click', () => window.LT_PROMPTS.toggleNewPromptEditor());

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
    const weatherCityInput = document.getElementById('f-weather-city');
    if (weatherCityInput) weatherCityInput.addEventListener('change', () => saveWeatherCity(weatherCityInput.value));
    engineSel.innerHTML = ENGINES.map(e => `<option value="${e.id}">${engName(e)}</option>`).join('');
    nameInput.addEventListener('change', async () => {
      state.settings.name = nameInput.value.trim();
      await Store.set(K.settings, state.settings);
      startClock();
      renderAvatar(); // the avatar initial / fallback derives from the display name
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
      if (weatherCityInput) weatherCityInput.value = (state.settings.weather && state.settings.weather.name) || '';
      applyTheme(); // keep the theme select in sync with state (covers remote sync changes)
      renderSwatches();
      renderWallLibGrid();
      const wallRotCb = document.getElementById('f-wall-rotate');
      if (wallRotCb) wallRotCb.checked = !!state.settings.wallRotate;
      const wallSrcSel = document.getElementById('f-wall-src');
      if (wallSrcSel) wallSrcSel.value = wallLibSource;
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
    renderAvatar(); // the avatar menu mirrors the login state, keep it in step
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
    let dataUrl, light;
    try {
      dataUrl = await compressImage(f, 2560, 0.82);
      light = await isLightImage(dataUrl);
    } catch (err) {
      // Undecodable/corrupt image: say so and reset the input so picking the same file retries.
      e.target.value = '';
      return showToast(t('toast.icon_invalid'));
    }
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
  // Content-aware square crop rect for an uploaded card icon. Returns {sx, sy, side} in source pixels.
  // `rows` is an optional per-row "inked pixel" fraction array of length `h` (null when unavailable).
  // Strategy:
  //  - near-square or wide source: plain centre-crop square (side = min(w, h)).
  //  - tall source (aspect < 0.85): trim empty top/bottom margins, then cut at the first sustained
  //    blank band so the tagline block below is dropped and only the brand icon remains. If no band
  //    is found, fall back to a top-aligned square. When the remaining icon block is shorter than
  //    the width (e.g. a cloud mark sitting over a tagline), the square shrinks to the block height
  //    and is centred horizontally.
  function iconCropRect(w, h, rows) {
    const SQ_LO = 0.85;
    const center = () => {
      const side = Math.min(w, h);
      return { sx: (w - side) / 2, sy: (h - side) / 2, side };
    };
    if (!rows || w / h >= SQ_LO) return center(); // square-ish / wide / no density data
    const BLANK = 0.015;
    const blank = (y) => rows[y] < BLANK;
    let y0 = 0; while (y0 < h && blank(y0)) y0++;
    let y1 = h - 1; while (y1 > y0 && blank(y1)) y1--;
    if (y1 - y0 < 2) return center(); // effectively empty image
    // First sustained blank run inside the trimmed content = boundary between icon and tagline.
    const gapMin = Math.max(3, Math.round(h * 0.015));
    let runStart = -1, gapStart = -1;
    for (let y = y0; y <= y1; y++) {
      if (blank(y)) { if (runStart < 0) runStart = y; }
      else if (runStart >= 0) {
        if (y - runStart >= gapMin) { gapStart = runStart; break; }
        runStart = -1;
      }
    }
    if (runStart >= 0 && y1 + 1 - runStart >= gapMin && gapStart < 0) gapStart = runStart;
    const iconH = (gapStart >= 0 ? gapStart : y1 + 1) - y0;
    if (iconH <= 1) return center();
    if (iconH >= w) return { sx: 0, sy: y0, side: w }; // icon block is taller than wide: top square
    // Icon block is wide-but-short (typical cloud-over-tagline mark): square at the block height,
    // centred horizontally so the mark itself fills the tile without the internal whitespace band.
    return { sx: (w - iconH) / 2, sy: y0, side: iconH };
  }
  // Square the image at `size`x`size` for a card tile (see iconCropRect for the strategy; this also
  // re-bakes over-budget PNGs as JPEG q0.85 — JPEG has no alpha, so the pad is filled with white).
  function compressIconSquare(file, size) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          if (!img.width || !img.height || !size) return reject(new Error('bad image'));
          const W = img.width, H = img.height;
          let rows = null;
          // Per-row inked fraction, computed at a capped resolution so huge photos stay cheap.
          if (W / H < 0.85) {
            const cap = 512 / Math.max(W, H);
            const scale = Math.min(1, cap);
            const sw = Math.max(1, Math.round(W * scale)), sh = Math.max(1, Math.round(H * scale));
            const sc = document.createElement('canvas');
            sc.width = sw; sc.height = sh;
            const sg = sc.getContext('2d', { willReadFrequently: true });
            sg.drawImage(img, 0, 0, sw, sh);
            const sd = sg.getImageData(0, 0, sw, sh).data;
            rows = new Array(sh);
            for (let y = 0; y < sh; y++) {
              let cnt = 0;
              for (let x = 0; x < sw; x++) {
                const i = (y * sw + x) * 4, a = sd[i + 3], r = sd[i], gg = sd[i + 1], b = sd[i + 2];
                if (a > 10 && Math.min(r, gg, b) < 244) cnt++; // inked = visible & not near-white
              }
              rows[y] = cnt / sw;
            }
            // Native-pixel rect from the scaled analysis.
            const r = iconCropRect(sw, sh, rows);
            rows = null; // release
            const inv = 1 / scale;
            drawCrop(r.sx * inv, r.sy * inv, r.side * inv);
          } else {
            const r = iconCropRect(W, H, null);
            drawCrop(r.sx, r.sy, r.side);
          }
          function drawCrop(sx, sy, side) {
            const c = document.createElement('canvas');
            c.width = size; c.height = size;
            const ctx = c.getContext('2d');
            const draw = (pad) => {
              if (pad) { ctx.fillStyle = pad; ctx.fillRect(0, 0, size, size); }
              ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
            };
            draw(null);
            let url = c.toDataURL('image/png');
            if (url.length > 96 * 1024) {
              draw('#fff');
              url = c.toDataURL('image/jpeg', 0.85);
            }
            resolve(url);
          }
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
      <li class="todo-item ${it.done ? 'done' : ''}" data-id="${escapeHtml(it.id)}">
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

  // ---------- Movie-of-the-day widget (route C: built-in Douban annual-best list, zero network) ----------
  // A curated, ordered pool of Douban annual-best / top-250 films. The daily pick is deterministic
  // (day-of-year → index), so every visitor with the widget on sees the same film on a given day,
  // and it rolls over at midnight without any fetch. A "next" affordance browses the pool manually.
  // The backend may later serve a richer live list; the static pool keeps the widget fully offline.
  const DOUBAN_ANNUAL_BEST = [
    { y: 1972, zh: '教父', en: 'The Godfather', rate: 9.3, genre: '剧情 / 犯罪', blurb: '权力与家族的史诗，黑帮电影难以逾越的丰碑。' },
    { y: 1993, zh: '霸王别姬', en: 'Farewell My Concubine', rate: 9.6, genre: '剧情 / 爱情', blurb: '一折京戏，半个世纪的人世浮沉与执念。' },
    { y: 1993, zh: '辛德勒的名单', en: "Schindler's List", rate: 9.6, genre: '剧情 / 历史', blurb: '黑白影像里，一个人如何用名单救下一千条命。' },
    { y: 1994, zh: '肖申克的救赎', en: 'The Shawshank Redemption', rate: 9.7, genre: '剧情 / 犯罪', blurb: '希望是好事，也许是人间至善。' },
    { y: 1994, zh: '阿甘正传', en: 'Forrest Gump', rate: 9.5, genre: '剧情 / 爱情', blurb: '一个傻子跑过美国，也跑进每个人心里。' },
    { y: 1994, zh: '这个杀手不太冷', en: 'Léon', rate: 9.4, genre: '剧情 / 动作', blurb: '杀手与少女，一盆绿植，一段温柔的羁绊。' },
    { y: 1995, zh: '大话西游之大圣娶亲', en: 'A Chinese Odyssey Part Two', rate: 9.2, genre: '喜剧 / 爱情', blurb: '曾经有一份真诚的爱情，我却没来得及珍惜。' },
    { y: 1997, zh: '泰坦尼克号', en: 'Titanic', rate: 9.5, genre: '剧情 / 爱情', blurb: '巨轮沉没，爱情不朽。' },
    { y: 1997, zh: '美丽人生', en: 'Life Is Beautiful', rate: 9.6, genre: '剧情 / 喜剧', blurb: '在最黑暗的岁月里，父亲用游戏守护孩子的童年。' },
    { y: 1998, zh: '海上钢琴师', en: 'The Legend of 1900', rate: 9.3, genre: '剧情 / 音乐', blurb: '一生未曾下船，琴键上却有整片海洋。' },
    { y: 1998, zh: '楚门的世界', en: 'The Truman Show', rate: 9.4, genre: '剧情 / 科幻', blurb: '假如全世界都在演戏，你敢走出那扇门吗？' },
    { y: 2001, zh: '千与千寻', en: 'Spirited Away', rate: 9.4, genre: '动画 / 奇幻', blurb: '别回头，穿过隧道，你会长大。' },
    { y: 2002, zh: '无间道', en: 'Infernal Affairs', rate: 9.3, genre: '剧情 / 犯罪', blurb: '出来混，迟早要还的。' },
    { y: 2004, zh: '放牛班的春天', en: 'Les Choristes', rate: 9.3, genre: '剧情 / 音乐', blurb: '一群被遗忘的孩子，被音乐温柔地唤醒。' },
    { y: 2006, zh: '当幸福来敲门', en: 'The Pursuit of Happyness', rate: 9.2, genre: '剧情 / 传记', blurb: '如果你有梦想，就要去捍卫它。' },
    { y: 2008, zh: '机器人总动员', en: 'WALL·E', rate: 9.3, genre: '动画 / 科幻', blurb: '地球最后的小机器人，谈了一场跨星际的恋爱。' },
    { y: 2009, zh: '三傻大闹宝莱坞', en: '3 Idiots', rate: 9.2, genre: '喜剧 / 剧情', blurb: 'All is well，追求卓越，成功自会追上你。' },
    { y: 2010, zh: '盗梦空间', en: 'Inception', rate: 9.4, genre: '科幻 / 悬疑', blurb: '层层梦境，那个陀螺到底停没停？' },
    { y: 2010, zh: '让子弹飞', en: 'Let the Bullets Fly', rate: 9.0, genre: '喜剧 / 剧情', blurb: '站着把钱挣了，让子弹再飞一会儿。' },
    { y: 2011, zh: '熔炉', en: 'Silenced', rate: 9.3, genre: '剧情', blurb: '我们一路奋战，不是为了改变世界。' },
    { y: 2011, zh: '触不可及', en: 'Intouchables', rate: 9.3, genre: '剧情 / 喜剧', blurb: '两个不同世界的人，成为彼此的救赎。' },
    { y: 2013, zh: '疯狂原始人', en: 'The Croods', rate: 8.7, genre: '动画 / 喜剧', blurb: '一家人第一次走出山洞，看见新世界。' },
    { y: 2014, zh: '星际穿越', en: 'Interstellar', rate: 9.4, genre: '科幻 / 冒险', blurb: '穿越虫洞与时间，爱是唯一能穿透维度的引力。' },
    { y: 2016, zh: '疯狂动物城', en: 'Zootopia', rate: 9.2, genre: '动画 / 喜剧', blurb: '任何人都能成为任何想成为的人。' },
    { y: 2016, zh: '你的名字。', en: 'Your Name.', rate: 8.4, genre: '动画 / 爱情', blurb: '交换身体的两个人，隔着时空寻找彼此。' },
    { y: 2017, zh: '寻梦环游记', en: 'Coco', rate: 9.1, genre: '动画 / 奇幻', blurb: '真正的死亡，是被所有人遗忘。' },
    { y: 2018, zh: '我不是药神', en: 'Dying to Survive', rate: 9.0, genre: '剧情 / 喜剧', blurb: '这世界上只有一种病，穷病。' },
    { y: 2018, zh: '头号玩家', en: 'Ready Player One', rate: 8.7, genre: '科幻 / 冒险', blurb: '在虚拟世界里，寻找现实的彩蛋。' },
    { y: 2018, zh: '绿皮书', en: 'Green Book', rate: 8.9, genre: '剧情 / 喜剧', blurb: '一段南下巡演，两个人都学会了尊重。' },
    { y: 2018, zh: '何以为家', en: 'Capernaum', rate: 9.1, genre: '剧情', blurb: '我要控告我的父母，因为他们生下了我。' },
    { y: 2019, zh: '流浪地球', en: 'The Wandering Earth', rate: 7.9, genre: '科幻 / 冒险', blurb: '带着地球去流浪，中国科幻的第一束光。' },
    { y: 2019, zh: '哪吒之魔童降世', en: 'Ne Zha', rate: 8.4, genre: '动画 / 奇幻', blurb: '我命由我不由天。' },
    { y: 2020, zh: '心灵奇旅', en: 'Soul', rate: 8.7, genre: '动画 / 奇幻', blurb: '生活的火花，不在远方，而在当下。' },
    { y: 2021, zh: '你好，李焕英', en: 'Hi, Mom', rate: 7.7, genre: '喜剧 / 剧情', blurb: '穿越回过去，只想让妈妈再笑一次。' },
    { y: 2022, zh: '灌篮高手', en: 'The First Slam Dunk', rate: 8.9, genre: '动画 / 运动', blurb: '全国大赛的哨声终于吹响，青春没有遗憾。' },
    { y: 2023, zh: '流浪地球2', en: 'The Wandering Earth II', rate: 8.3, genre: '科幻 / 冒险', blurb: '危难当前，唯有责任。' },
    { y: 2023, zh: '奥本海默', en: 'Oppenheimer', rate: 8.8, genre: '剧情 / 传记', blurb: '我成了死神，世界的毁灭者。' },
    { y: 2023, zh: '长安三万里', en: 'Chang An', rate: 8.3, genre: '动画 / 历史', blurb: '诗在，长安就在。' },
    { y: 2024, zh: '飞驰人生2', en: 'Pegasus 2', rate: 7.7, genre: '喜剧 / 运动', blurb: '人到中年，也要再飞一次。' },
    { y: 2024, zh: '第二十条', en: 'Article 20', rate: 7.6, genre: '剧情 / 喜剧', blurb: '法，不能向不法让步。' }
  ];
  // Local cursor: -1 = follow the deterministic daily pick; otherwise a manual index into the pool.
  let movieCursor = -1;
  function movieIndexForToday() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const doy = Math.floor((now - start) / 86400000);
    return ((doy % DOUBAN_ANNUAL_BEST.length) + DOUBAN_ANNUAL_BEST.length) % DOUBAN_ANNUAL_BEST.length;
  }
  function renderMovie() {
    const card = document.getElementById('movie-card');
    if (!card) return;
    const i = movieCursor >= 0 ? (movieCursor % DOUBAN_ANNUAL_BEST.length) : movieIndexForToday();
    const m = DOUBAN_ANNUAL_BEST[i];
    const douban = 'https://www.douban.com/search?cat=1002&q=' + encodeURIComponent(m.zh);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const dateEl = document.getElementById('movie-date');
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = isEn() ? `${now.getMonth() + 1}/${now.getDate()}` : `${now.getMonth() + 1}月${now.getDate()}日`;
    }
    card.innerHTML =
      '<div class="movie-top">' +
        '<div class="movie-rate" aria-label="' + t('movie.rating') + ' ' + m.rate + '">' + m.rate.toFixed(1) + '</div>' +
        '<div class="movie-body">' +
          '<div class="movie-title">' + esc(m.zh) + '<span class="movie-year">' + m.y + '</span></div>' +
          '<div class="movie-en">' + esc(m.en) + '</div>' +
          '<div class="movie-genre">' + esc(m.genre) + '</div>' +
          '<p class="movie-blurb">' + esc(m.blurb) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="movie-actions">' +
        '<a class="movie-link" href="' + douban + '" target="_blank" rel="noopener" data-i18n="movie.douban">豆瓣</a>' +
        '<button type="button" class="movie-next" id="movie-next" data-i18n="movie.next">换一部</button>' +
      '</div>';
    const next = card.querySelector('#movie-next');
    if (next) next.addEventListener('click', () => { movieCursor = i + 1; renderMovie(); });
    // Re-apply any i18n labels injected above (t() already localized the aria; data-i18n handles the rest).
    if (window.LT_I18N && window.LT_I18N.applyStatic) window.LT_I18N.applyStatic();
  }

  // ---------- Weather widget (opt-in, Open-Meteo) ----------
  // Open-Meteo is free, key-less and CORS-open, so the extension page can fetch it directly with no
  // extra manifest permissions. Zero-network rule: the widget ships OFF, and even when enabled it
  // never touches the network until a city is configured (Settings → General).
  const WEATHER_REFRESH_MS = 30 * 60 * 1000; // cache TTL; also the page-open refresh cadence
  const WEATHER_TIMEOUT_MS = 5000;           // every fetch is capped by an AbortController
  // WMO weather interpretation codes → localized condition word ([from, to, zh, en]).
  // https://open-meteo.com/en/docs — WMO Weather interpretation codes.
  const WMO_TEXT = [
    [0, 0, '晴', 'Clear'],
    [1, 2, '多云', 'Partly cloudy'],
    [3, 3, '阴', 'Overcast'],
    [45, 48, '雾', 'Fog'],
    [51, 57, '毛毛雨', 'Drizzle'],
    [61, 67, '雨', 'Rain'],
    [71, 77, '雪', 'Snow'],
    [80, 82, '阵雨', 'Showers'],
    [95, 99, '雷暴', 'Thunderstorm']
  ];
  function weatherText(code) {
    const row = WMO_TEXT.find((r) => code >= r[0] && code <= r[1]);
    if (!row) return isEn() ? 'Unknown' : '未知';
    return isEn() ? row[3] : row[2];
  }
  // Small inline SVG per condition group, drawn in the same stroke style as the rest of the UI.
  const WEATHER_ICON_PATHS = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3v2.3M12 18.7V21M3 12h2.3M18.7 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    cloud: '<path d="M6.8 18.5a4.3 4.3 0 0 1-.5-8.57 5.6 5.6 0 0 1 10.98 1.4 3.6 3.6 0 0 1 .22 7.17z"/>',
    fog: '<path d="M6.8 14.5a4.3 4.3 0 0 1-.5-8.57 5.6 5.6 0 0 1 10.98 1.4 3.6 3.6 0 0 1 .22 7.17z"/><path d="M5 17.8h14M7.2 20.8h9.6"/>',
    rain: '<path d="M6.8 14a4.3 4.3 0 0 1-.5-8.57A5.6 5.6 0 0 1 17.28 6.8a3.6 3.6 0 0 1 .22 7.2z"/><path d="m9.4 16.8-1 2.5M13.4 16.8l-1 2.5M17.4 16.8l-1 2.5"/>',
    snow: '<path d="M6.8 14a4.3 4.3 0 0 1-.5-8.57A5.6 5.6 0 0 1 17.28 6.8a3.6 3.6 0 0 1 .22 7.2z"/><path d="M9.2 17.2v.1M13 18.4v.1M16.8 17.2v.1M11.1 20.6v.1M14.9 20.6v.1"/>',
    thunder: '<path d="M6.8 13.6a4.3 4.3 0 0 1-.5-8.57A5.6 5.6 0 0 1 17.28 6.4a3.6 3.6 0 0 1 .22 7.2z"/><path d="m12.8 12.8-2.4 3.4h2.1l-1.5 3.6 3.6-4.6h-2.2l1.5-2.4z"/>'
  };
  function weatherIcon(code) {
    let kind = 'cloud';
    if (code === 0) kind = 'sun';
    else if (code >= 45 && code <= 48) kind = 'fog';
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) kind = 'rain';
    else if (code >= 71 && code <= 77) kind = 'snow';
    else if (code >= 95) kind = 'thunder';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      WEATHER_ICON_PATHS[kind] + '</svg>';
  }
  async function weatherFetchJson(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), WEATHER_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  // City name → coordinates via the Open-Meteo geocoding API (localized result names).
  async function resolveWeatherCity(name) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) +
      '&count=1&language=' + (isEn() ? 'en' : 'zh') + '&format=json';
    const j = await weatherFetchJson(url);
    const r = j && j.results && j.results[0];
    if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null;
    return { name: r.name || name, lat: r.latitude, lon: r.longitude };
  }
  async function fetchWeatherNow(w) {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + w.lat + '&longitude=' + w.lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
    const j = await weatherFetchJson(url);
    const cur = j && j.current, day = j && j.daily;
    if (!cur || typeof cur.temperature_2m !== 'number' ||
        !day || !day.temperature_2m_max || !day.temperature_2m_min) throw new Error('bad payload');
    return {
      temp: Math.round(cur.temperature_2m),
      rh: Math.round(cur.relative_humidity_2m),
      code: cur.weather_code,
      hi: Math.round(day.temperature_2m_max[0]),
      lo: Math.round(day.temperature_2m_min[0])
    };
  }
  function weatherConfigured() {
    const w = state.settings.weather;
    return !!(w && typeof w.lat === 'number' && typeof w.lon === 'number');
  }
  function renderWeather() {
    const card = document.getElementById('weather-card');
    if (!card) return;
    const updated = document.getElementById('weather-updated');
    const w = state.settings.weather;
    if (!weatherConfigured()) {
      // Guide state: a quiet prompt that opens Settings → General; zero network involved.
      if (updated) updated.textContent = '';
      card.innerHTML = '<button type="button" class="weather-setup" id="weather-setup">' +
        weatherIcon(3) + '<span>' + escapeHtml(t('weather.set_city')) + '</span></button>';
      const btn = card.querySelector('#weather-setup');
      if (btn) btn.addEventListener('click', () => openSettingsTab('gen'));
      return;
    }
    const last = w.last;
    if (!last || typeof last.temp !== 'number') {
      // Configured but nothing fetched yet (or every fetch failed): quiet unavailable state.
      if (updated) updated.textContent = '';
      card.innerHTML = '<div class="weather-empty">' + weatherIcon(3) +
        '<span>' + escapeHtml(t('weather.unavailable')) + '</span></div>';
      return;
    }
    const stale = !w.fetchedAt || (Date.now() - w.fetchedAt > WEATHER_REFRESH_MS);
    if (updated) {
      const d = new Date(w.fetchedAt);
      updated.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes()) +
        (stale ? ' · ' + t('weather.stale') : '');
      updated.classList.toggle('stale', stale);
    }
    card.innerHTML =
      '<div class="weather-top">' +
        '<div class="weather-icon">' + weatherIcon(last.code) + '</div>' +
        '<div class="weather-body">' +
          '<div class="weather-city">' + escapeHtml(w.name) + '</div>' +
          '<div class="weather-temp">' + last.temp + '°</div>' +
          '<div class="weather-desc">' + escapeHtml(weatherText(last.code)) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="weather-meta">' +
        '<span>' + last.hi + '° / ' + last.lo + '°</span>' +
        '<span>' + escapeHtml(t('weather.humidity')) + ' ' + last.rh + '%</span>' +
      '</div>';
  }
  // Fetch only when the widget is visible AND a city is configured AND the cache is stale or missing
  // (a city change drops the old cache, so it counts as stale too). Everything else renders from
  // settings.weather.last without touching the network.
  function maybeFetchWeather() {
    if (!widgetVisible('wweather')) return;
    if (!weatherConfigured()) return;
    const w = state.settings.weather;
    if (w.fetchedAt && Date.now() - w.fetchedAt < WEATHER_REFRESH_MS) return;
    fetchWeather();
  }
  let weatherBusy = false;
  async function fetchWeather() {
    if (weatherBusy) return;
    const w = state.settings.weather;
    if (!w || typeof w.lat !== 'number') return;
    weatherBusy = true;
    try {
      w.last = await fetchWeatherNow(w);
      w.fetchedAt = Date.now();
      await Store.set(K.settings, state.settings);
    } catch {
      // Keep the old cache on failure — renderWeather marks it as possibly outdated.
    }
    weatherBusy = false;
    renderWeather();
  }
  // Settings → General: the city input resolves a name to coordinates once, on commit.
  async function saveWeatherCity(rawName) {
    const name = (rawName || '').trim();
    if (!name) {
      // Clearing the field removes the data source; the widget toggle itself is untouched.
      state.settings.weather = null;
      await Store.set(K.settings, state.settings);
      renderWeather();
      return;
    }
    try {
      const geo = await resolveWeatherCity(name);
      if (!geo) { showToast(t('weather.city_not_found')); return; }
      state.settings.weather = { name: geo.name, lat: geo.lat, lon: geo.lon, last: null, fetchedAt: 0 };
      await Store.set(K.settings, state.settings);
      renderWeather();
      maybeFetchWeather();
      showToast(t('weather.city_saved', { name: geo.name }));
    } catch {
      showToast(t('weather.city_fail'));
    }
  }

  // ---------- Reset ----------
  async function resetAll() {
    if (!confirm(t('toast.reset_confirm'))) return;
    state.settings = structuredClone(DEFAULT_SETTINGS);
    setLangOnly(state.settings.lang);
    applyTheme();
    state.items = structuredClone(DEFAULT_SITES).map(x => ({ ...x, id: nid(), group: '' }));
    state.wallpaper = { ...BUNDLED_WALL };
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
    renderEngineList(); // the engine dropdown's active highlight must follow the reset
    syncUI();
    startClock();
    renderTodos();
    movieCursor = -1;
    renderMovie();
    renderSwatches(); // reset restores the default gradient — refresh the wallpaper panel
    applyWidgets(); // reset brings every left-column widget back
    renderAvatar(); // reset clears the name / avatar back to defaults
    document.getElementById('modal-set').hidden = true;
    showToast(t('toast.reset_done'));
    window.LT_CANVAS.reinitCanvas(); // reset clears layout coordinates, back to the default canvas
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
    // v3 -> v4: per-widget placement. The old single settings.clockPos becomes widgetPos.wclock and
    // everything else keeps its left-column home.
    3: (d) => {
      const st = d.settings || {};
      if (!st.widgetPos || typeof st.widgetPos !== 'object') {
        // Carry the clock's old placement over; never move a widget the user never asked about.
        st.widgetPos = {
          wclock: st.clockPos === 'left' ? 'left' : 'top',
          wcal: 'left',
          wtodo: 'left'
        };
      }
      delete st.clockPos;
      d.settings = st;
      return d;
    },
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
    state.settings.avatar = sanitizeIconDataUrl(state.settings.avatar) || '';
    // An empty array is legitimate (the user deleted every shortcut); only a missing key falls back to the default set.
    state.items = Array.isArray(data.items) ? data.items : structuredClone(DEFAULT_SITES);
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
    applyWidgets(); // a remote pull may have removed / restored left-column widgets
    startClock(); // greeting/name may have been updated remotely
    renderAvatar(); // a remote pull may have brought a different name / avatar
    maybeAutoRotate(); // a remote settings flip may have just enabled the daily rotate
    const nameInput = document.getElementById('f-name');
    if (nameInput) nameInput.value = state.settings.name || '';
    const engineSel = document.getElementById('f-engine');
    if (engineSel) engineSel.value = state.settings.engine;
    showToast(t('sync.applied'));
  }

  // Free canvas layout lives in js/canvas.js (window.LT_CANVAS; loaded before this file).

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
    renderWeather(); // condition words / humidity label follow the language
    window.LT_PROMPTS.renderPromptManager();
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

  // ---------- Profile avatar (top-right) ----------
  // A local profile marker: an optional uploaded avatar image, falling back to the name initial,
  // then to a default person glyph. Ties into the existing display-name field and the optional
  // cloud sync login state (the dropdown shows "logged in as …" and offers login/logout).
  const AVATAR_FALLBACK_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  function avatarState() {
    const avatar = sanitizeIconDataUrl(state.settings.avatar) || '';
    const name = String(state.settings.name || '').trim();
    const initial = name ? Array.from(name)[0].toUpperCase() : '';
    let loggedIn = false, syncLabel = t('avatar.sync');
    if (window.LT_SYNC) {
      const st = window.LT_SYNC.getState();
      loggedIn = !!st.loggedIn;
      syncLabel = loggedIn ? t('avatar.logout') : t('avatar.sync');
    }
    return { avatar, initial, loggedIn, syncLabel };
  }
  function renderAvatar() {
    const s = avatarState();
    const img = document.getElementById('avatar-img');
    const ini = document.getElementById('avatar-initial');
    const fb = document.getElementById('avatar-fallback');
    if (img) { img.style.backgroundImage = s.avatar ? `url("${s.avatar}")` : ''; img.hidden = !s.avatar; }
    if (ini) { ini.textContent = s.initial; ini.hidden = !(!s.avatar && s.initial); }
    // The fallback is an <svg>: SVGElement.hidden does not reflect to the attribute in every
    // engine, so a property assignment can leave the glyph visible beside the photo (the photo
    // then flex-shrinks and no longer fills the button). Toggle the attribute explicitly.
    if (fb) fb.toggleAttribute('hidden', !!(s.avatar || s.initial));
    const big = document.getElementById('avatar-big');
    if (big) {
      if (s.avatar) big.innerHTML = `<img src="${s.avatar}" alt="">`;
      else if (s.initial) big.textContent = s.initial;
      else big.innerHTML = AVATAR_FALLBACK_SVG;
    }
    const syncLabelEl = document.getElementById('avatar-sync-label');
    if (syncLabelEl) syncLabelEl.textContent = s.syncLabel;
    const syncItem = document.getElementById('avatar-sync');
    if (syncItem) syncItem.classList.toggle('danger', s.loggedIn);
    renderAvatarPreview();
  }
  function renderAvatarPreview() {
    const pv = document.getElementById('avatar-preview');
    const rm = document.getElementById('f-avatar-remove');
    if (pv) {
      const s = avatarState();
      if (s.avatar) pv.innerHTML = `<img src="${s.avatar}" alt="">`;
      else if (s.initial) pv.textContent = s.initial;
      else pv.innerHTML = AVATAR_FALLBACK_SVG;
    }
    if (rm) rm.hidden = !sanitizeIconDataUrl(state.settings.avatar);
  }
  // Open the settings modal on a specific tab by reusing the existing settings button (which already
  // syncs every control), then clicking the requested tab.
  function openSettingsTab(tab) {
    const setBtn = document.getElementById('btn-set');
    if (setBtn) setBtn.click();
    if (tab && tab !== 'gen') {
      const tabBtn = document.querySelector(`#modal-set .tab[data-tab="${tab}"]`);
      if (tabBtn) tabBtn.click();
    }
  }
  function bindAvatar() {
    const btn = document.getElementById('btn-avatar');
    const menu = document.getElementById('avatar-menu');
    if (!btn || !menu) return;
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const open = menu.hidden;
      if (open) renderAvatar(); // refresh login status right before showing
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    });
    const openSetEl = document.getElementById('avatar-open-set');
    if (openSetEl) openSetEl.addEventListener('click', () => { close(); openSettingsTab('gen'); });
    const exportEl = document.getElementById('avatar-export');
    if (exportEl) exportEl.addEventListener('click', () => { close(); doExport(); });
    const syncEl = document.getElementById('avatar-sync');
    if (syncEl) syncEl.addEventListener('click', async () => {
      close();
      if (window.LT_SYNC && window.LT_SYNC.isLoggedIn()) {
        await window.LT_SYNC.logout();
        renderAvatar();
      } else {
        openSettingsTab('sync');
      }
    });
    // Avatar upload (Settings → General): reuse the content-aware square crop, then bake to a 96px round.
    const avatarInput = document.getElementById('f-avatar');
    if (avatarInput) avatarInput.addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) return showToast(t('toast.image_too_big'));
      try {
        state.settings.avatar = await compressIconSquare(f, 96);
        await Store.set(K.settings, state.settings);
        renderAvatar();
        showToast(t('toast.avatar_saved'));
      } catch {
        showToast(t('toast.icon_invalid'));
      }
    });
    const rmEl = document.getElementById('f-avatar-remove');
    if (rmEl) rmEl.addEventListener('click', async () => {
      state.settings.avatar = '';
      await Store.set(K.settings, state.settings);
      renderAvatar();
      showToast(t('toast.avatar_removed'));
    });
    document.addEventListener('click', e => {
      if (!menu.hidden && !e.target.closest('.profile')) close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) close();
    });
  }

  // ---------- WorkBuddy desktop detection (#61) ----------
  // WorkBuddy Desktop runs a loopback probe server and answers
  //   GET http://127.0.0.1:18488/workbuddy/probe
  //   -> {"ok":true,"app":"workbuddy-desktop","version":"5.5.3","platform":"darwin"}
  // It binds 127.0.0.1 only, sends Access-Control-Allow-Origin:*, and walks 18488->18490 when a
  // port is taken (two Desktop instances). Same port table, path and timeout its own web landing
  // page probes with, so this tracks the official behaviour instead of sniffing for the app.
  // NOTE: the probe proves WorkBuddy is *running*, not merely installed - a closed app answers
  // nothing yet its workbuddy:// deep link still cold-starts it. So a failed probe never blocks a
  // launch; it only downgrades the toast to an honest "could not see it running".
  const WB_PROBE_PORTS = [18488, 18489, 18490];
  const WB_PROBE_PATH = '/workbuddy/probe';
  const WB_PROBE_TIMEOUT = 1500;
  const WB_PROBE_TTL = 20000; // re-probe at most every 20s; the app can be started mid-session
  const wbStatus = { running: false, version: '', at: 0, checked: false };
  let wbProbeInFlight = null;

  async function probeWorkBuddyPort(port) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), WB_PROBE_TIMEOUT);
    try {
      const r = await fetch(`http://127.0.0.1:${port}${WB_PROBE_PATH}`, {
        method: 'GET', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined
      });
      if (!r.ok) return null;
      const j = await r.json();
      return (j && j.ok && j.app === 'workbuddy-desktop') ? j : null;
    } catch {
      return null; // not listening / blocked / timed out - all mean "cannot see it"
    } finally {
      clearTimeout(timer);
    }
  }
  // Resolves to the probe payload, or null. Concurrent callers share one in-flight probe.
  function probeWorkBuddy(force) {
    if (!force && wbStatus.checked && Date.now() - wbStatus.at < WB_PROBE_TTL) {
      return Promise.resolve(wbStatus.running ? { version: wbStatus.version } : null);
    }
    if (wbProbeInFlight) return wbProbeInFlight;
    wbProbeInFlight = (async () => {
      let hit = null;
      for (const port of WB_PROBE_PORTS) {
        hit = await probeWorkBuddyPort(port);
        if (hit) break;
      }
      wbStatus.running = !!hit;
      wbStatus.version = hit ? String(hit.version || '') : '';
      wbStatus.at = Date.now();
      wbStatus.checked = true;
      wbProbeInFlight = null;
      renderEngineList();
      return hit;
    })();
    return wbProbeInFlight;
  }
  // Post-launch confirmation. A cold start takes a moment, so retry a few times before concluding
  // the app is not there, then offer the download page rather than leaving a dead end.
  function verifyWorkBuddyLaunch() {
    let tries = 0;
    const tick = async () => {
      tries++;
      if (await probeWorkBuddy(true)) return; // it came up - the "launched" toast was right
      if (tries < 3) return void setTimeout(tick, 1600);
      showToast(t('wb.not_detected'), t('wb.get'), () => {
        window.open('https://www.workbuddy.ai/', '_blank', 'noopener');
      }, 7000);
    };
    setTimeout(tick, 1200);
  }

  // ---------- Left-column widget visibility (#60) ----------
  // Coerce whatever came off disk / an imported file into a full per-widget boolean map.
  // Anything missing or non-boolean falls back to the shipped default (DEFAULT_SETTINGS.widgets),
  // so a corrupt file can never silently swallow a widget the user never chose to remove — while
  // opt-in widgets (wweather ships off) stay off until explicitly enabled.
  function normalizeWidgets(raw) {
    const out = {};
    for (const id of WIDGETS) {
      out[id] = (raw && typeof raw[id] === 'boolean') ? raw[id] : DEFAULT_SETTINGS.widgets[id] !== false;
    }
    return out;
  }
  function widgetVisible(id) {
    return normalizeWidgets(state.settings && state.settings.widgets)[id];
  }
  function applyWidgets() {
    const vis = normalizeWidgets(state.settings && state.settings.widgets);
    state.settings.widgets = vis;
    applyWidgetPos();
    for (const id of WIDGETS) {
      const el = document.querySelector('.widget.' + id);
      if (el) el.hidden = !vis[id];
      const box = document.getElementById('f-w-' + id);
      if (box) box.checked = vis[id];
    }
    // All three gone → drop the column entirely so .right (flex:1) reclaims the full width.
    // A clock lifted above the search box no longer counts towards keeping the column alive.
    const left = document.querySelector('.layout > .left');
    if (left) {
      left.hidden = !WIDGETS.some((id) =>
        vis[id] && document.querySelector('.widget.' + id)?.closest('.left'));
    }
    // In free-canvas mode the block coordinates are frozen: toggling a widget without a reflow
    // leaves a hole where it was — and a revived widget may have no coords at all and park at the
    // origin. Force a re-measure even for hand-arranged layouts; this is an explicit structural edit.
    window.LT_CANVAS.recaptureBlocksFromFlow(true);
    // The weather widget is opt-in and network-gated: (re)render on every visibility change and
    // fetch only if it just became visible with a stale cache (maybeFetchWeather decides).
    renderWeather();
    maybeFetchWeather();
  }
  // Per-widget placement (#62). Coerce anything off disk / out of an imported file into a full
  // {wclock,wcal,wtodo} map of 'left' | 'top'; unknown values fall back to the shipped default so a
  // corrupt file can never strand a widget somewhere it cannot be found.
  function normalizeWidgetPos(raw) {
    const out = {};
    for (const id of WIDGETS) {
      const v = raw && raw[id];
      out[id] = (v === 'left' || v === 'top') ? v : DEFAULT_SETTINGS.widgetPos[id];
    }
    return out;
  }
  // Move each widget card between the left column and the slot above the search box. The widget's
  // own DOM is reused verbatim — only its parent and one class change — so the clock's tick logic
  // and the calendar's month renderer never have to know this feature exists.
  function clockIsTop() {
    return normalizeWidgetPos(state.settings && state.settings.widgetPos).wclock === 'top';
  }
  function applyWidgetPos() {
    const pos = normalizeWidgetPos(state.settings && state.settings.widgetPos);
    state.settings.widgetPos = pos;
    const left = document.querySelector('.layout > .left');
    const right = document.querySelector('.layout > .right');
    const search = document.getElementById('search');
    // Walk WIDGETS in order and insert before #search each time, so the top stack ends up in the
    // same clock -> calendar -> to-do order as the left column would have shown.
    for (const id of WIDGETS) {
      const el = document.querySelector('.widget.' + id);
      if (!el) continue;
      if (pos[id] === 'top' && right && search) {
        right.insertBefore(el, search);
      } else if (pos[id] === 'left' && left) {
        left.appendChild(el);
      }
      el.classList.toggle('w-top', pos[id] === 'top');
      const sel = document.getElementById('f-pos-' + id);
      if (sel && sel.value !== pos[id]) sel.value = pos[id];
    }
    // The clock renders a different date line per placement, and its tick only rewrites text when the
    // day rolls over — so force a redraw whenever the placement changes.
    if (clockTimer) startClock();
  }
  // Remove one widget, with an undo toast — same affordance as deleting a shortcut card.
  function removeWidget(id) {
    if (!WIDGETS.includes(id) || !widgetVisible(id)) return;
    state.settings.widgets = normalizeWidgets(state.settings.widgets);
    state.settings.widgetPos = normalizeWidgetPos(state.settings.widgetPos);
    state.settings.widgets[id] = false;
    Store.set(K.settings, state.settings);
    applyWidgets();
    showToast(t('widget.removed'), t('toast.undo'), () => {
      state.settings.widgets[id] = true;
      Store.set(K.settings, state.settings);
      applyWidgets();
    });
  }
  function bindWidgetControls() {
    document.querySelectorAll('.widget .w-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeWidget(btn.dataset.widget);
      });
    });
    for (const id of WIDGETS) {
      const box = document.getElementById('f-w-' + id);
      if (!box) continue;
      box.addEventListener('change', () => {
        state.settings.widgets = normalizeWidgets(state.settings.widgets);
    state.settings.widgetPos = normalizeWidgetPos(state.settings.widgetPos);
        state.settings.widgets[id] = box.checked;
        Store.set(K.settings, state.settings);
        applyWidgets();
      });
    }
    for (const id of WIDGETS) {
      const sel = document.getElementById('f-pos-' + id);
      if (!sel) continue;
      sel.addEventListener('change', () => {
        state.settings.widgetPos = normalizeWidgetPos(state.settings.widgetPos);
        state.settings.widgetPos[id] = sel.value === 'top' ? 'top' : 'left';
        Store.set(K.settings, state.settings);
        applyWidgets();
      });
    }
  }


  // ---------- Boot ----------
  async function boot() {
    const { raw, data } = await loadDataIntoState();
    setLangOnly(state.settings.lang);
    applyTheme();
    // Focus the search box without scrolling: the HTML autofocus attribute makes the browser
    // scroll the input into view, which pushes the topbar off-screen on short/narrow windows.
    const qInput = document.getElementById('q');
    if (qInput) qInput.focus({ preventScroll: true });
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
    applyWidgets();
    bindWidgetControls();
    startClock();
    renderCalendar();
    bindCalendar();
    renderMovie();
    renderWeather();
    maybeFetchWeather(); // boot-time refresh, only when the cache is stale (30 min TTL)
    setInterval(maybeFetchWeather, WEATHER_REFRESH_MS); // page-open refresh cadence
    bindTodo();

    // Search
    const form = document.getElementById('search-form');
    const qEl = document.getElementById('q');
    form.addEventListener('submit', e => { e.preventDefault(); submitSearch(qEl.value, e); });
    document.getElementById('search-go').addEventListener('click', e => submitSearch(qEl.value, e));
    // Esc while a template is active: drop the template and go back to plain search.
    qEl.addEventListener('keydown', e => {
      if (e.key === 'Escape' && activePrompt) { e.stopPropagation(); window.LT_PROMPTS.clearActiveTemplate(); qEl.focus(); }
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
        window.LT_PROMPTS.closePalette(false);
        if (activePrompt && isTypingTarget(document.activeElement)) {
          const qq = document.getElementById('q');
          if (document.activeElement === qq) window.LT_PROMPTS.clearActiveTemplate();
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
          if (pal.hidden) window.LT_PROMPTS.openPalette(); else window.LT_PROMPTS.closePalette();
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
    window.LT_PROMPTS.bindPalette();
    bindSettings();
    bindAvatar();
    renderAvatar(); // profile avatar is rendered once events are bound and sync state is reachable
    sweepPending(); // sweep expired / corrupted pending leftovers on boot

    // Cloud sync init, last: the migration write-back has landed and every event is bound.
    if (window.LT_SYNC) {
      window.LT_SYNC.configure({ remoteApply: reloadFromStorage, onChange: renderSyncPanel });
      bindSyncPanel();
      renderSyncPanel();
      window.LT_SYNC.init();
    }

    // Plum blossom: rotate the wallpaper and show an inspirational quote along the bottom.
    document.getElementById('btn-plum').addEventListener('click', rotateWallpaperAndQuote);

    // Free canvas layout (draggable blocks): initialised last, once every block has rendered.
    window.LT_CANVAS.initCanvasLayout();
    // Boot order note: applyWidgets() runs before the canvas exists, so its recapture is a no-op
    // there. If this profile arrived with widgets already removed (cloud sync, imported file, a
    // previous session), the frozen coordinates still describe the old three-widget page — fix
    // them up now that the canvas is live.
    if (window.LT_CANVAS.widgetLayoutStale()) window.LT_CANVAS.recaptureBlocksFromFlow();

    // Probe WorkBuddy Desktop once at boot so the engine dropdown can show its real state.
    // Fire-and-forget: nothing on the page blocks on the result.
    probeWorkBuddy().catch(() => {});

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

  // Shared context for the split-out modules js/canvas.js and js/prompts.js.
  // They load before this file (see newtab.html) and only touch this object at call time.
  window.LT_APP = {
    state, Store, K, ENGINES, WIDGETS,
    t, engName, escapeHtml, nid, showToast,
    launchPrompt, setEngine, normalizeWidgets, normalizeWidgetPos,
    getCurrentEngine: () => currentEngine,
    getActivePrompt: () => activePrompt,
    setActivePrompt: (p) => { activePrompt = p; }
  };

  // Pure-function exports for the offline assertions in scripts/smoke.cjs
  // (same convention as window.LT_LUNAR / window.LT_SYNC).
  // Exposed for the offline probe harness: it has to drive port fallback and timeout paths with a
  // stubbed fetch, which is impossible from the outside.
  window.LT_PROBE_WB = probeWorkBuddy;
  window.LT_PURE = { looksLikeUrl, sanitizeWallpaperUrl, sanitizeIconDataUrl, iconCropRect, hostnameOf, iconFor, iconGlyphHtml, normalizeWidgets, normalizeWidgetPos, resolveTheme, todayStr, pickRotateCandidate, pickQuoteIndex };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

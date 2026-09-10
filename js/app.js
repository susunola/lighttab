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
  function engName(e) { return e.custom ? e.name : (t('eng.' + e.id) || e.name); }

  // ---------- Constants ----------
  // ENGINES: `id` is the stable key used for storage and for the i18n lookup `eng.<id>`.
  // `name` is only an English fallback for when the i18n layer is unavailable.
  const ENGINES = [
    { id: 'baidu',    name: 'Baidu',  url: 'https://www.baidu.com/s?wd={q}',                            color: '#2932e1' },
    { id: 'bing',     name: 'Bing',   url: 'https://www.bing.com/search?q={q}',                          color: '#008373' },
    { id: 'google',   name: 'Google', url: 'https://www.google.com/search?q={q}',                        color: '#4285F4' },
    { id: 'github',   name: 'GitHub', url: 'https://github.com/search?q={q}&type=repositories',          color: '#1f2937' },
    { id: 'bilibili', name: 'B 站',   url: 'https://search.bilibili.com/all?keyword={q}',                color: '#fb7299' },
    // AI chats: Doubao / ChatGPT are auto-filled and submitted by the content script (js/inject-ai.js).
    // The prompt never travels in the URL: in extension mode it goes through lt.pending.<nonce>
    // (the URL only carries lt_auto=1&lt_k=<nonce>); preview mode falls back to a plaintext ?q=.
    { id: 'doubao',   name: 'Doubao AI', url: 'https://www.doubao.com/chat/',                      color: '#3d8cff', ai: true, injected: true },
    { id: 'openai',   name: 'ChatGPT', url: 'https://chatgpt.com/',                               color: '#10a37f', ai: true, injected: true },
    { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/', color: '#4d6bfe', ai: true, copyOnly: true },
    // WorkBuddy desktop: open a new task draft through its deep link.
    { id: 'wbai',     name: 'WorkBuddy', url: 'workbuddy://task?action=start&prompt={q}', color: '#22d3ee', ai: true, deeplink: true }
  ];

  const WALLPAPERS = [
    // The factory default is a bundled render (procedurally generated, zero licensing surface);
    // entries with `img` are bundled files, entries with `css` are gradients.
    { id: 'blue-hour-plum', name: '暮蓝映梅', img: 'assets/wallpaper-blue-hour-plum.jpg' },
    { id: 'dusk',     name: 'Dusk Mountain', img: 'assets/wallpaper-dusk.jpg' },
    // Store builds bundle only self-generated art; the online library serves curated wallpapers.
    { id: 'midnight', name: 'Dusk Blue',    css: 'linear-gradient(135deg,#0b1426 0%,#152a4f 45%,#1c3d6e 100%)' },
    { id: 'aurora',   name: 'Aurora',       css: 'linear-gradient(135deg,#0f1c3a 0%,#1e3a6e 50%,#2d5f8f 100%)' },
    { id: 'violet',   name: 'Night Violet', css: 'linear-gradient(135deg,#0f0a26 0%,#2b1b54 50%,#432e7a 100%)' },
    { id: 'teal',     name: 'Teal',         css: 'linear-gradient(135deg,#0a1e25 0%,#0e3239 50%,#15525b 100%)' },
    { id: 'graphite', name: 'Graphite',     css: 'linear-gradient(135deg,#0e1117 0%,#1f242e 50%,#2a3038 100%)' },
    { id: 'rose',     name: 'Dusk Red',     css: 'linear-gradient(135deg,#1a0f1a 0%,#3d1b2e 50%,#5a2540 100%)' }
  ];
  // What a fresh profile (or an unreadable saved wallpaper) gets.
  const BUNDLED_WALL = { type: 'image', value: 'assets/wallpaper-blue-hour-plum.jpg', light: false };

  const DEFAULT_SITES = [
    { id: nid(), title: "豆包", url: "https://www.doubao.com/", color: "#7655ef" },
    { id: nid(), title: "Gmail", url: "https://mail.google.com/", color: "#EA4335" },
    { id: nid(), title: "Hotmail", url: "https://outlook.live.com/", color: "#0078D4" },
    { id: nid(), title: "YouTube", url: "https://www.youtube.com/", color: "#FF0000" },
    { id: nid(), title: "Bilibili", url: "https://www.bilibili.com/", color: "#00A1D6" },
    { id: nid(), title: "腾讯视频", url: "https://v.qq.com/", color: "#FFFFFF" },
    { id: nid(), title: "爱奇艺", url: "https://www.iqiyi.com/", color: "#FFFFFF" },
    { id: nid(), title: "优酷视频", url: "https://www.youku.com/", color: "#FFFFFF" },
    { id: nid(), title: "慕课网", url: "https://www.imooc.com/", color: "#F01414" },
    { id: nid(), title: "腾讯文档", url: "https://docs.qq.com/", color: "#2878FF" },
    { id: nid(), title: "微信读书", url: "https://weread.qq.com/", color: "#2878FF" },
    { id: nid(), title: "小鹅通", url: "https://www.xiaoe-tech.com/", color: "#2878FF" },
    { id: nid(), title: "Tencent Cloud", url: "https://www.tencentcloud.com/", color: "#FFFFFF" },
    { id: nid(), title: "腾讯云", url: "https://cloud.tencent.com/", color: "#FFFFFF" },
    { id: nid(), title: "AWS", url: "https://aws.amazon.com/", color: "#FFFFFF" },
    { id: nid(), title: "Huawei Cloud", url: "https://www.huaweicloud.com/", color: "#FFFFFF" },
    { id: nid(), title: "Google Cloud", url: "https://cloud.google.com/", color: "#FFFFFF" },
    { id: nid(), title: "阿里云", url: "https://www.aliyun.com/", color: "#FF6A00" },
    { id: nid(), title: "KodeKloud", url: "https://kodekloud.com/", color: "#102030" },
    { id: nid(), title: "极客时间", url: "https://time.geekbang.org/", color: "#FFFFFF" },
    { id: nid(), title: "51CTO", url: "https://www.51cto.com/", color: "#FFFFFF" },
    { id: nid(), title: "GitHub", url: "https://github.com/", color: "#181717" }
  ];

  const DEFAULT_SETTINGS = {
    engine: 'google',
    // Search suggestions dropdown (JSONP, no host_permissions). On by default; turning it off
    // stops the typed text from leaving the browser until Enter.
    suggest: true,
    name: '',
    // Top-right profile avatar: a local raster dataURL (data:image/png|jpeg|webp|gif;base64,…).
    // Empty = show the name initial, or a default person glyph when no name is set.
    avatar: '',
    lang: 'zh',
    // Theme: 'dark' | 'light' | 'system' (follow the OS scheme).
    theme: 'dark',
    // Accent colour: a custom hex, '' = the shipped per-theme accent (Settings → General).
    accent: '',
    // Clock format: false = 24h (default); true = 12h with a small AM/PM (上午/下午) indicator.
    clock12h: false,
    // Seconds display: false (default) = hh:mm; true = the seconds span shows hh:mm:ss.
    clockSeconds: false,
    // Clock face font: 'modern' (bundled Inter, default) | 'serif' | 'mono' (system stacks, zero downloads).
    clockFont: 'modern',
    // Optional second timezone (IANA name, e.g. "Asia/Tokyo"); '' = off. Rendered under the clock.
    clockTz2: '',
    // Local error capture (off by default): records error messages only, never leaves the device.
    diag: false,
    // Minimalism toggles: true removes the search bar / clock card from the layout entirely
    // (display:none, not just opacity — the icon grid simply rides up when both are hidden).
    hideSearch: false,
    hideClock: false,
    // Icon tile geometry, driven by the Settings → General sliders onto the --icon-size /
    // --icon-radius CSS custom properties. 64px tiles with a 28% corner radius are the shipped look.
    iconSize: 88,
    iconRadius: 28,
    wallpaper: { ...BUNDLED_WALL },
    // Daily Bing wallpaper auto-rotate: when on, one Bing daily image from the local pool is
    // applied per calendar day. Manual picks always win for the rest of that day.
    wallRotate: false,
    // Groups: array of { id, name }. Empty = grouping disabled (group bar hidden, and the
    // shortcut dialog does not show the group dropdown).
    groups: [],
    // Search engines: user-added engines and built-ins the user removed. Both live in settings
    // so they sync/export with everything else. Customs carry `custom: true` (their name is used
    // verbatim instead of the eng.<id> i18n lookup).
    customEngines: [],
    hiddenEngines: [],
    // Free canvas layout: { wclock/wcal/wtodo/search/grid: {x,y,w} }.
    // null = fall back to the default two-column flow layout.
    layout: null,
    // Left-column widgets the user kept. Removing one hides it in both the flow and canvas layouts;
    // removing all three collapses the whole left column so the icon grid spans the full width.
    // Lives inside settings on purpose — it then rides along with export / import / cloud sync for free.
    widgets: { wclock: true, wcal: false, wtodo: false, wmovie: true, wweather: false, wcount: false, wpomodoro: false },
    // Per-widget placement: 'left' keeps the widget as a left-column card, 'top' lifts it into the
    // stack above the search box (centred, card chrome dropped — the phone-launcher look).
    // Only the clock rides up top by default — that slot wants a glanceable time + date line, not a
    // month grid. Calendar, to-do and movie stay left-column cards; all can still be lifted from Settings.
    widgetPos: { wclock: 'top', wcal: 'left', wtodo: 'left', wmovie: 'left', wweather: 'left', wcount: 'left', wpomodoro: 'left' },
    // Weather widget (opt-in, Open-Meteo): null until the user picks a city in Settings → General,
    // then { name, lat, lon, last: { temp, rh, code, hi, lo }, fetchedAt }. Lives inside settings so
    // it rides along with export / import / cloud sync for free.
    weather: null,
    // Countdown widget (opt-in): a daily off-work time plus up to 5 custom countdown days
    // ({ id, name, date: 'YYYY-MM-DD' }). Lives inside settings like everything else.
    countdown: { off: '18:00', days: [] }
  };
  // Left-column widget ids, in render order. Single source of truth for visibility + settings UI.
  const WIDGETS = ['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather', 'wcount', 'wpomodoro'];

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
  ];

  const PROMPTS_ZH = [
    ['翻译成英文','请将以下内容翻译成自然、流畅的英文，保留原文语气和格式：','粘贴需要翻译的内容…'],
    ['翻译成中文','请将以下内容翻译成自然、流畅的中文，保留原文语气和格式：','粘贴需要翻译的内容…'],
    ['润色文字','你是一位资深编辑。请润色以下内容，使表达更简洁、清晰，并简要列出主要修改：','粘贴需要润色的内容…'],
    ['解释代码','请逐段解释以下代码的作用，指出潜在问题，并提出具体的改进建议：','粘贴代码…'],
    ['生成周报','请将以下工作记录整理成周报，分为已完成、进行中、风险和下周计划四部分：','粘贴本周工作记录…'],
    ['总结内容','请将以下内容提炼为要点列表，每行一个要点，按重要程度排序：','粘贴文章或会议记录…'],
  ].map(([name,tmpl,hint])=>({name,tmpl:tmpl+'\n\n{q}',hint}));
  function localizeBuiltinPrompts() {
    // Retire the former built-in task from saved libraries as well as new installs.
    const retired = {
      'WorkBuddy task': 'Help me complete the following task. First outline a plan, then execute it step by step; cite evidence for any external facts:\n\n{q}',
      'WorkBuddy 任务': '请帮我完成以下任务。先列出计划，再逐步执行；涉及外部事实时，请注明依据：\n\n{q}'
    };
    state.prompts = (state.prompts || []).filter(p => retired[p.name] !== p.tmpl);
    for (const p of state.prompts || []) {
      const i=DEFAULT_PROMPTS.findIndex((en,i)=>[en,PROMPTS_ZH[i]].some(v=>p.name===v.name && p.tmpl===v.tmpl && p.hint===v.hint));
      if(i<0)continue; // Never overwrite user-authored or edited content.
      const v=isEn()?DEFAULT_PROMPTS[i]:PROMPTS_ZH[i];
      Object.assign(p,{name:v.name,tmpl:v.tmpl,hint:v.hint});
    }
  }

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
    if (/^data:image\//i.test(v) || /^https:/i.test(v) || WALLPAPERS.some(w => w.img === v)) return v;
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
  // sentence the left-column card shows. Mirrors the launcher convention, e.g. "9/4 Fri · lunar 7/23".
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
  const SCHEMA_VERSION = 5;
  const K = { settings: 'lt.settings', items: 'lt.items', wallpaper: 'lt.wallpaper', todos: 'lt.todos', prompts: 'lt.prompts', walllib: 'lt.walllib', rot: 'lt.rot', schema: 'lt.schema', history: 'lt.history', backup: 'lt.backup', diag: 'lt.diag', calendars: 'lt.calendars', calcache: 'lt.calcache' };
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
        if (window.LT_SYNC) await window.LT_SYNC.writeLocal(key, val);
        else if (hasChromeStorage) await chrome.storage.local.set({ [key]: val });
        else localStorage.setItem(key, JSON.stringify(val));
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
  function fmtBytes(b) {
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
    if (b >= 1024) return Math.round(b / 1024) + ' KB';
    return b + ' B';
  }
  // Settings → Data management: live storage-usage line (chrome.storage bytes, localStorage in
  // preview). Refresh after boot, when opening settings, and after any big write path.
  async function renderStorageUse() {
    const el = document.getElementById('storage-use');
    if (!el) return;
    try {
      let bytes = 0;
      if (hasChromeStorage && chrome.storage && chrome.storage.local && chrome.storage.local.getBytesInUse) {
        bytes = await chrome.storage.local.getBytesInUse(null);
      } else {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) bytes += (localStorage.getItem(k) || '').length * 2;
        }
      }
      if (!bytes) { el.hidden = true; return; }
      el.textContent = t('store.used', { v: fmtBytes(bytes) });
      el.hidden = false;
    } catch { el.hidden = true; }
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
    // Subscribed calendars: [{ id, name, url, color, on }]. Kept out of DEFAULT_SETTINGS and read
    // through its own key because an Apple "public calendar" link is an unguessable capability —
    // see the note above rebuildCalIndex() for why it must never reach cloud sync.
    calendars: [],
    view: VIEW_ALL
  };
  let calCache = {};              // feedId → { fetchedAt, etag, title, events[], error }
  let calIndex = new Map();       // 'YYYY-MM-DD' → [{ feed, ev }], derived from calCache
  let currentEngine = ENGINES[0];
  let activePrompt = null; // template picked and waiting to launch (session only, not persisted)
  let clockTimer = null;
  let pendingIcon = null; // unsaved custom card icon (dataURL) held by the shortcut modal until Save
  // True once the shortcut modal's Name field holds a name the user (or an explicit source such as
  // "Add current tab") chose, so typing in the URL field stops overwriting it. Cleared on open.
  let siteTitleDirty = false;

  // ---------- Wallpaper ----------
  function applyWallpaper(wp) {
    const el = document.getElementById('wallpaper');
    // Anything unreadable (missing type, disallowed image URL, empty gradient) falls back to the bundled default.
    if (!wp || !wp.type
      || (wp.type === 'image' && !sanitizeWallpaperUrl(wp.value))
      || (wp.type === 'gradient' && !wp.value)) wp = BUNDLED_WALL;
    el.classList.toggle('bg-light', !!(wp.type === 'image' && wp.light));
    document.documentElement.dataset.wallTone = wp.light ? 'light' : 'dark';
    const toneSource = wp.type === 'image' ? sanitizeWallpaperUrl(wp.value) : '';
    el.dataset.toneSource = toneSource;
    if (toneSource) {
      const probe = new Image(); probe.crossOrigin = 'anonymous';
      probe.onload = () => {
        if (el.dataset.toneSource !== toneSource) return;
        try {
          const canvas = document.createElement('canvas'); canvas.width=24; canvas.height=16;
          const ctx = canvas.getContext('2d'); ctx.drawImage(probe,0,0,24,16);
          const pixels = ctx.getImageData(0,0,24,16).data;
          let brightness=0;
          for(let i=0;i<pixels.length;i+=4) brightness+=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];
          document.documentElement.dataset.wallTone = brightness/(24*16)>150 ? 'light' : 'dark';
        } catch (_) { /* Cross-origin sources retain their declared tone. */ }
      };
      probe.src=toneSource;
    }

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
  let wallLibImages = null;    // [{url,title,copyright,fav?}] of the current pool (null = not loaded yet)
  let wallLibSavedAt = 0;      // ms epoch of the last successful fetch (drives the once-a-day silent refresh)
  let wallLibSource = 'bing';  // current wallpaper source: bing | wallhaven | unsplash
  let wallFavOnly = false;     // library filter: favorites only (session-scoped, not persisted)

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
      el.addEventListener('click', async () => {
        if (el.dataset.i === 'img') return;
        const w = WALLPAPERS[+el.dataset.i];
        // Apply + persist, then give visible feedback. Without the toast, picking the preset that
        // is already active (e.g. the default) changes nothing on screen and looks dead.
        await setWallpaper(w.img ? { type: 'image', value: w.img, light: false } : { type: 'gradient', value: w.css });
        markManualPickToday(); // a manual pick wins for the rest of this calendar day
        renderSwatches();
        showToast(t('toast.wall_applied'));
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

  // Favorites persist inside the same lt.walllib entries (a `fav` flag on each image). Unlike
  // saveWallLibCache this keeps savedAt untouched — a favorite toggle is not a refetch.
  async function persistWallLib() {
    if (!Array.isArray(wallLibImages)) return;
    try { await localRawSet(K.walllib, { savedAt: wallLibSavedAt, images: wallLibImages }); } catch { /* best effort */ }
  }
  function toggleWallFav(url) {
    const im = (wallLibImages || []).find(x => x && x.url === url);
    if (!im) return;
    if (im.fav) delete im.fav; else im.fav = true;
    persistWallLib();
    renderWallLibGrid();
  }

  // "Shuffle" jumps the pool index to a random offset so the backend returns a different batch
  // ("获取最新" keeps showing the head of the feed). Favorites are preserved across batches.
  const WALL_SHUFFLE_MAX = 40;
  async function collectFavUrls() {
    const favs = new Set();
    const merge = (arr) => { for (const im of (arr || [])) if (im && im.fav && im.url) favs.add(im.url); };
    merge(wallLibImages);
    merge(await loadWallLibCache().catch(() => null));
    return favs;
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
      const params = new URLSearchParams({
        source: src,
        idx: o.shuffle ? String(Math.floor(Math.random() * WALL_SHUFFLE_MAX)) : '0',
        n: '8'
      });
      if (src === 'bing') params.set('mkt', isEn() ? 'en-US' : 'zh-CN');
      const res = await fetch(WALL_LIB_BASE + '/v1/wallpapers?' + params.toString());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      wallLibImages = (data.images || []).filter(im => im && sanitizeWallpaperUrl(im.url));
      if (wallLibImages.length) {
        // Re-apply favorites that were set on an earlier batch / cache (flagged by URL).
        const favs = await collectFavUrls();
        for (const im of wallLibImages) if (favs.has(im.url)) im.fav = true;
        await saveWallLibCache(wallLibImages);
      }
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
    const pool = Array.isArray(wallLibImages) ? wallLibImages : [];
    // The favorites filter toggle only makes sense once a pool exists.
    const favsBtn = document.getElementById('btn-wall-favs');
    if (favsBtn) {
      favsBtn.hidden = !pool.length;
      favsBtn.classList.toggle('on', wallFavOnly);
      favsBtn.setAttribute('aria-pressed', String(wallFavOnly));
    }
    const list = pool.filter(im => !wallFavOnly || im.fav);
    if (!list.length) { grid.innerHTML = ''; return; }
    const cur = state.wallpaper && state.wallpaper.type === 'image' ? state.wallpaper.value : '';
    grid.innerHTML = list.map(im => `
      <div class="wall-thumb ${im.url === cur ? 'active' : ''}" data-url="${escapeHtml(im.url)}" title="${escapeHtml(im.copyright || im.title || '')}">
        <img src="${escapeHtml(im.url)}" alt="${escapeHtml(im.title || '')}" loading="lazy">
        <button type="button" class="wall-fav${im.fav ? ' on' : ''}" data-url="${escapeHtml(im.url)}" title="${t('wall.fav')}" aria-label="${t('wall.fav')}" aria-pressed="${im.fav ? 'true' : 'false'}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
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
    grid.querySelectorAll('.wall-fav').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation(); // a favorite toggle must not apply the wallpaper
        toggleWallFav(el.dataset.url);
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
    { zh: '学而不思则罔，思而不学则殆。', en: 'Learning without thought is labour lost; thought without learning is perilous.', src: { zh: '《论语·为政》', en: 'The Analects' } },
    { zh: '知之者不如好之者，好之者不如乐之者。', en: 'Those who know it are not as good as those who love it; those who love it are not as good as those who delight in it.', src: { zh: '《论语·雍也》', en: 'The Analects' } },
    { zh: '问渠那得清如许？为有源头活水来。', en: 'How can the pond stay so clear? Living water keeps flowing in from its source.', src: { zh: '朱熹《观书有感》', en: 'Zhu Xi · Reading' } },
    { zh: '博观而约取，厚积而薄发。', en: 'Look widely, take selectively; store deeply, release sparingly.', src: { zh: '苏轼《稼说送张琥》', en: 'Su Shi' } },
    { zh: '业精于勤，荒于嬉；行成于思，毁于随。', en: 'Mastery comes from diligence and withers with play; conduct is shaped by thought and ruined by ease.', src: { zh: '韩愈《进学解》', en: 'Han Yu' } },
    { zh: '苟日新，日日新，又日新。', en: 'If you can renew yourself in a day, renew yourself day after day.', src: { zh: '《大学》', en: 'The Great Learning' } },
    { zh: '天将降大任于是人也，必先苦其心志，劳其筋骨。', en: 'When Heaven entrusts a great task, it first steels the will and wearies the body.', src: { zh: '《孟子·告子下》', en: 'Mencius' } },
    { zh: '玉不琢，不成器；人不学，不知道。', en: 'Unpolished jade cannot shine; untaught people cannot know the Way.', src: { zh: '《礼记·学记》', en: 'Book of Rites' } },
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
  // ---------- Plum petal burst ----------
  // Clicking the plum branch scatters a burst of petals from the corner: a one-shot DPR-aware
  // canvas overlay, torn down when the last petal lands. Respects prefers-reduced-motion.
  let petalCanvas = null;
  let petalRaf = 0;
  const PETAL_COLORS = ['#f9a8d4', '#f472b6', '#ec4899', '#e9d5ff', '#fbcfe8'];
  function drawPetal(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.95, -s * 0.55, s * 0.72, s * 0.6, 0, s);
    ctx.bezierCurveTo(-s * 0.72, s * 0.6, -s * 0.95, -s * 0.55, 0, -s);
    ctx.fill();
  }
  function petalBurst(launch = false) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!petalCanvas) {
      petalCanvas = document.createElement('canvas');
      petalCanvas.className = 'petal-canvas';
      petalCanvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(petalCanvas);
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    petalCanvas.width = W * dpr;
    petalCanvas.height = H * dpr;
    petalCanvas.style.width = W + 'px';
    petalCanvas.style.height = H + 'px';
    const ctx = petalCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Origin: the plum button's centre (bottom-right corner).
    const btn = document.getElementById(launch ? 'search' : 'btn-plum');
    const br = btn ? btn.getBoundingClientRect() : { left: W, top: H, width: 0, height: 0 };
    const ox = br.left + br.width / 2, oy = br.top + br.height / 2;
    const now = performance.now();
    const petals = [];
    for (let i = 0; i < (launch ? 100 : 46); i++) {
      // Fan up-and-left out of the corner, speeds in px/s.
      const ang = (launch ? -180 + Math.random() * 180 : -160 + Math.random() * 95) * Math.PI / 180;
      const spd = 260 + Math.random() * 560;
      petals.push({
        x: launch && i > 35 ? Math.random() * W : ox + (Math.random() - 0.5) * 30,
        y: launch && i > 35 ? -Math.random() * H * .6 : oy + (Math.random() - 0.5) * 20,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 140,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 7,
        size: 5 + Math.random() * 8,
        color: PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0],
        swayF: 1.2 + Math.random() * 2.2,   // sway frequency (rad/s)
        swayA: 20 + Math.random() * 46,     // sway amplitude (px)
        phase: Math.random() * Math.PI * 2,
        flipF: 2 + Math.random() * 3.5,     // fake 3D tumble frequency
        born: now + Math.random() * 180,
        ttl: 3200 + Math.random() * 1400
      });
    }
    if (petalRaf) cancelAnimationFrame(petalRaf);
    let prev = now;
    const GRAV = 460;        // px/s²
    const DRAG = 0.986;      // per-frame velocity retention
    function frame(t) {
      const dt = Math.max(0, Math.min((t - prev) / 1000, 0.05));
      prev = t;
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of petals) {
        // Not-yet-born petals still count as alive — an early vsync timestamp (< burst time)
        // must not kill the loop on its first frame.
        if (t < p.born) { alive++; continue; }
        const age = t - p.born;
        if (age > p.ttl || p.y > H + 60) continue;
        alive++;
        p.vy += GRAV * dt;
        p.vx *= DRAG; p.vy *= DRAG;
        p.x += (p.vx + Math.sin(t / 1000 * p.swayF + p.phase) * p.swayA) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const fade = age > p.ttl - 700 ? Math.max(0, (p.ttl - age) / 700) : 1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, 0.35 + 0.65 * Math.abs(Math.cos(t / 1000 * p.flipF + p.phase))); // tumble
        ctx.globalAlpha = fade;
        ctx.fillStyle = p.color;
        drawPetal(ctx, p.size);
        ctx.restore();
      }
      if (alive) petalRaf = requestAnimationFrame(frame);
      else { petalRaf = 0; ctx.clearRect(0, 0, W, H); }
    }
    petalRaf = requestAnimationFrame(frame);
  }
  function bindPlumSecret() {
    const btn = document.getElementById('btn-plum');
    const note = document.createElement('div');
    note.id = 'plum-secret'; note.hidden = true; note.setAttribute('role','status');
    note.innerHTML = '<div class="secret-aura" aria-hidden="true"></div><div class="secret-orbit" aria-hidden="true">' + Array.from({length:64},(_,i)=>{const angle=i*2.39996;const radius=170+(i%7)*13;return '<i style="--i:'+i+';--x:'+Math.round(Math.cos(angle)*radius)+'px;--y:'+Math.round(Math.sin(angle)*radius*.7)+'px;--dx:'+Math.round(Math.cos(angle)*900)+'px;--dy:'+Math.round(Math.sin(angle)*700)+'px;--r:'+Math.round(angle*180/Math.PI)+'deg;--delay:'+(i%11)*.045+'s"></i>';}).join('') + '</div><div class="secret-message"><small>有些名字，藏在花开处</small><strong aria-label="esmehan">' + [...'esmehan'].map((c,i)=>'<b aria-hidden="true" style="--i:'+i+'">'+c+'</b>').join('') + '<div class="secret-line" aria-hidden="true"></div><span>原来，你一直在这里。</span><em>花开有时，念念不忘。</em></div><button type="button" class="secret-close" aria-label="关闭彩蛋">×</button><div class="secret-exit">轻点空白处，回到此刻</div>';
    document.body.appendChild(note);
    let holdTimer, armTimer, hideTimer, armed = false, typed = '', suppressClick = false;
    function reset() {
      clearTimeout(holdTimer); clearTimeout(armTimer);
      armed = false; typed = ''; btn.removeAttribute('data-secret-step');
    }
    function closeSecret() { clearTimeout(hideTimer); note.hidden=true; reset(); suppressClick=false; }
    note.querySelector('.secret-close').addEventListener('click', closeSecret);
    note.addEventListener('click', e => { if (!e.target.closest('.secret-message')) closeSecret(); });
    document.addEventListener('keydown', e => { if(e.key==='Escape' && !note.hidden){e.preventDefault();closeSecret();} });
    function startHold() {
      if (armed) return;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        armed = true; typed = ''; suppressClick = true;
        btn.dataset.secretStep = '0';
        armTimer = setTimeout(reset, 8000);
      }, 3000);
    }
    btn.addEventListener('pointerdown', e => { if(e.button===0) startHold(); });
    btn.addEventListener('pointerup', () => clearTimeout(holdTimer));
    btn.addEventListener('pointerleave', () => clearTimeout(holdTimer));
    btn.addEventListener('pointercancel', () => { reset(); suppressClick=false; });
    btn.addEventListener('contextmenu', e => { if(armed){e.preventDefault();} });
    btn.addEventListener('keydown', e => {
      if((e.key===' ' || e.key==='Enter') && !e.repeat) { e.preventDefault(); startHold(); }
      else if(e.key===' ' || e.key==='Enter') e.preventDefault();
      if(e.key==='Escape'){reset();note.hidden=true;}
    });
    btn.addEventListener('keyup', e => { if(e.key===' '||e.key==='Enter'){e.preventDefault();clearTimeout(holdTimer);btn.click();} });
    btn.addEventListener('click', () => {
      if(suppressClick){suppressClick=false;return;}
      if(!armed){rotateWallpaperAndQuote();return;}
      // Once armed, the name must be typed; further clicks do not unlock it.
    });
    document.addEventListener('keydown', e => {
      if (!armed || e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) { if(e.key==='Escape') reset(); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      const key = e.key.toLowerCase();
      if (key !== 'esmehan'[typed.length]) { reset(); return; }
      typed += key;
      if (typed === 'esmehan') {
        reset(); note.hidden=true; void note.offsetWidth; note.hidden=false;
        clearTimeout(hideTimer); hideTimer=setTimeout(()=>{note.hidden=true;},12000);
      }
    }, true);
    document.addEventListener('pointerdown', e => {
      if(!btn.contains(e.target) && !note.contains(e.target)){note.hidden=true;reset();suppressClick=false;}
    });
    window.addEventListener('blur',()=>{reset();suppressClick=false;});
  }

  async function rotateWallpaperAndQuote() {
    const btn = document.getElementById('btn-plum');
    if (btn) { btn.classList.remove('spin'); void btn.offsetWidth; btn.classList.add('spin'); }
    petalBurst();
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
  // 12h/24h rendering for the clock (pure — smoke-tested). 24h zero-pads and carries no meridiem;
  // 12h shows h:mm plus a localized AM/PM label (上午/下午 in zh).
  function formatClock(h, m, use12h, en) {
    h = Number(h) || 0; m = Number(m) || 0;
    if (!use12h) return { hhmm: `${pad2(h)}:${pad2(m)}`, ampm: '' };
    const ampm = h < 12 ? (en ? 'AM' : '上午') : (en ? 'PM' : '下午');
    return { hhmm: `${h % 12 || 12}:${pad2(m)}`, ampm };
  }
  // Clock face font (Settings → General): applied as a class on the widget card; 'modern' is the
  // bundled Inter (no class), serif/mono switch to system font stacks — no font files are bundled.
  const CLOCK_FONTS = ['modern', 'serif', 'mono'];
  function applyClockFont() {
    const el = document.querySelector('.widget.wclock');
    if (!el) return;
    const f = CLOCK_FONTS.includes(state.settings.clockFont) ? state.settings.clockFont : 'modern';
    el.classList.toggle('clock-font-serif', f === 'serif');
    el.classList.toggle('clock-font-mono', f === 'mono');
  }
  // Optional second timezone line under the clock (Settings → General). Hidden when empty or the
  // IANA zone is invalid. Updated on the same 1-minute cadence as the clock.
  function renderTz2(now) {
    const el = document.getElementById('clock-tz2');
    if (!el) return;
    const zone = String((state.settings && state.settings.clockTz2) || '').trim();
    if (!zone) { el.hidden = true; return; }
    let fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit',
        hour12: state.settings.clock12h === true,
        timeZone: zone
      });
    } catch (_) { el.hidden = true; return; }
    const city = zone.split('/').pop().replace(/_/g, ' ');
    el.textContent = `${city} · ${fmt.format(now || new Date())}`;
    el.hidden = false;
  }
  function validTz(zone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch (_) { return false; }
  }
  function startClock() {
    const hhmmEl = document.getElementById('clock-hhmm');
    const secEl = document.getElementById('clock-sec');
    const ampmEl = document.getElementById('clock-ampm');
    const dateEl = document.getElementById('clock-date');
    const lunarEl = document.getElementById('clock-lunar');
    const greetEl = document.getElementById('clock-greet');
    let lastMinute = -1, lastHour = -1, lastDay = '';

    function tick() {
      const d = new Date();
      const hh = d.getHours();
      const mm = d.getMinutes();
      const ss = pad2(d.getSeconds());
      // Seconds display is opt-in (settings.clockSeconds): the span is hidden otherwise.
      // The 1s tick cadence is kept either way for greeting and date rollovers.
      const showSec = state.settings.clockSeconds === true;
      secEl.hidden = !showSec;
      if (showSec) secEl.textContent = ss;
      if (hh * 60 + mm !== lastMinute) {
        lastMinute = hh * 60 + mm;
        const fc = formatClock(hh, mm, state.settings.clock12h === true, isEn());
        hhmmEl.textContent = fc.hhmm;
        if (ampmEl) { ampmEl.textContent = fc.ampm; ampmEl.hidden = !fc.ampm; }
        renderTz2(); // second timezone ticks on the same minute boundary
      }
      if (hh !== lastHour) {
        lastHour = hh;
        const sep = isEn() ? ', ' : '，';
        const nm = state.settings.name ? `${sep}${state.settings.name}` : '';
        greetEl.textContent = `${greetingFor(d)}${nm}`;
      }
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}|${clockIsTop() ? 't' : 'l'}|${clockWeatherText()}`;
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        // Lifted above the search box: one compact line. Left-column card: the full date + lunar pair.
        const top = clockIsTop();
        dateEl.textContent = (top ? compactDateLine(d) : dateLine(d)) + clockWeatherText();
        if (lunarEl) lunarEl.textContent = top ? '' : lunarLine(d);
        // Runs on boot (lastDay starts empty) and again on every midnight rollover, so a tab left open
        // across days still rotates the wallpaper. Guarded internally by settings + the today marker.
        maybeAutoRotate();
        // The same midnight rollover must reach the calendar (today highlight + next-holiday line)
        // and the movie-of-the-day (a manual browse returns to the deterministic daily pick).
        maybeRollMovieToToday();
        renderCalendar();
        renderMovie();
      }
    }
    tick();
    applyClockFont();
    // The top-state CSS hides the seconds span as noise; an explicit opt-in overrides that.
    const clockWidget = secEl.closest('.widget');
    if (clockWidget) clockWidget.classList.toggle('clock-sec-on', state.settings.clockSeconds === true);
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  // ---------- Search engines ----------
  function setEngine(id) {
    const engines = allEngines();
    const e = engines.find(x => x.id === id) || engines[0];
    currentEngine = e;
    resetSuggest(); // engine switch: close the dropdown and drop the other engine's cached suggestions
    const btn = document.getElementById('engine-btn');
    btn.querySelector('.eng-name').textContent = engName(e);
    btn.querySelector('.eng-logo-wrap').innerHTML = engLogoHtml(e);
    document.getElementById('q').placeholder = t('search.placeholder_engine', { engine: engName(e) });
  }
  // The live engine list: built-ins minus user-removed ones, plus the user's own engines.
  // ENGINES itself stays the immutable built-in catalog.
  function allEngines() {
    const hidden = new Set((state.settings && state.settings.hiddenEngines) || []);
    const custom = ((state.settings && state.settings.customEngines) || [])
      .filter(e => e && e.id && e.name && typeof e.url === 'string');
    return ENGINES.filter(e => !hidden.has(e.id)).concat(custom);
  }
  // Engine logos: reuse the brand-icon library where an entry exists (Baidu, Google, GitHub,
  // bilibili, Doubao, ChatGPT); WorkBuddy ships a bundled logo (assets/engines/); the rest
  // (Bing, Sogou) get a brand-coloured letter tile — the same fallback language as the icon grid.
  const ENG_ICON_HOST = {
    baidu: 'baidu.com', google: 'google.com', github: 'github.com',
    bilibili: 'bilibili.com', doubao: 'doubao.com', openai: 'openai.com'
  };
  function engLogoHtml(e) {
    // WorkBuddy is a desktop deep link with no site icon to reuse — it ships a bundled logo.
    if (e.id === 'wbai') return '<span class="eng-logo eng-img"><img src="assets/engines/workbuddy.png" alt=""></span>';
    // Try the engine's own URL host first (works for user-added engines too, e.g. a custom
    // Perplexity entry gets the real logo), then the id→host map, then a letter tile.
    const icon = iconFor(e.url) || (ENG_ICON_HOST[e.id] ? iconFor('https://' + ENG_ICON_HOST[e.id]) : null);
    // No brand tile behind these glyphs (unlike the card grid), so single-colour marks
    // take the brand colour itself when it is bright enough, otherwise the menu's text colour.
    if (icon) return `<span class="eng-logo">${iconGlyphHtml(icon, menuGlyphColor(icon.c) || 'currentColor')}</span>`;
    return `<span class="eng-logo eng-letter" style="background:${e.color}">${escapeHtml(engName(e).trim().charAt(0))}</span>`;
  }
  function renderEngineList() {
    const ul = document.getElementById('engine-list');
    if (!ul) return;
    ul.innerHTML = allEngines().map((e, i) => {
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
        <span>${escapeHtml(engName(e))}</span>${badge}
        <span class="eng-key">${i + 1}</span>
      </li>
    `;
    }).join('');
  }

  // ---------- Engine manager (settings → general): add your own, remove built-ins ----------
  function fillEngineSelect() {
    const engineSel = document.getElementById('f-engine');
    if (engineSel) engineSel.innerHTML = allEngines().map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(engName(e))}</option>`).join('');
  }
  // Everything that shows engines re-renders; a deleted current engine falls back to the first.
  function enginesChanged() {
    const engines = allEngines();
    if (!engines.some(e => e.id === currentEngine.id)) setEngine(engines[0].id);
    else setEngine(currentEngine.id); // re-render name/logo in place
    state.settings.engine = currentEngine.id;
    Store.set(K.settings, state.settings);
    renderEngineList();
    fillEngineSelect();
    renderEngManager();
  }
  function renderEngManager() {
    const list = document.getElementById('engm-list');
    if (!list) return;
    const engines = allEngines();
    const restoreBtn = document.getElementById('engm-restore');
    if (restoreBtn) restoreBtn.hidden = !(state.settings.hiddenEngines || []).length;
    const lastOne = engines.length === 1;
    list.innerHTML = engines.map(e => `
      <div class="engm-row" data-id="${escapeHtml(e.id)}">
        ${engLogoHtml(e)}
        <span class="engm-name">${escapeHtml(engName(e))}</span>
        <span class="engm-host">${escapeHtml(e.deeplink ? t('engm.deeplink') : (hostnameOf(e.url) || '—'))}</span>
        <button type="button" class="engm-del" title="${escapeHtml(t('engm.del'))}" aria-label="${escapeHtml(t('engm.del'))}" ${lastOne ? 'disabled' : ''}>×</button>
      </div>
    `).join('');
    list.querySelectorAll('.engm-del').forEach(btn => {
      btn.addEventListener('click', () => removeEngine(btn.closest('.engm-row').dataset.id));
    });
  }
  function removeEngine(id) {
    const engines = allEngines();
    if (engines.length <= 1) return showToast(t('toast.eng_last'));
    const e = engines.find(x => x.id === id);
    if (!e) return;
    if (e.custom) {
      state.settings.customEngines = (state.settings.customEngines || []).filter(x => x.id !== id);
    } else {
      state.settings.hiddenEngines = [...(state.settings.hiddenEngines || []), id];
    }
    Store.set(K.settings, state.settings);
    enginesChanged();
    // Undo restores the exact entry — a custom engine otherwise could not be brought back.
    showToast(t('toast.eng_removed'), t('toast.undo'), () => {
      if (e.custom) state.settings.customEngines = [...(state.settings.customEngines || []), e];
      else state.settings.hiddenEngines = (state.settings.hiddenEngines || []).filter(x => x !== id);
      Store.set(K.settings, state.settings);
      enginesChanged();
    });
  }
  function addCustomEngine() {
    const nameEl = document.getElementById('engm-name');
    const urlEl = document.getElementById('engm-url');
    const name = (nameEl.value || '').trim().slice(0, 12);
    const url = (urlEl.value || '').trim();
    // The URL must be a real web search template: http(s) and carrying the {q} placeholder.
    if (!name || !/^https?:\/\//i.test(url) || !url.includes('{q}')) {
      return showToast(t('toast.eng_invalid'), null, null, 3200);
    }
    state.settings.customEngines = [...(state.settings.customEngines || []),
      { id: 'u-' + nid(), name, url, color: pickColor(hostnameOf(url) || name), custom: true }];
    nameEl.value = '';
    urlEl.value = '';
    Store.set(K.settings, state.settings);
    enginesChanged();
    showToast(t('toast.eng_added'));
  }
  function bindEngManager() {
    const addBtn = document.getElementById('engm-add');
    if (!addBtn) return;
    addBtn.addEventListener('click', addCustomEngine);
    document.getElementById('engm-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCustomEngine(); }
    });
    document.getElementById('engm-restore').addEventListener('click', () => {
      state.settings.hiddenEngines = [];
      Store.set(K.settings, state.settings);
      enginesChanged();
    });
    renderEngManager();
  }

  // ---------- Inline calculator ----------
  // A pure arithmetic evaluator (no eval(), ever): the input is only treated as a calculation
  // when it consists of nothing but digits, +−×÷ (ASCII and full-width), %, parentheses, dots
  // and whitespace, and carries at least one operator and one digit — so plain numbers ("2024")
  // and any real query fall through to a normal search. Recursive-descent: expr = term ((+|-) term)*,
  // term = factor ((*|/|%) factor)*, factor = unary, atom = number | '(' expr ')'.
  const CALC_OPS = { '＋': '+', '－': '-', '×': '*', '÷': '/', '（': '(', '）': ')', '％': '%', '．': '.', '　': ' ' };
  function normalizeCalc(raw) {
    // Full-width operators/digits collapse to ASCII so both IME styles evaluate the same.
    return String(raw).replace(/[＋－×÷（）％．　０-９]/g, (ch) =>
      CALC_OPS[ch] || String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  }
  function calcEval(raw) {
    if (typeof raw !== 'string') return null;
    const s = normalizeCalc(raw).trim();
    if (!s || s.length > 200) return null;
    if (!/^[0-9+\-*/%().\s]+$/.test(s)) return null; // strict whitelist: anything else is a query
    if (!/[+\-*/%]/.test(s) || !/\d/.test(s)) return null; // need an operator and a digit
    let i = 0;
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    const fail = () => { throw null; }; // local parse-failure signal, caught below
    function parseExpr() {
      let v = parseTerm();
      for (;;) { ws(); if (s[i] === '+') { i++; v += parseTerm(); } else if (s[i] === '-') { i++; v -= parseTerm(); } else return v; }
    }
    function parseTerm() {
      let v = parseFactor();
      for (;;) {
        ws();
        if (s[i] === '*') { i++; v *= parseFactor(); }
        else if (s[i] === '/') { i++; const d = parseFactor(); if (d === 0) fail(); v /= d; }
        else if (s[i] === '%') { i++; v %= parseFactor(); }
        else return v;
      }
    }
    function parseFactor() {
      ws();
      if (s[i] === '-') { i++; return -parseFactor(); } // unary minus binds tighter than * / %
      if (s[i] === '+') { i++; return parseFactor(); }
      return parseAtom();
    }
    function parseAtom() {
      ws();
      if (s[i] === '(') { i++; const v = parseExpr(); ws(); if (s[i] !== ')') fail(); i++; return v; }
      const m = /^(\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
      if (!m) fail();
      i += m[0].length;
      return parseFloat(m[0]);
    }
    let v;
    try { v = parseExpr(); ws(); if (i !== s.length) return null; } catch { return null; }
    if (!Number.isFinite(v)) return null; // division-by-zero already throws; this guards overflow to Infinity
    // Trim float noise (0.1+0.2 -> 0.3) and cap at 10 significant digits.
    const result = String(Number(v.toPrecision(10)));
    // Display normalises to spaced × ÷ + - operators; a parenthesised unary minus stays tight.
    const display = s.replace(/\s+/g, ' ')
      .replace(/\s*([+*/%-])\s*/g, ' $1 ')
      .replace(/\*/g, '×').replace(/\//g, '÷').replace(/\s+/g, ' ').trim()
      .replace(/\(- /g, '(-');
    return { display: `${display} = ${result}`, result };
  }

  // ---------- Search history ----------
  // Own storage key (lt.history), a plain string array read/written through localRawGet/localRawSet,
  // so it is never marked dirty for cloud sync and never joins lt.settings. Newest first, deduped,
  // capped at 10. updateHistory / histMatches are pure (smoke-tested); the rest is DOM glue.
  const HISTORY_MAX = 10;
  const HIST_MATCH_MAX = 3; // matching rows above network suggestions while typing
  let searchHistory = [];
  function updateHistory(list, q, cap) {
    const s = String(q || '').trim();
    const out = [];
    const seen = new Set();
    const add = (item) => {
      const clean = String(item).trim();
      if (!clean) return;
      const key = clean.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(clean); }
    };
    if (s) add(s);
    // Case-insensitive dedupe (search casing varies between sessions) while keeping the first
    // entry's original spelling; also cleans up duplicates / stray whitespace an older version
    // may have left behind. Non-strings (corrupt storage) never join the list.
    for (const h of list) if (typeof h === 'string') add(h);
    return out.slice(0, cap);
  }
  function histMatches(list, q, cap) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return list.slice(0, cap);
    return list.filter(h => h.toLowerCase().includes(s)).slice(0, cap);
  }
  // ---------- Local shortcut/bookmark rows (the search box doubles as a launcher) ----------
  // Every shortcut the user added or imported from bookmarks (folder children included) is matched
  // by title / URL against the typed query — fully local, no engine, no network. Rows render above
  // history and network suggestions and open on Enter / click, exactly like typing a URL.
  const SITE_MATCH_MAX = 3;
  function siteMatchRows(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return [];
    const seen = new Set();
    const out = [];
    const consider = (it) => {
      if (out.length >= SITE_MATCH_MAX || !it || !it.url) return;
      const title = String(it.title || '');
      const url = String(it.url || '');
      if (!(title.toLowerCase().includes(s) || url.toLowerCase().includes(s))) return;
      if (seen.has(url)) return;
      seen.add(url);
      out.push({ title, url });
    };
    for (const it of (state.items || [])) {
      if (isFolder(it)) (it.children || []).forEach(consider);
      else consider(it);
    }
    return out;
  }
  async function loadHistory() {
    const raw = await localRawGet(K.history);
    return updateHistory(Array.isArray(raw) ? raw : [], '', HISTORY_MAX + 10).slice(0, HISTORY_MAX);
  }
  function persistHistory() { localRawSet(K.history, searchHistory); }
  function pushHistory(q) {
    searchHistory = updateHistory(searchHistory, q, HISTORY_MAX);
    persistHistory();
  }
  function removeHistoryEntry(q) {
    searchHistory = searchHistory.filter(h => h !== q);
    persistHistory();
  }
  function clearHistory() {
    searchHistory = [];
    persistHistory();
    renderSuggest();
  }
  // ---------- Search suggestions ----------
  // fetch() against three declared host_permissions (see manifest.json): granting an origin lets the
  // extension bypass the target's missing CORS headers, so we no longer need the old <script>-injection
  // JSONP trick to reach these APIs (MV3's page CSP is script-src 'self' and cannot allow remote script
  // hosts at all, which made the old script-injection approach permanently broken under MV3). The
  // providers below still speak JSONP (a "cb" callback name in the query string), so the response body
  // is a `name(...)` wrapper rather than bare JSON; parseJsonpText() strips that wrapper without ever
  // executing it.
  const SUGGEST_DEBOUNCE_MS = 150;
  const SUGGEST_TIMEOUT_MS = 5000;
  const SUGGEST_MAX = 8;
  let suggestSeq = 0; // unique JSONP callback suffix

  // url receives the query and the generated callback name; parse normalises the payload to a
  // plain string array. Engines without an entry (Sogou, GitHub, bilibili, the AI engines and
  // user-added customs) simply never show suggestions.
  const SUGGEST = {
    baidu: {
      url: (q, cb) => 'https://suggestion.baidu.com/su?wd=' + encodeURIComponent(q) + '&cb=' + cb,
      parse: (d) => (d && Array.isArray(d.s) ? d.s : [])
    },
    google: {
      url: (q, cb) => 'https://suggestqueries.google.com/complete/search?client=chrome&q=' + encodeURIComponent(q) + '&jsonp=' + cb,
      parse: (d) => (Array.isArray(d) && Array.isArray(d[1]) ? d[1] : [])
    },
    bing: {
      // osjson.aspx answers plain JSON but without CORS headers; qsonhs.aspx is the JSONP variant
      // the Bing homepage itself uses.
      url: (q, cb) => 'https://api.bing.com/qsonhs.aspx?type=cb&cb=' + cb + '&q=' + encodeURIComponent(q),
      parse: (d) => {
        const results = d && d.AS && Array.isArray(d.AS.Results) ? d.AS.Results : [];
        return results.flatMap(r => (r && Array.isArray(r.Suggests) ? r.Suggests : []))
          .map(s => s && s.Txt).filter(Boolean);
      }
    }
  };

  // Strips a JSONP `name(...)` wrapper without ever eval-ing it (plain string slicing + JSON.parse),
  // falling back to parsing the body directly in case a provider ever answers with bare JSON.
  function parseJsonpText(text) {
    const s = String(text).trim();
    if (s.startsWith('{') || s.startsWith('[')) return JSON.parse(s);
    const start = s.indexOf('(');
    const end = s.lastIndexOf(')');
    if (start === -1 || end === -1 || end <= start) throw new Error('unexpected suggest payload');
    return JSON.parse(s.slice(start + 1, end));
  }
  // urlFn(cb) builds the final URL from the generated callback name (the providers still expect one in
  // the query string). Resolves with the parsed payload, rejects on network error, non-2xx, timeout or
  // malformed body. try/catch + AbortController guarantee the timer and controller are always cleaned up.
  async function jsonp(urlFn, timeoutMs = SUGGEST_TIMEOUT_MS) {
    const cb = '__ltSuggest_' + Date.now().toString(36) + '_' + (++suggestSeq);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(urlFn(cb), { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
      if (!res.ok) throw new Error('suggest failed: HTTP ' + res.status);
      const text = await res.text();
      return parseJsonpText(text);
    } catch (err) {
      if (err && err.name === 'AbortError') throw new Error('suggest timeout');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  let suggestItems = [];      // current network-suggestion entries
  let suggestNav = [];        // keyboard-selectable union: {kind:'site'} rows + {kind:'net'} rows
  let suggestHl = -1;         // highlighted index into suggestNav (-1 = the raw input)
  let suggestTyped = '';      // the raw input text, restored when the highlight returns to -1
  let suggestBusy = false;    // a network suggestion request is in flight (drives the loading row)
  let suggestTimer = 0;       // debounce timer
  let suggestBlurTimer = 0;   // delayed close on blur (so a row click lands first)
  let suggestFetchSeq = 0;    // stale-response guard
  const suggestCache = new Map(); // `${engineId}:${q}` -> string[] (cleared on engine switch)

  function suggestProvider() {
    // Suggestions stay on unless the user explicitly turned them off (older profiles lack the key).
    if (state.settings.suggest === false) return null;
    return SUGGEST[currentEngine.id] || null;
  }
  function suggestListEl() { return document.getElementById('suggest-list'); }
  function closeSuggest() {
    clearTimeout(suggestTimer);
    suggestFetchSeq++; // drop any in-flight response
    suggestItems = [];
    suggestNav = [];
    suggestHl = -1;
    suggestBusy = false;
    const list = suggestListEl();
    if (list) list.hidden = true;
  }
  // Engine switch: close the dropdown and drop the cache (stale entries would be from another engine).
  function resetSuggest() {
    closeSuggest();
    suggestCache.clear();
  }
  // The calc row is engine-independent local state: recompute from the live input on every render.
  function currentCalc() {
    const qEl = document.getElementById('q');
    const q = qEl ? qEl.value.trim() : '';
    return q && !looksLikeUrl(q) ? calcEval(q) : null;
  }
  // History rows for the current input: everything (newest first) when empty, substring matches while typing.
  function currentHistRows() {
    const qEl = document.getElementById('q');
    const q = qEl ? qEl.value.trim() : '';
    return q ? histMatches(searchHistory, q, HIST_MATCH_MAX) : searchHistory.slice(0, HISTORY_MAX);
  }
  // Enter (or a click) on a calc row copies the result instead of searching. The whitelist
  // guarantees there is no real query to lose: a calc expression is never also a search phrase.
  // A live AI template changes that contract: its content slot is a prompt, so Enter must fire the
  // template even when the typed content happens to look like an arithmetic expression.
  function maybeCopyCalc() {
    if (activePrompt) return false;
    const calc = currentCalc();
    if (!calc) return false;
    copyText(calc.result);
    showToast(t('toast.copied'));
    return true;
  }
  // Rebuild the keyboard-selectable union on every render: local shortcut/bookmark rows first,
  // then network rows. Returns the site rows (history rows stay click-only, as before).
  function buildSuggestNav() {
    const qEl = document.getElementById('q');
    const sites = siteMatchRows(qEl ? qEl.value : '');
    suggestNav = sites
      .map(r => ({ kind: 'site', ...r }))
      .concat(suggestItems.map(text => ({ kind: 'net', text })));
    return sites;
  }
  function siteRowHtml(site, idx, hl) {
    const p = cardIconParts(site);
    const host = hostnameOf(site.url) || '';
    const active = idx === hl;
    return `<li role="option" class="sg-site${active ? ' active' : ''}" data-n="${idx}"${active ? ' aria-selected="true"' : ''}>
      <span class="sg-site-ico" style="background:${p.bg};color:${p.ink}">${p.ico}</span>
      <span class="sg-site-title">${escapeHtml(site.title)}</span>
      <span class="sg-site-host">${escapeHtml(host)}</span>
    </li>`;
  }
  function renderSuggest() {
    const list = suggestListEl();
    if (!list) return;
    if (!document.getElementById('q').value.trim()) { list.hidden = true; return; }
    const calc = currentCalc();
    const hist = currentHistRows();
    const sites = buildSuggestNav();
    // While a network fetch is in flight the dropdown stays open with a quiet loading row —
    // otherwise a slow engine looks like nothing happened.
    const pending = suggestBusy && suggestProvider() !== null;
    if (!pending && !calc && !hist.length && !sites.length && !suggestItems.length) { list.hidden = true; return; }
    if (suggestHl > suggestNav.length - 1) suggestHl = suggestNav.length - 1;
    let html = '';
    // Top row: the inline calculator result (local rows always sit above network suggestions).
    if (calc) {
      html += `<li role="option" class="sg-calc"><span class="sg-calc-expr">${escapeHtml(calc.display)}</span><span class="sg-calc-hint">${escapeHtml(t('calc.enter_copy'))}</span></li>`;
    }
    // Local shortcut/bookmark matches: instant launch targets, above history and network rows.
    if (sites.length) {
      html += sites.map((r, i) => siteRowHtml(r, i, suggestHl)).join('');
    }
    if (hist.length) {
      html += `<li class="sg-head" role="presentation"><span>${escapeHtml(t('hist.recent'))}</span><button type="button" class="sg-clear" title="${escapeHtml(t('hist.clear'))}">${escapeHtml(t('hist.clear'))}</button></li>`;
      html += hist.map((h, i) =>
        `<li role="option" class="sg-hist" data-h="${i}"><span class="sg-hist-text">${escapeHtml(h)}</span><span class="sg-hist-del" data-del="${i}" title="${escapeHtml(t('hist.del'))}" aria-label="${escapeHtml(t('hist.del'))}">×</span></li>`
      ).join('');
    }
    html += suggestItems.map((s, i) => {
      const ni = sites.length + i;
      return `<li role="option" data-n="${ni}" class="${ni === suggestHl ? 'active' : ''}" aria-selected="${ni === suggestHl}">${escapeHtml(s)}</li>`;
    }).join('');
    if (pending) {
      html += `<li class="sg-loading" role="presentation" aria-hidden="true"><span class="sg-dot"></span><span class="sg-dot"></span><span class="sg-dot"></span></li>`;
    }
    list.innerHTML = html;
    list.setAttribute('aria-busy', pending ? 'true' : 'false');
    list.hidden = false;
  }
  function setSuggestHl(i) {
    const qEl = document.getElementById('q');
    suggestHl = i;
    // The highlight is written back into the input; -1 restores what the user actually typed.
    if (qEl) {
      const row = suggestNav[i];
      qEl.value = row
        ? (row.kind === 'site' ? row.url : row.text)
        : suggestTyped;
    }
    renderSuggest();
  }
  async function fetchSuggest(q) {
    const provider = suggestProvider();
    if (!provider) return; // local rows (calc / history) are already rendered by the input listener
    const key = currentEngine.id + ':' + q;
    const cached = suggestCache.get(key);
    if (cached) {
      suggestItems = cached.slice(0, SUGGEST_MAX);
      suggestHl = -1;
      renderSuggest();
      return;
    }
    const seq = ++suggestFetchSeq;
    suggestBusy = true;
    renderSuggest(); // open the dropdown with the loading row (other local rows stay visible)
    try {
      const raw = await jsonp((cb) => provider.url(q, cb));
      // A newer keystroke (or a close) superseded this request — discard quietly (the newer
      // request keeps suggestBusy true; the finally below only clears it for the latest one).
      if (seq !== suggestFetchSeq) return;
      const items = provider.parse(raw).filter(s => typeof s === 'string' && s.trim()).slice(0, SUGGEST_MAX);
      suggestCache.set(key, items);
      if ((document.getElementById('q')?.value || '').trim() !== q) return; // input moved on meanwhile
      suggestItems = items;
      suggestHl = -1;
      renderSuggest(); // empty items only drop the network rows; calc / history rows stay up
    } catch {
      // Timeouts, blocked networks and engines that never call back all end here: just stay silent.
    } finally {
      if (seq === suggestFetchSeq) { suggestBusy = false; renderSuggest(); }
    }
  }
  // F2 / Shift+F2 in the search box cycles the engine instead of moving focus.
  function cycleEngine(dir) {
    const engines = allEngines();
    if (engines.length < 2) return;
    const idx = Math.max(0, engines.findIndex(e => e.id === currentEngine.id));
    const next = engines[(idx + dir + engines.length) % engines.length];
    setEngine(next.id); // also resets the dropdown + drops the old engine's cached suggestions
    state.settings.engine = next.id;
    Store.set(K.settings, state.settings);
    renderEngineList();
    // Quiet cue: a brief highlight flash on the engine button (no toast).
    const btn = document.getElementById('engine-btn');
    if (btn) { btn.classList.remove('eng-flash'); void btn.offsetWidth; btn.classList.add('eng-flash'); }
    // Local rows (calc / history) come back instantly; network suggestions refetch for the new engine.
    renderSuggest();
    const qEl = document.getElementById('q');
    const q = qEl ? qEl.value.trim() : '';
    if (q && !looksLikeUrl(q)) fetchSuggest(q);
  }
  function bindSuggest() {
    const qEl = document.getElementById('q');
    const list = suggestListEl();
    if (!qEl || !list) return;
    qEl.addEventListener('input', () => {
      clearTimeout(suggestTimer);
      const q = qEl.value.trim();
      // Typing in the box means the first-run "search here" tip did its job; it is anchored
      // exactly where the dropdown floats, so dismiss it before the dropdown can slide under it.
      if (q) dismissOnboarding();
      suggestTyped = qEl.value;
      suggestHl = -1;
      // Empty input: keep the dropdown closed. URLs never suggest (and can never be calc expressions).
      if (!q) { closeSuggest(); return; }
      if (looksLikeUrl(q)) { closeSuggest(); return; }
      renderSuggest(); // calc row + history matches render instantly, network rows join when they land
      suggestTimer = setTimeout(() => fetchSuggest(q), SUGGEST_DEBOUNCE_MS);
    });
    qEl.addEventListener('keydown', (e) => {
      // F2 / Shift+F2: cycle engines, only while the search input itself is focused.
      if (e.key === 'F2' && document.activeElement === qEl) {
        e.preventDefault();
        cycleEngine(e.shiftKey ? -1 : 1);
        return;
      }
      if (list.hidden) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        // Range is -1..nav-1: -1 is the raw input row.
        const next = suggestHl + step;
        setSuggestHl(next < -1 ? suggestNav.length - 1 : next >= suggestNav.length ? -1 : next);
      } else if (e.key === 'Enter') {
        const row = suggestNav[suggestHl];
        if (suggestHl >= 0 && row) {
          // A highlighted row wins over the plain search; the form submit never fires (preventDefault).
          // Grab the row before closeSuggest() empties the list.
          e.preventDefault();
          closeSuggest();
          // A shortcut/bookmark row opens like a typed URL — or feeds its title to a live template.
          const picked = row.kind === 'site' ? (activePrompt ? row.title : row.url) : row.text;
          qEl.value = picked;
          submitSearch(picked, e);
        } else if (maybeCopyCalc()) {
          e.preventDefault(); // a calc row is showing: Enter copies the result instead of searching
        }
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeSuggest();
      }
    });
    // Close shortly after blur: the delay lets a row mousedown land before the dropdown disappears.
    qEl.addEventListener('blur', () => {
      clearTimeout(suggestBlurTimer);
      suggestBlurTimer = setTimeout(closeSuggest, 150);
    });
    qEl.addEventListener('focus', () => {
      clearTimeout(suggestBlurTimer);
      // Focusing an empty input must not expose history.
      if (!qEl.value.trim()) closeSuggest();
    });
    // mousedown (not click): it fires before the input blurs, so the row is still there to be hit.
    list.addEventListener('mousedown', (e) => {
      const del = e.target.closest('.sg-hist-del');
      if (del) {
        e.preventDefault();
        const h = currentHistRows()[+del.dataset.del];
        if (h) { removeHistoryEntry(h); renderSuggest(); }
        return;
      }
      if (e.target.closest('.sg-clear')) {
        e.preventDefault();
        clearHistory();
        return;
      }
      if (e.target.closest('.sg-calc')) {
        e.preventDefault();
        maybeCopyCalc();
        return;
      }
      const hli = e.target.closest('li[data-h]');
      if (hli) {
        e.preventDefault();
        const h = currentHistRows()[+hli.dataset.h];
        if (h) { qEl.value = h; closeSuggest(); submitSearch(h, e); }
        return;
      }
      const li = e.target.closest('li[data-n]');
      if (!li) return;
      e.preventDefault();
      const row = suggestNav[+li.dataset.n];
      closeSuggest();
      if (row) {
        const picked = row.kind === 'site' ? (activePrompt ? row.title : row.url) : row.text;
        qEl.value = picked;
        submitSearch(picked, e);
      }
    });
    // No suggestions on boot until the user enters a query.
  }
  // Open the result page: navigate in the current tab by default (no stray blank tabs); hold Cmd/Ctrl for a new tab.
  function openResult(url, ev) {
    if (ev && (ev.metaKey || ev.ctrlKey)) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.href = url;
    }
  }
  // Unique saved-site match: the typed text exactly equals one shortcut's title or URL (folders'
  // children included). Lets plain Enter act like a launcher for exact names; ambiguous matches
  // (or several sites sharing the name) fall through to a normal search.
  function exactSiteHit(q) {
    const s = String(q || '').trim().toLowerCase();
    if (!s) return null;
    const norm = (u) => { try { const n = normalizeUrl(u); return n || u; } catch { return u; } };
    const hits = new Set();
    const consider = (it) => {
      if (!it || !it.url) return;
      const full = norm(it.url);
      const u = full.toLowerCase();
      const bare = u.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const title = String(it.title || '').trim().toLowerCase();
      if (title === s || u === s || bare === s) hits.add(full);
    };
    for (const it of (state.items || [])) { if (isFolder(it)) (it.children || []).forEach(consider); else consider(it); }
    return hits.size === 1 ? [...hits][0] : null;
  }
  let launchFeedbackTimer;
  function launchFeedback() {
    const panel = document.getElementById('ai-launcher');
    const bar = panel && !panel.hidden ? panel : document.getElementById('search');
    if (!bar) return;
    clearTimeout(launchFeedbackTimer);
    bar.classList.remove('is-launching');
    void bar.offsetWidth;
    bar.classList.add('is-launching');
    launchFeedbackTimer = setTimeout(() => bar.classList.remove('is-launching'), 600);
  }

  let launcherTargets = ['doubao'];
  try { const saved=JSON.parse(localStorage.getItem('lt.ai.targets')); if(Array.isArray(saved))launcherTargets=saved.filter(id=>ENGINES.some(e=>e.ai&&e.id===id)); } catch (_) {}
  let launcherAutoSend = true;
  try { launcherAutoSend = localStorage.getItem('lt.ai.autoSend') !== 'false'; } catch (_) {}
  let launchBusy = false, lastLaunchAt = 0;
  let deliveryListener=null;
  let rememberTasks=false,recentTasks=[];
  try{rememberTasks=localStorage.getItem('lt.ai.remember')==='true';const saved=JSON.parse(localStorage.getItem('lt.ai.recent'));if(rememberTasks&&Array.isArray(saved))recentTasks=saved.filter(x=>typeof x==='string').slice(0,10);}catch(_){}
  let launcherTemplate = null;
  let launcherDraft = '';
  function applyAiButtonPosition() {
    const button=document.getElementById('ai-side-toggle'),pos=state.settings.aiButtonPosition;
    if(!button||button.hidden||!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.y))return;
    button.style.left=Math.max(8,Math.min(pos.x,innerWidth-button.offsetWidth-8))+'px';
    button.style.top=Math.max(8,Math.min(pos.y,innerHeight-button.offsetHeight-8))+'px';
    button.style.right='auto';
  }
  function bindAiButtonDrag() {
    const button=document.getElementById('ai-side-toggle');
    if(!button||button.dataset.dragBound)return;
    button.dataset.dragBound='true';
    let gesture=null,suppressClick=false;
    button.addEventListener('click',e=>{
      if(suppressClick&&e.detail!==0){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}
    },true);
    button.addEventListener('pointerdown',e=>{
      if(e.button!==0||!e.isPrimary)return;
      suppressClick=false;
      const rect=button.getBoundingClientRect();
      gesture={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top,moved:false};
      button.setPointerCapture(e.pointerId);
    });
    button.addEventListener('pointermove',e=>{
      if(!gesture||e.pointerId!==gesture.id)return;
      const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      if(!gesture.moved&&Math.hypot(dx,dy)<5)return;
      gesture.moved=true;button.classList.add('dragging');
      button.style.left=Math.max(8,Math.min(gesture.left+dx,innerWidth-button.offsetWidth-8))+'px';
      button.style.top=Math.max(8,Math.min(gesture.top+dy,innerHeight-button.offsetHeight-8))+'px';
      button.style.right='auto';
    });
    const finish=e=>{
      if(!gesture||e.pointerId!==gesture.id)return;
      const moved=gesture.moved;gesture=null;button.classList.remove('dragging');
      if(button.hasPointerCapture(e.pointerId))button.releasePointerCapture(e.pointerId);
      if(moved){suppressClick=true;const rect=button.getBoundingClientRect();state.settings.aiButtonPosition={x:rect.left,y:rect.top};Store.set(K.settings,state.settings);}
    };
    button.addEventListener('pointerup',finish);
    button.addEventListener('pointercancel',finish);
  }
  function applyAiPosition() {
    const panel=document.getElementById('ai-launcher');
    const pos=state.settings.aiPanelPosition;
    if (!panel || panel.hidden || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    panel.style.left=Math.max(8,Math.min(pos.x,innerWidth-panel.offsetWidth-8))+'px';
    panel.style.top=Math.max(8,Math.min(pos.y,innerHeight-panel.offsetHeight-8))+'px';
    panel.style.right='auto';
  }
  function bindAiDrag(root) {
    const head=root.querySelector('.launch-heading');
    head.onpointerdown=e=>{
      if(e.button!==0 || e.target.closest('button'))return;
      const rect=root.getBoundingClientRect(),sx=e.clientX,sy=e.clientY;
      head.setPointerCapture(e.pointerId);
      head.onpointermove=ev=>{
        const x=Math.max(8,Math.min(rect.left+ev.clientX-sx,innerWidth-root.offsetWidth-8));
        const y=Math.max(8,Math.min(rect.top+ev.clientY-sy,innerHeight-root.offsetHeight-8));
        root.style.left=x+'px';root.style.top=y+'px';root.style.right='auto';
      };
      const end=()=>{
        head.onpointermove=null;head.onpointerup=null;head.onpointercancel=null;
        const r=root.getBoundingClientRect();state.settings.aiPanelPosition={x:r.left,y:r.top};
        Store.set(K.settings,state.settings);
      };
      head.onpointerup=end;head.onpointercancel=end;
    };
  }
  function renderLauncher() {
    const root=document.getElementById('ai-launcher');
    if(!root)return;
    const enabled=state.settings.aiEnabled !== false;
    document.getElementById('ai-side-toggle').hidden=!enabled;
    bindAiButtonDrag();applyAiButtonPosition();
    if(!enabled)root.hidden=true;
    const previousResults=root.querySelector('#ai-launch-results');
    const en=isEn();
    const names={'Translate to English':'翻译成英文','Translate to Chinese':'翻译成中文','Polish writing':'润色','Explain code':'解释代码','Weekly report':'周报','Summarize':'总结'};
    root.innerHTML=`<div class="launch-heading"><strong>${en?'AI assistant':'AI 助手'}</strong><button data-close-ai aria-label="${en?'Close':'关闭'}">×</button></div>
      <textarea id="ai-draft" aria-label="${en?'Task':'任务内容'}" placeholder="${en?'Ask a question or paste content…':'输入问题或粘贴内容…'}"></textarea>
      <div class="launch-presets"><button data-preset="writing">${en?'Writing':'写作'}</button><button data-preset="coding">${en?'Coding':'编程'}</button><button data-preset="research">${en?'Research':'研究'}</button></div>
      <div class="launch-options">${ENGINES.filter(e=>e.ai).map(e=>`<button data-target="${e.id}" aria-pressed="${launcherTargets.includes(e.id)}">${escapeHtml(engName(e))}<small>${e.copyOnly?(en?'Manual paste':'手动粘贴'):e.deeplink?(en?'Desktop':'桌面启动'):(en?'Extension auto-send':'扩展内自动发送')}</small></button>`).join('')}</div>
      <label class="launch-template-label">${en?'Template':'模板'}<select id="ai-template"><option value="">${en?'Direct question':'直接提问'}</option>${state.prompts.slice().sort((a,b)=>Number(!!b.favorite)-Number(!!a.favorite)).map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(en?p.name:names[p.name]||p.name)}</option>`).join('')}</select></label>
      <label class="launch-hint"><input type="checkbox" id="ai-auto-send" ${launcherAutoSend?'checked':''}> ${en?'Send automatically (supported targets)':'自动发送（支持的目标）'}</label>
      <details class="launch-history"><summary>${en?'Recent tasks':'最近任务'}</summary><label><input id="ai-remember" type="checkbox" ${rememberTasks?'checked':''}> ${en?'Save on this device':'仅在本机保存'}</label><div id="ai-recent-list"></div><button id="ai-clear-recent">${en?'Clear':'清空'}</button></details>
      <details class="launch-preview"><summary>${en?'Preview prompt':'预览完整提示词'}</summary><pre id="ai-prompt-preview"></pre></details>
      <button id="ai-send">${en?'Launch':'发射'} ↗</button><p class="launch-hint">${en?'Multiple targets · Ctrl / ⌘ + Enter to launch':'支持多选目标 · Ctrl / ⌘ + Enter 发射'}</p>`;
    if(previousResults)root.append(previousResults);
    bindAiDrag(root);
    applyAiPosition();
    const input=root.querySelector('#ai-draft');input.value=launcherDraft;
    function updatePreview(){root.querySelector('#ai-prompt-preview').textContent=(launcherTemplate?.tmpl||'{q}').replace(/\{q\}/g,()=>input.value);}
    input.oninput=()=>{launcherDraft=input.value;updatePreview();};
    root.querySelector('#ai-auto-send').onchange=e=>{launcherAutoSend=e.target.checked;try{localStorage.setItem('lt.ai.autoSend',String(launcherAutoSend));}catch(_){}};
    const recentList=root.querySelector('#ai-recent-list');
    for(const text of recentTasks){const b=document.createElement('button');b.textContent=text.slice(0,50);b.onclick=()=>{launcherDraft=text;input.value=text;updatePreview();input.focus();};recentList.append(b);}
    root.querySelector('#ai-remember').onchange=e=>{rememberTasks=e.target.checked;if(!rememberTasks)recentTasks=[];try{localStorage.setItem('lt.ai.remember',String(rememberTasks));if(!rememberTasks)localStorage.removeItem('lt.ai.recent');}catch(_){}renderLauncher();};
    root.querySelector('#ai-clear-recent').onclick=()=>{recentTasks=[];try{localStorage.removeItem('lt.ai.recent');}catch(_){}renderLauncher();};
    updatePreview();
    const select=root.querySelector('#ai-template');select.value=launcherTemplate?.id||'';select.onchange=()=>{launcherTemplate=state.prompts.find(p=>p.id===select.value)||null;updatePreview();};
    function send(e){if(launchBusy || Date.now()-lastLaunchAt<1200)return;const text=input.value.trim();if(!launcherTargets.length)return showToast(en?'Choose an AI':'请先选择 AI');if(!text&&(!launcherTemplate||launcherTemplate.tmpl.includes('{q}')))return showToast(en?'Enter content':'请先输入内容');launchPrompt({...launcherTemplate,tmpl:launcherTemplate?.tmpl||'{q}',targets:launcherTargets,autoSend:launcherAutoSend},text,e);}
    input.onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send(e);}};
    root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-close-ai')){root.hidden=true;document.getElementById('ai-side-toggle').setAttribute('aria-expanded','false');document.getElementById('ai-side-toggle').focus();return;}if(b.dataset.preset){launcherTargets=({writing:['doubao','openai'],coding:['openai','deepseek'],research:['doubao','openai','deepseek']})[b.dataset.preset];try{localStorage.setItem('lt.ai.targets',JSON.stringify(launcherTargets));}catch(_){}renderLauncher();return;}if(b.dataset.target){const id=b.dataset.target;launcherTargets=launcherTargets.includes(id)?launcherTargets.filter(x=>x!==id):[...launcherTargets,id];try{localStorage.setItem('lt.ai.targets',JSON.stringify(launcherTargets));}catch(_){}renderLauncher();return;}if(b.id==='ai-send')send(e);};
    const toggle=document.getElementById('ai-side-toggle');toggle.onclick=()=>{root.hidden=!root.hidden;toggle.setAttribute('aria-expanded',String(!root.hidden));if(!root.hidden){renderLauncher();root.querySelector('textarea').focus();}};
    root.onkeydown=e=>{if(e.key==='Escape'){root.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus();}};
  }

  function templateKeys(pattern){return [...new Set([...String(pattern||'').matchAll(/\{([\p{L}\p{N}_-]{1,24})\}/gu)].map(x=>x[1]).filter(x=>x!=='q'))];}
  function withTemplateFields(template,done,content){
    const keys=templateKeys(template?.tmpl);if(!keys.length)return done(template);
    const dialog=document.createElement('dialog');dialog.className='manual-copy-dialog';
    const form=document.createElement('form');const title=document.createElement('h3');title.textContent=isEn()?'Complete template fields':'补充模板内容';form.append(title);
    const fields=[];for(const key of keys){const label=document.createElement('label');label.style.display='block';label.textContent=key;const input=document.createElement('input');input.required=true;input.maxLength=4000;input.style.cssText='display:block;width:100%;box-sizing:border-box;margin:8px 0 16px';label.append(input);form.append(label);fields.push(input);}
    const preview=document.createElement('pre');preview.style.cssText='white-space:pre-wrap;overflow:auto;max-height:160px';const update=()=>{const values=Object.fromEntries(keys.map((k,i)=>[k,fields[i].value]));preview.textContent=template.tmpl.replace(/\{([\p{L}\p{N}_-]{1,24})\}/gu,(all,key)=>key==='q'?(content||''):(values[key]??all));};fields.forEach(input=>input.oninput=update);update();form.append(preview);
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent=isEn()?'Cancel':'取消';cancel.onclick=()=>dialog.close();
    const submit=document.createElement('button');submit.textContent=isEn()?'Continue':'继续';form.append(cancel,submit);dialog.append(form);document.body.append(dialog);
    form.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(keys.map((k,i)=>[k,fields[i].value]));dialog.close();done({...template,fieldValues:values});};dialog.onclose=()=>dialog.remove();dialog.showModal();fields[0].focus();
  }
  function submitSearch(rawQuery, ev, resolvedTemplate) {
    closeSuggest();
    let q = (rawQuery || '').trim();
    const template = resolvedTemplate || activePrompt;
    if(!resolvedTemplate&&templateKeys(template?.tmpl).length)return withTemplateFields(template,p=>submitSearch(rawQuery,ev,p),rawQuery);
    if (template) {
      const pattern = String(template.tmpl || '');
      if (pattern.includes('{q}') && !q) { showToast(t('ai.enter')); document.getElementById('q').focus(); return; }
      q = pattern.replace(/\{([\p{L}\p{N}_-]{1,24})\}/gu,(all,key)=>key==='q'?q:(template.fieldValues?.[key]??all));
    }
    if (!q) return;
    // Launcher behaviour on a web engine: an exact, unique site name opens the site directly
    // (URL jumps excluded from history, exactly like typing a URL).
    if (!template && !currentEngine.ai && !looksLikeUrl(q)) {
      const direct = exactSiteHit(q);
      if (direct) { openResult(direct, ev); return; }
    }
    // Record the submission in the search history (URL jumps excluded — those are navigations, not searches).
    if (!looksLikeUrl(q)) pushHistory(q);

    // AI engines: WorkBuddy opens via deep link with a pre-filled draft; Doubao / ChatGPT auto-send through the nonce channel.
    if (currentEngine.ai) {
      if (!currentEngine.injected) launchFeedback();
      if (currentEngine.deeplink) {
        window.open(deepLinkUrl(currentEngine, q, null), '_blank');
        showToast(t('ai.wb_launched'), null, null, 3600);
        return;
      }
      if (currentEngine.injected) {
        launchPrompt(null, q, ev); // single engine: keep the same-tab navigation semantics
        return;
      }
      if (currentEngine.copyOnly) openResult(currentEngine.url, {ctrlKey: true});
      if (!currentEngine.copyOnly) {
        const u = currentEngine.url.replace('{q}', encodeURIComponent(q));
        if (u && u !== currentEngine.url) openResult(u, ev);
      }
      copyToClipboard(q);
      return;
    }

    if (!template && looksLikeUrl(q)) {
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
  // A pointer lt.pending.current (TTL 90s) accompanies every nonce: some targets
  // (doubao.com -> dola.com) redirect and STRIP the query string, and the pointer is the only
  // way the content script can still find the nonce afterwards.
  const POINTER_KEY = PENDING_PREFIX + 'current';
  const POINTER_TTL = 90000; // redirect chains (the doubao region gate) can sit on a page for 20s+
  function sweepPending() {
    const now = Date.now();
    const drop = [];
    // raw may already be an object (chrome.storage deserializes for us) or a JSON string (localStorage).
    const collect = (pairs) => {
      for (const [k, raw] of pairs) {
        try {
          const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
          // The pointer carries { k, t } instead of { p, t } and lives on a much shorter leash.
          if (k === POINTER_KEY) {
            if (!rec || typeof rec.k !== 'string' || (now - (rec.t || 0)) > POINTER_TTL) drop.push(k);
            continue;
          }
          if (!rec || typeof rec.p !== 'string' || (now - (rec.t || 0)) > PENDING_TTL) drop.push(k);
        } catch (_) { drop.push(k); } // structurally corrupted leftovers get swept too
      }
    };
    if (hasChromeStorage) {
      chrome.storage.local.get(null).then(all => {
        const pairs = Object.entries(all).filter(([k]) => k.startsWith(PENDING_PREFIX));
        for(const [k,v] of Object.entries(all)){if((k.startsWith('lt.delivery.')||k.startsWith('lt.selection.'))&&(!v?.t||now-v.t>PENDING_TTL))drop.push(k);}
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
  async function putPending(promptText, autoSend = true, targets = []) {
    const nonce = 'n_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
    try {
      if (hasChromeStorage) await chrome.storage.local.set({
        [PENDING_PREFIX + nonce]: { p: promptText, t: Date.now(), autoSend, targets },
        ...(targets.includes('doubao')?{[POINTER_KEY]: { k: nonce, t: Date.now() }}:{}) // redirect fallback, one-shot
      });
      else localStorage.setItem(PENDING_PREFIX + nonce, JSON.stringify({ p: promptText, t: Date.now(), autoSend }));
      return nonce;
    } catch (err) {
      console.warn('[LightTab] pending storage unavailable; manual paste required');
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
    const cap = Array.from(String(text || '')).slice(0,7500).join('');
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
      text = tmpl.replace(/\{([\p{L}\p{N}_-]{1,24})\}/gu,(all,key)=>key==='q'?(content||''):(tpl.fieldValues?.[key]??all));
    } else {
      text = content || '';
    }
    if(tpl&&!tpl.fieldsResolved&&templateKeys(tpl.tmpl).length)return withTemplateFields(tpl,p=>launchPrompt({...p,fieldsResolved:true},content,ev),content);
    if (!text.trim()) return showToast(t('ai.empty'), null, null, 2600);
    let targetIds = tpl ? (tpl.targets || []) : [currentEngine.id];
    // Only AI engines can receive a prompt (injected chat or deep link); a plain search engine
    // would get a malformed URL with a literal "{q}".
    targetIds = [...new Set(targetIds)].filter(id => allEngines().some(x => x.id === id && x.ai));
    if (!targetIds.length) {
      // A template with no targets configured falls back to the current engine (AI engines only);
      // a template whose targets are all invalid/removed gets the explicit no-target toast.
      if (tpl && !(tpl.targets || []).length && currentEngine.ai) targetIds = [currentEngine.id];
      if (!targetIds.length) return showToast(t('ai.no_target'));
    }
    if (launchBusy || Date.now()-lastLaunchAt<1200) return;
    launchBusy=true; lastLaunchAt=Date.now();
    if(rememberTasks){recentTasks=[text,...recentTasks.filter(x=>x!==text)].slice(0,10);try{localStorage.setItem('lt.ai.recent',JSON.stringify(recentTasks));}catch(_){}}
    try {
    launchFeedback();
    const engs = targetIds.map(id => allEngines().find(x => x.id === id)).filter(Boolean);
    const deeplinks = engs.filter(x => x.deeplink);
    const webs = engs.filter(x => !x.deeplink);
    const desktopTruncated=deeplinks.length&&Array.from(text).length>7500;
    if(desktopTruncated)copyToClipboard(text);
    if (!hasChromeStorage || webs.some(x=>x.copyOnly)) copyToClipboard(text);
    let dlN = 0, webN = 0, blocked = false;
    const failedTargets=[];
    for (const e of deeplinks) { try { window.open(deepLinkUrl(e, text, tpl && tpl.wb), '_blank'); dlN++; } catch (_) {} }
    // Preview windows must be reserved during the click, before any storage await.
    const useTabs = !!(hasChromeStorage && window.chrome?.tabs?.create);
    const reserved = !useTabs ? webs.map(() => {
      try { const w=window.open('about:blank','_blank'); if(w)w.opener=null; return w; } catch (_) { return null; }
    }) : [];
    const nonce = hasChromeStorage && webs.some(x=>x.injected) ? await putPending(text, tpl?.autoSend !== false, targetIds) : null;
    if (hasChromeStorage && webs.some(x=>x.injected) && !nonce) copyToClipboard(text);
    let results = document.getElementById('ai-launch-results');
    if (!results) { results=document.createElement('div'); results.id='ai-launch-results'; document.getElementById('ai-launcher').appendChild(results); }
    if(deliveryListener&&window.chrome?.storage?.onChanged){chrome.storage.onChanged.removeListener(deliveryListener);deliveryListener=null;}
    results.replaceChildren();
    for(const engine of deeplinks){const row=document.createElement('div');row.textContent=engName(engine)+(isEn()?' · Desktop launch requested; confirm in the app':' · 已请求桌面启动，请在应用中确认');if(desktopTruncated)row.append(document.createTextNode(isEn()?' · First 7,500 characters only; copy full prompt below':' · 仅带入前 7500 字符，可用下方按钮复制全文'));results.append(row);}
    const copy=document.createElement('button'); copy.textContent=isEn()?'Copy full prompt':'复制完整提示词';
    copy.onclick=()=>copyToClipboard(text); results.append(copy);

    for (let i=0;i<webs.length;i++) {
      const e=webs[i];
      const u=e.injected && nonce ? injectedUrl(e,text,nonce) : e.url;
      let opened=false;
      if(useTabs){try{await chrome.tabs.create({url:u,active:false});opened=true;}catch(_){}}
      else if(reserved[i]){try{reserved[i].location.replace(u);opened=true;}catch(_){}}
      if(opened)webN++;else {blocked=true;failedTargets.push(e.id);}
      const row=document.createElement('div');
      const link=document.createElement('a');link.href=u;link.target='_blank';link.rel='noopener';link.textContent=engName(e)+' ↗';
      row.append(link,document.createTextNode(opened?(isEn()?' · Opened':' · 已打开'):(isEn()?' · Blocked — click to open':' · 未打开，点击重试')));
      if(e.copyOnly||!hasChromeStorage||(e.injected&&!nonce))row.append(document.createTextNode(isEn()?' · Manual paste required':' · 需手动粘贴提示词'));
      const status=document.createElement('span');row.append(status);row.dataset.targetId=e.id;
      if(nonce&&e.injected){status.dataset.deliveryKey='lt.delivery.'+nonce+'.'+e.id;status.textContent=isEn()?' · Waiting for target':' · 等待目标页面处理';}
      results.append(row);
    }
    if(failedTargets.length){const retry=document.createElement('button');retry.textContent=isEn()?'Retry unopened targets':'重试未打开的目标';retry.onclick=ev=>launchPrompt({...tpl,tmpl:'{q}',targets:failedTargets},text,ev);results.append(retry);}
    if(nonce&&window.chrome?.storage?.onChanged){deliveryListener=(changes)=>{for(const el of results.querySelectorAll('[data-delivery-key]')){const rec=changes[el.dataset.deliveryKey]?.newValue;if(!rec)continue;const labels=isEn()?{filled:'Filled',sent:'Input submitted',manual:'Manual action required'}:{filled:'已填入',sent:'输入已提交',manual:'需手动处理'};el.textContent=' · '+(labels[rec.status]||'');}};chrome.storage.onChanged.addListener(deliveryListener);}
    const panel=document.getElementById('ai-launcher');
    if(blocked && panel){panel.hidden=false;document.getElementById('ai-side-toggle')?.setAttribute('aria-expanded','true');}
    if (!webN && !dlN) return showToast(t('ai.fail'));
    const names = engs.map(x => engName(x)).join(' · ');
    if (webN && !hasChromeStorage) {
      // Preview mode (file:// / single-file dist): no content script exists out there, so the
      // target page would open with nothing to fill it. Copy the prompt and say so instead.
      showToast(isEn()?'Targets opened; paste the prompt manually':'已打开目标网站，请手动粘贴提示词',null,null,4200);
    }
    else if (webN && dlN) showToast(t('ai.wb_multi', { n: webN }));
    else if (dlN) showToast(t('ai.wb_launched'), null, null, 3600);
    else showToast(t('ai.launched', { n: webN, names }), null, null, blocked ? 4200 : 2600);
    if (blocked) setTimeout(() => showToast(t('ai.blocked'), null, null, 3200), blocked ? 2600 : 0);
    // The deep link already fired synchronously inside the gesture (never gate that on a network
    // round-trip). Confirm out-of-band: if the probe still cannot see WorkBuddy a moment later the
    // link most likely went nowhere - say so instead of leaving a false "launched".
    if (dlN) verifyWorkBuddyLaunch();
    if (tpl) { const saved=state.prompts.find(p=>p.id===tpl.id);if(saved)saved.lastUsedAt=Date.now();window.LT_PROMPTS.savePrompts(); }
    sweepPending();
    window.LT_PROMPTS.clearActiveTemplate();
    } finally { launchBusy=false; }
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
    const movieTile = grid.querySelector('.wmovie');
    if (movieTile) movieTile.remove();
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
    if (movieTile) grid.prepend(movieTile);
    bindCardEvents();
    grid.querySelector('.card-add').addEventListener('click', () => openSiteModal(null));
    // Canvas mode: right after rendering, apply (col, row) to the cards and assign coordinates to any new ones.
    const C = window.LT_CANVAS;
    C.applyCardCanvas();
    requestAnimationFrame(() => C.applyCardCanvas());
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
  //   3. { tx, c, f }        wordmark tile — some brands (51CTO, Xiaoe Tech, iLearning…) *are* set type;
  //                          drawing them as text is more faithful than a hand-traced silhouette
  // ICONDB is static, authored data — never user input — so the markup below is not sanitised.
  function iconGlyphHtml(icon, glyphColor) {
    // Raster entries (rare: brands like 小鹅通 ship only a raster mark; the data-URI is bundled,
    // so this is still zero-network). Sized by the .logo-img / .eng-logo img / .icon-preview rules.
    if (icon.img) {
      return `<img class="logo-img" src="${icon.img}" alt="" draggable="false">`;
    }
    if (icon.p) {
      const paths = icon.p.map((s) => `<path fill="${s.f}" d="${s.d}"/>`).join('');
      return `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
    }
    if (icon.tx) {
      // Shrink the type as the wordmark gets longer so 51CTO and CJK wordmarks both fit the same tile.
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
  // The icon well of a card: user-uploaded image > brand icon > brand-coloured letter tile.
  // Shared by the main grid (cardHtml), folder tiles (the 2x2 mini grid) and the folder popup.
  function cardIconParts(it) {
    const host = hostnameOf(it.url) || it.title;
    const icon = iconFor(it.url);
    const customIcon = sanitizeIconDataUrl(it.icon);
    let bg, ink, ico, customCls = '';
    if (customIcon) {
      // User-uploaded image wins over the brand icon. The tile background defaults to a CSS-picked
      // neutral (theme-aware) so uploaded logos — usually white-bg corporate marks or transparent
      // marks — read as the visual focus instead of competing with a saturated host colour. Users
      // can still set it.color (e.g. via import) for an explicit coloured frame.
      customCls = 'has-custom-icon';
      bg = safeColor(it.color);
      ico = `<img class="logo-img" src="${customIcon}" alt="" draggable="false">`;
    } else if (icon) {
      if (icon.img) {
        // Raster brand mark (bundled data-URI): full-bleed tile in the brand colour, same visual
        // language as the vector glyphs (the PNG ships its own rounded-square artwork).
        bg = safeColor(icon.c) || '#1f2937';
        // Standalone vector marks need breathing room; app artwork already includes its own inset.
        if (icon.img.startsWith('data:image/svg+xml')) customCls = 'brand-vector-mark';
        ico = `<img class="logo-img" src="${icon.img}" alt="" draggable="false">`;
      } else {
        bg = icon.c;
        ico = iconGlyphHtml(icon);
      }
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
    return { bg, ink, ico, customCls };
  }

  // ---------- Shortcut folders (iOS style, schema v5) ----------
  // A folder is an item in state.items: { id, type:'folder', name, group, children: [shortcut...] }.
  // Children are plain shortcut objects nested inside the folder (the group lives on the folder);
  // existing plain shortcut items carry no `type` and load unchanged.
  function isFolder(it) { return !!it && it.type === 'folder'; }
  // The folder that groups two shortcuts: it takes the drop target's slot and group, dragged one last.
  function makeFolder(a, b, name) {
    const strip = (c) => { const k = { ...c }; delete k.group; return k; };
    return { id: nid(), type: 'folder', name: name || '', group: b.group || '', children: [strip(b), strip(a)] };
  }
  // Suggested folder name from the two merged shortcuts ("GitHub、Gmail"), capped to the rename
  // input's 32-char budget; falls back to the generic label when nothing readable is available.
  function defaultFolderName(a, b) {
    const join = isEn() ? ', ' : '、';
    const t1 = String((a && a.title) || '').trim();
    const t2 = String((b && b.title) || '').trim();
    const pick = (s) => [...s].slice(0, 9).join('');
    const name = t1 || t2 ? `${pick(t2 || t1)}${join}${pick(t1 || t2)}` : '';
    const trimmed = name ? [...name].slice(0, 30).join('').trim() : '';
    return trimmed || t('folder.default_name');
  }
  // Drop srcId onto targetId: shortcut+shortcut -> a new folder at the target's slot; anything ->
  // folder -> src (or its kids) joins the target folder; folder -> shortcut -> null (folders cannot
  // be nested, so that drop stays a plain reorder). Returns a new items array, or null when the
  // drop is not a folder operation.
  function folderMergeItems(items, srcId, targetId, defName) {
    if (srcId === targetId) return null;
    const srcIdx = items.findIndex(x => x.id === srcId);
    const tgtIdx0 = items.findIndex(x => x.id === targetId);
    if (srcIdx < 0 || tgtIdx0 < 0) return null;
    const src = items[srcIdx];
    const tgt = items[tgtIdx0];
    if (!isFolder(tgt) && isFolder(src)) return null;
    const next = items.slice();
    next.splice(srcIdx, 1);
    const ti = next.findIndex(x => x.id === targetId);
    if (isFolder(tgt)) {
      const kids = isFolder(src) ? (src.children || []) : [src];
      next[ti] = { ...next[ti], children: [...(next[ti].children || []), ...kids] };
      return next;
    }
    // Two shortcuts -> a fresh folder takes over the target's slot.
    next.splice(ti, 1, makeFolder(src, tgt, defName));
    return next;
  }
  // Take one child out of a folder. Returns { items, child }: the removed child (group restored,
  // NOT yet re-inserted — the caller places it at the drop point) plus the new items array, in
  // which a folder that fell below 2 kids has dissolved (its survivor returns to the folder's slot).
  function folderRemoveChild(items, folderId, childId) {
    const fi = items.findIndex(x => x.id === folderId);
    if (fi < 0 || !isFolder(items[fi])) return null;
    const folder = items[fi];
    const kids = Array.isArray(folder.children) ? folder.children : [];
    const ci = kids.findIndex(c => c.id === childId);
    if (ci < 0) return null;
    const back = (k) => ({ ...k, group: folder.group || '' });
    const child = back(kids[ci]);
    const rest = kids.filter((_, i) => i !== ci);
    const next = items.slice();
    if (rest.length < 2) {
      // Auto-dissolve: the survivor returns to the grid at the folder's slot.
      next.splice(fi, 1, ...rest.map(back));
    } else {
      next[fi] = { ...folder, children: rest };
    }
    return { items: next, child };
  }
  function folderRename(items, folderId, name) {
    const fi = items.findIndex(x => x.id === folderId);
    if (fi < 0 || !isFolder(items[fi])) return null;
    const next = items.slice();
    next[fi] = { ...next[fi], name: String(name || '').slice(0, 32) };
    return next;
  }
  // Normalize one item record on read/migrate: plain shortcuts pass through untouched (backward
  // compat); folders get fresh ids / a name / valid kids, and degenerate folders (< 2 kids)
  // dissolve back into plain shortcuts inheriting the folder's group.
  function normalizeFolderRecord(it, defName) {
    if (!it || it.type !== 'folder') return it ? [it] : [];
    const group = typeof it.group === 'string' ? it.group : '';
    const kids = (Array.isArray(it.children) ? it.children : [])
      .filter(c => c && typeof c.url === 'string')
      .map(c => ({ id: c.id || nid(), title: String(c.title || '').slice(0, 32) || defName, url: c.url, icon: c.icon, color: c.color }));
    if (kids.length < 2) return kids.map(k => ({ ...k, group }));
    return [{ id: it.id || nid(), type: 'folder', name: String(it.name || '').slice(0, 32) || defName, group, children: kids }];
  }

  // Folder tile: same footprint as a shortcut card; the icon well shows a 2x2 mini grid of kids.
  function folderCardHtml(it) {
    const name = escapeHtml(it.name || t('folder.default_name'));
    const minis = (it.children || []).slice(0, 4).map(c => {
      const p = cardIconParts(c);
      const bgStyle = p.bg ? `background:${p.bg};` : '';
      return `<span class="folder-mini${p.customCls ? ' ' + p.customCls : ''}" style="${bgStyle}color:${p.ink}">${p.ico}</span>`;
    }).join('');
    return `
      <div class="card card-folder" data-id="${escapeHtml(it.id)}" draggable="true" role="button" tabindex="0" aria-expanded="false" title="${name}">
        <div class="ico folder-ico"><div class="folder-mini-grid">${minis}</div></div>
        <div class="title">${name}</div>
      </div>
    `;
  }
  function tileSize(value) { return ["1x1", "2x1", "1x2", "2x2", "4x2"].includes(value) ? value : "1x1"; }
  function cardHtml(it) {
    if (isFolder(it)) return folderCardHtml(it);
    const p = cardIconParts(it);
    const safeTitle = escapeHtml(it.title);
    const bgStyle = p.bg ? `background:${p.bg};` : '';
    // Only http(s) links are renderable — an imported/synced record could otherwise carry a javascript: URL.
    const safeHref = /^https?:\/\//i.test(it.url || '') ? it.url : '#';
    return `
      <a class="card" data-size="${tileSize(it.tileSize)}" style="--tile-cols:${tileSize(it.tileSize).split('x')[0]};--tile-rows:${tileSize(it.tileSize).split('x')[1]}" href="${escapeHtml(safeHref)}" data-id="${escapeHtml(it.id)}" draggable="true" target="${/^https:\/\/(www\.)?youtube\.com(?:\/|$)/i.test(safeHref) ? '_self' : '_blank'}" rel="noopener" title="${safeTitle}">
        <div class="ico${p.customCls ? ' ' + p.customCls : ''}" style="${bgStyle}color:${p.ink}">
          ${p.ico}
        </div>
        <div class="title">${escapeHtml(it.shortTitle || it.title)}</div>
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

  // ---------- Folder popup + folder drag & drop state ----------
  // Module-level because a drag spans several handlers (and the popup outlives grid re-renders).
  const FOLDER_DWELL_MS = 550; // hover this long on a tile to arm "merge into folder" mode
  let gridDragId = null;       // data-id of the grid card being dragged (shortcut or folder)
  let folderDrag = null;       // { folderId, childId } while a child is dragged out of the popup
  let mergeTimer = 0;          // dwell timer
  let mergeCardId = null;      // card the dwell is currently armed on
  let openFolderId = null;     // folder whose popup is open (session only)

  function clearMergeArmed() {
    clearTimeout(mergeTimer);
    mergeTimer = 0;
    mergeCardId = null;
    document.querySelectorAll('.card.dwell, .card.drag-merge').forEach(n => n.classList.remove('dwell', 'drag-merge'));
    document.querySelectorAll('.card .dwell-bar').forEach(b => b.remove());
  }
  // Only a drop that would actually merge gets the dwell affordance: a folder cannot nest into a
  // plain shortcut, so hovering that combination stays a plain reorder (no misleading progress).
  function dwellMergeable(srcId, tgtId) {
    if (!srcId || !tgtId) return false;
    const src = state.items.find(x => x.id === srcId);
    const tgt = state.items.find(x => x.id === tgtId);
    if (!src || !tgt) return false;
    return !(isFolder(src) && !isFolder(tgt));
  }
  // Start the 550ms fill bar on a card; the timer in the dragover handler flips it to drag-merge.
  function armDwellBar(card) {
    if (!card) return;
    if (!card.querySelector('.dwell-bar')) {
      const bar = document.createElement('span');
      bar.className = 'dwell-bar';
      bar.setAttribute('aria-hidden', 'true');
      card.appendChild(bar);
    }
    card.classList.add('dwell');
    void card.offsetWidth; // restart the fill animation if the same card is re-armed
  }
  // Insert an item into the grid: next to refId (before/after), or at the end of the visible scope.
  function insertIntoView(child, refId, before) {
    if (refId) {
      const idx = state.items.findIndex(x => x.id === refId);
      if (idx >= 0) { state.items.splice(before ? idx : idx + 1, 0, child); return; }
    }
    if (state.view === VIEW_ALL) { state.items.push(child); return; }
    let last = -1;
    state.items.forEach((it, i) => { if (inView(it)) last = i; });
    state.items.splice(last + 1, 0, child);
  }
  // Dissolve a folder outright (context menu): every kid returns to the grid at the folder's slot.
  async function dissolveFolder(id) {
    const fi = state.items.findIndex(x => x.id === id);
    if (fi < 0 || !isFolder(state.items[fi])) return;
    const folder = state.items[fi];
    const kids = (folder.children || []).map(k => ({ ...k, group: folder.group || '' }));
    state.items.splice(fi, 1, ...kids);
    await Store.set(K.items, state.items);
    closeFolderPopup();
    syncUI();
  }

  function folderPopEl() { return document.getElementById('folder-pop'); }
  function setFolderTileExpanded(id, open) {
    const tile = [...document.querySelectorAll('#grid .card-folder')].find(n => n.dataset.id === id);
    if (tile) tile.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeFolderPopup() {
    const was = openFolderId;
    openFolderId = null;
    folderDrag = null;
    if (was) setFolderTileExpanded(was, false);
    const pop = folderPopEl();
    if (pop) pop.hidden = true;
  }
  function openFolderPopup(id, opts) {
    const o = opts || {};
    openFolderId = id;
    renderFolderPopup();
    const pop = folderPopEl();
    if (!openFolderId || !pop) return; // the folder vanished while rendering
    // Anchor under the folder tile (above when space runs out), clamped into the viewport.
    pop.style.left = '0px'; pop.style.top = '0px';
    const tile = [...document.querySelectorAll('#grid .card-folder')].find(n => n.dataset.id === id);
    if (tile) tile.setAttribute('aria-expanded', 'true');
    const tr = tile ? tile.getBoundingClientRect() : { left: window.innerWidth / 2, right: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2, width: 0 };
    const pr = pop.getBoundingClientRect();
    const x = Math.max(8, Math.min(tr.left + (tr.width - pr.width) / 2, window.innerWidth - pr.width - 8));
    const below = tr.bottom + 10;
    const y = (below + pr.height + 8 <= window.innerHeight) ? below : Math.max(8, tr.top - pr.height - 10);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
    if (o.focusName) {
      const input = pop.querySelector('.folder-name-input');
      if (input) { input.focus(); input.select(); }
    }
  }
  function renderFolderPopup() {
    const pop = folderPopEl();
    if (!pop) return;
    const folder = state.items.find(x => x.id === openFolderId);
    if (!folder || !isFolder(folder)) { closeFolderPopup(); return; }
    const kids = Array.isArray(folder.children) ? folder.children : [];
    pop.innerHTML = `
      <input class="folder-name-input" value="${escapeHtml(folder.name || '')}" maxlength="32"
        placeholder="${escapeHtml(t('folder.name_ph'))}" aria-label="${escapeHtml(t('folder.name_ph'))}">
      <div class="folder-pop-grid">
        ${kids.map(c => {
          const p = cardIconParts(c);
          const bgStyle = p.bg ? `background:${p.bg};` : '';
          const safeTitle = escapeHtml(c.title);
          const safeHref = /^https?:\/\//i.test(c.url || '') ? c.url : '#';
          return `<a class="fcard" href="${escapeHtml(safeHref)}" data-id="${escapeHtml(c.id)}" draggable="true" target="${/^https:\/\/(www\.)?youtube\.com(?:\/|$)/i.test(safeHref) ? '_self' : '_blank'}" rel="noopener" title="${safeTitle}">
            <span class="fcard-ico${p.customCls ? ' ' + p.customCls : ''}" style="${bgStyle}color:${p.ink}">${p.ico}</span>
            <span class="fcard-title">${safeTitle}</span>
          </a>`;
        }).join('')}
      </div>
      <div class="folder-pop-hint">${escapeHtml(t('folder.hint'))}</div>`;
    pop.hidden = false;
    // Rename: Enter/blur commits (empty falls back to the default name), Esc reverts.
    const nameInput = pop.querySelector('.folder-name-input');
    nameInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); }
      else if (e.key === 'Escape') { nameInput.value = folder.name || ''; nameInput.blur(); }
    });
    nameInput.addEventListener('blur', async () => {
      const f = state.items.find(x => x.id === openFolderId);
      if (!f) return;
      const name = nameInput.value.trim().slice(0, 32) || t('folder.default_name');
      if (name === (f.name || '')) return;
      const next = folderRename(state.items, f.id, name);
      if (!next) return;
      state.items = next;
      await Store.set(K.items, state.items);
      renderGrid(); // the tile's label follows the rename
    });
    // Drag a child out: the drop lands on a grid card (insert/merge) or on empty grid space (append).
    pop.querySelectorAll('.fcard').forEach(el => {
      el.addEventListener('dragstart', e => {
        folderDrag = { folderId: openFolderId, childId: el.dataset.id };
        el.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', el.dataset.id); e.dataTransfer.effectAllowed = 'move'; } catch {}
      });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); folderDrag = null; });
    });
  }
  // Re-render the open popup after a mutation; closes itself when the folder is gone (dissolved).
  function refreshFolderPopup() {
    if (openFolderId) renderFolderPopup();
  }
  // Bound once at boot: #grid / #folder-pop are static elements and the outside-click / Esc
  // closers are document-level — none of this may be rebound on every grid re-render.
  function bindFolderGlobal() {
    const pop = folderPopEl();
    if (!pop) return;
    // Drop a grid card into the open popup = add it to that folder.
    pop.addEventListener('dragover', e => {
      if (!gridDragId && !folderDrag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    pop.addEventListener('drop', async e => {
      e.preventDefault();
      e.stopPropagation();
      if (folderDrag) { folderDrag = null; return; } // dropped back inside its own folder: no-op
      if (!gridDragId || !openFolderId) return;
      clearMergeArmed();
      const next = folderMergeItems(state.items, gridDragId, openFolderId, t('folder.default_name'));
      if (!next) return;
      state.items = next;
      await Store.set(K.items, state.items);
      syncUI();
      renderFolderPopup();
    });
    // Empty grid space accepts a child dragged out of the popup (appended at the end of the view).
    const grid = document.getElementById('grid');
    grid.addEventListener('dragover', e => {
      if (!folderDrag || e.target.closest('.card')) return; // card-level handlers take card drops
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    grid.addEventListener('drop', async e => {
      if (!folderDrag || e.target.closest('.card')) return;
      e.preventDefault();
      const fd = folderDrag;
      folderDrag = null;
      const res = folderRemoveChild(state.items, fd.folderId, fd.childId);
      if (!res) return;
      state.items = res.items;
      insertIntoView(res.child, null, false);
      await Store.set(K.items, state.items);
      syncUI();
      refreshFolderPopup();
    });
    // Close on outside click / Esc (mirrors the context menu's closers).
    document.addEventListener('click', e => {
      if (!openFolderId) return;
      if (e.target.closest('#folder-pop') || e.target.closest('.card-folder')) return;
      closeFolderPopup();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFolderPopup(); });
  }

  function bindCardEvents() {
    document.querySelectorAll('#grid a.card').forEach(a => {      a.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: t('ctx.open'), action: () => window.open(a.href, '_blank', 'noopener') },
          { label: t('ctx.copy'), action: () => copyToClipboard(a.href) },
          { sizes: true, id: a.dataset.id },
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
    // Folder tiles: click / Enter opens the popup; right-click offers folder actions.
    document.querySelectorAll('#grid .card-folder').forEach(f => {
      f.addEventListener('click', e => {
        e.preventDefault();
        if (openFolderId === f.dataset.id) { closeFolderPopup(); return; }
        openFolderPopup(f.dataset.id);
      });
      f.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFolderPopup(f.dataset.id); }
      });
      f.addEventListener('contextmenu', e => {
        e.preventDefault();
        const id = f.dataset.id;
        openContextMenu(e.clientX, e.clientY, [
          { label: t('ctx.open_folder'), action: () => openFolderPopup(id) },
          { label: t('ctx.rename_folder'), action: () => openFolderPopup(id, { focusName: true }) },
          { label: t('ctx.ungroup_folder'), action: () => dissolveFolder(id) },
          { sep: true },
          { label: t('ctx.del'), danger: true, action: () => deleteItem(id) }
        ]);
      });
    });
    // drag & drop (shortcuts and folder tiles alike; the add tile is excluded)
    document.querySelectorAll('#grid .card:not(.card-add)').forEach(a => {
      a.addEventListener('dragstart', e => {
        // Dragging a link onto the address bar would open it, so suppress the default link-drag visuals.
        if (e.target.closest('.card-actions')) { e.preventDefault(); return; }
        gridDragId = a.dataset.id;
        a.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', gridDragId); e.dataTransfer.effectAllowed = 'move'; } catch {}
      });
      a.addEventListener('dragend', () => {
        a.classList.remove('dragging');
        document.querySelectorAll('.card.drag-over').forEach(n => n.classList.remove('drag-over'));
        clearMergeArmed();
        gridDragId = null;
      });
      a.addEventListener('dragover', e => {
        if (!gridDragId && !folderDrag) return;
        if (gridDragId && gridDragId === a.dataset.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('.card.drag-over').forEach(n => n.classList.remove('drag-over'));
        a.classList.add('drag-over');
        // Hover dwell: lingering on a tile arms folder mode — a stronger highlight plus a 550ms
        // progress bar under the tile, and the drop merges instead of reordering. Moving on to
        // another tile disarms it. Impossibly-mergeable combos (folder onto shortcut) skip the
        // dwell affordance and stay a plain reorder.
        if (mergeCardId !== a.dataset.id) {
          clearMergeArmed();
          // Children dragged out of a folder popup can merge onto any card; grid cards cannot
          // merge a folder onto a plain shortcut (that combination is a plain reorder).
          const mergeable = folderDrag ? true : dwellMergeable(gridDragId, a.dataset.id);
          if (!mergeable) return;
          mergeCardId = a.dataset.id;
          const el = a;
          armDwellBar(el);
          mergeTimer = setTimeout(() => {
            if (mergeCardId === el.dataset.id) {
              el.classList.remove('dwell'); // the bar finished filling
              el.classList.add('drag-merge');
            }
          }, FOLDER_DWELL_MS);
        }
      });
      a.addEventListener('dragleave', () => a.classList.remove('drag-over'));
      a.addEventListener('drop', async e => {
        e.preventDefault();
        e.stopPropagation(); // keep the grid-level folder-child drop handler out of card drops
        const mergeArmed = a.classList.contains('drag-merge');
        clearMergeArmed();
        a.classList.remove('drag-over');
        const rect = a.getBoundingClientRect();
        // The grid flows horizontally across columns, so use the horizontal midpoint to pick insert-before vs insert-after.
        const before = (e.clientX - rect.left) < rect.width / 2;
        // A child dragged out of the open folder popup lands here (insert, or dwell-merge onto the target).
        if (folderDrag) {
          const fd = folderDrag;
          folderDrag = null;
          const res = folderRemoveChild(state.items, fd.folderId, fd.childId);
          if (res) {
            state.items = res.items;
            if (mergeArmed) {
              // Dropping a folder child onto a shortcut creates a new folder — name it after both.
              const tgtItem = state.items.find(x => x.id === a.dataset.id);
              const merged = folderMergeItems([...state.items, res.child], res.child.id, a.dataset.id,
                defaultFolderName(res.child, tgtItem));
              if (merged) state.items = merged;
            } else {
              insertIntoView(res.child, a.dataset.id, before);
            }
            await Store.set(K.items, state.items);
            syncUI();
            refreshFolderPopup();
          }
          return;
        }
        if (!gridDragId || gridDragId === a.dataset.id) return;
        // Dwell-armed drop: create a folder (two shortcuts), add to a folder, or merge two folders.
        if (mergeArmed) {
          const src = state.items.find(x => x.id === gridDragId);
          const tgt = state.items.find(x => x.id === a.dataset.id);
          // Fresh folders (shortcut + shortcut) get a name made from both titles.
          const madeName = src && tgt && !isFolder(src) && !isFolder(tgt) ? defaultFolderName(src, tgt) : t('folder.default_name');
          const merged = folderMergeItems(state.items, gridDragId, a.dataset.id, madeName);
          if (merged) {
            const created = src && tgt && !isFolder(src) && !isFolder(tgt);
            const dragId0 = gridDragId;
            state.items = merged;
            await Store.set(K.items, state.items);
            syncUI();
            if (created) {
              showToast(t('toast.folder_created'));
              // Like iOS: a freshly created folder opens right away so it can be renamed.
              const f = state.items.find(x => isFolder(x) && (x.children || []).some(c => c.id === dragId0));
              if (f) openFolderPopup(f.id);
            }
            return;
          }
          // Folders cannot nest into a new folder: fall through to a plain reorder.
        }
        return reorderVisibleItems(gridDragId, a.dataset.id, before);
      });
    });
  }

  // Move a card within the visible scope of the current view (shortcuts & folders alike). Shared
  // by the HTML5 drop path above and the touch long-press reorder below, so both stay in sync.
  async function reorderVisibleItems(dragId, tgtId, before) {
    const scope = state.items.filter(inView);
    const fromIdx = scope.findIndex(x => x.id === dragId);
    const toIdx0 = scope.findIndex(x => x.id === tgtId);
    if (fromIdx < 0 || toIdx0 < 0) return;
    const [moved] = scope.splice(fromIdx, 1);
    let toIdx = scope.findIndex(x => x.id === tgtId);
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
  }

  // ---------- Touch / pen long-press reorder (flow layout) ----------
  // HTML5 drag needs a mouse, so pointer devices get a long-press gesture instead: hold still for
  // 400ms to pick a card up, drag it, release over a gap to reorder (same reorder as the mouse
  // drop). A movement before the timer fires is treated as a normal scroll and cancels the press.
  const TOUCH_HOLD_MS = 400;
  const TOUCH_MOVE_CANCEL = 10;
  let touchDrag = null;
  function isFlowGrid() {
    const root = document.querySelector('.layout');
    return !(root && root.classList.contains('canvas'));
  }
  function bindTouchReorder() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const setGridTouchAction = (none) => { grid.style.touchAction = none ? 'none' : ''; };
    const cancel = () => {
      if (!touchDrag) return;
      if (touchDrag.timer) clearTimeout(touchDrag.timer);
      if (touchDrag.card) { touchDrag.card.classList.remove('t-dragging'); touchDrag.card.style.transform = ''; touchDrag.card.style.zIndex = ''; }
      setGridTouchAction(false);
      touchDrag = null;
    };
    grid.addEventListener('pointerdown', (e) => {
      const ptr = e.pointerType || '';
      if (ptr !== 'touch' && ptr !== 'pen') return; // mouse keeps the native HTML5 drag
      if (e.button !== 0) return;
      if (!isFlowGrid()) return; // canvas mode already pointer-drags cards
      if (e.target.closest('.card-actions')) return;
      const card = e.target.closest('.card:not(.card-add)');
      if (!card || !card.dataset.id) return;
      cancel();
      const start = { x: e.clientX, y: e.clientY };
      const cand = {
        id: card.dataset.id, card, pointerId: e.pointerId, start,
        px: start.x, py: start.y, armed: false, live: true, timer: 0
      };
      cand.timer = setTimeout(() => {
        if (!cand.live) return;
        // Still holding (no scroll started): pick the card up.
        cand.armed = true;
        cand.card.classList.add('t-dragging');
        cand.card.style.zIndex = '50';
        setGridTouchAction(true);
        try { cand.card.setPointerCapture(e.pointerId); } catch (_) {}
      }, TOUCH_HOLD_MS);
      touchDrag = cand;
    });
    grid.addEventListener('pointermove', (e) => {
      const d = touchDrag;
      if (!d || d.pointerId !== e.pointerId || !d.live) return;
      const dx = e.clientX - d.start.x;
      const dy = e.clientY - d.start.y;
      if (!d.armed) {
        if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL) cancel(); // user meant to scroll
        return;
      }
      e.preventDefault();
      d.px = e.clientX; d.py = e.clientY;
      d.card.style.transform = `translate(${dx}px, ${dy}px) scale(1.04)`;
    });
    const finish = async (e) => {
      const d = touchDrag;
      if (!d || d.pointerId !== e.pointerId) return;
      const armed = d.armed && d.live;
      cancel();
      if (!armed) return;
      // Where did we let go? Prefer the card under the pointer, else the closest visible card.
      let target = null;
      try { target = document.elementFromPoint(e.clientX, e.clientY); } catch (_) {}
      const tCard = target ? target.closest('.card:not(.card-add)') : null;
      const visible = visibleGridCards().filter(c => c.dataset.id !== d.id);
      let pick = tCard && tCard.dataset.id ? tCard : null;
      if (!pick && visible.length) {
        pick = visible.reduce((best, c) => {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const bd = Math.hypot(cx - e.clientX, cy - e.clientY) - (best ? best.d : Infinity);
          return bd < 0 ? { el: c, d: Math.hypot(cx - e.clientX, cy - e.clientY) } : best;
        }, null);
        pick = pick && pick.el ? pick.el : null;
      }
      if (!pick || pick.dataset.id === d.id) return;
      const pr = pick.getBoundingClientRect();
      // Same visual row → horizontal half decides before/after; otherwise vertical.
      const sameRow = Math.abs((pr.top + pr.height / 2) - e.clientY) <= pr.height * 0.6;
      const before = sameRow ? e.clientX < pr.left + pr.width / 2 : e.clientY < pr.top + pr.height / 2;
      await reorderVisibleItems(d.id, pick.dataset.id, before);
    };
    grid.addEventListener('pointerup', finish);
    grid.addEventListener('pointercancel', finish);
    // A long hold on touch can also fire a context menu — suppress it while dragging.
    grid.addEventListener('contextmenu', (e) => {
      if (touchDrag && touchDrag.armed) e.preventDefault();
    });
  }

  async function deleteItem(id) {
    const idx = state.items.findIndex(x => x.id === id);
    if (idx < 0) return;
    const removed = state.items.splice(idx, 1)[0];
    if (openFolderId === id) closeFolderPopup(); // deleting the open folder closes its popup
    await Store.set(K.items, state.items);
    syncUI();
    deletedItems.push({removed, idx});
    if (deletedItems.length > 50) deletedItems.shift();
    showToast(t('toast.deleted'), t('toast.undo'), undoDeletedItem, 10000);
  }
  const deletedItems = [];
  async function undoDeletedItem() {
    const entry = deletedItems.pop();
    if (!entry) return;
    if (!state.items.some(x => x.id === entry.removed.id)) {
      state.items.splice(Math.min(entry.idx, state.items.length), 0, entry.removed);
      await Store.set(K.items, state.items);
      syncUI();
    }
    if (deletedItems.length) showToast(isEn() ? 'More deletions can be undone' : '还可以撤销之前的删除', t('toast.undo'), undoDeletedItem, 10000);
  }
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTypingTarget(e.target) && deletedItems.length) {
      e.preventDefault(); undoDeletedItem();
    }
  });

  // ---------- Context menu ----------
  let menuEl;

  // ---------- Modal focus management (a11y: closing a modal returns focus to its opener) ----------
  let modalReturnFocus = null;
  function hideModal(m, refocus) {
    if (!m) return;
    m.hidden = true;
    if (refocus !== false && modalReturnFocus && document.contains(modalReturnFocus)) {
      const back = modalReturnFocus;
      modalReturnFocus = null;
      try { back.focus({ preventScroll: true }); } catch (_) { try { back.focus(); } catch (_) {} }
    } else if (refocus === false) {
      modalReturnFocus = null;
    }
  }
  // Focus trap: while a .modal is open, F2 / Shift+F2 stay inside it (a11y). Delegated once at
  // boot; hidden panes are excluded by the visibility filter.
  function modalFocusables(modal) {
    return [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(el => !el.hidden && el.offsetParent !== null && el.getClientRects().length > 0);
  }
  function bindModalTrap() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const modal = [...document.querySelectorAll('.modal')].find(m => !m.hidden);
      if (!modal) return;
      const els = modalFocusables(modal);
      if (!els.length) return;
      const inModal = modal.contains(document.activeElement);
      if (e.shiftKey) {
        if (!inModal || document.activeElement === els[0]) { e.preventDefault(); els[els.length - 1].focus(); }
      } else {
        if (!inModal || document.activeElement === els[els.length - 1]) { e.preventDefault(); els[0].focus(); }
      }
    });
  }

  // ---------- Icon grid keyboard navigation (a11y) ----------
  // Arrow keys move focus between visible grid cards (wrapping both ways), Delete / Backspace
  // removes the focused shortcut or folder (undo toast, same as the context menu), 'e' opens the
  // editor for a shortcut. Delegated on #grid so every re-render keeps it working; focus inside a
  // text-entry element is never hijacked.
  function visibleGridCards() {
    return [...document.querySelectorAll('#grid .card')].filter(c => !c.hidden);
  }
  function bindGridKeys() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    grid.addEventListener('keydown', (e) => {
      const card = e.target && e.target.closest ? e.target.closest('.card') : null;
      if (!card || card.hidden || !grid.contains(card)) return;
      if (isTypingTarget(e.target)) return;
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (dir) {
        const cards = visibleGridCards();
        const idx = cards.indexOf(card);
        if (idx < 0) return;
        e.preventDefault();
        const r = card.getBoundingClientRect();
        const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const candidates = cards.filter(c => c !== card).map(c => {
          const b = c.getBoundingClientRect();
          const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
          return {c, ahead: (vertical ? dy : dx) * dir, cross: Math.abs(vertical ? dx : dy)};
        }).filter(x => x.ahead > 1).sort((a,b) => (a.cross * 3 + a.ahead) - (b.cross * 3 + b.ahead));
        const next = candidates[0]?.c || card;
        if (next) { try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); } }
        return;
      }
      const id = card.dataset && card.dataset.id;
      if (!id || id === '__add__') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const idx = visibleGridCards().indexOf(card);
        deleteItem(id).then(() => {
          // The re-render removed the focused card; hand focus to the card that took its place.
          const rest = visibleGridCards();
          const next = rest[Math.min(Math.max(idx, 0), rest.length - 1)] || rest[0];
          if (next) { try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); } }
        });
      } else if (e.key === 'e' || e.key === 'E') {
        if (card.classList.contains('card-add') || card.classList.contains('card-folder')) return;
        e.preventDefault();
        openSiteModal(id);
      }
    });
  }

  function openContextMenu(x, y, items) {
    if (!menuEl) menuEl = document.getElementById('context-menu');
    menuEl.innerHTML = items.map((it, i) => {
      if (it.sep) return '<div class="sep"></div>';
      if (it.sizes) {
        const current = tileSize(state.items.find(x => x.id === it.id)?.tileSize);
        return `<div class="tile-size-label">${isEn() ? 'Tile size' : '图标布局'}</div><div class="tile-size-options">${['1x1','2x1','1x2','2x2','4x2'].map(size => `<button type="button" data-size="${size}" data-id="${escapeHtml(it.id)}" aria-pressed="${size === current}">${size.replace('x','×')}</button>`).join('')}</div>`;
      }
      return `<div class="item ${it.danger ? 'danger' : ''}" data-i="${i}">${escapeHtml(it.label)}</div>`;
    }).join('');
    menuEl.style.left = '0px'; menuEl.style.top = '0px';
    menuEl.hidden = false;
    const r = menuEl.getBoundingClientRect();
    const maxX = window.innerWidth - r.width - 8;
    const maxY = window.innerHeight - r.height - 8;
    menuEl.style.left = Math.min(x, maxX) + 'px';
    menuEl.style.top = Math.min(y, maxY) + 'px';
    menuEl.onclick = async (e) => {
      const sizeBtn = e.target.closest('button[data-size]');
      if (sizeBtn) {
        const item = state.items.find(x => x.id === sizeBtn.dataset.id);
        if (item) { item.tileSize = tileSize(sizeBtn.dataset.size); await Store.set(K.items, state.items); syncUI(); }
        closeContextMenu(); return;
      }
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
    // Editing keeps the stored name untouched; adding starts with an empty, auto-fillable Name.
    siteTitleDirty = !!id;
    const row = document.getElementById('f-group-row');
    const sel = document.getElementById('f-group');
    row.hidden = state.settings.groups.length === 0;
    let it = null;
    if (id) {
      it = state.items.find(x => x.id === id);
      if (!it) return;
      titleEl.textContent = t('site.edit');
      form.elements['title'].value = it.title;
      form.elements['shortTitle'].value = it.shortTitle || '';
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
    // "Add current tab" is offered only when adding (not editing) and only in extension mode —
    // the preview-mode detection mirrors the bookmarks import: chrome.permissions / chrome.tabs
    // simply do not exist under file://.
    const curtabBtn = document.getElementById('f-curtab');
    if (curtabBtn) curtabBtn.hidden = !!id || !(window.chrome && chrome.permissions && chrome.tabs);
    // Bulk add only applies to new shortcuts (never to editing an existing one).
    const batchBtn = document.getElementById('btn-batch');
    if (batchBtn) batchBtn.hidden = !!id;
    const batchPanel = document.getElementById('batch-panel');
    const batchForm = document.getElementById('site-form');
    if (batchPanel) batchPanel.hidden = true;
    if (batchForm) batchForm.hidden = false;
    const batchText = document.getElementById('batch-text');
    if (batchText) batchText.value = '';
    const batchPrev = document.getElementById('batch-preview');
    if (batchPrev) { batchPrev.hidden = true; batchPrev.textContent = ''; }
    const batchAddBtn = document.getElementById('btn-batch-add');
    if (batchAddBtn) batchAddBtn.disabled = true;
    // Remember what opened the modal so closing returns focus there (a11y).
    if (document.activeElement && !modal.contains(document.activeElement)) modalReturnFocus = document.activeElement;
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
  // Bulk-add parser: one shortcut per line — a bare URL, or "Title <sep> URL" where the separator
  // is a space / tab / " | ". Titles default to a humanised host. URLs already saved (or repeated
  // inside the paste) are skipped and counted, never duplicated.
  const BATCH_MAX = 60;
  function batchHostTitle(url) {
    const seg = (hostnameOf(url) || '').replace(/^www\./, '').split('.')[0] || 'site';
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  }
  function parseBatchText(text) {
    const known = new Set();
    const addKnown = (it) => { if (it && it.url) { const n = normalizeUrl(it.url); if (n) known.add(n); } };
    for (const it of (state.items || [])) { if (isFolder(it)) (it.children || []).forEach(addKnown); else addKnown(it); }
    const list = [];
    const seen = new Set();
    let dup = 0, bad = 0;
    for (const raw of String(text || '').split(/\r?\n/)) {
      if (list.length >= BATCH_MAX) { bad++; continue; }
      const line = raw.trim();
      if (!line) continue;
      let title = '', urlRaw = line;
      if (line.includes('\t')) { const i = line.indexOf('\t'); title = line.slice(0, i).trim(); urlRaw = line.slice(i + 1).trim(); }
      else if (line.includes(' | ')) { const i = line.indexOf(' | '); title = line.slice(0, i).trim(); urlRaw = line.slice(i + 3).trim(); }
      else if (!looksLikeUrl(line)) {
        const parts = line.split(/\s+/);
        const last = parts[parts.length - 1] || '';
        if (looksLikeUrl(last)) { title = parts.slice(0, -1).join(' ').trim(); urlRaw = last; }
      }
      const url = normalizeUrl(urlRaw);
      if (!url) { bad++; continue; }
      if (known.has(url) || seen.has(url)) { dup++; continue; }
      seen.add(url); known.add(url);
      list.push({ url, title: String(title || '').trim() || batchHostTitle(url) });
    }
    return { list, dup, bad };
  }
  function bindSiteForm() {
    const modal = document.getElementById('modal-site');
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => hideModal(modal)));
    modal.addEventListener('click', e => { if (e.target === modal) hideModal(modal); });
    // ---------- Bulk add panel ----------
    const batchToggle = document.getElementById('btn-batch');
    const batchPanel = document.getElementById('batch-panel');
    const batchText = document.getElementById('batch-text');
    const batchPrev = document.getElementById('batch-preview');
    const batchAdd = document.getElementById('btn-batch-add');
    const batchBack = document.getElementById('btn-batch-back');
    if (batchToggle && batchPanel && batchText && batchAdd && batchBack) {
      const refreshBatch = () => {
        const { list, dup, bad } = parseBatchText(batchText.value);
        const txt = list.length
          ? (dup ? t('site.batch_preview', { n: list.length, d: dup }) : t('site.batch_count', { n: list.length }))
          : (dup ? t('site.batch_dup_only', { d: dup }) : '');
        batchPrev.textContent = txt;
        batchPrev.hidden = !txt;
        batchAdd.disabled = !list.length;
        return list;
      };
      batchToggle.addEventListener('click', () => {
        const formEl = document.getElementById('site-form');
        if (formEl) formEl.hidden = true;
        batchPanel.hidden = false;
        batchText.focus();
        refreshBatch();
      });
      batchBack.addEventListener('click', () => {
        batchPanel.hidden = true;
        const formEl = document.getElementById('site-form');
        if (formEl) formEl.hidden = false;
      });
      batchText.addEventListener('input', refreshBatch);
      batchAdd.addEventListener('click', async () => {
        const { list } = parseBatchText(batchText.value);
        if (!list.length) return;
        let group = '';
        if (state.view !== VIEW_ALL && state.view !== VIEW_NONE) group = state.view;
        state.items.push(...list.map(x => ({ id: nid(), title: [...x.title].slice(0, 32).join(''), url: x.url, group, icon: undefined })));
        await Store.set(K.items, state.items);
        hideModal(modal);
        syncUI();
        showToast(t('toast.batch_done', { n: list.length }));
      });
    }
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
    const curtabBtn = document.getElementById('f-curtab');
    if (curtabBtn) curtabBtn.addEventListener('click', fillFromCurrentTab);
    // Typing a URL pre-fills the Name from its host, the same derivation bulk add and bookmark
    // import use, so all three entry points name a site identically. It yields as soon as the Name
    // holds something the user picked (or "Add current tab" supplied), and never runs while editing,
    // so a hand-typed name is never overwritten.
    ['f-url', 'f-title'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', renderIconPreview);
    });
    const urlField = document.getElementById('f-url');
    const titleField = document.getElementById('f-title');
    if (titleField) {
      titleField.addEventListener('input', () => { siteTitleDirty = !!titleField.value.trim(); });
    }
    if (urlField && titleField) {
      urlField.addEventListener('input', () => {
        if (siteTitleDirty || form.dataset.editId) return;
        const url = normalizeUrl(urlField.value);
        titleField.value = url ? batchHostTitle(url).slice(0, 32) : '';
        renderIconPreview(); // the letter tile falls back to the Name, so it has to re-read it
      });
    }
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = form.elements['title'].value.trim();
      const shortTitle = form.elements['shortTitle'].value.trim().slice(0, 16);
      const url = normalizeUrl(form.elements['url'].value);
      if (!title) return showToast(t('toast.name_required'));
      if (!url) return showToast(t('toast.url_invalid'));
      const group = document.getElementById('f-group').value || '';
      const editId = form.dataset.editId;
      const same=state.items.find(x=>x.id!==editId&&x.url===url);
      if(same&&!confirm(isEn()?'This URL already exists. Keep another shortcut?':'这个网址已有快捷方式，仍然保留另一个吗？'))return;
      const icon = sanitizeIconDataUrl(pendingIcon) || undefined;
      if (editId) {
        const it = state.items.find(x => x.id === editId);
        if (it) { it.title = title; it.shortTitle = shortTitle; it.url = url; it.group = group; it.icon = icon; }
      } else {
        state.items.push({ id: nid(), title, shortTitle, url, group, icon });
      }
      await Store.set(K.items, state.items);
      hideModal(modal);
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
      version: '1.23.2',
      exportedAt: new Date().toISOString(),
      schema: SCHEMA_VERSION,
      settings: state.settings,
      items: state.items,
      wallpaper: state.wallpaper,
      todos: state.todos,
      prompts: state.prompts
    };
  }
  // Backup reminders live in their own local key (lt.backup) — never in lt.settings, so they stay
  // off the cloud-sync / export payloads (they are this device's local nudge, not user data).
  const BACKUP_DEFAULT_DAYS = 14;
  async function backupPrefs() {
    const r = await localRawGet(K.backup);
    const p = (r && typeof r === 'object') ? r : { remind: false, days: BACKUP_DEFAULT_DAYS, last: 0 };
    p.remind = !!p.remind;
    p.days = Number.isFinite(Number(p.days)) && Number(p.days) >= 1 ? Math.min(90, Math.round(Number(p.days))) : BACKUP_DEFAULT_DAYS;
    p.last = Number.isFinite(Number(p.last)) ? Number(p.last) : 0;
    return p;
  }
  async function saveBackupPrefs(p) { await localRawSet(K.backup, p); }
  function markBackupNow() { backupPrefs().then(p => { p.last = Date.now(); return saveBackupPrefs(p); }).catch(() => {}); }
  function maybeRemindBackup() {
    backupPrefs().then(p => {
      if (!p.remind) return;
      const days = p.days || BACKUP_DEFAULT_DAYS;
      if (p.last && Date.now() - p.last < days * 86400000) return;
      markBackupNow(); // one toast per interval; the action button still exports now
      showToast(t('toast.backup_remind', { n: days }), t('gen.export'), () => { doExport(); markBackupNow(); }, 15000);
    }).catch(() => {});
  }
  // Optional local error capture (Settings → Data): stores only timestamped error messages on
  // this device (no URLs/stacks, never sent anywhere). Off by default — see settings.diag.
  const DIAG_MAX = 100;
  function diagPush(msg) {
    if (!(state.settings && state.settings.diag)) return;
    const raw=String(msg||'');
    const kind=raw.match(/\b(TypeError|ReferenceError|SyntaxError|RangeError|SecurityError|QuotaExceededError|NetworkError|AbortError)\b/);
    const line=kind?kind[0]:(/fetch|network|offline/i.test(raw)?'Network failure':'Application error');
    if (!line) return;
    localRawGet(K.diag).then((r) => {
      const arr = Array.isArray(r) ? r : [];
      arr.push({ t: Date.now(), m: line });
      if (arr.length > DIAG_MAX) arr.splice(0, arr.length - DIAG_MAX);
      return localRawSet(K.diag, arr);
    }).catch(() => {});
  }
  async function exportDiagLog() {
    const r = await localRawGet(K.diag).catch(() => null);
    const arr = Array.isArray(r) ? r : [];
    const text = (arr.length ? arr.map((x) => new Date(x.t).toISOString() + '  ' + (/^(TypeError|ReferenceError|SyntaxError|RangeError|SecurityError|QuotaExceededError|NetworkError|AbortError|Network failure|Application error)$/.test(x.m)?x.m:'Application error')).join('\n') : '(no diagnostics recorded)');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'LightTab-diagnostics.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
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
      markBackupNow(); // a successful manual export satisfies the reminder interval
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
    const preview = isEn()
      ? `Restore backup?\nShortcuts: ${Array.isArray(data.items) ? data.items.length : 0}\nTodos: ${Array.isArray(data.todos) ? data.todos.length : 0}\nSettings, templates and wallpaper are also restored. Existing data will be replaced. Export a backup first if needed.`
      : `确认恢复备份？\n快捷方式（含文件夹）：${Array.isArray(data.items) ? data.items.length : 0} 项\n待办：${Array.isArray(data.todos) ? data.todos.length : 0} 项\n同时恢复设置、模板和壁纸，现有数据将被替换。需要保留当前数据时，请先导出备份。`;
    if (!confirm(preview)) return;
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
    if (!allEngines().some(x => x.id === state.settings.engine)) state.settings.engine = allEngines()[0].id;
    if (!Array.isArray(state.settings.groups)) state.settings.groups = [];
    state.settings.avatar = sanitizeIconDataUrl(state.settings.avatar) || '';
    state.settings.accent = safeColor(state.settings.accent) || '';
    state.settings.clockTz2 = (typeof state.settings.clockTz2 === 'string' ? state.settings.clockTz2.trim().slice(0, 64) : '');
    state.settings.diag = state.settings.diag === true;
    state.settings.widgets = normalizeWidgets(state.settings.widgets);
    state.settings.widgetPos = normalizeWidgetPos(state.settings.widgetPos);
    state.settings.clock12h = state.settings.clock12h === true;
    state.settings.clockSeconds = state.settings.clockSeconds === true;
    state.settings.clockFont = CLOCK_FONTS.includes(state.settings.clockFont) ? state.settings.clockFont : 'modern';
    state.settings.hideSearch = state.settings.hideSearch === true;
    state.settings.hideClock = state.settings.hideClock === true;
    state.settings.iconSize = clampIcon(state.settings.iconSize, ICON_SIZE_MIN, ICON_SIZE_MAX, DEFAULT_SETTINGS.iconSize);
    state.settings.iconRadius = clampIcon(state.settings.iconRadius, ICON_RADIUS_MIN, ICON_RADIUS_MAX, DEFAULT_SETTINGS.iconRadius);
    state.settings.countdown = normalizeCountdown(state.settings.countdown);
    // Imported engine lists get the same validation as the add form: customs must be well-formed
    // http(s) URLs carrying {q}; hidden ids must name real built-ins.
    state.settings.customEngines = (() => {
      if (!Array.isArray(state.settings.customEngines)) return [];
      const seen = new Set();
      const out = [];
      for (const e of state.settings.customEngines) {
        if (!e || typeof e.name !== 'string' || typeof e.url !== 'string') continue;
        if (!/^https?:\/\//i.test(e.url) || !e.url.includes('{q}')) continue;
        if (seen.has(String(e.id))) continue;
        out.push({ id: uniqueCustomEngineId(e.id, seen), name: e.name.slice(0, 12), url: e.url, color: safeColor(e.color) || '#3b82f6', custom: true });
      }
      return out;
    })();
    state.settings.hiddenEngines = Array.isArray(state.settings.hiddenEngines)
      ? state.settings.hiddenEngines.filter(id => ENGINES.some(x => x.id === id))
      : [];
    setLangOnly(state.settings.lang);
    const gids = new Set(state.settings.groups.map(g => g.id));
    state.items = Array.isArray(migrated.items)
      ? migrated.items.flatMap(it => {
          // Folder records: validate kids one by one; degenerate folders (< 2 valid kids)
          // dissolve into plain shortcuts inheriting the folder's group.
          if (it && it.type === 'folder') {
            const fgroup = gids.has(it.group) ? it.group : '';
            const kids = (Array.isArray(it.children) ? it.children : [])
              .filter(c => c && typeof c.url === 'string')
              .map(c => ({ id: c.id || nid(), title: String(c.title || '').slice(0, 32) || t('toast.unnamed'), url: c.url, icon: sanitizeIconDataUrl(c.icon) || undefined, color: safeColor(c.color) || undefined }));
            if (kids.length < 2) return kids.map(k => ({ ...k, group: fgroup }));
            return [{ id: it.id || nid(), type: 'folder', name: String(it.name || '').slice(0, 32) || t('folder.default_name'), group: fgroup, children: kids }];
          }
          if (!it || typeof it.url !== 'string') return [];
          return [{ id: it.id || nid(), shortTitle: String(it.shortTitle || '').slice(0,16), title: String(it.title || '').slice(0, 32) || t('toast.unnamed'), url: it.url, group: gids.has(it.group) ? it.group : '', icon: sanitizeIconDataUrl(it.icon) || undefined }];
        })
      : [];
    state.wallpaper = pickWallpaperFromData(migrated.wallpaper);
    state.todos = Array.isArray(migrated.todos)
      ? migrated.todos.filter(it => it && typeof it.text === 'string').map(it => ({
          id: it.id || nid(),
          text: it.text,
          done: !!it.done,
          due: (typeof it.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.due)) ? it.due : undefined
        }))
      : [];
    // Templates: validate one by one (tmpl must be a string; targets keep only known engines) and drop bad entries.
    const validTarget = id => allEngines().some(x => x.id === id);
    state.prompts = Array.isArray(migrated.prompts)
      ? migrated.prompts
          .filter(p => p && typeof p.tmpl === 'string')
          .map(p => ({
            id: p.id || nid(),
            name: String(p.name || '').slice(0, 24) || t('toast.unnamed_tpl'),
            tmpl: p.tmpl.slice(0, 4000),
            favorite: p.favorite === true,
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
    hideModal(document.getElementById('modal-set'), false);
    syncUI();
    renderTodos();
    renderMovie(); // an import may switch the language, which the movie card renders in
    renderSwatches(); // refresh wallpaper labels/active state in the (possibly new) language
    applyWidgets(); // an import may bring in a different left-column widget selection
    applySearchVis(); // ... or the hide-search preference
    applyIconSizing(); // ... or custom icon tile geometry
    renderAvatar(); // an import may carry a different name / avatar
    showToast(t('toast.import_done', { items: state.items.length, todos: state.todos.length }));
    window.LT_CANVAS.reinitCanvas(); // an import may bring in or clear layout coordinates, so resync the canvas
    renderStorageUse(); // the import changed the data size
  }
  // Which action the shared file input performs next: false = overwrite import (doImport),
  // true = merge shortcuts only (doImportMerge). Reset after every use.
  let mergeImportMode = false;
  async function doImportMerge(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return showToast(t('toast.import_not_json')); }
    if (!data || typeof data !== 'object') return showToast(t('toast.import_bad'));
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) return showToast(t('toast.import_merge_empty'));
    const gids = new Set(state.settings.groups.map(g => g.id));
    const seen = new Set();
    const addSeen = (it) => { if (it && it.url) { const u = normalizeUrl(it.url); if (u) seen.add(u); } };
    for (const it of (state.items || [])) { if (isFolder(it)) (it.children || []).forEach(addSeen); else addSeen(it); }
    let added = 0, dup = 0;
    for (const it of items) {
      if (!it || typeof it !== 'object' || it.type === 'folder' || typeof it.url !== 'string') continue;
      const url = normalizeUrl(it.url);
      if (!url) continue;
      if (seen.has(url)) { dup++; continue; }
      seen.add(url);
      state.items.push({
        id: nid(),
        title: String(it.title || '').trim().slice(0, 32) || batchHostTitle(url),
        url,
        group: gids.has(it.group) ? it.group : '',
        icon: sanitizeIconDataUrl(it.icon) || undefined
      });
      added++;
    }
    if (!added) {
      return showToast(dup ? t('toast.import_merge_dup_only', { n: dup }) : t('toast.import_merge_empty'));
    }
    await Store.set(K.items, state.items);
    syncUI();
    renderStorageUse();
    showToast(t('toast.import_merge_done', { n: added }) + (dup ? ' · ' + t('toast.import_merge_dup', { n: dup }) : ''));
  }

  // Add current tab (shortcut dialog, extension mode only): prefill name + URL from the browser's
  // active tab. The "tabs" permission is optional and requested on demand, inside this user gesture
  // — same pattern as the bookmarks import below. Without it chrome.tabs.query returns the active
  // tab stripped of title/url, so the permission is ensured before querying.
  async function fillFromCurrentTab() {
    if (!window.chrome || !chrome.permissions || !chrome.tabs) return; // preview mode: the button is hidden anyway
    let granted = false;
    try { granted = await chrome.permissions.contains({ permissions: ['tabs'] }); } catch { granted = false; }
    if (!granted) {
      try { granted = await chrome.permissions.request({ permissions: ['tabs'] }); } catch { granted = false; }
    }
    if (!granted) { showToast(t('toast.tabs_denied')); return; }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) return;
    const form = document.getElementById('site-form');
    form.elements['title'].value = String(tab.title || hostnameOf(tab.url) || '').slice(0, 32);
    form.elements['url'].value = tab.url;
    // The tab's own title beats anything derived from the host, so lock it in against auto-fill.
    siteTitleDirty = true;
    renderIconPreview();
  }

  // Import from bookmarks: uses the optional "bookmarks" permission, requested on first click.
  async function importBookmarks() {    // Only detect preview mode (no extension APIs here). chrome.bookmarks simply does not exist until the
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
    const aiEnabled=document.getElementById('f-ai-enabled');
    aiEnabled.addEventListener('change',async()=>{state.settings.aiEnabled=aiEnabled.checked;await Store.set(K.settings,state.settings);renderLauncher();});
    const modal = document.getElementById('modal-set');
    const tabs = modal.querySelectorAll('.tab');
    const panes = modal.querySelectorAll('.tab-pane');

    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => hideModal(modal)));
    modal.addEventListener('click', e => { if (e.target === modal) hideModal(modal); });
    tabs.forEach(tb => tb.addEventListener('click', () => {
      tabs.forEach(x => x.classList.toggle('active', x === tb));
      const key = tb.dataset.tab;
      panes.forEach(p => p.hidden = p.dataset.pane !== key);
      if (key === 'prompt') window.LT_PROMPTS.renderPromptManager(); // re-sync on every visit to the Templates pane
      if (key === 'cal') { renderCalList(); renderCalStatus(); } // ... and to the Calendar pane
    }));
    document.getElementById('f-upload').addEventListener('change', onUpload);
    document.getElementById('btn-reset-wall').addEventListener('click', () => {
      setWallpaper({ ...BUNDLED_WALL });
      markManualPickToday(); // a manual pick wins for the rest of this calendar day
      renderSwatches();
      showToast(t('toast.wall_reset'));
    });
    document.getElementById('btn-wall-fetch').addEventListener('click', fetchWallLib);
    const shuffleBtn = document.getElementById('btn-wall-shuffle');
    if (shuffleBtn) shuffleBtn.addEventListener('click', () => fetchWallLib({ shuffle: true }));
    const wallFavsBtn = document.getElementById('btn-wall-favs');
    if (wallFavsBtn) wallFavsBtn.addEventListener('click', () => {
      wallFavOnly = !wallFavOnly;
      renderWallLibGrid();
    });
    const wallSrcSel = document.getElementById('f-wall-src');
    if (wallSrcSel) wallSrcSel.addEventListener('change', () => {
      wallLibSource = wallSrcSel.value || 'bing';
      wallLibImages = null; // clear the previous source's pool so the grid doesn't show stale thumbs
      renderWallLibGrid();
      fetchWallLib();
    });
    document.getElementById('btn-reset-all').addEventListener('click', resetAll);
    // Template manager (Settings -> Templates): the "new template" button.
    document.getElementById('btn-prompt-add').addEventListener('click', () => window.LT_PROMPTS.toggleNewPromptEditor());

    // Data management: export JSON / import JSON / import from bookmarks (optional permission, requested on click).
    document.getElementById('btn-export').addEventListener('click', doExport);
    const fImport = document.getElementById('f-import');
    document.getElementById('btn-import').addEventListener('click', () => { mergeImportMode = false; fImport.click(); });
    const mergeBtn = document.getElementById('btn-import-merge');
    if (mergeBtn) mergeBtn.addEventListener('click', () => { mergeImportMode = true; fImport.click(); });
    fImport.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) { if (mergeImportMode) doImportMerge(f); else doImport(f); }
      mergeImportMode = false;
      e.target.value = '';
    });
    document.getElementById('btn-import-bookmarks').addEventListener('click', importBookmarks);
    // Backup reminder (local-only preference, lt.backup — never synced).
    const backupCb = document.getElementById('f-backup-remind');
    const backupDays = document.getElementById('f-backup-days');
    if (backupCb) backupCb.addEventListener('change', async () => {
      const p = await backupPrefs();
      p.remind = backupCb.checked;
      if (p.remind && !p.last) { p.last = Date.now(); } // the interval starts when enabled
      await saveBackupPrefs(p);
    });
    if (backupDays) backupDays.addEventListener('change', async () => {
      const p = await backupPrefs();
      p.days = Math.max(1, Math.min(90, Math.round(Number(backupDays.value) || BACKUP_DEFAULT_DAYS)));
      backupDays.value = String(p.days);
      await saveBackupPrefs(p);
    });
    // Local diagnostics (opt-in, no network): toggle + export.
    const diagCb = document.getElementById('f-diag');
    const diagExport = document.getElementById('btn-diag-export');
    const syncDiag = () => {
      if (diagCb) diagCb.checked = !!(state.settings && state.settings.diag);
      if (diagExport) diagExport.hidden = !diagCb || !diagCb.checked;
    };
    if (diagCb) diagCb.addEventListener('change', async () => {
      state.settings.diag = !!diagCb.checked;
      await Store.set(K.settings, state.settings);
      syncDiag();
    });
    if (diagExport) diagExport.addEventListener('click', exportDiagLog);

    // General
    const nameInput = document.getElementById('f-name');
    const engineSel = document.getElementById('f-engine');
    const langSel = document.getElementById('f-lang');
    const weatherCityInput = document.getElementById('f-weather-city');
    if (weatherCityInput) weatherCityInput.addEventListener('change', () => saveWeatherCity(weatherCityInput.value));
    fillEngineSelect();
    bindEngManager();
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
    // Search suggestions toggle (General). On by default; older profiles lack the key, so it
    // reads as on unless explicitly set to false.
    const suggestCb = document.getElementById('f-suggest');
    if (suggestCb) suggestCb.addEventListener('change', async () => {
      state.settings.suggest = !!suggestCb.checked;
      await Store.set(K.settings, state.settings);
      if (!suggestCb.checked) resetSuggest();
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
    // Accent colour (General): preset swatches + the native colour input (empty = shipped default).
    const accentInput = document.getElementById('f-accent');
    if (accentInput) accentInput.addEventListener('input', () => setAccent(accentInput.value));
    // 12h/24h clock toggle (General). Older profiles lack the key, which reads as 24h.
    const clock12hCb = document.getElementById('f-clock12h');
    if (clock12hCb) clock12hCb.addEventListener('change', async () => {
      state.settings.clock12h = !!clock12hCb.checked;
      await Store.set(K.settings, state.settings);
      startClock(); // force a redraw so the format flips immediately
    });
    // Seconds toggle (General): the seconds span shows/hides; the 1s cadence is unchanged.
    const clockSecCb = document.getElementById('f-clockseconds');
    if (clockSecCb) clockSecCb.addEventListener('change', async () => {
      state.settings.clockSeconds = !!clockSecCb.checked;
      await Store.set(K.settings, state.settings);
      startClock(); // force a redraw so the seconds flip immediately
    });
    // Clock face font (General): modern (bundled Inter) / serif / mono system stacks.
    const clockFontSel = document.getElementById('f-clockfont');
    if (clockFontSel) clockFontSel.addEventListener('change', async () => {
      state.settings.clockFont = CLOCK_FONTS.includes(clockFontSel.value) ? clockFontSel.value : 'modern';
      await Store.set(K.settings, state.settings);
      applyClockFont(); // class-only change, no redraw needed
    });
    // Hide search bar / hide clock (General): both default off. Hiding uses the [hidden] attribute
    // (display:none), so the layout closes up — the icon grid simply rides up when both are gone.
    const hideSearchCb = document.getElementById('f-hidesearch');
    if (hideSearchCb) hideSearchCb.addEventListener('change', async () => {
      state.settings.hideSearch = !!hideSearchCb.checked;
      await Store.set(K.settings, state.settings);
      closeSuggest(); // a hidden box can hold no open dropdown
      applySearchVis();
    });
    // Second timezone (General): IANA name; invalid values are rejected and the old one kept.
    const tz2Input = document.getElementById('f-tz2');
    if (tz2Input) tz2Input.addEventListener('change', async () => {
      const v = tz2Input.value.trim();
      if (v && !validTz(v)) {
        tz2Input.value = state.settings.clockTz2 || '';
        return showToast(t('toast.tz2_invalid'));
      }
      state.settings.clockTz2 = v;
      await Store.set(K.settings, state.settings);
      renderTz2();
    });
    const hideClockCb = document.getElementById('f-hideclock');
    if (hideClockCb) hideClockCb.addEventListener('change', async () => {
      state.settings.hideClock = !!hideClockCb.checked;
      await Store.set(K.settings, state.settings);
      applyWidgets(); // clock visibility is computed there, together with the widget registry
    });
    // Icon size / corner radius sliders (General): live-preview on input, persist on change.
    const iconSizeRg = document.getElementById('f-iconsize');
    const iconRadiusRg = document.getElementById('f-iconradius');
    const syncIconRangeVals = () => {
      const sv = document.getElementById('f-iconsize-val');
      if (sv && iconSizeRg) sv.textContent = iconSizeRg.value + 'px';
      const rv = document.getElementById('f-iconradius-val');
      if (rv && iconRadiusRg) rv.textContent = iconRadiusRg.value + '%';
    };
    if (iconSizeRg) {
      iconSizeRg.addEventListener('input', () => {
        state.settings.iconSize = clampIcon(iconSizeRg.value, ICON_SIZE_MIN, ICON_SIZE_MAX, DEFAULT_SETTINGS.iconSize);
        applyIconSizing();
        syncIconRangeVals();
      });
      iconSizeRg.addEventListener('change', () => Store.set(K.settings, state.settings));
    }
    if (iconRadiusRg) {
      iconRadiusRg.addEventListener('input', () => {
        state.settings.iconRadius = clampIcon(iconRadiusRg.value, ICON_RADIUS_MIN, ICON_RADIUS_MAX, DEFAULT_SETTINGS.iconRadius);
        applyIconSizing();
        syncIconRangeVals();
      });
      iconRadiusRg.addEventListener('change', () => Store.set(K.settings, state.settings));
    }
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
      renderAccentPicks(); // ... and the accent swatches / colour input
      renderStorageUse(); // data-usage line is live in this pane
      backupPrefs().then(p => {
        const bc = document.getElementById('f-backup-remind');
        const bd = document.getElementById('f-backup-days');
        if (bc) bc.checked = !!p.remind;
        if (bd) bd.value = String(p.days || BACKUP_DEFAULT_DAYS);
      }).catch(() => {});
      const dg = document.getElementById('f-diag');
      const dx = document.getElementById('btn-diag-export');
      if (dg) dg.checked = !!(state.settings && state.settings.diag);
      if (dx) dx.hidden = !(state.settings && state.settings.diag);
      renderSwatches();
      renderWallLibGrid();
      const wallRotCb = document.getElementById('f-wall-rotate');
      if (wallRotCb) wallRotCb.checked = !!state.settings.wallRotate;
      const suggestCb = document.getElementById('f-suggest');
      if (suggestCb) suggestCb.checked = state.settings.suggest !== false;
      const clock12hCb = document.getElementById('f-clock12h');
      if (clock12hCb) clock12hCb.checked = state.settings.clock12h === true;
      const clockSecCb = document.getElementById('f-clockseconds');
      if (clockSecCb) clockSecCb.checked = state.settings.clockSeconds === true;
      const clockFontSel = document.getElementById('f-clockfont');
      if (clockFontSel) clockFontSel.value = CLOCK_FONTS.includes(state.settings.clockFont) ? state.settings.clockFont : 'modern';
      const tz2In = document.getElementById('f-tz2');
      if (tz2In) tz2In.value = state.settings.clockTz2 || '';
      const hideSearchCb = document.getElementById('f-hidesearch');
      if (hideSearchCb) hideSearchCb.checked = state.settings.hideSearch === true;
      document.getElementById('f-ai-enabled').checked=state.settings.aiEnabled !== false;
      const hideClockCb = document.getElementById('f-hideclock');
      if (hideClockCb) hideClockCb.checked = state.settings.hideClock === true;
      const iconSizeRg = document.getElementById('f-iconsize');
      if (iconSizeRg) iconSizeRg.value = clampIcon(state.settings.iconSize, ICON_SIZE_MIN, ICON_SIZE_MAX, DEFAULT_SETTINGS.iconSize);
      const iconRadiusRg = document.getElementById('f-iconradius');
      if (iconRadiusRg) iconRadiusRg.value = clampIcon(state.settings.iconRadius, ICON_RADIUS_MIN, ICON_RADIUS_MAX, DEFAULT_SETTINGS.iconRadius);
      const iconSizeVal = document.getElementById('f-iconsize-val');
      if (iconSizeVal && iconSizeRg) iconSizeVal.textContent = iconSizeRg.value + 'px';
      const iconRadiusVal = document.getElementById('f-iconradius-val');
      if (iconRadiusVal && iconRadiusRg) iconRadiusVal.textContent = iconRadiusRg.value + '%';
      const wallSrcSel = document.getElementById('f-wall-src');
      if (wallSrcSel) wallSrcSel.value = wallLibSource;
      if (tab === 'wall') {
        syncWallSources(); // Discover online sources only after the user opens the wallpaper tab.
        if (wallLibImages === null) fetchWallLib(); // warm the pool (cached fallback when offline)
      }
      // Remember what opened the settings so closing returns focus there (a11y).
      if (document.activeElement && !modal.contains(document.activeElement)) modalReturnFocus = document.activeElement;
      modal.hidden = false;
    }
  }
  // ---------- Cloud sync settings panel ----------
  function syncStatusText(st) {
    switch (st.status) {
      case 'syncing': return t('sync.status.syncing');
      case 'conflict': return t('sync.status.conflict');
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
      const dot = st.status === 'syncing' ? 'busy' : (['error', 'offline', 'conflict'].includes(st.status) ? 'warn' : 'ok');
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
        </div>
        <div class="sync-data">
          <span class="data-label">${t('sync.data_mgmt')}</span>
          <div class="sync-actions">
            <button type="button" class="btn ghost sm" data-sync="wipe-local">${t('sync.wipe_local')}</button>
            <button type="button" class="btn ghost sm danger" data-sync="wipe-remote">${t('sync.wipe_remote')}</button>
          </div>
          <label><span>${t('sync.delete_password')}</span><input id="sync-delete-password" type="password" autocomplete="current-password"></label><p class="form-tip">${t('sync.delete_tip')}</p>
        </div>`;
    }
    const conflicts = Object.entries(st.conflicts || {});
    if (st.loggedIn && conflicts.length) {
      panel.insertAdjacentHTML('beforeend', `<section class="sync-review" aria-label="${t('sync.review')}">
        <h3>${t('sync.review')}</h3><p class="form-tip">${t('sync.review_tip')}</p>
        ${st.lastError ? `<p role="alert" class="form-tip">${escapeHtml(t(st.lastError))}</p>` : ''}
        ${conflicts.map(([key, doc]) => `<div class="sync-conflict">
          <strong>${escapeHtml(t('sync.key.' + key.slice(3)))}</strong>
          <div class="sync-compare">
            <details><summary>${t('sync.local')}</summary><div class="sync-preview">${escapeHtml(syncPreview(doc.local, key))}</div></details>
            <details><summary>${t('sync.cloud')}</summary><div class="sync-preview">${escapeHtml(syncPreview(doc.payload, key))}</div></details>
          </div>
          <div class="sync-actions">
            <button type="button" class="btn ghost sm" data-sync="keep-local" data-key="${escapeHtml(key)}">${t('sync.keep_local')}</button>
            <button type="button" class="btn ghost sm" data-sync="use-cloud" data-key="${escapeHtml(key)}">${t('sync.use_cloud')}</button>
          </div>
        </div>`).join('')}</section>`);
    }
    panel.insertAdjacentHTML('beforeend', `<section class="sync-data" aria-label="${t('sync.backups')}">
      <h3>${t('sync.backups')}</h3><p class="form-tip">${t('sync.backups_tip')}</p>
      ${(st.backups || []).map(entry => `<div class="sync-backup">
        <strong>${escapeHtml(new Date(entry.createdAt).toLocaleString(isEn() ? 'en-US' : 'zh-CN'))}</strong>
        <p class="form-tip">${escapeHtml(t('sync.reason.' + entry.reason))} · ${t('sync.backup_counts', { items: entry.counts[0], todos: entry.counts[1], prompts: entry.counts[2] })}</p>
        <div class="sync-actions">
          <button type="button" class="btn ghost sm" data-sync="export-backup" data-id="${escapeHtml(entry.id)}">${t('sync.export_backup')}</button>
          <button type="button" class="btn ghost sm" data-sync="restore-backup" data-id="${escapeHtml(entry.id)}">${t('sync.restore_backup')}</button>
          <button type="button" class="btn ghost sm" data-sync="delete-backup" data-id="${escapeHtml(entry.id)}">${t('sync.delete_backup')}</button>
        </div>
      </div>`).join('') || `<p class="form-tip">${t('sync.no_backups')}</p>`}
    </section>`);
    renderAvatar(); // the avatar menu mirrors the login state, keep it in step
  }
  function syncPreview(payload, key) {
    if (!payload) return t('sync.deleted');
    try {
      const value = JSON.parse(payload);
      const short = text => String(text || '').slice(0, 500);
      if (Array.isArray(value)) {
        if (!value.length) return t('sync.empty_list');
        return value.slice(0, 20).map((entry, index) => {
          if (!entry || typeof entry !== 'object') return '';
          const title = short(entry.title || entry.name || entry.text);
          const body = key === 'lt.prompts' ? short(entry.tmpl) : short(entry.url);
          const children = Array.isArray(entry.children) ? entry.children.slice(0, 8).map(child => short(child.title)).join(' · ') : '';
          return `${index + 1}. ${key === 'lt.todos' ? (entry.done ? '✓ ' : '○ ') : ''}${title}${body ? '\n' + body : ''}${children ? '\n' + children : ''}`;
        }).join('\n\n') + (value.length > 20 ? '\n…' : '');
      }
      if (key === 'lt.settings') return t('sync.settings_preview', {
        name: short(value.name) || '—', language: value.lang === 'en' ? 'English' : '中文',
        engine: short(value.engine), groups: Array.isArray(value.groups) ? value.groups.length : 0
      });
      if (key === 'lt.wallpaper') return t('sync.wallpaper_preview', { type: short(value?.type) });
      return t('sync.deleted');
    } catch { return t('sync.err.response'); }
  }
  function bindSyncPanel() {
    const panel = document.getElementById('sync-panel');
    if (!panel || !window.LT_SYNC) return;
    panel.addEventListener('click', async e => {
      const btn = e.target.closest('[data-sync]');
      if (!btn) return;
      const action = btn.dataset.sync;
      if (['keep-local', 'use-cloud', 'export-backup', 'restore-backup', 'delete-backup'].includes(action)) {
        const api = window.LT_SYNC;
        const st = api.getState();
        const doc = st.conflicts?.[btn.dataset.key];
        if (action === 'restore-backup' && !confirm(t('sync.restore_confirm'))) return;
        if (action === 'delete-backup' && !confirm(t('sync.delete_confirm'))) return;
        btn.disabled = true;
        try {
          let result;
          if (action === 'keep-local' || action === 'use-cloud') {
            if (!doc) return;
            result = await api.resolveConflict(btn.dataset.key, action === 'keep-local' ? 'local' : 'cloud', doc.rev, doc.local);
          } else if (action === 'restore-backup') {
            result = await api.restoreBackup(btn.dataset.id);
            if (result.ok) showToast(t('sync.restored'));
          } else if (action === 'delete-backup') {
            await api.deleteBackup(btn.dataset.id);
          } else {
            const data = await api.getBackup(btn.dataset.id);
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = url; link.download = 'LightTab-recovery-' + btn.dataset.id + '.json';
            document.body.appendChild(link); link.click(); link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }
          if (result && !result.ok) showToast(t(result.error));
        } catch (error) { showToast(t(error.message)); }
        finally { renderSyncPanel(); }
        return;
      }
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
      } else if (action === 'wipe-local') {
        const r = await window.LT_SYNC.resetLocalSyncState();
        if (r && r.ok) showToast(t('sync.wipe_local_done'));
      } else if (action === 'wipe-remote') {
        if (!confirm(t('sync.wipe_remote_confirm'))) return;
        const password = document.getElementById('sync-delete-password').value;
        const r = await window.LT_SYNC.deleteRemoteData(password);
        if (r?.ok) showToast(t('sync.delete_done')); 
        if (!r || !r.ok) showToast(r && r.error ? t(r.error) : t('sync.status.error'));
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
    // Clear the input immediately (success or failure alike): picking the same file again later
    // must re-fire the change event.
    e.target.value = '';
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
    // Every toast auto-dismisses: 2.6s for plain notices, longer when it carries an action
    // (undo) so the button is reachable. A toast without a timer would sit there forever.
    const ms = ttl || (actionLabel ? 6000 : 2600);
    toastTimer = setTimeout(() => { box.hidden = true; toastTimer = 0; }, ms);
  }
  async function copyText(text) {
    try { if(navigator.clipboard){await navigator.clipboard.writeText(text);return true;} } catch (_) {}
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta=document.createElement('textarea');ta.value=text;
    ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();
    let ok=false;try{ok=document.execCommand('copy');}catch(_){}ta.remove();return ok;
  }
  async function copyToClipboard(text) {
    if(await copyText(text)){showToast(t('toast.copied'));return;}
    const box=document.createElement('dialog');box.className='manual-copy-dialog';
    const title=document.createElement('p');title.textContent=isEn()?'Copy unavailable. Select and copy manually.':'无法自动复制，请选中下方内容手动复制。';
    const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.rows=8;
    const close=document.createElement('button');close.textContent=isEn()?'Close':'关闭';close.onclick=()=>box.close();
    box.append(title,area,close);document.body.append(box);box.onclose=()=>box.remove();box.showModal();area.focus();area.select();
  }

  // ---------- To-do widget ----------
  // Optional due-date chip: shows M/D (M月D日 in zh) beside the text, turns red once the date has
  // passed while the item is still open, and clicking it clears the deadline (no separate editor).
  function dueDateLabel(due) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due || '');
    if (!m) return '';
    const mm = +m[2], dd = +m[3];
    return isEn() ? `${mm}/${dd}` : `${mm}月${dd}日`;
  }
  function dueChipHtml(it) {
    const due = /^\d{4}-\d{2}-\d{2}$/.test(it && it.due) ? it.due : '';
    if (!due) return '';
    const overdue = !it.done && due < todayStr();
    const tip = overdue ? t('todo.overdue') : t('todo.due_clear');
    return `<span class="t-due${overdue ? ' over' : ''}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${escapeHtml(dueDateLabel(due))}</span>`;
  }
  function renderTodos() {
    const list = document.getElementById('todo-list');
    const countEl = document.getElementById('todo-count');
    const clearBtn = document.getElementById('todo-clear-done');
    const done = state.todos.filter(it => it.done).length;
    const overdue = state.todos.filter(it => !it.done && /^\d{4}-\d{2}-\d{2}$/.test(it.due || '') && it.due < todayStr()).length;
    countEl.textContent = done + '/' + state.todos.length + (overdue ? ' · ' + t('todo.overdue_count', { n: overdue }) : '');
    countEl.classList.toggle('has-overdue', overdue > 0);
    if (clearBtn) clearBtn.hidden = done === 0 || !state.todos.length;
    if (!state.todos.length) {
      list.innerHTML = `<li class="todo-empty">${t('todo.empty')}</li>`;
      return;
    }
    const delLabel = escapeHtml(t('todo.del'));
    list.innerHTML = state.todos.map(it => `
      <li class="todo-item ${it.done ? 'done' : ''}" data-id="${escapeHtml(it.id)}">
        <span class="t-check"></span>
        <span class="t-text">${escapeHtml(it.text)}</span>
        ${dueChipHtml(it)}
        <span class="t-del" title="${delLabel}">×</span>
      </li>
    `).join('');
  }
  async function saveTodos() {
    await Store.set(K.todos, state.todos);
  }
  async function updateTodos(change) {
    state.todos = await window.LT_SYNC.writeLocal(K.todos, raw => change(sanitizeTodos(raw) || []));
    renderTodos(); renderCalendar();
  }
  function bindTodo() {
    const form = document.getElementById('todo-form');
    const input = document.getElementById('todo-input');
    const dueInput = document.getElementById('todo-due');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const due = dueInput && /^\d{4}-\d{2}-\d{2}$/.test(dueInput.value) ? dueInput.value : '';
      const added = { id: nid(), text, done: false, ...(due ? { due } : {}) };
      await updateTodos(todos => [added, ...todos]);
      input.value = '';
      if (dueInput) dueInput.value = '';
      renderTodos();
      renderCalendar(); // the calendar's due dots must follow a newly dated task
    });
    document.getElementById('todo-list').addEventListener('click', async e => {
      const item = e.target.closest('.todo-item');
      if (!item) return;
      const todo = state.todos.find(it => it.id === item.dataset.id);
      if (!todo) return;
      const remove = !!e.target.closest('.t-del');
      const clearDue = !!e.target.closest('.t-due');
      const done = !todo.done;
      await updateTodos(todos => todos.flatMap(t => {
        if (t.id !== todo.id) return [t];
        if (remove) return [];
        if (clearDue) { const next = { ...t }; delete next.due; return [next]; }
        return [{ ...t, done }];
      }));
      renderTodos();
      renderCalendar(); // completion / deletion also moves the calendar's due dots
    });
    const clearDoneBtn = document.getElementById('todo-clear-done');
    if (clearDoneBtn) clearDoneBtn.addEventListener('click', async () => {
      await updateTodos(todos => todos.filter(it => !it.done));
      renderTodos();
      renderCalendar();
    });
    renderTodos();
  }

  // ---------- Calendar widget (month view: lunar days + statutory holidays, plus optional dots for
  // subscribed read-only ICS feeds — see the subscription block below for the network story) ----------
  // Next statutory holiday after todayStr (pure — smoke-tested). table is the LT_HOLIDAYS map
  // { 'YYYY-MM-DD': { h } | { work: true } }; make-up workdays are skipped. Returns
  // { key, date, days } (days = calendar days until the first holiday date, 0 = today), or null
  // when the dataset has no holiday left (the table covers one year and is refreshed yearly).
  function nextHoliday(todayStr, table) {
    if (typeof todayStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(todayStr) || !table) return null;
    const t0 = new Date(todayStr + 'T00:00:00').getTime();
    if (isNaN(t0)) return null;
    const dates = Object.keys(table).filter(k => table[k] && table[k].h).sort();
    for (const k of dates) {
      if (k < todayStr) continue;
      const days = Math.round((new Date(k + 'T00:00:00').getTime() - t0) / 86400000);
      return { key: table[k].h, date: k, days };
    }
    return null;
  }
  const calCursor = { y: 0, m: 0 }; // currently displayed year/month; 0 = follow today
  const CAL_MAX_DOTS = 4;           // per cell; a fifth feed colour would just read as noise
  let calSelected = null;           // 'YYYY-MM-DD' of the day whose detail popover is open

  function calKey(y, m, d) {
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function hhmm(ms) {
    const d = new Date(ms);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

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
    // Open to-dos with a deadline mark their calendar day with a small dot (any month in view).
    const dueSet = new Set();
    for (const td of state.todos) {
      if (td && !td.done && /^\d{4}-\d{2}-\d{2}$/.test(td.due || '')) dueSet.add(td.due);
    }
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<span class="cal-cell empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      let lday = '';
      if (window.LT_LUNAR) {
        const lu = window.LT_LUNAR.toLunar(y, m, d);
        if (lu) lday = isEn() ? window.LT_LUNAR.dayNameEn(lu.day) : window.LT_LUNAR.dayName(lu.day);
      }
      const isToday = isThisMonth && d === now.getDate();
      const key = `${y}-${pad2(m)}-${pad2(d)}`;
      // Statutory-holiday markers (js/holidays.js): a corner badge — 休/Off for holidays,
      // 班/Work for 调休 make-up workdays. The today highlight always wins visually.
      const hol = window.LT_HOLIDAYS && window.LT_HOLIDAYS.table[key];
      const badge = !hol ? '' : hol.work
        ? `<em class="cal-badge work">${escapeHtml(t('cal.badge_work'))}</em>`
        : `<em class="cal-badge hol">${escapeHtml(t('cal.badge_rest'))}</em>`;
      // Subscribed-calendar hits for this day. One dot per feed, not per event: a day with eight
      // standups should still read as "one thing".
      const hits = calIndex.get(key) || [];
      const feedIds = [];
      for (const hit of hits) if (feedIds.indexOf(hit.feed.id) < 0) feedIds.push(hit.feed.id);
      const dots = feedIds.slice(0, CAL_MAX_DOTS)
        .map(id => {
          const f = state.calendars.find(x => x.id === id);
          return `<i class="cal-dot" style="background:${(f && f.color) || '#8a8f98'}"></i>`;
        }).join('');
      const cls = 'cal-cell' + (isToday ? ' today' : '')
        + (hol ? (hol.work ? ' workday' : ' holiday') : '')
        + (dueSet.has(key) ? ' due' : '')
        + (hits.length ? ' has-ev' : '');
      if (hits.length) {
        cells.push(`<span class="${cls}" data-day="${d}" role="button" tabindex="0" aria-label="${escapeHtml(t('cal.events_n', { n: hits.length }))}">` +
          `<b>${d}</b><i>${lday}</i>${badge}<span class="cal-dots">${dots}</span></span>`);
      } else {
        cells.push(`<span class="${cls}"><b>${d}</b><i>${lday}</i>${badge}</span>`);
      }
    }
    grid.innerHTML = cells.join('');
    renderCalDay(); // the popover is anchored to a specific day, so re-resolve it against the new grid
    // One quiet line under the grid: the next statutory holiday counted from today (not from the
    // viewed month). Hidden once the dataset's year has run out (see the note in js/holidays.js).
    const nhEl = document.getElementById('cal-next-holiday');
    if (nhEl) {
      const tbl = window.LT_HOLIDAYS && window.LT_HOLIDAYS.table;
      const nh = tbl ? nextHoliday(todayStr(), tbl) : null;
      // Coverage year is derived from the table (js/holidays.js is refreshed yearly). Once the
      // calendar year runs past it there is no data at all — say so instead of silently hiding.
      let cov = 0;
      if (tbl) for (const k of Object.keys(tbl)) { const y = +k.slice(0, 4); if (y > cov) cov = y; }
      if (nh) {
        nhEl.textContent = nh.days === 0
          ? t('cal.holiday_today', { name: t('hol.' + nh.key) })
          : t('cal.next_holiday', { name: t('hol.' + nh.key), n: nh.days });
        nhEl.hidden = false;
      } else if (cov && +todayStr().slice(0, 4) > cov) {
        nhEl.textContent = t('cal.data_stale', { y: cov });
        nhEl.hidden = false;
      } else {
        nhEl.hidden = true; // the year's holidays are over; nothing to announce
      }
    }
  }

  // Day detail: which subscribed events fall on the clicked date, across every enabled feed.
  //
  // Placement is a tiny search rather than a fixed side. The card lives at the top of a narrow left
  // column, and the search box sits to its right and *overlaps it vertically* — so a naive "park it
  // beside the card" lands the popover squarely on the search box, while clamping it back inside
  // covers the very grid the user just clicked. Neither is acceptable, and the free side depends on
  // which widgets the user kept and how wide the window is.
  //
  // So: generate candidate slots around the card (three vertical anchors per side, three horizontal
  // anchors above/below), score each by how much it overlaps the things that must stay usable — the
  // search box, the month grid, and the sibling widgets — then take the first slot that overlaps
  // nothing, falling back to the least-bad one. Must run after the box is visible: a hidden box
  // measures 0.
  function placeCalDay(box) {
    const host = box.offsetParent; // .widget.wcal, the nearest positioned ancestor
    if (!host) return;
    const hb = host.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    const gap = 10, pad = 8;

    const cands = [];
    for (const t of [0, hb.height / 2 - h / 2, hb.height - h]) cands.push({ left: hb.width + gap, top: t }); // right
    for (const t of [0, hb.height / 2 - h / 2, hb.height - h]) cands.push({ left: -w - gap, top: t });        // left
    for (const l of [0, hb.width / 2 - w / 2, hb.width - w]) cands.push({ left: l, top: hb.height + gap });  // below
    for (const l of [0, hb.width / 2 - w / 2, hb.width - w]) cands.push({ left: l, top: -h - gap });         // above

    // Things the popover must not sit on top of.
    const obstacles = [];
    for (const sel of ['#search', '.search-wrap', '.searchbox']) {
      const el = document.querySelector(sel);
      if (el) { obstacles.push(el.getBoundingClientRect()); break; }
    }
    // The month grid (so another day stays clickable) and the shortcut area. The latter is not
    // cosmetic: the movie card is a `#grid > .wmovie` child rather than a left-column sibling, so
    // "the card's siblings" misses it entirely and a naive beside-the-card slot lands right on it.
    for (const sel of ['#cal-grid', '#grid']) {
      const el = document.querySelector(sel);
      if (el) obstacles.push(el.getBoundingClientRect());
    }
    const parent = host.parentElement;
    if (parent) for (const sib of parent.children) {
      if (sib !== host && !sib.contains(host) && sib.offsetParent) obstacles.push(sib.getBoundingClientRect());
    }

    const overlapArea = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

    let best = null;
    for (const c of cands) {
      // Clamp into the viewport, expressed as an offset from the card's own top-left.
      const left = Math.max(pad - hb.left, Math.min(c.left, window.innerWidth - pad - w - hb.left));
      const top = Math.max(pad - hb.top, Math.min(c.top, window.innerHeight - pad - h - hb.top));
      const rect = { left: hb.left + left, top: hb.top + top, right: hb.left + left + w, bottom: hb.top + top + h };
      let cost = 0;
      for (const ob of obstacles) cost += overlapArea(rect, ob);
      if (best === null || cost < best.cost) best = { cost, left, top };
      if (cost === 0) break;
    }
    box.style.left = Math.round(best.left) + 'px';
    box.style.top = Math.round(best.top) + 'px';
  }

  function renderCalDay() {
    const box = document.getElementById('cal-day');
    if (!box) return;
    if (!calSelected) { box.hidden = true; box.innerHTML = ''; return; }
    const parts = calSelected.split('-');
    const yy = +parts[0], mm = +parts[1], dd = +parts[2];
    // The cursor may have moved to another month while the popover was open; hide rather than lie.
    if (yy !== calCursor.y || mm !== calCursor.m) { box.hidden = true; box.innerHTML = ''; return; }
    const hits = calIndex.get(calKey(yy, mm, dd)) || [];
    const label = isEn() ? `${EN_MONTHS[mm - 1]} ${dd}` : `${mm}月${dd}日`;
    let body;
    if (!hits.length) {
      body = `<p class="cal-day-empty">${escapeHtml(t('cal.no_events'))}</p>`;
    } else {
      body = '<ul class="cal-day-list">' + hits.map(hit => {
        const ev = hit.ev;
        let time;
        if (ev.d) {
          time = t('cal.all_day');
        } else {
          const a = hhmm(ev.s), b = hhmm(ev.e);
          time = (b && b !== a) ? a + '–' + b : a;
        }
        const loc = ev.l ? `<span class="cal-day-loc">${escapeHtml(ev.l)}</span>` : '';
        return `<li><i class="cal-dot" style="background:${hit.feed.color}"></i>` +
          `<span class="cal-day-time">${escapeHtml(time)}</span>` +
          `<span class="cal-day-title">${escapeHtml(ev.t || t('cal.unnamed'))}</span>${loc}</li>`;
      }).join('') + '</ul>';
    }
    box.innerHTML = `<div class="cal-day-head"><span>${escapeHtml(label)}</span>` +
      `<button type="button" class="icon-btn" data-cal-day-close aria-label="${escapeHtml(t('cal.close'))}">✕</button></div>` + body;
    box.hidden = false;
    placeCalDay(box);
  }

  function bindCalendar() {
    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    if (!prev || !next) return;
    const go = (dm) => {
      calSelected = null; // the popover belongs to the old month
      calCursor.m += dm;
      if (calCursor.m < 1) { calCursor.m = 12; calCursor.y--; }
      if (calCursor.m > 12) { calCursor.m = 1; calCursor.y++; }
      renderCalendar();
    };
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));

    const grid = document.getElementById('cal-grid');
    if (grid) {
      const toggleDay = (cell) => {
        if (!cell || !cell.dataset.day) return;
        const key = calKey(calCursor.y, calCursor.m, +cell.dataset.day);
        calSelected = (calSelected === key) ? null : key;
        renderCalDay();
      };
      grid.addEventListener('click', e => toggleDay(e.target.closest('.cal-cell')));
      grid.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const cell = e.target.closest('.cal-cell');
        if (!cell || !cell.dataset.day) return;
        e.preventDefault();
        toggleDay(cell);
      });
    }
    const day = document.getElementById('cal-day');
    if (day) day.addEventListener('click', e => {
      if (e.target.closest('[data-cal-day-close]') || e.target === day) { calSelected = null; renderCalDay(); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && calSelected) { calSelected = null; renderCalDay(); }
    });
  }

  // ---------- Calendar subscriptions (Apple / any published ICS feed, read-only) ----------
  // The feed list is user data and goes through Store.set, so a failed write surfaces a toast.
  // Note it is deliberately NOT in sync.js's SYNC_KEYS: an Apple "public calendar" link is an
  // unguessable capability, and pushing it to the server would hand the server a key to the user's
  // calendar. Fetched events are derived from that URL, potentially large, and device-specific, so
  // they live in the local-only cache key and skip sync/export entirely.
  function normalizeCalendars(raw) {
    if (!Array.isArray(raw) || !window.LT_CAL) return [];
    const out = [];
    for (const c of raw) {
      if (!c || typeof c !== 'object') continue;
      const url = window.LT_CAL.normalizeFeedUrl(c.url);
      if (!url) continue;
      const id = String(c.id || nid());
      out.push({
        id,
        name: String(c.name || '').slice(0, 40),
        url,
        color: /^#[0-9a-f]{6}$/i.test(String(c.color || '')) ? c.color : window.LT_CAL.colorFor(id),
        on: c.on !== false
      });
      if (out.length >= window.LT_CAL.MAX_FEEDS) break;
    }
    return out;
  }

  // Day-key → [{ feed, ev }]. Rebuilt whenever the cache or the enabled set changes; the month grid
  // then renders from a map lookup instead of scanning every event.
  function rebuildCalIndex() {
    calIndex = new Map();
    if (!window.LT_CAL) return;
    for (const feed of state.calendars) {
      if (!feed.on) continue;
      const entry = calCache[feed.id];
      if (!entry || !Array.isArray(entry.events) || !entry.events.length) continue;
      for (const [key, list] of window.LT_CAL.groupByDay(entry.events)) {
        if (!calIndex.has(key)) calIndex.set(key, []);
        const bucket = calIndex.get(key);
        for (const ev of list) bucket.push({ feed, ev });
      }
    }
    for (const list of calIndex.values()) list.sort((a, b) => (b.ev.d - a.ev.d) || (a.ev.s - b.ev.s));
  }

  let calBusy = false;
  // force = ignore the freshness window (the "Refresh now" button, and a just-added feed).
  async function syncCalendars(force) {
    if (calBusy || !window.LT_CAL || !window.LT_ICS) return;
    const active = state.calendars.filter(c => c.on);
    if (!active.length) { rebuildCalIndex(); renderCalendar(); renderCalList(); renderCalStatus(); return; }
    calBusy = true;
    renderCalStatus();
    try {
      let changed = false;
      for (const feed of active) {
        const next = await window.LT_CAL.syncFeed(feed, force ? null : calCache[feed.id], Date.now());
        if (JSON.stringify(next) !== JSON.stringify(calCache[feed.id] || null)) {
          calCache[feed.id] = next;
          changed = true;
        }
      }
      if (changed) await localRawSet(K.calcache, calCache);
      rebuildCalIndex();
      renderCalendar();
    } finally {
      calBusy = false;
      renderCalList();
      renderCalStatus();
    }
  }

  function calErrorMessage(entry) {
    const code = entry && entry.error;
    if (!code) return '';
    const http = /^http(\d+)$/.exec(code);
    if (http) return t('cal.err_http', { code: http[1] });
    const known = { timeout: 'cal.err_timeout', network: 'cal.err_network', parse: 'cal.err_parse', too_large: 'cal.err_too_large' };
    return t(known[code] || 'cal.err_network');
  }

  function renderCalStatus() {
    const el = document.getElementById('cal-status');
    if (!el) return;
    if (calBusy) { el.textContent = t('cal.status_syncing'); el.className = 'cal-status'; return; }
    const active = state.calendars.filter(c => c.on);
    if (!active.length) { el.textContent = ''; el.className = 'cal-status'; return; }
    const bad = active.find(c => (calCache[c.id] || {}).error);
    if (bad) { el.textContent = t('cal.status_err', { why: calErrorMessage(calCache[bad.id]) }); el.className = 'cal-status err'; return; }
    const last = active.reduce((mx, c) => Math.max(mx, (calCache[c.id] || {}).fetchedAt || 0), 0);
    if (!last) { el.textContent = t('cal.status_never'); el.className = 'cal-status'; return; }
    let n = 0;
    for (const c of active) n += ((calCache[c.id] || {}).events || []).length;
    el.textContent = t('cal.status_ok', { n });
    el.className = 'cal-status ok';
  }

  function renderCalList() {
    const box = document.getElementById('cal-list');
    if (!box) return;
    if (!state.calendars.length) {
      box.innerHTML = `<p class="cal-empty">${escapeHtml(t('cal.empty'))}</p>`;
      return;
    }
    box.innerHTML = state.calendars.map(feed => {
      let host = '';
      try { host = new URL(feed.url).hostname; } catch { host = ''; }
      const entry = calCache[feed.id] || {};
      const n = (entry.events || []).length;
      const stateHtml = entry.error
        ? `<span class="cal-item-state err">${escapeHtml(calErrorMessage(entry))}</span>`
        : `<span class="cal-item-state">${escapeHtml(entry.fetchedAt ? t('cal.status_ok', { n }) : t('cal.status_never'))}</span>`;
      return `<div class="cal-item" data-cal-id="${feed.id}">` +
        `<i class="cal-dot" style="background:${feed.color}"></i>` +
        `<div class="cal-item-main">` +
          `<div class="cal-item-name">${escapeHtml(feed.name || entry.title || host || t('cal.unnamed'))}</div>` +
          `<div class="cal-item-url">${escapeHtml(host)}</div>${stateHtml}` +
        `</div>` +
        `<label class="cal-item-toggle" title="${escapeHtml(t('cal.enable'))}">` +
          `<input type="checkbox" data-cal-on${feed.on ? ' checked' : ''}>` +
        `</label>` +
        `<button type="button" class="icon-btn" data-cal-del aria-label="${escapeHtml(t('cal.remove'))}" title="${escapeHtml(t('cal.remove'))}">✕</button>` +
      `</div>`;
    }).join('');
  }

  async function addCalendarFeed() {
    const input = document.getElementById('f-cal-url');
    if (!input || !window.LT_CAL) return;
    const url = window.LT_CAL.normalizeFeedUrl(input.value);
    if (!url) return showToast(t('toast.cal_bad_url'));
    if (state.calendars.some(c => c.url === url)) return showToast(t('toast.cal_dup'));
    if (state.calendars.length >= window.LT_CAL.MAX_FEEDS) return showToast(t('toast.cal_limit', { n: window.LT_CAL.MAX_FEEDS }));
    // Chrome refuses to prompt for an origin that is not declared in optional_host_permissions, and
    // that refusal is indistinguishable from a user "no" — so check first and say something useful.
    if (!window.LT_CAL.isDeclared(url)) return showToast(t('toast.cal_host'));
    const perm = await window.LT_CAL.permissionState(url);
    if (perm === 'unsupported') return showToast(t('toast.cal_host'));
    if (perm !== 'granted' && !(await window.LT_CAL.requestAccess(url))) return showToast(t('toast.cal_denied'));

    const id = nid();
    state.calendars.push({ id, name: '', url, color: window.LT_CAL.colorFor(id), on: true });
    await Store.set(K.calendars, state.calendars);
    input.value = '';
    showToast(t('toast.cal_added'));
    renderCalList();
    await syncCalendars(true); // a brand-new feed has nothing cached, so skip the freshness window
  }

  function bindCalSettings() {
    const input = document.getElementById('f-cal-url');
    const addBtn = document.getElementById('f-cal-add');
    if (addBtn) addBtn.addEventListener('click', addCalendarFeed);
    if (input) input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addCalendarFeed(); }
    });
    const refresh = document.getElementById('f-cal-refresh');
    if (refresh) refresh.addEventListener('click', () => syncCalendars(true));
    const list = document.getElementById('cal-list');
    if (!list) return;

    list.addEventListener('click', async e => {
      const del = e.target.closest('[data-cal-del]');
      if (!del) return;
      const id = (del.closest('[data-cal-id]') || {}).dataset?.calId;
      const at = state.calendars.findIndex(c => c.id === id);
      if (at < 0) return;
      state.calendars.splice(at, 1);
      delete calCache[id];
      await Store.set(K.calendars, state.calendars);
      await localRawSet(K.calcache, calCache);
      rebuildCalIndex();
      renderCalendar();
      renderCalList();
      renderCalStatus();
      showToast(t('toast.cal_removed'));
    });

    list.addEventListener('change', async e => {
      const cb = e.target.closest('[data-cal-on]');
      if (!cb) return;
      const id = (cb.closest('[data-cal-id]') || {}).dataset?.calId;
      const feed = state.calendars.find(c => c.id === id);
      if (!feed) return;
      feed.on = cb.checked;
      await Store.set(K.calendars, state.calendars);
      rebuildCalIndex();
      renderCalendar();
      renderCalList();
      renderCalStatus();
      if (feed.on) syncCalendars(false); // re-enabling a feed should not wait for the next boot
    });
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
    { y: 2024, zh: '第二十条', en: 'Article 20', rate: 7.6, genre: '剧情 / 喜剧', blurb: '法，不能向不法让步。' },
    { y: 1957, zh: '十二怒汉', en: '12 Angry Men', rate: 9.4, genre: '剧情 / 悬疑', blurb: '一间陪审室里，十二个人如何决定一个少年的生死。' },
    { y: 1961, zh: '大闹天宫', en: 'Havoc in Heaven', rate: 9.4, genre: '动画 / 奇幻', blurb: '中国动画的巅峰一笔，齐天大圣的一腔孤勇。' },
    { y: 1994, zh: '活着', en: 'To Live', rate: 9.3, genre: '剧情 / 历史', blurb: '人是为了活着本身而活着，而不是为了活着之外的任何事物。' },
    { y: 2008, zh: '入殓师', en: 'Departures', rate: 8.8, genre: '剧情 / 音乐', blurb: '温柔对待每一个告别，让死者有尊严地启程。' },
    { y: 2010, zh: '怦然心动', en: 'Flipped', rate: 9.1, genre: '剧情 / 爱情', blurb: '斯人若彩虹，遇上方知有。' },
    { y: 2021, zh: '雄狮少年', en: 'I Am What I Am', rate: 8.3, genre: '动画 / 运动', blurb: '不认命的人，连狮子也会为他抬头。' }
  ].filter(m => window.LT_MOVIE_DATA?.[m.zh]?.poster).map(m => ({ ...m, ...window.LT_MOVIE_DATA[m.zh] }));
  const HOT_MOVIE_KEY = 'lt.movie.hot.v1';
  const HOT_MOVIE_URL = 'https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&sort=recommend&page_limit=30&page_start=0';
  function normalizeHotMovies(data) {
    if (!Array.isArray(data?.subjects)) return [];
    return data.subjects.filter(m => typeof m.title === 'string' && /^https:\/\/movie\.douban\.com\/subject\/\d+\/$/.test(m.url) && /^https:\/\/img\d*\.doubanio\.com\/[\w/.-]+$/.test(m.cover)).slice(0,30).map(m => ({
      zh:m.title, en:m.title, rate:Number(m.rate)||0, y:'', source:m.url, poster:m.cover,
      country:'—', director:'—', genre:'豆瓣热门', hot:true,
      blurb:'豆瓣热门电影 · 点击查看', synopsis:'热门片单暂未提供剧情简介，可前往豆瓣查看完整电影资料。'
    }));
  }
  let hotCache;
  try { hotCache = JSON.parse(localStorage.getItem(HOT_MOVIE_KEY)); } catch (_) {}
  let hotMovies = normalizeHotMovies(hotCache?.data);
  if (!hotMovies.length) hotMovies = normalizeHotMovies(window.LT_MOVIE_HOT);
  let hiddenMovies=[];
  try{const saved=JSON.parse(localStorage.getItem('lt.movie.hidden'));if(Array.isArray(saved))hiddenMovies=saved.filter(x=>typeof x==='string').slice(-200);}catch(_){}
  function moviePool() { const pool=hotMovies.length?hotMovies:DOUBAN_ANNUAL_BEST;const filtered=pool.filter(m=>!hiddenMovies.includes(m.source||m.zh));return filtered.length?filtered:DOUBAN_ANNUAL_BEST; }
  async function refreshHotMovies() {
    if (!normalizeWidgets(state.settings?.widgets).wmovie) return;
    if (hotCache?.at && Date.now()-hotCache.at < 86400000) return;
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),8000);
    try {
      const response = await fetch(HOT_MOVIE_URL,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) return;
      const data = await response.json();
      const movies = normalizeHotMovies(data);
      if (!movies.length) return;
      // Keep this tab's daily selection stable; refreshed data is used on the next open.
      hotCache = {at:Date.now(),data};
      try { localStorage.setItem(HOT_MOVIE_KEY,JSON.stringify(hotCache)); } catch (_) {}
    } catch (_) { /* Cached/bundled movies remain available offline or when blocked. */ }
    finally { clearTimeout(timer); }
  }
  // Local cursor: -1 = follow the deterministic daily pick; otherwise a manual index into the pool.
  let movieCursor = -1;
  // Last calendar day the midnight-rollover hook ran on (see maybeRollMovieToToday).
  let movieDayMarker = '';
  function movieIndexForToday() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const doy = Math.floor((now - start) / 86400000);
    return ((doy % moviePool().length) + moviePool().length) % moviePool().length;
  }
  // A manual "换一部" browse is session-only: at the next calendar day the widget returns to the
  // deterministic daily pick (the README promise). Boot never counts as a rollover — only a real
  // day change with the page left open does. Rendering is left to the caller's own renderMovie().
  function maybeRollMovieToToday() {
    const today = todayStr();
    if (movieCursor >= 0 && movieDayMarker !== '' && movieDayMarker !== today) {
      movieCursor = -1;
    }
    movieDayMarker = today;
  }
  function openMovieDetails(movie, url) {
    let dialog = document.getElementById('movie-details');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'movie-details';
      document.body.appendChild(dialog);
      dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    }
    const e = escapeHtml;
    const title = isEn() ? movie.en : movie.zh;
    dialog.style.setProperty('--detail-poster', `url('${movie.poster}')`);
    dialog.setAttribute('aria-labelledby', 'movie-details-title');
    dialog.innerHTML = `<div class="movie-details-inner">
      <button type="button" class="movie-details-close" aria-label="${isEn() ? 'Close' : '关闭'}">×</button>
      <div class="movie-details-copy"><div class="movie-details-kicker">${isEn() ? 'DAILY MOVIE' : '每日电影'} · ${e(new Intl.DateTimeFormat(isEn() ? 'en-US' : 'zh-CN', {month:'long', day:'numeric', weekday:'short'}).format(new Date()))}</div>
      <h2 id="movie-details-title">${e(title)}</h2>
      <p class="movie-details-subtitle">${e(isEn() ? movie.zh : movie.en)}</p>
      <div class="movie-details-rating"><span aria-hidden="true">★</span> ${(movie.rate ? movie.rate.toFixed(1) : '—')} <small>${isEn() ? 'Douban rating · curated entry' : (movie.hot ? '豆瓣评分 · 热门片单' : '豆瓣评分 · 内置记录')}</small></div>
      <div class="movie-details-tags"><span>${movie.y}</span><span>${e(movie.country)}</span>${!isEn() ? `<span>${e(movie.genre)}</span>` : ''}</div>
      <p class="movie-details-director">${isEn() ? "Director" : "导演"}：${e(movie.director)}</p>
      <div class="movie-details-note"><span>${isEn() ? 'Film note (Chinese)' : '电影手记'}</span><p lang="zh-CN">${e(movie.blurb)}</p></div>
      <section class="movie-details-synopsis"><h3>${isEn() ? "Synopsis (Chinese)" : "剧情简介"}</h3><p>${e(movie.synopsis)}</p></section>
      <a class="movie-details-source" href="${e(url)}" target="_blank" rel="noopener">${isEn() ? 'View film on Douban ↗' : '查看豆瓣电影资料 ↗'}</a>
    </div><figure class="movie-details-poster"><img referrerpolicy="no-referrer" src="${movie.poster}" alt="${e(title)} 海报"><figcaption>${e(title)} · ${movie.y}</figcaption></figure></div>`;
    const sourceInfo=document.createElement('p');sourceInfo.className='movie-details-subtitle';
    sourceInfo.textContent=movie.hot?((isEn()?'List updated: ':'片单更新：')+(hotCache?.at?new Date(hotCache.at).toLocaleDateString():'2026/9/6')):(isEn()?'Offline curated collection':'离线精选片库');
    const hide=document.createElement('button');hide.textContent=isEn()?'Not interested':'不感兴趣';hide.className='btn ghost';
    hide.onclick=()=>{const key=movie.source||movie.zh;hiddenMovies=[...new Set([...hiddenMovies,key])].slice(-200);try{localStorage.setItem('lt.movie.hidden',JSON.stringify(hiddenMovies));}catch(_){}dialog.close();movieCursor=-1;renderMovie();showToast(isEn()?'Movie hidden':'已隐藏这部电影',isEn()?'Undo':'撤销',()=>{hiddenMovies=hiddenMovies.filter(x=>x!==key);try{localStorage.setItem('lt.movie.hidden',JSON.stringify(hiddenMovies));}catch(_){}renderMovie();});};
    dialog.querySelector('.movie-details-copy').append(sourceInfo,hide);
    dialog.querySelector('.movie-details-close').addEventListener('click', () => dialog.close());
    dialog.showModal();
  }

  function renderMovie() {
    const card = document.getElementById('movie-card');
    if (!card) return;
    const i = movieCursor >= 0 ? (movieCursor % moviePool().length) : movieIndexForToday();
    const m = moviePool()[i];
    const douban = m.source || 'https://www.douban.com/search?cat=1002&q=' + encodeURIComponent(m.zh);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const dateEl = document.getElementById('movie-date');
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = isEn() ? `${now.getMonth() + 1}/${now.getDate()}` : `${now.getMonth() + 1}月${now.getDate()}日`;
    }
    card.style.setProperty('--movie-background', `url('${m.poster}')`);
    const movieNow = new Date();
    card.innerHTML =
      '<img referrerpolicy="no-referrer" class="movie-poster-full" src="' + m.poster + '" alt="' + esc(m.zh) + ' 海报">' +
      '<div class="movie-calendar-date"><strong>' + String(movieNow.getDate()).padStart(2, '0') + '</strong><span>' + esc(new Intl.DateTimeFormat(isEn() ? 'en-US' : 'zh-CN', { month: 'short', weekday: 'short' }).format(movieNow)) + '</span></div>' +
      '<div class="movie-top">' +
        '<div class="movie-rate" aria-label="' + t('movie.rating') + ' ' + m.rate + '">' + (m.rate ? m.rate.toFixed(1) : '—') + '</div>' +
        '<div class="movie-body">' +
          '<div class="movie-title">' + esc(m.zh) + '<span class="movie-year">' + m.y + '</span></div>' +
          '<div class="movie-en">' + esc(m.en) + '</div>' +
          // Genre strings are curated in Chinese only — like the blurb, hidden in the English UI.
          (!isEn() ? '<div class="movie-genre">' + esc(m.genre) + '</div>' : '') +
          // The blurbs are curated in Chinese only; an English UI hides them rather than
          // surfacing a Chinese quote (the title/year/genre row above stays bilingual).
          '<p class="movie-blurb" lang="zh-CN" title="' + (isEn() ? 'Chinese film note' : '电影手记') + '">' + esc(m.blurb) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="movie-actions">' +
        '<button type="button" class="movie-next" id="movie-next" data-i18n="movie.next">Next ›</button>' +
      '</div>';
    const detail = document.createElement('button');
    detail.className = 'movie-open';
    detail.type = 'button';
    detail.addEventListener('click', () => openMovieDetails(m, douban));
    detail.setAttribute('aria-label', (isEn() ? 'Movie details: ' : '查看电影详情：') + (isEn() ? m.en : m.zh));
    card.prepend(detail);
    card.querySelector('.movie-poster-full').addEventListener('error', () => {
      const fallback = DOUBAN_ANNUAL_BEST[i % DOUBAN_ANNUAL_BEST.length];
      if (m.hot) { const original=hotMovies.indexOf(m);if(original>=0)hotMovies[original]=fallback;renderMovie(); }
    }, {once:true});
    const len = moviePool().length;
    const next = card.querySelector('#movie-next');
    if (next) next.addEventListener('click', () => { movieCursor = (i + 1) % len; renderMovie(); document.getElementById('movie-next')?.focus({preventScroll:true}); });
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
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7';
    const j = await weatherFetchJson(url);
    const cur = j && j.current, day = j && j.daily;
    if (!cur || typeof cur.temperature_2m !== 'number' ||
        !day || !Array.isArray(day.time) || !day.time.length ||
        !day.weather_code || !day.temperature_2m_max || !day.temperature_2m_min) throw new Error('bad payload');
    // One row per day, today first; kept in the cache so renders never touch the network.
    const daily = day.time.map((date, i) => ({
      date,
      code: day.weather_code[i],
      hi: Math.round(day.temperature_2m_max[i]),
      lo: Math.round(day.temperature_2m_min[i])
    }));
    return {
      temp: Math.round(cur.temperature_2m),
      rh: Math.round(cur.relative_humidity_2m),
      code: cur.weather_code,
      hi: daily[0].hi,
      lo: daily[0].lo,
      daily
    };
  }
  // Multi-day forecast UI state: in-memory only (collapsed on every page load). Collapsed shows a
  // 3-day mini strip under the current conditions; expanded replaces it with the full 7-day list.
  let weatherExpanded = false;
  // 'YYYY-MM-DD' → localized weekday label (weather.d0..d6). T00:00:00 pins the parse to local
  // midnight, so it never crosses a day boundary.
  function weatherWeekday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return '';
    return t('weather.d' + d.getDay());
  }
  function weatherCaret(up) {
    return '<svg class="weather-fc-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (up ? '<polyline points="6 15 12 9 18 15"/>' : '<polyline points="6 9 12 15 18 9"/>') + '</svg>';
  }
  // 7-day temperature trend sparkline (expanded forecast): two polylines (hi / lo) scaled into a
  // w×h viewBox — no library. Padding keeps the first/last points off the edges; a flat week
  // (hi === lo everywhere) parks both lines at mid-height instead of dividing by zero.
  // Pure helper, exported to LT_PURE for the offline smoke checks.
  function tempTrendPoints(daily, w, h) {
    if (!Array.isArray(daily) || !daily.length) return null;
    const pts = daily.filter(d => d && Number.isFinite(d.hi) && Number.isFinite(d.lo));
    if (!pts.length) return null;
    const pad = 4;
    const min = Math.min(...pts.map(d => d.lo));
    const max = Math.max(...pts.map(d => d.hi));
    const span = max - min;
    const x = (i) => pts.length === 1 ? w / 2 : pad + (w - 2 * pad) * i / (pts.length - 1);
    const y = (v) => span === 0 ? h / 2 : pad + (h - 2 * pad) * (1 - (v - min) / span);
    const fmt = (n) => Math.round(n * 10) / 10;
    const line = (key) => pts.map((d, i) => fmt(x(i)) + ',' + fmt(y(d[key]))).join(' ');
    return { hi: line('hi'), lo: line('lo') };
  }
  // Forecast strip below the current conditions. Old caches carry no `daily` yet — the
  // Array.isArray guard renders no strip then, and the next refresh upgrades the data.
  function weatherForecastHtml(last) {
    const daily = last && Array.isArray(last.daily) ? last.daily : null;
    if (!daily || !daily.length) return '';
    if (!weatherExpanded) {
      // Collapsed: the next 3 days (today is already the headline above); the strip itself is the
      // expand button.
      const cells = daily.slice(1, 4).map((d) =>
        '<span class="weather-fc-cell">' +
          '<span class="weather-fc-day">' + escapeHtml(weatherWeekday(d.date)) + '</span>' +
          '<span class="weather-fc-ico">' + weatherIcon(d.code) + '</span>' +
          '<span class="weather-fc-temp">' + d.hi + '° / ' + d.lo + '°</span>' +
        '</span>').join('');
      return '<button type="button" class="weather-fc weather-mini" id="weather-fc-toggle" aria-expanded="false" aria-label="' +
        escapeHtml(t('weather.expand')) + '">' + cells + weatherCaret(false) + '</button>';
    }
    // Expanded: the full week — a hi/lo temperature trend sparkline first, then one row per day.
    const trend = tempTrendPoints(daily, 280, 44);
    const trendHtml = trend
      ? '<svg class="weather-trend" viewBox="0 0 280 44" preserveAspectRatio="none" aria-hidden="true">' +
        '<polyline class="weather-trend-lo" points="' + trend.lo + '"/>' +
        '<polyline class="weather-trend-hi" points="' + trend.hi + '"/>' +
        '</svg>'
      : '';
    const rows = daily.map((d, i) =>
      '<div class="weather-fc-row">' +
        '<span class="weather-fc-date">' + escapeHtml(d.date.slice(5)) + '</span>' +
        '<span class="weather-fc-day">' + (i === 0 ? escapeHtml(t('weather.today')) : escapeHtml(weatherWeekday(d.date))) + '</span>' +
        '<span class="weather-fc-ico">' + weatherIcon(d.code) + '</span>' +
        '<span class="weather-fc-temp">' + d.lo + '° — ' + d.hi + '°</span>' +
      '</div>').join('');
    return '<div class="weather-fc weather-forecast">' + trendHtml + rows +
      '<button type="button" class="weather-fc-toggle" id="weather-fc-toggle" aria-expanded="true" aria-label="' +
      escapeHtml(t('weather.collapse')) + '">' + weatherCaret(true) + '</button></div>';
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
      card.classList.remove('open');
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
      card.classList.remove('open');
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
      '</div>' +
      weatherForecastHtml(last);
    card.classList.toggle('open', weatherExpanded);
    const fcToggle = card.querySelector('#weather-fc-toggle');
    if (fcToggle) fcToggle.addEventListener('click', () => {
      weatherExpanded = !weatherExpanded;
      renderWeather();
    });
  }
  // Compact weather tail on the clock's date line, shown only when the weather widget itself is
  // hidden — configuring a city is the opt-in, so a hidden widget should not waste the data.
  function clockWeatherText() {
    if (widgetVisible('wweather')) return '';
    const w = state.settings.weather;
    if (!w || !w.last || typeof w.last.temp !== 'number') return '';
    return ` · ${w.name} ${w.last.temp}° ${weatherText(w.last.code)}`;
  }
  // Fetch only when a city is configured AND the cache is stale or missing (a city change drops
  // the old cache, so it counts as stale too). A hidden widget means the clock line shows the
  // weather instead — still a reason to fetch. Everything else renders from settings.weather.last
  // without touching the network.
  function maybeFetchWeather() {
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

  // ---------- Countdown widget (off-work clock + custom countdown days) ----------
  // Persisted in settings.countdown = { off: 'HH:MM', days: [{ id, name, date }] } (cap: 5 days).
  // Zero network: everything is computed from the local clock.
  const COUNT_DAYS_MAX = 5;
  // Whole days from todayStr to dateStr (pure — smoke-tested). Local midnights, negative when past.
  function daysUntil(todayStr, dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(todayStr || '') || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null;
    return Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000);
  }
  // Coerce an imported / synced countdown field into shape (pure — smoke-tested).
  function normalizeCountdown(raw) {
    const out = { off: '18:00', days: [] };
    if (raw && typeof raw === 'object') {
      if (typeof raw.off === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.off)) out.off = raw.off;
      if (Array.isArray(raw.days)) {
        out.days = raw.days
          .filter(d => d && typeof d.name === 'string' && d.name.trim() && typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
          .slice(0, COUNT_DAYS_MAX)
          .map(d => ({ id: d.id || nid(), name: d.name.trim().slice(0, 24), date: d.date }));
      }
    }
    return out;
  }
  function countdownData() {
    state.settings.countdown = normalizeCountdown(state.settings.countdown);
    return state.settings.countdown;
  }
  function saveCountdown() { return Store.set(K.settings, state.settings); }
  let countEditing = false; // the off-work time is being edited inline — ticks must not re-render it
  let countShowAdd = false; // the add form opens from the guide state; stays open once days exist
  // Off-work state for "now": 'weekend' | 'relax' (past off time) | 'count' (HH:MM:SS remaining).
  function offWorkState(now, off) {
    const wd = now.getDay();
    if (wd === 0 || wd === 6) return { mode: 'weekend' };
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(off || '');
    const oh = m ? +m[1] : 18, om = m ? +m[2] : 0;
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), oh, om, 0);
    const leftMs = target - now;
    if (leftMs <= 0) return { mode: 'relax' };
    const s = Math.floor(leftMs / 1000);
    return { mode: 'count', text: `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}` };
  }
  function renderCountdown() {
    const card = document.getElementById('count-card');
    if (!card) return;
    const cd = countdownData();
    const ow = offWorkState(new Date(), cd.off);
    let html = '<div class="count-off">' +
      '<span class="count-off-label">' + escapeHtml(t('cd.offwork')) + '</span>';
    if (countEditing) {
      html += '<input type="time" class="count-off-input" id="count-off-input" value="' + escapeHtml(cd.off) + '" aria-label="' + escapeHtml(t('cd.off_edit')) + '">';
    } else if (ow.mode === 'count') {
      html += '<button type="button" class="count-off-time" id="count-off-edit" title="' + escapeHtml(t('cd.off_edit')) + '">' +
        '<span id="count-left">' + ow.text + '</span></button>';
    } else {
      html += '<button type="button" class="count-off-time relaxed" id="count-off-edit" title="' + escapeHtml(t('cd.off_edit')) + '">' +
        escapeHtml(t(ow.mode === 'weekend' ? 'cd.relax_weekend' : 'cd.relax')) + '</button>';
    }
    html += '</div>';
    const today = todayStr();
    if (cd.days.length) {
      html += '<ul class="count-days">' + cd.days.map(d => {
        const n = daysUntil(today, d.date);
        const rel = n === null ? '' : n > 0 ? t(n === 1 ? 'cd.days_left_1' : 'cd.days_left', { n }) : n < 0 ? t('cd.days_passed', { n: -n }) : t('cd.today');
        return '<li class="count-row" data-id="' + escapeHtml(d.id) + '">' +
          '<span class="count-name">' + escapeHtml(d.name) + '</span>' +
          '<span class="count-n' + (n !== null && n < 0 ? ' past' : '') + '">' + escapeHtml(rel) + '</span>' +
          '<span class="count-del" title="' + escapeHtml(t('cd.del')) + '" role="button" aria-label="' + escapeHtml(t('cd.del')) + '">×</span></li>';
      }).join('') + '</ul>';
    }
    if (!cd.days.length && !countShowAdd) {
      // Guide state (weather-widget style): a quiet dashed prompt that reveals the add form.
      html += '<button type="button" class="count-guide" id="count-guide">' + escapeHtml(t('cd.guide')) + '</button>';
    } else if (cd.days.length < COUNT_DAYS_MAX) {
      html += '<form class="count-add" id="count-add" autocomplete="off">' +
        '<input id="count-name" type="text" maxlength="24" placeholder="' + escapeHtml(t('cd.name_ph')) + '" aria-label="' + escapeHtml(t('cd.name_ph')) + '">' +
        '<input id="count-date" type="date" aria-label="date">' +
        '<button type="submit" class="count-add-btn" aria-label="' + escapeHtml(t('cd.add')) + '">+</button></form>';
    }
    card.innerHTML = html;
    const offInput = card.querySelector('#count-off-input');
    if (offInput) { offInput.focus(); }
  }
  // 1s tick: re-renders nothing while the off-time editor is open; otherwise only the HH:MM:SS
  // text is rewritten, with a full re-render when the mode flips or the calendar day rolls over.
  let countLastKey = '';
  function countTick() {
    if (!widgetVisible('wcount')) return;
    if (countEditing) return;
    const cd = countdownData();
    const ow = offWorkState(new Date(), cd.off);
    const key = todayStr() + '|' + ow.mode + '|' + cd.days.length + '|' + countShowAdd + '|' + isEn();
    if (key !== countLastKey) { countLastKey = key; renderCountdown(); return; }
    const el = document.getElementById('count-left');
    if (el && ow.mode === 'count') el.textContent = ow.text;
  }
  function bindCountdown() {
    const card = document.getElementById('count-card');
    if (!card) return;
    card.addEventListener('click', async (e) => {
      if (e.target.closest('#count-off-edit')) {
        countEditing = true;
        renderCountdown();
        return;
      }
      if (e.target.closest('#count-guide')) {
        countShowAdd = true;
        countTick();
        const nameEl = document.getElementById('count-name');
        if (nameEl) nameEl.focus();
        return;
      }
      const del = e.target.closest('.count-del');
      if (del) {
        const row = del.closest('.count-row');
        const cd = countdownData();
        cd.days = cd.days.filter(d => d.id !== row.dataset.id);
        await saveCountdown();
        countLastKey = '';
        renderCountdown();
      }
    });
    card.addEventListener('change', async (e) => {
      if (e.target.id !== 'count-off-input') return;
      const v = e.target.value;
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) {
        countdownData().off = v;
        await saveCountdown();
      }
      countEditing = false;
      countLastKey = '';
      renderCountdown();
    });
    card.addEventListener('focusout', (e) => {
      // Clicking away without picking a time closes the editor, keeping the previous value.
      if (e.target.id === 'count-off-input') {
        countEditing = false;
        countLastKey = '';
        setTimeout(renderCountdown, 0);
      }
    });
    card.addEventListener('submit', async (e) => {
      if (e.target.id !== 'count-add') return;
      e.preventDefault();
      const cd = countdownData();
      if (cd.days.length >= COUNT_DAYS_MAX) return showToast(t('cd.limit', { n: COUNT_DAYS_MAX }));
      const name = (document.getElementById('count-name').value || '').trim();
      const date = document.getElementById('count-date').value;
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return showToast(t('cd.invalid'));
      cd.days.push({ id: nid(), name: name.slice(0, 24), date });
      await saveCountdown();
      countLastKey = '';
      renderCountdown();
    });
  }

  // ---------- Pomodoro widget (25 min focus / 5 min break, in-memory only) ----------
  // Deliberately not persisted: a timer is a session tool, and a restored mid-cycle timer would
  // be a lie after a reload anyway.
  const POMO_FOCUS_S = 25 * 60;
  const POMO_BREAK_S = 5 * 60;
  // Pure state machine (smoke-tested): pomoInitial → pomoAdvance flips phase on completion and
  // counts finished focus sessions, wrapping every 4 (one full set = 4 dots).
  function pomoInitial() {
    return { phase: 'focus', left: POMO_FOCUS_S, running: false, done: 0 };
  }
  function pomoAdvance(st) {
    if (st.phase === 'focus') return { phase: 'break', left: POMO_BREAK_S, running: st.running, done: (st.done + 1) % 4 };
    return { phase: 'focus', left: POMO_FOCUS_S, running: st.running, done: st.done };
  }
  let pomo = pomoInitial();
  function renderPomodoro() {
    const timeEl = document.getElementById('pomo-time');
    const card = document.getElementById('pomo-card');
    if (!card) { return; }
    if (!timeEl) {
      card.innerHTML =
        '<div class="pomo-phase" id="pomo-phase"></div>' +
        '<div class="pomo-time" id="pomo-time"></div>' +
        '<div class="pomo-controls">' +
          '<button type="button" class="pomo-btn primary" id="pomo-toggle"></button>' +
          '<button type="button" class="pomo-btn" id="pomo-reset"></button>' +
        '</div>';
    }
    renderPomodoroState();
  }
  function renderPomodoroState() {
    const timeEl = document.getElementById('pomo-time');
    const phaseEl = document.getElementById('pomo-phase');
    const toggleEl = document.getElementById('pomo-toggle');
    const resetEl = document.getElementById('pomo-reset');
    const dotsEl = document.getElementById('pomo-dots');
    if (!timeEl) return;
    timeEl.textContent = pad2(Math.floor(pomo.left / 60)) + ':' + pad2(pomo.left % 60);
    timeEl.classList.toggle('break', pomo.phase === 'break');
    if (phaseEl) phaseEl.textContent = t(pomo.phase === 'focus' ? 'pomo.focus' : 'pomo.break');
    if (toggleEl) toggleEl.textContent = t(pomo.running ? 'pomo.pause' : 'pomo.start');
    if (resetEl) resetEl.textContent = t('pomo.reset');
    if (dotsEl) {
      dotsEl.innerHTML = [0, 1, 2, 3].map(i =>
        '<span class="pomo-dot' + (i < pomo.done ? ' on' : '') + '"></span>').join('');
    }
  }
  function pomoTick() {
    if (!pomo.running) return;
    if (--pomo.left <= 0) {
      const wasFocus = pomo.phase === 'focus';
      pomo = pomoAdvance(pomo);
      showToast(t(wasFocus ? 'pomo.toast_break' : 'pomo.toast_focus'));
    }
    renderPomodoroState();
  }
  function bindPomodoro() {
    const card = document.getElementById('pomo-card');
    if (!card) return;
    card.addEventListener('click', (e) => {
      if (e.target.closest('#pomo-toggle')) {
        pomo.running = !pomo.running;
        renderPomodoroState();
      } else if (e.target.closest('#pomo-reset')) {
        pomo = pomoInitial();
        renderPomodoroState();
      }
    });
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
    hideModal(document.getElementById('modal-set'), false);
    showToast(t('toast.reset_done'));
    window.LT_CANVAS.reinitCanvas(); // reset clears layout coordinates, back to the default canvas
    renderStorageUse();
  }

  // ---------- Read-time sanitizers (boot + cloud pull + preview) ----------
  // Storage can hold data from an older version, a buggy cloud pull or a hand-edited file. These
  // guards never invent data and never drop legitimate fields — they only coerce shapes, drop
  // structurally corrupt records and cap absurd lengths. Missing keys keep their default fallbacks
  // (empty arrays stay empty: a user may have deleted everything). Shared by loadDataIntoState;
  // doImport keeps its own stricter pass on top of the same rules.
  function sanitizeGroups(raw) {
    const seen = new Set();
    const out = [];
    for (const g of (Array.isArray(raw) ? raw : [])) {
      if (!g || typeof g !== 'object') continue;
      const name = typeof g.name === 'string' ? g.name.trim().slice(0, 16) : '';
      if (!name) continue;
      const id = (typeof g.id === 'string' && g.id) ? g.id : ('g_' + nid());
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name });
    }
    return out;
  }
  // A custom engine's id must never collide with a built-in id (ENGINES) or another custom engine —
  // an import/legacy file could otherwise carry a custom "google", which would shadow the built-in
  // and make deletions look like they never applied. Colliding ids are renamed on read/import.
  function uniqueCustomEngineId(rawId, seen) {
    let id = (typeof rawId === 'string' && rawId) ? rawId : ('u-' + nid());
    let guard = 0;
    while ((seen && seen.has(id)) || ENGINES.some(x => x.id === id)) {
      if (++guard > 24) break;
      id = 'u-' + nid();
    }
    if (seen) seen.add(id);
    return id;
  }
  function sanitizeCustomEngines(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const e of raw) {
      if (!e || typeof e !== 'object' || typeof e.name !== 'string' || typeof e.url !== 'string') continue;
      if (!/^https?:\/\//i.test(e.url) || !e.url.includes('{q}')) continue;
      if (seen.has(String(e.id))) continue; // exact duplicates never render twice
      const id = uniqueCustomEngineId(e.id, seen);
      out.push({ id, name: e.name.slice(0, 12), url: e.url, color: safeColor(e.color) || '#3b82f6', custom: true });
    }
    return out;
  }
  function sanitizeHiddenEngines(raw) {
    return Array.isArray(raw) ? raw.filter(id => ENGINES.some(x => x.id === id)) : [];
  }
  function sanitizeTodos(raw) {
    if (!Array.isArray(raw)) return null; // null = key missing entirely -> caller default
    const out = [];
    for (const it of raw) {
      if (!it || typeof it !== 'object' || typeof it.text !== 'string') continue;
      const rec = { id: (typeof it.id === 'string' && it.id) ? it.id : nid(), text: it.text, done: !!it.done };
      if (typeof it.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.due)) rec.due = it.due;
      out.push(rec);
    }
    return out;
  }
  function sanitizePrompts(raw) {
    if (!Array.isArray(raw)) return null;
    const validTarget = id => allEngines().some(x => x.id === id);
    return raw
      .filter(p => p && typeof p === 'object' && typeof p.tmpl === 'string')
      .slice(0, 100) // absurd lists are cut; the UI itself caps at 30
      .map(p => ({
        id: (typeof p.id === 'string' && p.id) ? p.id : nid(),
        name: String(p.name || '').slice(0, 24) || t('toast.unnamed_tpl'),
        tmpl: p.tmpl.slice(0, 4000),
        favorite: p.favorite === true,
        hint: typeof p.hint === 'string' ? p.hint.slice(0, 60) : '',
        targets: Array.isArray(p.targets) ? p.targets.filter(validTarget).slice(0, 4) : [],
        wb: p.wb && typeof p.wb === 'object' ? p.wb : null
      }));
  }
  // Items (shortcuts + folders). Non-http(s) URLs are unrenderable by design and can carry
  // javascript: payloads from crafted files, so they are dropped; degenerate folders dissolve.
  function sanitizeItems(raw, gids) {
    if (!Array.isArray(raw)) return null;
    const normUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) && u.length < 2000) ? u : '';
    const normTitle = (s) => { const v = String(s || ''); return v.length > 500 ? v.slice(0, 500) : v; };
    const normKid = (c) => {
      if (!c || typeof c !== 'object') return null;
      const url = normUrl(c.url);
      if (!url) return null;
      return { id: (typeof c.id === 'string' && c.id) ? c.id : nid(), title: normTitle(c.title) || t('toast.unnamed'), url, icon: sanitizeIconDataUrl(c.icon) || undefined, color: safeColor(c.color) || undefined };
    };
    const out = [];
    for (const it of raw) {
      if (!it || typeof it !== 'object') continue;
      const group = gids.has(it.group) ? it.group : '';
      if (it.type === 'folder') {
        const kids = (Array.isArray(it.children) ? it.children : []).map(normKid).filter(Boolean).slice(0, 64);
        if (kids.length < 2) { out.push(...kids.map(k => ({ ...k, group }))); continue; } // dissolve
        out.push({ id: (typeof it.id === 'string' && it.id) ? it.id : nid(), type: 'folder', name: normTitle(it.name) || t('folder.default_name'), group, children: kids });
        continue;
      }
      const url = normUrl(it.url);
      if (!url) continue;
      out.push({ id: (typeof it.id === 'string' && it.id) ? it.id : nid(), shortTitle: String(it.shortTitle || '').slice(0,16), title: normTitle(it.title) || t('toast.unnamed'), url, group, tileSize: tileSize(it.tileSize), icon: sanitizeIconDataUrl(it.icon) || undefined, color: safeColor(it.color) || undefined });
    }
    return out;
  }

  // ---------- Schema migrations ----------
  // Procedure for a structural change: bump SCHEMA_VERSION, add a single-step function to MIGRATIONS, and old data upgrades level by level on read.
  const MIGRATIONS = {
    // v1 -> v2: groups (a settings.groups array plus a group field on every shortcut; empty string = ungrouped).
    1: (d) => {
      const s = d.settings || {};
      if (!Array.isArray(s.groups)) s.groups = [];
      d.settings = s;
      // Missing items must stay missing — materializing [] here would rob fresh profiles of the
      // default shortcut set (loadDataIntoState only defaults on a MISSING key, not an empty array).
      if (Array.isArray(d.items)) d.items = d.items.map(it => {
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
    },
    // v4 -> v5: shortcut folders (an item with type:'folder' carrying a children[] array of plain
    // shortcuts; the folder itself holds the group). Hand-edited / foreign folders are normalized;
    // degenerate folders (< 2 valid kids) dissolve back into plain shortcuts.
    4: (d) => {
      // Same guard as v1: never materialize a missing items key into an empty array here.
      if (Array.isArray(d.items)) d.items = d.items.flatMap(it => normalizeFolderRecord(it, t('folder.default_name')));
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

  // Read storage -> migrate -> sanitize -> populate in-memory state. Read-only (never writes); also
  // reused after a cloud-sync pull, where the payload arrives as raw JSON from the server.
  async function loadDataIntoState() {
    const raw = await Store.getAll();
    const data = migrateSchema(raw);
    state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), data.settings || {});
    state.settings.avatar = sanitizeIconDataUrl(state.settings.avatar) || '';
    // Read-time hardening: whatever survived migration (old versions, cloud pulls, hand-edited
    // files) is coerced into shape before any renderer or submit path can touch it.
    state.settings.accent = safeColor(state.settings.accent) || '';
    state.settings.clockTz2 = (typeof state.settings.clockTz2 === 'string' ? state.settings.clockTz2.trim().slice(0, 64) : '');
    state.settings.diag = state.settings.diag === true;
    state.settings.groups = sanitizeGroups(state.settings.groups);
    state.settings.customEngines = sanitizeCustomEngines(state.settings.customEngines);
    state.settings.hiddenEngines = sanitizeHiddenEngines(state.settings.hiddenEngines);
    const gids = new Set(state.settings.groups.map(g => g.id));
    if (typeof state.settings.engine !== 'string' || !allEngines().some(x => x.id === state.settings.engine)) {
      state.settings.engine = allEngines()[0].id;
    }
    // An empty array is legitimate (the user deleted every shortcut); only a missing key falls back
    // to the default set — sanitizeItems mirrors that by returning null for a missing key.
    const items = sanitizeItems(data.items, gids);
    state.items = items !== null ? items : structuredClone(DEFAULT_SITES);
    state.wallpaper = pickWallpaperFromData(data.wallpaper);
    const todos = sanitizeTodos(data.todos);
    state.todos = todos !== null ? todos : [];
    // Templates: an empty array is legitimate (the user deleted them all); only undefined falls back
    // to the default set.
    const prompts = sanitizePrompts(data.prompts);
    state.prompts = prompts !== null ? prompts : structuredClone(DEFAULT_PROMPTS);
    // Calendar subscriptions read through their own keys (Store.getAll covers a fixed key set): the
    // feed list is user data, the fetched events are a device-local cache that is never exported.
    state.calendars = normalizeCalendars(await localRawGet(K.calendars));
    calCache = (await localRawGet(K.calcache)) || {};
    rebuildCalIndex();
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
    renderCalList();  // subscribed feeds survived the pull untouched, but the status line may be stale
    renderCalStatus();
    applyWidgets(); // a remote pull may have removed / restored left-column widgets
    applySearchVis(); // ... or flipped the hide-search preference
    applyIconSizing(); // ... or changed the icon tile geometry
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
    localizeBuiltinPrompts();
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
    renderMovie(); // the movie card carries a localized date line / label — follow the language
    renderWeather(); // condition words / humidity label follow the language
    renderCountdown(); // off-work labels / day rows follow the language
    renderPomodoro(); // phase / button labels follow the language
    window.LT_PROMPTS.renderPromptManager();
    renderLauncher();
    setEngine(state.settings.engine);
    startClock();
    if (window.LT_SYNC) renderSyncPanel();
  }

  // ---------- Theme (dark / light / system) ----------
  // Settings store 'dark' | 'light' | 'system'; the DOM attribute html[data-theme] is always
  // 'dark' | 'light' so every CSS light-mode override can key off [data-theme="light"].
  const THEME_OPTIONS = ['dark', 'light', 'system'];
  // Custom accent picker (Settings → General): preset swatches + a native colour input. Empty
  // string = the shipped per-theme accent. The companion --accent-2 (focus rings, gradients) is
  // derived by dimming the pick so it never disappears into surfaces using --accent.
  const ACCENT_PRESETS = ['#7dd3fc', '#38bdf8', '#a78bfa', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#fb7185'];
  function accentCompanion(hex) {
    const n = parseInt(String(hex || '').replace('#', ''), 16);
    if (!Number.isFinite(n)) return null;
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * 0.8)));
    const c = ((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
    return '#' + c;
  }
  function applyAccent() {
    const a = safeColor(state.settings && state.settings.accent);
    const root = document.documentElement;
    const comp = a ? accentCompanion(a) : null;
    for (const [p, v] of [['--accent', a], ['--accent-2', comp]]) {
      if (v) root.style.setProperty(p, v);
      else root.style.removeProperty(p);
    }
  }
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
    applyAccent();
    const sel = document.getElementById('f-theme');
    if (sel && sel.value !== pref) sel.value = pref;
    bindThemeMQ();
  }
  function setAccent(v) {
    state.settings.accent = (typeof v === 'string' && safeColor(v)) ? v : '';
    applyAccent();
    renderAccentPicks();
    Store.set(K.settings, state.settings);
  }
  // Settings → General: preset swatches + native colour input; empty swatch = shipped default.
  function renderAccentPicks() {
    const wrap = document.getElementById('accent-picks');
    const input = document.getElementById('f-accent');
    if (!wrap) return;
    const cur = (state.settings && safeColor(state.settings.accent)) ? state.settings.accent : '';
    const defT = escapeHtml(t('gen.accent_default'));
    const btn = (c, active) => `<button type="button" class="accent-swatch${active ? ' active' : ''}" data-accent="${c}"${c ? ` style="background:${c}"` : ''} title="${c ? c : defT}" aria-label="${c ? c : defT}" aria-pressed="${active}"></button>`;
    wrap.innerHTML = btn('', cur === '') + ACCENT_PRESETS.map(c => btn(c, cur === c)).join('');
    wrap.querySelectorAll('.accent-swatch').forEach(b => b.addEventListener('click', () => setAccent(b.dataset.accent)));
    if (input) input.value = cur || '#38bdf8';
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
      // The hideClock preference (Settings → General) hides the clock card on top of the registry.
      if (el) el.hidden = !vis[id] || (id === 'wclock' && state.settings.hideClock === true);
      const box = document.getElementById('f-w-' + id);
      if (box) box.checked = vis[id];
    }
    // All three gone → drop the column entirely so .right (flex:1) reclaims the full width.
    // A clock lifted above the search box no longer counts towards keeping the column alive,
    // and neither does a clock hidden via the hideClock preference.
    const left = document.querySelector('.layout > .left');
    if (left) {
      left.hidden = !WIDGETS.some((id) =>
        vis[id] && !(id === 'wclock' && state.settings.hideClock === true) &&
        document.querySelector('.widget.' + id)?.closest('.left'));
    }
    // In free-canvas mode the block coordinates are frozen: toggling a widget without a reflow
    // leaves a hole where it was — and a revived widget may have no coords at all and park at the
    // origin. Force a re-measure even for hand-arranged layouts; this is an explicit structural edit.
    const integratedMovie = vis.wmovie && state.settings.widgetPos.wmovie === 'left';
    document.querySelector('.layout')?.classList.toggle('movie-grid', integratedMovie);
    if (integratedMovie) window.LT_CANVAS.reinitCanvas();
    else window.LT_CANVAS.recaptureBlocksFromFlow(true);
    // The weather widget is opt-in and network-gated: (re)render on every visibility change and
    // fetch only if it just became visible with a stale cache (maybeFetchWeather decides).
    renderWeather();
    maybeFetchWeather();
    // Countdown / pomodoro are pure-local: just re-render on visibility changes.
    renderCountdown();
    renderPomodoro();
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
      if (id === 'wmovie' && pos[id] === 'left') {
        document.getElementById('grid').prepend(el);
      } else if (pos[id] === 'top' && right && search) {
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
  // ---------- Hide search bar / hide clock + icon tile sizing ----------
  // Hiding removes the element from the layout entirely (the [hidden] attribute wins over any
  // display rule, see style.css) — the remaining content just closes up. #search keeps living in
  // the DOM, so every search code path (suggestions, F2 engine-cycling, the boot focus) stays
  // valid: the listeners sit inside the hidden box and can never fire, and readers of #q still
  // find the element. Clock visibility is computed in applyWidgets together with the registry.
  function applySearchVis() {
    const search = document.getElementById('search');
    if (search) search.hidden = state.settings.hideSearch === true;
    // In free-canvas mode removing a block leaves a hole in the frozen coordinates — re-measure
    // (a no-op in flow layout, which reflows on its own).
    window.LT_CANVAS.recaptureBlocksFromFlow(true);
  }
  // Slider bounds (Settings → General): keep them in one place so doImport clamps to the same range.
  const ICON_SIZE_MIN = 48, ICON_SIZE_MAX = 112, ICON_RADIUS_MIN = 20, ICON_RADIUS_MAX = 50;
  function clampIcon(v, lo, hi, dflt) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  }
  // Push settings.iconSize / iconRadius onto :root as --icon-size / --icon-radius; every tile
  // consumer (.card .ico, folder mini-grids, the add tile) derives from those custom properties.
  function applyIconSizing() {
    const size = clampIcon(state.settings.iconSize, ICON_SIZE_MIN, ICON_SIZE_MAX, DEFAULT_SETTINGS.iconSize);
    const radius = clampIcon(state.settings.iconRadius, ICON_RADIUS_MIN, ICON_RADIUS_MAX, DEFAULT_SETTINGS.iconRadius);
    document.documentElement.style.setProperty('--icon-size', size + 'px');
    document.documentElement.style.setProperty('--icon-radius', radius + '%');
    if (window.LT_CANVAS) window.LT_CANVAS.applyCardCanvas();
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


  // ---------- First-run onboarding hint ----------
  // One quiet tip card under the search box, shown only on a genuinely fresh profile (nothing
  // ever persisted under lt.settings). Dismissed by the × button, a click on the card, or Esc;
  // the dismissal lands in settings.onboarded, so it never comes back.
  function maybeShowOnboarding(raw) {
    const el = document.getElementById('onboard-tip');
    if (!el || !el.hidden) return;
    if (raw && raw.settings) return; // an existing profile is never first-run
    if (state.settings.onboarded === true) return;
    // Anchor just under the search box, centred on it (measured live, canvas layout included).
    const sr = document.getElementById('search');
    if (sr) {
      const r = sr.getBoundingClientRect();
      el.style.left = (r.left + r.width / 2) + 'px';
      el.style.top = (r.bottom + 14) + 'px';
    }
    el.hidden = false;
  }
  async function dismissOnboarding() {
    const el = document.getElementById('onboard-tip');
    if (el) el.hidden = true;
    if (state.settings.onboarded === true) return;
    state.settings.onboarded = true;
    await Store.set(K.settings, state.settings);
  }

  // ---------- Keyboard shortcut help (press "?") ----------
  const SHORTCUT_HELP = [
    ['/', 'help.slash'],
    ['1-9', 'help.digits'],
    ['F2 / Shift+F2', 'help.tabcycle'],
    ['↑ / ↓ / Enter', 'help.arrows'],
    ['e / Delete', 'help.gridkeys'],
    ['t', 'help.todo'],
    ['?', 'help.help'],
    ['Esc', 'help.esc']
  ];
  function helpEl() { return document.getElementById('shortcut-help'); }
  function renderShortcutHelp() {
    const el = helpEl();
    if (!el) return;
    const kbdHtml = (label) => label.split(' / ').map(p => `<kbd>${escapeHtml(p)}</kbd>`).join('');
    el.innerHTML = '<div class="sh-title">' + escapeHtml(t('help.title')) + '</div><div class="sh-rows">' +
      SHORTCUT_HELP.map(([keys, key]) =>
        '<div class="sh-row"><span class="sh-keys">' + kbdHtml(keys) + '</span><span class="sh-desc">' + escapeHtml(t(key)) + '</span></div>'
      ).join('') + '</div>';
  }
  function toggleShortcutHelp(force) {
    const el = helpEl();
    if (!el) return;
    const show = (force !== undefined) ? !!force : el.hidden;
    if (show) renderShortcutHelp();
    el.hidden = !show;
  }

  // ---------- Boot ----------
  async function boot() {
    const { raw, data } = await loadDataIntoState();
    searchHistory = await loadHistory(); // lt.history: local-only, kept out of lt.settings and cloud sync
    setLangOnly(state.settings.lang);
    applyTheme();
    // Focus the search box without scrolling: the HTML autofocus attribute makes the browser
    // scroll the input into view, which pushes the topbar off-screen on short/narrow windows.
    const qInput = document.getElementById('q');
    // Focusing a display:none input is a harmless no-op, but skip it explicitly when the search
    // bar is hidden so no scroll/focus side effect can ever reach the hidden box.
    if (qInput && state.settings.hideSearch !== true) qInput.focus({ preventScroll: true });
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
    bindFolderGlobal();
    bindGridKeys();
    bindModalTrap();
    bindTouchReorder();
    applyWidgets();
    applySearchVis(); // hide-search preference (the clock side is folded into applyWidgets)
    applyIconSizing(); // --icon-size / --icon-radius on :root
    bindWidgetControls();
    startClock();
    renderCalendar();
    bindCalendar();
    renderMovie();
    refreshHotMovies();
    renderWeather();
    maybeFetchWeather(); // boot-time refresh, only when the cache is stale (30 min TTL)
    setInterval(maybeFetchWeather, WEATHER_REFRESH_MS); // page-open refresh cadence
    bindTodo();
    // Countdown / pomodoro widgets: render once, then keep them live on a 1s tick
    // (both tickers no-op immediately when their widget is hidden or idle).
    bindCountdown();
    renderCountdown();
    bindPomodoro();
    renderPomodoro();
    setInterval(countTick, 1000);
    setInterval(pomoTick, 1000);

    // Search
    const form = document.getElementById('search-form');
    const qEl = document.getElementById('q');
    form.addEventListener('submit', e => { e.preventDefault(); if (!maybeCopyCalc()) submitSearch(qEl.value, e); });
    document.getElementById('search-go').addEventListener('click', e => { if (!maybeCopyCalc()) submitSearch(qEl.value, e); });
    bindSuggest();
    renderLauncher();
    window.addEventListener('resize',applyAiPosition);
    window.addEventListener('resize',applyAiButtonPosition);
    // Esc while a template is active: drop the template and go back to plain search.
    qEl.addEventListener('keydown', e => {
      if (e.key === 'Escape' && activePrompt) { e.stopPropagation(); window.LT_PROMPTS.clearActiveTemplate(); qEl.focus(); }
    });
    const engineBtn = document.getElementById('engine-btn');
    engineBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Re-render before showing: engine removals/restores can happen in Settings while this
      // list is closed, and the DOM must never serve a stale engine that was deleted.
      renderEngineList();
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
      if(e.altKey&&e.shiftKey&&e.code==='KeyA'&&state.settings.aiEnabled!==false){e.preventDefault();const panel=document.getElementById('ai-launcher');panel.hidden=false;document.getElementById('ai-side-toggle').setAttribute('aria-expanded','true');renderLauncher();document.getElementById('ai-draft').focus();return;}
      if (e.key === 'Escape') {
        const openModals = [...document.querySelectorAll('.modal')].filter(m => !m.hidden);
        openModals.forEach(m => hideModal(m));
        document.getElementById('engine-list').hidden = true;
        window.LT_PROMPTS.closePalette(false);
        toggleShortcutHelp(false);
        dismissOnboarding();
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
      // "?" opens / closes the shortcut help; "t" focuses the to-do input (when the widget is on).
      if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (document.querySelector('.modal:not([hidden])')) return; // never open behind a dialog
        e.preventDefault();
        toggleShortcutHelp();
        return;
      }
      if ((e.key === 't' || e.key === 'T') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const todo = document.getElementById('todo-input');
        if (todo && widgetVisible('wtodo')) {
          e.preventDefault();
          todo.focus({ preventScroll: true });
          try { todo.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        }
      }
      if (/^[1-9]$/.test(e.key) && !typing) {
        const idx = +e.key - 1;
        const engines = allEngines();
        if (engines[idx]) {
          setEngine(engines[idx].id);
          state.settings.engine = engines[idx].id;
          Store.set(K.settings, state.settings);
          renderEngineList();
        }
      }
    });
    document.addEventListener('click', e => {
      const h = helpEl();
      if (h && !h.hidden && !h.contains(e.target)) toggleShortcutHelp(false);
    });

    bindSiteForm();
    window.LT_PROMPTS.bindPalette();
    bindSettings();
    bindCalSettings(); // subscribe / remove / toggle calendar feeds
    bindAvatar();
    renderAvatar(); // profile avatar is rendered once events are bound and sync state is reachable
    sweepPending(); // sweep expired / corrupted pending leftovers on boot
    renderStorageUse(); // data-management usage line (boot)
    maybeRemindBackup(); // interval backup nudge (opt-in, local-only)
    // Error capture (only active when settings.diag is on; messages stay local).
    window.addEventListener('error', (e) => diagPush((e && e.message) || 'window error'));
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e && e.reason;
      diagPush(reason && (reason.message || String(reason)) || 'unhandled promise rejection');
    });

    // Subscribed calendars: render from the local cache immediately so the dots are on first paint,
    // then refresh in the background (syncFeed skips feeds fetched within the freshness window).
    renderCalList();
    renderCalStatus();
    syncCalendars(false).catch(() => {});

    // Cloud sync init, last: the migration write-back has landed and every event is bound.
    if (window.LT_SYNC) {
      window.LT_SYNC.configure({ remoteApply: reloadFromStorage, onChange: renderSyncPanel });
      bindSyncPanel();
      renderSyncPanel();
      window.LT_SYNC.init();
    }

    // Plum blossom: rotate the wallpaper and show an inspirational quote along the bottom.
    bindPlumSecret();

    // Free canvas layout (draggable blocks): initialised last, once every block has rendered.
    window.LT_CANVAS.initCanvasLayout();
    // Onboarding hint, after the canvas settles so the search box has its final position.
    const onboardEl = document.getElementById('onboard-tip');
    if (onboardEl) {
      onboardEl.addEventListener('click', dismissOnboarding);
      document.getElementById('onboard-close').addEventListener('click', dismissOnboarding);
    }
    maybeShowOnboarding(raw);
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
    state, Store, K, ENGINES, allEngines, WIDGETS,
    t, engName, escapeHtml, nid, showToast,
    launchPrompt, setEngine, normalizeWidgets, normalizeWidgetPos,
    getCurrentEngine: () => currentEngine,
    getActivePrompt: () => activePrompt,
    openTemplateInSidebar: (p) => {
      state.settings.aiEnabled = true;
      Store.set(K.settings,state.settings);
      launcherTemplate = p;
      const targets = (p.targets || []).filter(id => ENGINES.some(e => e.id === id && e.ai));
      if (targets.length) launcherTargets = targets;
      const q = document.getElementById('q');
      if (q.value.trim() && q.value !== '/') launcherDraft = q.value;
      activePrompt = null;
      document.getElementById('tpl-chip').hidden = true;
      renderLauncher();
      document.getElementById('ai-launcher').hidden = false;
      document.getElementById('ai-side-toggle').setAttribute('aria-expanded', 'true');
      applyAiPosition();
      document.getElementById('ai-draft').focus();
    },
    setActivePrompt: (p) => { activePrompt = p; }
  };

  // Pure-function exports for the offline assertions in scripts/smoke.cjs
  // (same convention as window.LT_LUNAR / window.LT_SYNC).
  // Exposed for the offline probe harness: it has to drive port fallback and timeout paths with a
  // stubbed fetch, which is impossible from the outside.
  window.LT_PROBE_WB = probeWorkBuddy;
  window.LT_PURE = { looksLikeUrl, sanitizeWallpaperUrl, sanitizeIconDataUrl, iconCropRect, hostnameOf, iconFor, iconGlyphHtml, normalizeWidgets, normalizeWidgetPos, resolveTheme, todayStr, pickRotateCandidate, pickQuoteIndex, isFolder, makeFolder, folderMergeItems, folderRemoveChild, folderRename, normalizeFolderRecord, formatClock, calcEval, normalizeCalc, updateHistory, histMatches, nextHoliday, daysUntil, normalizeCountdown, pomoInitial, pomoAdvance, tempTrendPoints, sanitizeGroups, sanitizeCustomEngines, sanitizeHiddenEngines, sanitizeTodos, sanitizePrompts, sanitizeItems };

  // Boot resilience: a storage / extension-context failure mid-init must not leave a dead blank
  // tab — surface the generic message (the toast survives because it is static DOM).
  async function bootGuarded() {
    try {
      await boot();
      const params=new URLSearchParams(location.search),selection=params.get('selection');
      if(selection&&selection.startsWith('lt.selection.')&&hasChromeStorage){
        const result=await chrome.storage.local.get(selection),rec=result[selection];
        await chrome.storage.local.remove(selection);
        if(rec&&typeof rec.text==='string'&&Date.now()-rec.t<300000)launcherDraft=rec.text;
      }
      if((selection||params.get('ai')==='1')&&state.settings.aiEnabled!==false){
        const panel=document.getElementById('ai-launcher');panel.hidden=false;renderLauncher();document.getElementById('ai-side-toggle').setAttribute('aria-expanded','true');document.getElementById('ai-draft').focus();
        history.replaceState(null,'',location.pathname);
      }
    } catch (err) {
      console.error('[LightTab] boot failed', err);
      try {
        const box = document.getElementById('toast');
        if (box) {
          box.innerHTML = `<span>${escapeHtml(t('boot.fatal'))}</span>`;
          box.hidden = false;
        }
      } catch (_) { /* toast unavailable: nothing more we can do */ }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGuarded);
  } else {
    bootGuarded();
  }
})();

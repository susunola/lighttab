/* LightTab - app.js
   单文件逻辑：存储 / 壁纸 / 时钟 / 搜索 / 图标网格 / 设置 / 拖拽
   使用原生 HTML5 drag and drop，零外部依赖。
*/
(() => {
  'use strict';

  // ---------- 常量 ----------
  const ENGINES = [
    { id: 'baidu',    name: '百度',   url: 'https://www.baidu.com/s?wd={q}',                            color: '#2932e1' },
    { id: 'bing',     name: '必应',   url: 'https://www.bing.com/search?q={q}',                          color: '#008373' },
    { id: 'google',   name: '谷歌',   url: 'https://www.google.com/search?q={q}',                        color: '#4285F4' },
    { id: 'sogou',    name: '搜狗',   url: 'https://www.sogou.com/web?query={q}',                        color: '#fb6f19' },
    { id: 'github',   name: 'GitHub', url: 'https://github.com/search?q={q}&type=repositories',          color: '#1f2937' },
    { id: 'bilibili', name: 'B 站',   url: 'https://search.bilibili.com/all?keyword={q}',                color: '#fb7299' },
    // AI 对话：豆包 / ChatGPT 由通用注入脚本（js/inject-ai.js）自动填词并发送。
    // 明文不进 URL：扩展模式经 lt.pending.<nonce> 传递（URL 仅带 lt_auto=1&lt_k=<nonce>），预览模式退回 ?q= 明文
    { id: 'doubao',   name: '豆包 AI', url: 'https://www.doubao.com/chat/',                       color: '#3d8cff', ai: true, injected: true },
    { id: 'openai',   name: 'ChatGPT', url: 'https://chatgpt.com/',                               color: '#10a37f', ai: true, injected: true },
    // WorkBuddy 走官方 task 深链协议（workbuddy://task?action=start&prompt=...），拉起客户端并把 prompt 预填进新建任务草稿
    { id: 'wbai',     name: 'WorkBuddy', url: 'workbuddy://task?action=start&prompt={q}',        color: '#22d3ee', ai: true, deeplink: true }
  ];

  const WALLPAPERS = [
    { id: 'midnight', name: '暮色蓝', css: 'linear-gradient(135deg,#0b1426 0%,#152a4f 45%,#1c3d6e 100%)' },
    { id: 'aurora',   name: '极光',   css: 'linear-gradient(135deg,#0f1c3a 0%,#1e3a6e 50%,#2d5f8f 100%)' },
    { id: 'violet',   name: '暗夜紫', css: 'linear-gradient(135deg,#0f0a26 0%,#2b1b54 50%,#432e7a 100%)' },
    { id: 'teal',     name: '青黛',   css: 'linear-gradient(135deg,#0a1e25 0%,#0e3239 50%,#15525b 100%)' },
    { id: 'graphite', name: '石墨',   css: 'linear-gradient(135deg,#0e1117 0%,#1f242e 50%,#2a3038 100%)' },
    { id: 'rose',     name: '暮红',   css: 'linear-gradient(135deg,#1a0f1a 0%,#3d1b2e 50%,#5a2540 100%)' }
  ];

  const DEFAULT_SITES = [
    { id: nid(), title: '腾讯云',     url: 'https://cloud.tencent.com', color: '#0052D9' },
    { id: nid(), title: 'GitHub',     url: 'https://github.com',         color: '#1f2937' },
    { id: nid(), title: 'ChatGPT',    url: 'https://chatgpt.com',        color: '#10a37f' },
    { id: nid(), title: 'Gmail',      url: 'https://mail.google.com',    color: '#EA4335' },
    { id: nid(), title: '腾讯文档',   url: 'https://docs.qq.com',        color: '#1A6CFF' },
    { id: nid(), title: '企业微信',   url: 'https://work.weixin.qq.com', color: '#FF6F00' },
    { id: nid(), title: '知乎',       url: 'https://www.zhihu.com',      color: '#056DE8' },
    { id: nid(), title: '哔哩哔哩',   url: 'https://www.bilibili.com',   color: '#FB7299' },
    { id: nid(), title: '微信读书',   url: 'https://weread.qq.com',      color: '#3D7EFF' },
    { id: nid(), title: '微博',       url: 'https://weibo.com',          color: '#E6162D' }
  ];

  const DEFAULT_SETTINGS = {
    engine: 'baidu',
    name: '',
    wallpaper: WALLPAPERS[0],
    // 分组：{ id, name } 数组；为空 = 不启用分组（分组栏隐藏，站点弹窗不出现分组下拉）
    groups: [],
    // 自由画布布局：{ wclock/wcal/wtodo/search/grid: {x,y,w} }；null = 用默认两栏流式
    layout: null
  };

  // 内置 Prompt 模板：name 展示名 / tmpl 含 {q}（用户输入插槽）/ hint 选中后输入框占位 / targets 发射目标引擎
  // wb 仅当 targets 含 'wbai' 时生效：WorkBuddy 深链附加参数（expertId/model/mode/cwd）
  const DEFAULT_PROMPTS = [
    { id: nid(), name: '翻译成中文', tmpl: '请把下面的内容翻译成地道、通顺的中文，保留原有语气与格式：\n\n{q}', hint: '粘贴要翻译的外文内容…', targets: ['doubao', 'openai'] },
    { id: nid(), name: '翻译成英文', tmpl: 'Please translate the following into natural, fluent English, preserving tone and formatting:\n\n{q}', hint: '粘贴要翻译的中文内容…', targets: ['doubao', 'openai'] },
    { id: nid(), name: '中文润色', tmpl: '你是资深中文编辑。请润色下面的文字，使其更简洁、有力、通顺，并简要说明主要改动：\n\n{q}', hint: '粘贴要润色的文字…', targets: ['doubao', 'openai'] },
    { id: nid(), name: '代码解释', tmpl: '请逐段解释下面的代码在做什么，指出潜在问题与改进建议：\n\n{q}', hint: '粘贴代码…', targets: ['doubao', 'openai'] },
    { id: nid(), name: '周报整理', tmpl: '请把下面的工作记录整理成结构化周报，分「本周完成 / 进行中 / 风险 / 下周计划」四部分：\n\n{q}', hint: '粘贴本周工作流水…', targets: ['doubao', 'openai'] },
    { id: nid(), name: '总结要点', tmpl: '请把下面的内容提炼成要点列表，每条一行、按重要性排序，用中文输出：\n\n{q}', hint: '粘贴长文/会议记录…', targets: ['doubao', 'openai'] },
    { id: nid(), name: 'WorkBuddy 任务', tmpl: '请帮我完成以下任务：先给出执行计划，再逐步实施；涉及外部事实时给出依据：\n\n{q}', hint: '描述你想让 WorkBuddy 干的任务…', targets: ['wbai'] }
  ];

  // ---------- 工具 ----------
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
  function debounce(fn, ms) {
    let t = 0;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  // 焦点是否落在文本输入类元素上（输入框 / 多行框 / 下拉 / 可编辑区）
  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }
  function greetingFor(d) {
    const h = d.getHours();
    if (h >= 5 && h < 11) return '早上好';
    if (h >= 11 && h < 13) return '中午好';
    if (h >= 13 && h < 18) return '下午好';
    if (h >= 18 && h < 23) return '晚上好';
    return '夜深了';
  }
  function dateLine(d) {
    const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`;
  }
  // 农历（依赖 js/lunar.js 的 window.LT_LUNAR，缺失时静默降级为空）
  function lunarLine(d) {
    if (!window.LT_LUNAR) return '';
    const lu = window.LT_LUNAR.toLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (!lu) return '';
    const gz = window.LT_LUNAR.ganzhiYear(lu.year);
    const an = window.LT_LUNAR.animalYear(lu.year);
    const mo = window.LT_LUNAR.monthName(lu.month, lu.isLeap);
    const da = window.LT_LUNAR.dayName(lu.day);
    return `农历 ${mo}${da} · ${gz}${an}年`;
  }
  function pad2(n) { return String(n).padStart(2, '0'); }

  // ---------- Store（chrome.storage.local + localStorage 降级） ----------
  // 数据模型 schema 版本：结构变更（新增/改名/重解释字段）时 +1，并同步 migrateSchema()
  const SCHEMA_VERSION = 3;
  const K = { settings: 'lt.settings', items: 'lt.items', wallpaper: 'lt.wallpaper', todos: 'lt.todos', prompts: 'lt.prompts', schema: 'lt.schema' };
  // 临时 prompt 通道 key 前缀：非ce 传参（lt.pending.<nonce> = {p, t}），跨标签页传给注入脚本，读后即删
  const PENDING_PREFIX = 'lt.pending.';
  const PENDING_TTL = 30 * 60 * 1000; // 30 分钟未消费视为孤儿
  const hasChromeStorage = !!(window.chrome && chrome.storage && chrome.storage.local);
  // 各 key 的友好提示：保存失败时给用户可理解的反馈
  const KEY_TIPS = {
    [K.wallpaper]: '壁纸图片过大，未能保存（本次仍可预览，重开可能恢复默认）',
    [K.settings]: '设置保存失败',
    [K.items]: '快捷方式保存失败',
    [K.todos]: '待办保存失败',
    [K.prompts]: '模板保存失败'
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
        // 云同步：业务 key 写入后标记 dirty（未登录时 sync 模块内部直接忽略）
        if (window.LT_SYNC) window.LT_SYNC.onLocalWrite(key);
      } catch (err) {
        console.warn('[LightTab] 保存失败', key, err);
        // 存储写失败不阻塞主流程，但必须让用户知道（壁纸 dataURL 最易触顶配额）
        const tip = KEY_TIPS[key] || '数据保存失败（可能超出浏览器存储限制）';
        try { showToast(tip, null, null, 4200); } catch {}
      }
    }
  };
  function readJSON(k) {
    const v = localStorage.getItem(k);
    if (v == null) return undefined;
    try { return JSON.parse(v); } catch { return undefined; }
  }

  // ---------- 状态 ----------
  // 分组视图（仅本次会话，不持久化）：VIEW_ALL 全部 / VIEW_NONE 未分组 / 其它 = 分组 id
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
  let activePrompt = null; // 已选用待发射的模板对象（不持久化，仅本次会话）
  let clockTimer = null;

  // ---------- 壁纸 ----------
  function applyWallpaper(wp) {
    const el = document.getElementById('wallpaper');
    el.classList.toggle('bg-light', !!(wp && wp.type === 'image' && wp.light));
    if (!wp || !wp.type) {
      el.style.background = WALLPAPERS[0].css;
      return;
    }
    if (wp.type === 'image' && wp.value) {
      el.style.background = `center/cover no-repeat url("${wp.value}")`;
    } else if (wp.type === 'gradient' && wp.value) {
      el.style.background = wp.value;
    } else {
      el.style.background = WALLPAPERS[0].css;
    }
  }
  function pickWallpaperFromData(data) {
    if (data && data.type === 'image' && data.value) return data;
    if (data && data.type === 'gradient' && data.value) return data;
    // 兼容旧版：未保存 → 渐变默认
    return { type: 'gradient', value: WALLPAPERS[0].css };
  }
  async function setWallpaper(wp) {
    state.wallpaper = wp;
    applyWallpaper(wp);
    await Store.set(K.wallpaper, wp);
  }

  // ---------- 壁纸库（必应每日壁纸，经后端代理绕 CORS） ----------
  const WALL_LIB_BASE = 'https://lighttab.atomwangnus.com';
  let wallLibImages = null;

  // 渐变 swatch 渲染（顶层函数，供 bindSettings 与壁纸库应用后复用）
  function renderSwatches() {
    const swEl = document.getElementById('swatches');
    if (!swEl) return;
    const currentId = state.wallpaper?.type === 'gradient'
      ? WALLPAPERS.findIndex(w => w.css === state.wallpaper.value)
      : -1;
    swEl.innerHTML = WALLPAPERS.map((w, i) => `
      <div class="swatch ${i === currentId ? 'active' : ''}" data-i="${i}" style="background:${w.css}">
        <span class="label">${w.name}</span>
      </div>
    `).join('') + (state.wallpaper?.type === 'image' ? `
      <div class="swatch active" data-i="img" style="background:center/cover url('${state.wallpaper.value}')">
        <span class="label">自定义</span>
      </div>
    ` : '');
    swEl.querySelectorAll('.swatch').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.i === 'img') return;
        const w = WALLPAPERS[+el.dataset.i];
        setWallpaper({ type: 'gradient', value: w.css });
        renderSwatches();
      });
    });
  }

  async function fetchWallLib() {
    const btn = document.getElementById('btn-wall-fetch');
    const tip = document.getElementById('wall-lib-tip');
    if (btn) btn.disabled = true;
    if (tip) tip.textContent = '加载中…';
    try {
      const res = await fetch(WALL_LIB_BASE + '/v1/wallpapers?idx=0&n=8&mkt=zh-CN');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      wallLibImages = (data.images || []).filter(im => im && im.url);
      renderWallLibGrid();
      if (tip) tip.textContent = `已获取 ${wallLibImages.length} 张必应每日壁纸 · 点击应用（图片来源见版权信息）`;
    } catch (e) {
      wallLibImages = null;
      renderWallLibGrid();
      if (tip) tip.textContent = '壁纸库加载失败：' + (e && e.message || e) + '（需联网）';
    } finally {
      if (btn) btn.disabled = false;
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
        renderSwatches();
        renderWallLibGrid();
        showToast('已应用壁纸');
      });
    });
  }

  // ---------- 时钟 / 问候 ----------
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
      // 秒节点每秒更新；时分/问候/日期 chip 只在对应周期变化时才写 DOM
      secEl.textContent = ss;
      if (hh * 60 + mm !== lastMinute) {
        lastMinute = hh * 60 + mm;
        hhmmEl.textContent = `${pad2(hh)}:${pad2(mm)}`;
      }
      if (hh !== lastHour) {
        lastHour = hh;
        const nm = state.settings.name ? `，${state.settings.name}` : '';
        greetEl.textContent = `${greetingFor(d)}${nm}`;
        chipEl.textContent = `${d.getMonth() + 1}月${d.getDate()}日 · ${greetingFor(d).replace('好', '')}`;
      }
      const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (dayKey !== lastDay) {
        lastDay = dayKey;
        dateEl.textContent = dateLine(d);
        if (lunarEl) lunarEl.textContent = lunarLine(d);
      }
    }
    tick();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(tick, 1000);
  }

  // ---------- 引擎 ----------
  function setEngine(id) {
    const e = ENGINES.find(x => x.id === id) || ENGINES[0];
    currentEngine = e;
    const btn = document.getElementById('engine-btn');
    btn.querySelector('.eng-name').textContent = e.name;
    btn.querySelector('.eng-dot').style.background = `linear-gradient(135deg, ${e.color}, ${shade(e.color, 30)})`;
    document.getElementById('q').placeholder = `使用 ${e.name} 搜索，或输入网址回车`;
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
        <span>${e.name}</span>
        <span class="eng-key">${i + 1}</span>
      </li>
    `).join('');
  }
  // 打开结果页：默认当前标签内跳转（不留空白新标签）；按住 ⌘/Ctrl 则新标签打开
  function openResult(url, ev) {
    if (ev && (ev.metaKey || ev.ctrlKey)) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.href = url;
    }
  }
  function submitSearch(rawQuery, ev) {
    const q = (rawQuery || '').trim();
    // 已选用模板：输入内容 → 按模板多目标发射（不走普通搜索）
    if (activePrompt) {
      if (!q) { showToast('输入内容后按 Enter 发射（{q} 为内容插槽）', null, null, 3000); document.getElementById('q').focus(); return; }
      launchPrompt(activePrompt, q, ev);
      return;
    }
    if (!q) return;

    // AI 引擎：WorkBuddy 深链拉起并预填草稿；豆包 / ChatGPT 走 nonce 通道自动发送
    if (currentEngine.ai) {
      if (currentEngine.deeplink) {
        window.open(deepLinkUrl(currentEngine, q, null), '_blank');
        showToast('已拉起 WorkBuddy · Prompt 已预填，在窗口按 Enter 发送', null, null, 3600);
        return;
      }
      if (currentEngine.injected) {
        launchPrompt(null, q, ev); // 单引擎直发，沿用当前标签跳转语义
        return;
      }
      if (!currentEngine.copyOnly) {
        const u = currentEngine.url.replace('{q}', encodeURIComponent(q));
        if (u && u !== currentEngine.url) openResult(u, ev);
      }
      copyText(q);
      showToast('Prompt 已复制 · 对话页打开后 Ctrl+V 粘贴发送', null, null, 3200);
      return;
    }

    if (/^https?:\/\//i.test(q) || /\.[a-z]{2,}$/i.test(q) && !/\s/.test(q)) {
      const url = normalizeUrl(q);
      if (url) { openResult(url, ev); return; }
    }
    const u = currentEngine.url.replace('{q}', encodeURIComponent(q));
    openResult(u, ev);
  }

  // ---------- AI 发射（v1.8）：nonce 传递通道 + 多目标并发 ----------
  // 传递链路：newtab 把 prompt 写入 lt.pending.<nonce>（TTL 30 分钟）→ URL 只带 lt_k=<nonce>
  // → 目标站 content script（inject-ai.js）读扩展 storage 取词 → 发送后清 URL。
  // 不设"读后即删"：多目标并发共用一个 nonce，删了会互相踩；防重放靠发送后清 URL + 启动时清理过期孤儿。
  function sweepPending() {
    const now = Date.now();
    const drop = [];
    // raw 可能已是对象（chrome.storage 反序列化结果）也可能是 JSON 字符串（localStorage）
    const collect = (pairs) => {
      for (const [k, raw] of pairs) {
        try {
          const rec = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!rec || typeof rec.p !== 'string' || (now - (rec.t || 0)) > PENDING_TTL) drop.push(k);
        } catch (_) { drop.push(k); } // 结构损坏的残留一并清掉
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
      console.warn('[LightTab] 写 pending 失败，退回明文 URL', err);
      return null;
    }
  }
  // 注入型引擎 URL：扩展模式带 nonce（不落明文）；无 storage 时退回 ?q= 明文（预览模式）
  function injectedUrl(e, text, nonce) {
    if (!e || !e.url) return null;
    if (nonce) return e.url + '?lt_auto=1&lt_k=' + encodeURIComponent(nonce);
    return e.url + '?q=' + encodeURIComponent(text) + '&lt_auto=1';
  }
  // WorkBuddy 深链：prompt 预填 + 可选附加参数（expertId/model/mode/cwd）；官方对 prompt 有长度上限
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
  // 发射入口：tpl 为模板对象（含 tmpl/targets/wb）或 null（= 当前引擎直发 content）
  // 深链目标（workbuddy://）必须留在用户手势内同步 window.open，先发；网页目标走 storage nonce + 并发开标签
  async function launchPrompt(tpl, content, ev) {
    let text;
    if (tpl) {
      const tmpl = typeof tpl.tmpl === 'string' ? tpl.tmpl : '';
      text = tmpl.indexOf('{q}') !== -1 ? tmpl.replace(/\{q\}/g, content || '') : tmpl;
    } else {
      text = content || '';
    }
    if (!text.trim()) return showToast('内容为空，未发射', null, null, 2600);
    let targetIds = tpl ? (tpl.targets || []) : [currentEngine.id];
    targetIds = targetIds.filter(id => ENGINES.some(x => x.id === id));
    if (!targetIds.length) {
      if (tpl) targetIds = [currentEngine.id];
      if (!targetIds.length) return showToast('模板未配置可用发射目标');
    }
    const engs = targetIds.map(id => ENGINES.find(x => x.id === id)).filter(Boolean);
    const deeplinks = engs.filter(x => x.deeplink);
    const webs = engs.filter(x => !x.deeplink);
    let dlN = 0, webN = 0, blocked = false;
    for (const e of deeplinks) { try { window.open(deepLinkUrl(e, text, tpl && tpl.wb), '_blank'); dlN++; } catch (_) {} }
    if (webs.length) {
      const nonce = hasChromeStorage ? await putPending(text) : null;
      if (webs.length === 1) {
        // 单目标：沿用 openResult 语义（当前标签内跳转 / ⌘ 新标签）
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
    if (!webN && !dlN) return showToast('发射失败：没有成功打开任何目标');
    const names = engs.map(x => x.name).join(' · ');
    if (webN && dlN) showToast(`已拉起 WorkBuddy，并向 ${webN} 个网页目标发射`);
    else if (dlN) showToast('已拉起 WorkBuddy · Prompt 已预填，在窗口按 Enter 发送', null, null, 3600);
    else showToast(`已发射到 ${webN} 个目标：${names}`, null, null, blocked ? 4200 : 2600);
    if (blocked) setTimeout(() => showToast('若浏览器拦截了弹窗，请允许本站弹窗后重试', null, null, 3200), blocked ? 2600 : 0);
    if (tpl) { tpl.lastUsedAt = Date.now(); savePrompts(); }
    sparkFx();
    sweepPending();
    clearActiveTemplate();
  }

  // ---------- 发射动效签名：星火飞散（LightTab 视觉识别符） ----------
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

  // ---------- Prompt 模板 UI：选中态 / / 调色板 ----------
  function clearActiveTemplate() {
    activePrompt = null;
    const chip = document.getElementById('tpl-chip');
    if (chip) chip.hidden = true;
    setEngine(currentEngine.id); // 恢复默认占位文案
    const q = document.getElementById('q');
    if (q) q.value = '';
  }
  function renderTemplateChip(p) {
    const chip = document.getElementById('tpl-chip');
    if (!p || !chip) return;
    chip.innerHTML = '';
    const nm = document.createElement('span');
    nm.className = 'tpl-name';
    nm.textContent = p.name || '模板';
    nm.title = p.name || '模板';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'tpl-x';
    x.setAttribute('aria-label', '取消模板');
    x.textContent = '×';
    x.addEventListener('click', () => { clearActiveTemplate(); document.getElementById('q').focus(); });
    chip.append(nm, x);
    chip.hidden = false;
  }
  function chooseTemplate(p) {
    if (!p) return;
    closePalette(false);
    // 无 {q} 插槽 = 固定指令模板：选中即发射，不需要用户再输入
    if (p.tmpl.indexOf('{q}') === -1) { launchPrompt(p, ''); return; }
    activePrompt = p;
    renderTemplateChip(p);
    const q = document.getElementById('q');
    q.placeholder = p.hint || '输入内容，Enter 发射…';
    q.value = '';
    q.focus();
  }
  // 调色板：/ 唤起，过滤 + 键盘选择
  let palItems = [], palIdx = 0;
  function paletteRows() {
    const inp = document.getElementById('palette-q');
    const kw = (inp ? inp.value : '').trim().toLowerCase();
    const src = state.prompts.filter(p => p && typeof p.tmpl === 'string');
    if (!kw) {
      // 无关键词：最近使用过的浮顶（lastUsedAt 降序，稳定排序保证未用过的保持原序）
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
        return e ? `<i class="p-dot" style="background:${e.color}" title="${escapeHtml(e.name)}"></i>` : '';
      }).join('');
      const preview = (p.tmpl || '').replace(/\{q\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 46);
      return `
        <li class="${i === palIdx ? 'active' : ''}" data-i="${i}">
          <span class="p-name">${escapeHtml(p.name)}</span>
          <span class="p-dots">${dots || '<span class="p-nodots">未设目标</span>'}</span>
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
  // 模板管理（设置 → 模板）：行列表 + 内联编辑器
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
            return e ? `<span class="ptag" style="--pc:${e.color};background:${e.color}20;color:${e.color}">${escapeHtml(e.name)}</span>` : '';
          }).join('') || '<span class="ptag dim">未设目标</span>'}</span>
          <span class="pr-acts">
            <button class="btn ghost sm" data-act="edit">编辑</button>
            <button class="btn ghost sm danger" data-act="del">删除</button>
          </span>
        </div>
        ${promptEditingId === p.id ? promptEditorHtml(p) : ''}
      </div>`).join('');
    box.innerHTML = (state.prompts.length
      ? rows
      : '<div class="pr-empty">还没有模板：主界面按 / 打开模板面板即可选用；或点右上角「＋ 新建」创建。</div>')
      + (promptEditingId === 'new' ? promptEditorHtml(null) : '');
    box.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const row = b.closest('.prompt-row');
      const id = row ? row.dataset.id : null;
      if (b.dataset.act === 'edit') { promptEditingId = promptEditingId === id ? null : id; renderPromptManager(); }
      if (b.dataset.act === 'del') {
        const p = state.prompts.find(x => x.id === id);
        if (p && confirm(`删除模板「${p.name}」？`)) {
          state.prompts = state.prompts.filter(x => x.id !== id);
          promptEditingId = null;
          savePrompts();
          renderPromptManager();
          showToast('模板已删除');
        }
      }
    }));
    if (promptEditingId) bindPromptEditor();
  }
  function promptEditorHtml(p) {
    const t = p || { name: '', tmpl: '', hint: '', targets: [], wb: {} };
    const tg = t.targets || [];
    const wb = t.wb || {};
    return `
      <div class="prompt-editor" data-edit-id="${promptEditingId}">
        <label class="pe-field"><span class="pe-lbl">名称</span>
          <input class="pe-name" type="text" maxlength="24" placeholder="例如 翻译成中文" value="${escapeHtml(t.name || '')}"></label>
        <label class="pe-field"><span class="pe-lbl">提示词模板（{q} = 内容插槽；不含 {q} 则作为固定指令，选中即发射）</span>
          <textarea class="pe-tmpl" rows="3" maxlength="4000" placeholder="例如 请把下面的内容翻译成地道中文：&#10;&#10;{q}">${escapeHtml(t.tmpl || '')}</textarea></label>
        <label class="pe-field"><span class="pe-lbl">输入框占位提示（选用后显示）</span>
          <input class="pe-hint" type="text" maxlength="60" placeholder="例如 粘贴要翻译的内容…" value="${escapeHtml(t.hint || '')}"></label>
        <div class="pe-field"><span class="pe-lbl">发射目标（多选；勾选 WorkBuddy 可填附加参数）</span>
          <div class="pe-targets">${ENGINES.map(e => `
            <label class="pe-t"><input type="checkbox" value="${e.id}" ${tg.includes(e.id) ? 'checked' : ''}>
            <span class="ptag" style="--pc:${e.color};background:${e.color}20;color:${e.color}">${escapeHtml(e.name)}</span></label>`).join('')}
          </div>
        </div>
        <div class="wb-fields" ${tg.includes('wbai') ? '' : 'hidden'}>
          <span class="pe-lbl">WorkBuddy 附加参数（可选，官方深链：expertId / model / mode / cwd）</span>
          <div class="wb-grid">
            <input class="pe-wb" data-wbk="expertId" placeholder="expertId" value="${escapeHtml(wb.expertId || '')}">
            <input class="pe-wb" data-wbk="model" placeholder="model" value="${escapeHtml(wb.model || '')}">
            <input class="pe-wb" data-wbk="mode" placeholder="mode" value="${escapeHtml(wb.mode || '')}">
            <input class="pe-wb" data-wbk="cwd" placeholder="cwd" value="${escapeHtml(wb.cwd || '')}">
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-act="cancel">取消</button>
          <button type="button" class="btn primary" data-act="save">保存</button>
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
    if (!name) return showToast('请填写模板名称');
    if (!tmpl.trim()) return showToast('请填写提示词内容');
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
      if (state.prompts.length >= 30) return showToast('模板数量已达上限（30）');
      state.prompts.push({ id: nid(), ...rec });
    } else {
      const p = state.prompts.find(x => x.id === id);
      if (p) Object.assign(p, rec);
    }
    promptEditingId = null;
    savePrompts();
    renderPromptManager();
    showToast(id === 'new' ? '模板已添加' : '模板已保存');
  }

  // ---------- 图标网格 ----------
  // 快捷方式是否属于当前视图（全部 / 未分组 / 指定分组）
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
        ? '暂无快捷方式，点右下角 ＋ 添加'
        : '该视图暂无快捷方式，点右下角 ＋ 添加';
      grid.innerHTML = `<div class="grid-empty">${hint}</div>`;
      return;
    }
    grid.innerHTML = list.map(it => cardHtml(it)).join('');
    bindCardEvents();
  }
  // ---------- 图标渲染（全本地，零网络请求） ----------
  // 匹配链：完整 host → 剥 www host → 收录品牌主域尾缀（如 zh.wikipedia.org → wikipedia.org 未收录则跳过）
  // → 品牌色文字块兜底。ICONDB 见 js/icondb.js（simple-icons CC0 品牌 path + 品牌色）
  function iconFor(url) {
    let host = hostnameOf(url);
    if (!host) return null;
    const I = window.LT_ICONDB || {};
    if (I[host]) return I[host];
    if (host.startsWith('www.')) host = host.slice(4);
    if (I[host]) return I[host];
    for (const key of Object.keys(I)) {
      if (host !== key && host.endsWith('.' + key)) return I[key];
    }
    return null;
  }
  function cardHtml(it) {
    const host = hostnameOf(it.url) || it.title;
    const icon = iconFor(it.url);
    const bg = icon ? icon.c : (it.color || pickColor(host));
    const ink = inkOn(bg);
    const safeTitle = escapeHtml(it.title);
    // 文字兜底：中文标题取首字，否则取主机名首字母（大写）
    let letter = (it.title || '').trim().charAt(0);
    if (!/[\u4e00-\u9fa5]/.test(letter)) {
      const h = hostnameOf(it.url);
      letter = (h && h[0] ? h[0] : '?').toUpperCase();
    }
    return `
      <a class="card" href="${escapeHtml(it.url)}" data-id="${it.id}" draggable="true" target="_blank" rel="noopener" title="${safeTitle}">
        <div class="ico" style="background:${bg};color:${ink}">
          ${icon
            ? `<svg class="logo" viewBox="0 0 24 24" aria-hidden="true"><path fill="${ink}" d="${icon.d}"/></svg>`
            : `<span class="ini">${escapeHtml(letter)}</span>`}
        </div>
        <div class="title">${safeTitle}</div>
        <div class="card-actions">
          <span class="mini edit" data-act="edit" title="编辑">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </span>
          <span class="mini del" data-act="del" title="删除">
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
          { label: '在新标签页打开', action: () => window.open(a.href, '_blank', 'noopener') },
          { label: '复制链接', action: () => copyToClipboard(a.href) },
          { sep: true },
          { label: '编辑', action: () => openSiteModal(a.dataset.id) },
          { label: '删除', danger: true, action: () => deleteItem(a.dataset.id) }
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
        // 链接拖到地址栏也会打开 → 屏蔽默认链接拖拽影响视觉
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
        // 网格为横向多列布局：按水平中点判断插入目标卡片之前还是之后
        const before = (e.clientX - rect.left) < rect.width / 2;
        // 拖拽只在「当前视图可见」的卡片间发生：先对可见子集重排
        const scope = state.items.filter(inView);
        const fromIdx = scope.findIndex(x => x.id === dragId);
        const toIdx0 = scope.findIndex(x => x.id === a.dataset.id);
        if (fromIdx < 0 || toIdx0 < 0) return;
        const [moved] = scope.splice(fromIdx, 1);
        let toIdx = scope.findIndex(x => x.id === a.dataset.id);
        if (!before) toIdx += 1;
        scope.splice(toIdx, 0, moved);
        if (state.view === VIEW_ALL) {
          // 全部视图：可见子集即全集，直接写回
          state.items = scope;
        } else {
          // 分组/未分组视图：把可见槽位按新顺序重排，隐藏项锚定原位置不动
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
    // 撤销：闭包各自绑定删除时刻的 item 与索引，互不覆盖（连删多次也能各自正确恢复原位）
    showToast('已删除', '撤销', async () => {
      state.items.splice(Math.min(idx, state.items.length), 0, removed);
      await Store.set(K.items, state.items);
      syncUI();
    }, 5000);
  }

  // ---------- 右键菜单 ----------
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
      const t = e.target.closest('.item');
      if (!t) return;
      const act = items[+t.dataset.i];
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

  // ---------- 弹窗（站点） ----------
  // 分组下拉：无分组时整行隐藏；有分组时选中「编辑项的归属 / 当前视图分组」
  function fillGroupSelect(sel) {
    sel.innerHTML = '<option value="">未分组</option>' +
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
    if (id) {
      const it = state.items.find(x => x.id === id);
      if (!it) return;
      titleEl.textContent = '编辑快捷方式';
      form.elements['title'].value = it.title;
      form.elements['url'].value = it.url;
      form.dataset.editId = id;
    } else {
      titleEl.textContent = '添加快捷方式';
      delete form.dataset.editId;
    }
    if (!row.hidden) {
      fillGroupSelect(sel);
      // 预选：编辑→沿用原分组；新增→若当前正查看某分组则归入该组，否则未分组
      let cur = '';
      if (id) {
        cur = (state.items.find(x => x.id === id) || {}).group || '';
      } else if (state.view !== VIEW_ALL && state.view !== VIEW_NONE) {
        cur = state.view;
      }
      sel.value = state.settings.groups.some(g => g.id === cur) ? cur : '';
    }
    modal.hidden = false;
    setTimeout(() => form.elements['title'].focus(), 30);
  }
  function bindSiteForm() {
    const modal = document.getElementById('modal-site');
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.hidden = true));
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
    const form = document.getElementById('site-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = form.elements['title'].value.trim();
      const url = normalizeUrl(form.elements['url'].value);
      if (!title) return showToast('名称不能为空');
      if (!url) return showToast('网址格式不正确');
      const group = document.getElementById('f-group').value || '';
      const editId = form.dataset.editId;
      if (editId) {
        const it = state.items.find(x => x.id === editId);
        if (it) { it.title = title; it.url = url; it.group = group; }
      } else {
        state.items.push({ id: nid(), title, url, group });
      }
      await Store.set(K.items, state.items);
      modal.hidden = true;
      syncUI();
    });
  }

  // ---------- 分组 ----------
  // 网格 + 分组栏统一刷新（增删改拖后调用）
  function syncUI() {
    renderGrid();
    renderGroupBar();
  }
  function groupCount(fn) { return state.items.filter(fn).length; }
  function renderGroupBar() {
    const bar = document.getElementById('group-bar');
    bar.hidden = false; // 分组栏常驻可见（无分组时仅保留「＋ 新建分组」入口）
    const gs = state.settings.groups;
    // 无分组：仅保留「＋ 新建分组」入口（保证第一个分组可达）
    if (!gs.length) {
      bar.innerHTML = '<button type="button" class="gchip add" data-g="add">＋ 新建分组</button>';
      return;
    }
    const chip = (g, label, count, extra) => `
      <button type="button" class="gchip ${state.view === g ? 'active' : ''} ${extra || ''}" data-g="${g}">
        ${label}<span class="gcnt">${count}</span>
      </button>`;
    let html = chip(VIEW_ALL, '全部', state.items.length);
    html += chip(VIEW_NONE, '未分组', groupCount(it => !(it.group || '')));
    for (const g of gs) html += chip(g.id, escapeHtml(g.name), groupCount(it => (it.group || '') === g.id));
    html += '<button type="button" class="gchip add" data-g="add">＋ 新建分组</button>';
    if (state.view !== VIEW_ALL && state.view !== VIEW_NONE) {
      html += '<button type="button" class="gchip del" data-g="del">删除分组</button>';
    }
    bar.innerHTML = html;
  }
  // 分组栏交互：事件委托一次绑定（重渲染不重复）
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
  // ＋ 新建分组：chip 就地变成输入框，回车确认 / Esc 取消 / 失焦提交
  function startAddGroup(btn) {
    const input = document.createElement('input');
    input.className = 'gchip-input';
    input.placeholder = '分组名称';
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
        showToast('分组已存在');
        renderGroupBar();
        return;
      }
      state.settings.groups.push({ id: nid(), name });
      await Store.set(K.settings, state.settings);
      // 建组后直接进入该组视图，方便立刻往里加
      state.view = state.settings.groups[state.settings.groups.length - 1].id;
      syncUI();
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; input.remove(); renderGroupBar(); }
    });
    input.addEventListener('blur', commit);
  }
  // 删除分组：组内快捷方式移到「未分组」，数据不丢
  async function deleteGroup(id) {
    const g = state.settings.groups.find(x => x.id === id);
    if (!g) return;
    const n = groupCount(it => (it.group || '') === id);
    if (!confirm(`删除分组「${g.name}」？\n组内 ${n} 个快捷方式将移到「未分组」，不会被删除。`)) return;
    state.settings.groups = state.settings.groups.filter(x => x.id !== id);
    state.items.forEach(it => { if ((it.group || '') === id) it.group = ''; });
    state.view = VIEW_ALL;
    await Store.set(K.settings, state.settings);
    await Store.set(K.items, state.items);
    syncUI();
    showToast(`已删除分组「${g.name}」`);
  }

  // ---------- 数据导出 / 导入 ----------
  function exportPayload() {
    return {
      app: 'LightTab',
      version: '1.14.0',
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
      showToast('已导出数据文件（JSON）');
    } catch (err) {
      console.warn('[LightTab] 导出失败', err);
      showToast('导出失败');
    }
  }
  async function doImport(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return showToast('文件不是有效的 JSON'); }
    if (!data || typeof data !== 'object') return showToast('文件格式不正确');
    if (data.app && data.app !== 'LightTab') return showToast('不是 LightTab 的备份文件');
    const hasLocal = state.items.length || state.todos.length || state.prompts.length;
    if (hasLocal && !confirm('导入将覆盖当前全部数据（快捷方式/待办/模板/设置/壁纸），确定继续？')) return;
    const migrated = migrateSchema({
      settings: data.settings || {},
      items: data.items || [],
      wallpaper: data.wallpaper,
      todos: data.todos,
      prompts: data.prompts,
      schema: data.schema || 1
    });
    // 导入字段逐一校验兜底，保证任意来源的 JSON 都不会打崩页面
    state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), migrated.settings || {});
    if (!ENGINES.some(x => x.id === state.settings.engine)) state.settings.engine = 'baidu';
    if (!Array.isArray(state.settings.groups)) state.settings.groups = [];
    const gids = new Set(state.settings.groups.map(g => g.id));
    state.items = Array.isArray(migrated.items)
      ? migrated.items
          .filter(it => it && typeof it.url === 'string')
          .map(it => ({ id: it.id || nid(), title: String(it.title || '').slice(0, 32) || '未命名', url: it.url, group: gids.has(it.group) ? it.group : '' }))
      : [];
    state.wallpaper = pickWallpaperFromData(migrated.wallpaper);
    state.todos = Array.isArray(migrated.todos)
      ? migrated.todos.filter(t => t && typeof t.text === 'string').map(t => ({ id: t.id || nid(), text: t.text, done: !!t.done }))
      : [];
    // 模板：逐条校验（tmpl 必须字符串；targets 只保留已知引擎），坏项剔除
    const validTarget = id => ENGINES.some(x => x.id === id);
    state.prompts = Array.isArray(migrated.prompts)
      ? migrated.prompts
          .filter(p => p && typeof p.tmpl === 'string')
          .map(p => ({
            id: p.id || nid(),
            name: String(p.name || '').slice(0, 24) || '未命名模板',
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
    startClock(); // 刷新问候/名字（时钟文本按小时节流，导入跨小时段必须强制刷新）
    document.getElementById('modal-set').hidden = true;
    syncUI();
    renderTodos();
    showToast(`导入完成：${state.items.length} 个快捷方式 · ${state.todos.length} 条待办`);
    reinitCanvas(); // 导入可能带入/清空 layout 坐标，重新同步画布
  }
  // 从书签导入：走 optional_permissions（bookmarks），首次点击时请求授权
  async function importBookmarks() {
    if (!window.chrome || !chrome.permissions || !chrome.bookmarks) {
      showToast('书签导入需在 Chrome 扩展中启用，当前预览模式不可用');
      return;
    }
    let granted = true;
    // 已授权时 chrome.bookmarks 存在；未授权先请求（用户手势内发起）
    if (!chrome.bookmarks) {
      try { granted = await chrome.permissions.request({ permissions: ['bookmarks'] }); } catch { granted = false; }
    }
    if (!granted) { showToast('未授权书签权限，导入已取消'); return; }
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
          if (!title) { const h = hostnameOf(u); title = h.split('.')[0] || '书签'; }
          hits.push({ id: nid(), title: title.slice(0, 32), url: u, color: pickColor(u), group: targetGroup });
        } else if (n.children) {
          walk(n.children);
        }
      }
    })(tree);
    if (!hits.length) {
      showToast(dup ? `没有导入新书签（跳过 ${dup} 个重复）` : '书签列表为空');
      return;
    }
    state.items.push(...hits);
    await Store.set(K.items, state.items);
    syncUI();
    showToast(`已导入 ${hits.length} 个书签` + (dup ? `，跳过 ${dup} 个重复` : '') + (targetGroup ? '（归入当前分组）' : ''));
  }

  // ---------- 弹窗（设置 / 壁纸） ----------
  function bindSettings() {
    const modal = document.getElementById('modal-set');
    const tabs = modal.querySelectorAll('.tab');
    const panes = modal.querySelectorAll('.tab-pane');

    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => modal.hidden = true));
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.toggle('active', x === t));
      const key = t.dataset.tab;
      panes.forEach(p => p.hidden = p.dataset.pane !== key);
      if (key === 'prompt') renderPromptManager(); // 每次进入模板页同步最新数据
    }));
    document.getElementById('f-upload').addEventListener('change', onUpload);
    document.getElementById('btn-reset-wall').addEventListener('click', () => {
      setWallpaper({ type: 'gradient', value: WALLPAPERS[0].css });
      renderSwatches();
      showToast('已恢复默认渐变');
    });
    document.getElementById('btn-wall-fetch').addEventListener('click', fetchWallLib);
    document.getElementById('btn-reset-all').addEventListener('click', resetAll);
    // 模板管理（设置 → 模板）：＋ 新建
    document.getElementById('btn-prompt-add').addEventListener('click', () => {
      promptEditingId = promptEditingId === 'new' ? null : 'new';
      renderPromptManager();
      const ed = document.querySelector('#prompt-manage .prompt-editor');
      if (ed) { ed.scrollIntoView({ block: 'nearest' }); ed.querySelector('.pe-name').focus(); }
    });

    // 数据管理：导出 JSON / 导入 JSON / 从书签导入（书签走 optional_permissions，点击时请求授权）
    document.getElementById('btn-export').addEventListener('click', doExport);
    const fImport = document.getElementById('f-import');
    document.getElementById('btn-import').addEventListener('click', () => fImport.click());
    fImport.addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) doImport(f);
      e.target.value = '';
    });
    document.getElementById('btn-import-bookmarks').addEventListener('click', importBookmarks);

    // 常规
    const nameInput = document.getElementById('f-name');
    const engineSel = document.getElementById('f-engine');
    engineSel.innerHTML = ENGINES.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
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

    document.getElementById('btn-wall').addEventListener('click', () => openSet('wall'));
    document.getElementById('btn-set').addEventListener('click', () => openSet('gen'));

    function openSet(tab) {
      const t = modal.querySelector(`.tab[data-tab="${tab}"]`);
      t.click();
      nameInput.value = state.settings.name || '';
      engineSel.value = state.settings.engine;
      renderSwatches();
      renderWallLibGrid();
      modal.hidden = false;
    }
  }
  // ---------- 云同步设置面板 ----------
  function syncStatusText(st) {
    switch (st.status) {
      case 'syncing': return '同步中…';
      case 'offline': return '离线，已保留本地修改';
      case 'error': return st.lastError || '同步出错';
      default: return st.lastSyncAt ? '已同步' : '待同步';
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
      panel.innerHTML = `
        <p class="form-tip">登录后可在多台设备间同步快捷方式、待办、设置、壁纸与模板。数据经 HTTPS 加密传输，密码仅存加密哈希，本地数据始终可用。</p>
        <label><span>邮箱</span><input id="sync-email" type="email" autocomplete="email" placeholder="you@example.com"></label>
        <label><span>密码</span><input id="sync-pass" type="password" autocomplete="current-password" placeholder="至少 8 位"></label>
        <div class="sync-err" id="sync-err" hidden></div>
        <div class="sync-actions">
          <button type="button" class="btn primary" data-sync="login">登录</button>
          <button type="button" class="btn ghost" data-sync="register">注册新账号</button>
        </div>`;
    } else {
      const dot = st.status === 'syncing' ? 'busy' : (st.status === 'error' || st.status === 'offline' ? 'warn' : 'ok');
      panel.innerHTML = `
        <div class="sync-row">
          <span class="data-label">已登录</span>
          <span class="sync-email">${escapeHtml(st.email)}</span>
        </div>
        <div class="sync-status">
          <span class="dot ${dot}"></span>
          <span>${escapeHtml(syncStatusText(st))}</span>
          ${st.lastSyncAt ? `<span class="sync-time">${fmtSyncTime(st.lastSyncAt)}</span>` : ''}
        </div>
        <div class="sync-actions">
          <button type="button" class="btn ghost sm" data-sync="now">立即同步</button>
          <button type="button" class="btn ghost sm" data-sync="logout">登出</button>
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
        if (!email) { syncShowErr('请输入邮箱'); return; }
        if (pass.length < 8) { syncShowErr('密码至少 8 位'); return; }
        btn.disabled = true;
        const r = action === 'login'
          ? await window.LT_SYNC.login(email, pass)
          : await window.LT_SYNC.register(email, pass);
        btn.disabled = false;
        if (!r.ok) { syncShowErr(r.error); renderSyncPanel(); return; }
        if (errEl) errEl.hidden = true;
        showToast('登录成功，正在同步…');
      } else if (action === 'logout') {
        await window.LT_SYNC.logout();
        showToast('已登出');
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
    if (f.size > 4 * 1024 * 1024) return showToast('图片超过 4MB，请压缩后再试');
    const dataUrl = await compressImage(f, 2560, 0.82);
    const light = await isLightImage(dataUrl);
    await setWallpaper({ type: 'image', value: dataUrl, light });
    document.getElementById('swatches').querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
    showToast('壁纸已应用');
    // 触发设置面板刷新
    document.getElementById('btn-wall').click();
    document.getElementById('swatches').querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  }
  // 判定图片整体亮度（缩略采样），浅色图用于加深遮罩
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

  // ---------- Toast ----------
  function showToast(text, actionLabel, action, ttl) {
    const t = document.getElementById('toast');
    t.innerHTML = `<span>${escapeHtml(text)}</span>` +
      (actionLabel ? `<button>${escapeHtml(actionLabel)}</button>` : '');
    t.hidden = false;
    if (actionLabel) {
      t.querySelector('button').addEventListener('click', () => {
        action && action();
        t.hidden = true;
      });
    }
    if (ttl) setTimeout(() => t.hidden = true, ttl);
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
    showToast('已复制到剪贴板');
  }

  // ---------- 待办 widget ----------
  function renderTodos() {
    const list = document.getElementById('todo-list');
    const countEl = document.getElementById('todo-count');
    const done = state.todos.filter(t => t.done).length;
    countEl.textContent = done + '/' + state.todos.length;
    if (!state.todos.length) {
      list.innerHTML = '<li class="todo-empty">今天要做点什么？</li>';
      return;
    }
    list.innerHTML = state.todos.map(t => `
      <li class="todo-item ${t.done ? 'done' : ''}" data-id="${t.id}">
        <span class="t-check"></span>
        <span class="t-text">${escapeHtml(t.text)}</span>
        <span class="t-del" title="删除">×</span>
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
      const todo = state.todos.find(t => t.id === item.dataset.id);
      if (!todo) return;
      if (e.target.closest('.t-del')) {
        state.todos = state.todos.filter(t => t.id !== todo.id);
      } else {
        todo.done = !todo.done;
      }
      await saveTodos();
      renderTodos();
    });
    renderTodos();
  }

  // ---------- 日历 widget（纯本地月历，含农历日；零网络请求） ----------
  const calCursor = { y: 0, m: 0 }; // 当前显示年月；0 表示跟随今天
  function renderCalendar() {
    const title = document.getElementById('cal-title');
    const grid = document.getElementById('cal-grid');
    if (!title || !grid) return;
    const now = new Date();
    if (!calCursor.y) { calCursor.y = now.getFullYear(); calCursor.m = now.getMonth() + 1; }
    const y = calCursor.y, m = calCursor.m;
    title.textContent = `${y}年${m}月`;
    const startDow = new Date(y, m - 1, 1).getDay(); // 0=周日
    const daysInMonth = new Date(y, m, 0).getDate();
    const isThisMonth = y === now.getFullYear() && m === now.getMonth() + 1;
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<span class="cal-cell empty"></span>');
    for (let d = 1; d <= daysInMonth; d++) {
      let lday = '';
      if (window.LT_LUNAR) {
        const lu = window.LT_LUNAR.toLunar(y, m, d);
        if (lu) lday = window.LT_LUNAR.dayName(lu.day);
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

  // ---------- 重置 ----------
  async function resetAll() {
    if (!confirm('确认重置所有数据？\n（名称、引擎、壁纸、快捷方式、分组、模板、待办都会被清空）')) return;
    state.settings = structuredClone(DEFAULT_SETTINGS);
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
    showToast('已恢复默认数据');
    reinitCanvas(); // 重置清空 layout 坐标，回到默认画布
  }

  // ---------- Schema 迁移 ----------
  // 结构变更流程：SCHEMA_VERSION +1 → 在 MIGRATIONS 补 from:升一版的迁移函数 → 老数据读取时自动逐级迁移
  const MIGRATIONS = {
    // v1 → v2：分组（settings.groups 数组 + 每个快捷方式 group 字段，默认空串=未分组）
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
    // v2 → v3：Prompt 模板库（lt.prompts）。老用户缺省注入内置模板集；空数组视为用户已清空，不重复注入
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
      console.warn('[LightTab] 数据迁移中断于 schema', v, '/', SCHEMA_VERSION);
    }
    cur.schema = SCHEMA_VERSION;
    return cur;
  }

  // 从持久层读数据 → 迁移 → 填充内存 state（纯读，不写 storage；云同步拉取覆盖后复用）
  async function loadDataIntoState() {
    const raw = await Store.getAll();
    const data = migrateSchema(raw);
    state.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), data.settings || {});
    state.items = (data.items && data.items.length) ? data.items : structuredClone(DEFAULT_SITES);
    state.wallpaper = pickWallpaperFromData(data.wallpaper);
    state.todos = Array.isArray(data.todos) ? data.todos : [];
    // 模板：空数组合法（用户全删过），undefined 才兜底默认集（首次运行或 v2 迁移已由 MIGRATIONS[2] 注入）
    state.prompts = Array.isArray(data.prompts) ? data.prompts : structuredClone(DEFAULT_PROMPTS);
    return { raw, data };
  }

  // 云同步拉取覆盖本地后：刷新内存 state + 重渲染数据型 UI（不重绑事件）
  async function reloadFromStorage() {
    await loadDataIntoState();
    applyWallpaper(state.wallpaper);
    setEngine(state.settings.engine);
    renderEngineList();
    syncUI();
    renderTodos();
    renderCalendar();
    startClock(); // 问候/名字可能被远程更新
    const nameInput = document.getElementById('f-name');
    if (nameInput) nameInput.value = state.settings.name || '';
    const engineSel = document.getElementById('f-engine');
    if (engineSel) engineSel.value = state.settings.engine;
  }

  // ---------- 自由画布布局（块自由拖拽移动） ----------
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
  }

  // 首次进入画布：测量当前流式视觉位置 → 固化坐标（切换绝对定位零跳变）
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
    root.style.height = (maxBottom + 90) + 'px';
  }

  function injectDragHandles() {
    for (const b of blockEls()) {
      if (b.el.querySelector('.drag-handle')) continue;
      const h = document.createElement('span');
      h.className = 'drag-handle';
      h.title = '拖拽移动';
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
      // 非手柄：仅空白区域可拖（交互元素正常点击，不触发拖拽）
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
      if (!moved) return; // 未超过阈值：视为点击，不写坐标
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

  // 根据当前窗口宽度与 layout 数据，切回流式或进入画布（可重复调用：导入/重置后复用）
  function reinitCanvas() {
    leaveCanvas();
    if (!canvasEligible()) return;
    if (getLayout()) applyCanvas();
    else { captureLayout(); applyCanvas(); }
  }

  function initCanvasLayout() {
    injectDragHandles();
    bindBlockDrag();

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => refreshCanvasHeight());
      blockEls().forEach(b => ro.observe(b.el));
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

  // ---------- 启动 ----------
  async function boot() {
    const { raw, data } = await loadDataIntoState();
    // 若迁移后版本有变化则回写持久层：schema + 迁移过程中被补齐/改写的各 key（保证磁盘数据与内存一致）
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

    // 搜索
    const form = document.getElementById('search-form');
    const qEl = document.getElementById('q');
    form.addEventListener('submit', e => { e.preventDefault(); submitSearch(qEl.value, e); });
    document.getElementById('search-go').addEventListener('click', e => submitSearch(qEl.value, e));
    // 模板选中态下按 Esc：撤销模板回到普通搜索
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

    // 快捷键（焦点在输入类元素时不抢键）
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
        // 模板调色板：焦点不在输入区、或在空的搜索框上时按 / 打开（输入框有字则视为普通字符）
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
    sweepPending(); // 启动即清理过期/损坏的 pending 残留

    // 云同步初始化（放最后：确保上面的迁移回写已落盘、事件已绑定）
    if (window.LT_SYNC) {
      window.LT_SYNC.configure({ remoteApply: reloadFromStorage, onChange: renderSyncPanel });
      bindSyncPanel();
      renderSyncPanel();
      window.LT_SYNC.init();
    }

    // 浮动添加按钮
    document.getElementById('add-float').addEventListener('click', () => openSiteModal(null));

    // 自由画布布局（块拖拽移动）：最后初始化，确保所有块已渲染
    initCanvasLayout();

    // 自检
    if (!hasChromeStorage) {
      // 仅首次给提示
      // 延迟以免阻塞首屏
      setTimeout(() => {
        const tip = document.createElement('div');
        tip.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(20,26,44,.92);color:#fff;padding:8px 14px;border-radius:10px;font-size:12px;z-index:200;border:1px solid rgba(255,255,255,.18)';
        tip.textContent = '当前为浏览器直接预览模式（未安装扩展），数据保存在 localStorage。';
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 4000);
      }, 600);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

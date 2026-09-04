#!/usr/bin/env node
/* LightTab 离线冒烟检查（纯 node，零依赖）
 * 用法：node scripts/smoke.cjs   —— 退出码非 0 即失败
 *
 * 覆盖：
 *  1) 全部 js 文件语法校验（等价 node --check）
 *  2) manifest.json 是合法 JSON 且 manifest_version === 3
 *  3) 版本号一致：manifest.json / newtab.html ver-line / app.js exportPayload() /
 *     js/i18n.js 的 gen.version（中英两份）
 *  4) 纯函数断言：looksLikeUrl（URL 识别）、lunar 已知日期换算、iconFor 后缀匹配、
 *     sanitizeWallpaperUrl 白名单、sanitizeIconDataUrl（#50 自定义图标守卫）、
 *     resolveTheme（dark/light/system 映射）、
 *     todayStr / pickRotateCandidate（#49 壁纸轮换纯逻辑）、i18n 字典 zh/en 完整性
 *  5) newtab.html 结构完整（读取时剥离 preview 面板实时注入的 data-page-node-id）
 *  6) #48 主题静态结构：html 默认 data-theme、#f-theme 三选项、主题词条钩子
 *  7) #49 壁纸轮换静态结构：#f-wall-rotate 复选框、词条钩子、K 映射含 walllib/rot
 *  8) #50 自定义图标静态结构：#f-icon 上传、预览、移除、icon 字段导入/渲染钩子
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let failures = 0;

function ok(name) { console.log('  ok  ' + name); }
function fail(name, detail) {
  failures++;
  console.error('FAIL  ' + name + (detail ? ' —— ' + detail : ''));
}
function assert(cond, name, detail) { cond ? ok(name) : fail(name, detail); }

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- 1) JS 语法 ----------
console.log('[1] node --check');
const JS_FILES = ['js/app.js', 'js/canvas.js', 'js/prompts.js', 'js/sync.js', 'js/inject-ai.js', 'js/lunar.js', 'js/icondb.js', 'js/i18n.js'];
for (const f of JS_FILES) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' });
    ok(f);
  } catch (e) {
    fail(f, String(e.stderr || e.message).trim().split('\n')[0]);
  }
}

// ---------- 2) manifest ----------
console.log('[2] manifest.json');
let manifest = null;
try {
  manifest = JSON.parse(read('manifest.json'));
  ok('manifest.json 是合法 JSON');
} catch (e) {
  fail('manifest.json 是合法 JSON', e.message);
}
if (manifest) {
  assert(manifest.manifest_version === 3, 'manifest_version === 3', String(manifest.manifest_version));
}

// ---------- 3) 版本号一致（i18n 后 ver-line 的实际渲染源是 js/i18n.js 的 gen.version） ----------
console.log('[3] 版本号一致性');
// preview 面板会实时回注 data-page-node-id（含注入到 select/input 标签内部），
// 属开发环境噪声、非源文件缺陷，故读取后先剥离再断言。
const htmlRaw = read('newtab.html');
const html = htmlRaw.replace(/\s*data-page-node-id="[^"]*"/g, '');
const appSrc = read('js/app.js');
const canvasSrc = read('js/canvas.js'); // 画布布局已从 app.js 拆出（v1.18.1）
const cssSrc = read('css/style.css');
const i18nSrc = read('js/i18n.js');
const mHtml = html.match(/ver-line[^>]*>\s*LightTab v(\d+\.\d+\.\d+)/);
const mApp = appSrc.match(/\bversion:\s*'(\d+\.\d+\.\d+)'/);
const mI18nZh = i18nSrc.match(/'gen\.version':\s*\{\s*zh:\s*'LightTab v(\d+\.\d+\.\d+)/);
const mI18nEn = i18nSrc.match(/'gen\.version':\s*\{[^}]*en:\s*'LightTab v(\d+\.\d+\.\d+)/);
assert(!!mHtml, 'newtab.html ver-line 含版本号（data-i18n 兜底文本）', mHtml && mHtml[0]);
assert(!!mApp, 'app.js exportPayload 含版本号');
assert(!!mI18nZh && !!mI18nEn, 'i18n.js gen.version 中英两份均含版本号');
if (manifest && mHtml && mApp && mI18nZh && mI18nEn) {
  const vs = [manifest.version, mHtml[1], mApp[1], mI18nZh[1], mI18nEn[1]];
  assert(vs.every(v => v === vs[0]), `五处版本一致（${vs[0]}）`, `manifest/html/app/i18n.zh/i18n.en = ${vs.join('/')}`);
}

// ---------- 4) 纯函数断言 ----------
console.log('[4] 纯函数');

// 4a) lunar.js：已知日期 2024-02-10 = 甲辰龙年 正月初一（春节）
{
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/lunar.js'), sandbox, { filename: 'lunar.js' });
  const L = sandbox.window.LT_LUNAR;
  assert(!!L, 'lunar.js 暴露 window.LT_LUNAR');
  if (L) {
    const lu = L.toLunar(2024, 2, 10);
    assert(!!lu && lu.year === 2024 && lu.month === 1 && lu.day === 1 && lu.isLeap === false,
      'toLunar(2024-02-10) = 2024 正月初一', JSON.stringify(lu));
    assert(L.ganzhiYear(2024) === '甲辰' && L.animalYear(2024) === '龙', '2024 = 甲辰龙年',
      L.ganzhiYear(2024) + L.animalYear(2024));
    assert(L.monthName(1, false) === '正月' && L.dayName(1) === '初一', '月名/日名换算');
  }
}

// 4b) app.js：用桩环境加载 IIFE（document.readyState='loading' → boot 不执行），取 window.LT_PURE
{
  const noop = () => {};
  const elStub = { addEventListener: noop };
  const sandbox = {
    document: { readyState: 'loading', addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, key: () => null, length: 0 },
    navigator: {},
    structuredClone,
    URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('js/app.js'), sandbox, { filename: 'app.js' });
  const P = sandbox.LT_PURE;
  assert(!!P, 'app.js 暴露 window.LT_PURE');
  if (P) {
    // looksLikeUrl：裸域名带路径/查询应识别为 URL；含空格的搜索词不误判
    const urlCases = [
      ['github.com', true], ['github.com/susunola', true],
      ['example.com/path?q=a#f', true], ['https://foo.bar/x y', true],
      ['hello world', false], ['搜索 关键词', false], ['foo.c', false], ['a .com', false]
    ];
    for (const [input, want] of urlCases) {
      assert(P.looksLikeUrl(input) === want, `looksLikeUrl(${JSON.stringify(input)}) === ${want}`);
    }
    // sanitizeWallpaperUrl：白名单 + 拒绝注入字符
    assert(P.sanitizeWallpaperUrl('data:image/jpeg;base64,AAAA') !== null, '允许 data:image/');
    assert(P.sanitizeWallpaperUrl('https://cdn.example.com/w.jpg') !== null, '允许 https:');
    assert(P.sanitizeWallpaperUrl("https://x.com/a');alert(1);//") === null, '拒绝含引号的 URL');
    assert(P.sanitizeWallpaperUrl('javascript:alert(1)') === null, '拒绝 javascript:');
    assert(P.sanitizeWallpaperUrl('http://x.com/a.jpg') === null, '拒绝 http:');
    // sanitizeIconDataUrl：#50 自定义图标只收本地 base64 光栅图（png/jpeg/webp/gif）
    assert(P.sanitizeIconDataUrl('data:image/png;base64,iVBORw0KGgo=') !== null, '允许 data:image/png;base64');
    assert(P.sanitizeIconDataUrl('data:image/jpeg;base64,/9j/4AAQ') !== null, '允许 data:image/jpeg;base64');
    assert(P.sanitizeIconDataUrl('data:image/webp;base64,UklGR') !== null, '允许 data:image/webp;base64');
    assert(P.sanitizeIconDataUrl('data:image/svg+xml;base64,PHN2Zz4=') === null, '拒绝 svg dataURL');
    assert(P.sanitizeIconDataUrl('https://cdn.example.com/logo.png') === null, '拒绝远程 URL');
    assert(P.sanitizeIconDataUrl('data:text/html;base64,PGI+') === null, '拒绝非图片 dataURL');
    assert(P.sanitizeIconDataUrl("data:image/png;base64,AB'CD") === null, '拒绝含引号的 dataURL');
    assert(P.sanitizeIconDataUrl('data:image/png;base64,' + 'A'.repeat(140 * 1024)) === null, '拒绝超 128KiB 的图标');
    // iconCropRect：内容感知方形裁切（竖图去 tagline）
    const dense = (n) => Array(n).fill(0.6);
    let R = P.iconCropRect(300, 600, dense(600));
    assert(R.sx === 0 && R.sy === 0 && R.side === 300, '竖图无空隙 → 顶部正方形', JSON.stringify(R));
    R = P.iconCropRect(300, 600, dense(200).concat(Array(400).fill(0)));
    assert(R.sx === 50 && R.sy === 0 && R.side === 200, '竖图下有空隙 → 只取首块（图标）', JSON.stringify(R));
    R = P.iconCropRect(400, 400, dense(400));
    assert(R.sx === 0 && R.sy === 0 && R.side === 400, '近方形 → 全图', JSON.stringify(R));
    R = P.iconCropRect(600, 300, null);
    assert(R.sx === 150 && R.sy === 0 && R.side === 300, '宽图 → 中心裁方', JSON.stringify(R));
    R = P.iconCropRect(300, 600, dense(200).concat(Array(200).fill(0)).concat(dense(200)));
    assert(R.sx === 50 && R.sy === 0 && R.side === 200, '图标+空隙+tagline → 只取首块', JSON.stringify(R));
    // iconFor：精确命中 + 主域尾缀匹配 + 未收录返回 null
    sandbox.LT_ICONDB = { 'github.com': { c: '#1f2937', d: 'M0 0' }, 'wikipedia.org': { c: '#000', d: 'M1 1' } };
    assert(P.iconFor('https://github.com/susunola')?.d === 'M0 0', 'iconFor 精确匹配 github.com');
    assert(P.iconFor('https://zh.wikipedia.org/wiki/X')?.d === 'M1 1', 'iconFor 尾缀匹配 wikipedia.org');
    assert(P.iconFor('https://no-such-host-zzz.example/') === null, 'iconFor 未收录返回 null');
    // #59 iconGlyphHtml：三种条目形态各自渲染成正确的矢量标记
    assert(P.iconGlyphHtml({ d: 'M0 0', c: '#1f2937' }).includes('<path fill="'), 'iconGlyphHtml 单色 → 单 path');
    const gMulti = P.iconGlyphHtml({ p: [{ d: 'M0 0', f: '#EA4335' }, { d: 'M1 1', f: '#4285F4' }], c: '#FFFFFF' });
    assert((gMulti.match(/<path /g) || []).length === 2 && gMulti.includes('#EA4335') && gMulti.includes('#4285F4'),
      'iconGlyphHtml 多色 → 每个子路径带自己的 fill', gMulti);
    const gTx = P.iconGlyphHtml({ tx: '51CTO', c: '#FFFFFF', f: '#E60012' });
    assert(gTx.includes('logo-tx') && gTx.includes('>51CTO<') && gTx.includes('#E60012'),
      'iconGlyphHtml 字标 → <text> + 品牌色', gTx);
    assert(P.iconGlyphHtml({ tx: '<img src=x>', c: '#fff', f: '#000' }).includes('&lt;img'),
      'iconGlyphHtml 字标转义 HTML');
    // 字数越多字号越小，保证长字标不溢出图标框
    const fsOf = (s) => Number(/font-size="([\d.]+)"/.exec(P.iconGlyphHtml({ tx: s, c: '#fff', f: '#000' }))[1]);
    assert(fsOf('O') > fsOf('文档') && fsOf('文档') > fsOf('小鹅通') && fsOf('小鹅通') > fsOf('51CTO'),
      'iconGlyphHtml 字标字号随字数递减');
    // #60 normalizeWidgets：缺省/脏数据一律回落到"可见"，只有显式 false 才算移除
    const NW = P.normalizeWidgets;
    assert(JSON.stringify(NW(undefined)) === JSON.stringify({ wclock: true, wcal: true, wtodo: true, wmovie: true }),
      'normalizeWidgets(undefined) → 四个全可见');
    assert(JSON.stringify(NW(null)) === JSON.stringify({ wclock: true, wcal: true, wtodo: true, wmovie: true }),
      'normalizeWidgets(null) → 四个全可见');
    assert(NW({ wcal: false }).wcal === false && NW({ wcal: false }).wclock === true,
      'normalizeWidgets 部分对象 → 缺的补 true');
    assert(NW({ wclock: 0, wcal: '', wtodo: null }).wclock === true,
      'normalizeWidgets 只认显式 false，其它假值仍可见');
    assert(NW({ bogus: false }).wclock === true && !('bogus' in NW({ bogus: false })),
      'normalizeWidgets 丢弃未知键');
    assert(Object.values(NW({ wclock: false, wcal: false, wtodo: false, wmovie: false })).every((v) => v === false),
      'normalizeWidgets 允许四个全移除（左栏整列收起）');
    // resolveTheme：'dark'/'light' 直接映射；'system' 在无 matchMedia 时回退深色，有 matchMedia 时跟随系统
    assert(P.resolveTheme('dark') === 'dark' && P.resolveTheme('light') === 'light', 'resolveTheme 固定 dark/light');
    assert(P.resolveTheme('bogus') === 'dark', 'resolveTheme 未知值回退 dark');
    assert(P.resolveTheme('system') === 'dark', 'resolveTheme system（无 matchMedia）回退 dark');
    const realMQ = sandbox.matchMedia;
    sandbox.matchMedia = () => ({ matches: true, addEventListener: () => {} });
    assert(P.resolveTheme('system') === 'light', 'resolveTheme system（prefers light）→ light');
    sandbox.matchMedia = () => ({ matches: false, addEventListener: () => {} });
    assert(P.resolveTheme('system') === 'dark', 'resolveTheme system（prefers dark）→ dark');
    sandbox.matchMedia = realMQ;
    // #49 wallpaper rotate: todayStr shape + pure candidate picker
    assert(/^\d{4}-\d{2}-\d{2}$/.test(P.todayStr()), 'todayStr() 为 YYYY-MM-DD', String(P.todayStr()));
    const rotPool = [
      { url: 'https://a.example/1.jpg', title: 'A' },
      { url: 'https://a.example/2.jpg', title: 'B' },
      null,
      { title: 'no url' }
    ];
    assert(P.pickRotateCandidate(rotPool, '') === rotPool[0], 'pickRotateCandidate 空当前值取池首项');
    assert(P.pickRotateCandidate(rotPool, 'https://a.example/1.jpg') === rotPool[1], 'pickRotateCandidate 跳过当前壁纸');
    assert(P.pickRotateCandidate(rotPool, 'https://a.example/9.jpg') === rotPool[0], 'pickRotateCandidate 当前不在池中取首项');
    assert(P.pickRotateCandidate([], '') === null, 'pickRotateCandidate 空池返回 null');
    assert(P.pickRotateCandidate(null, '') === null, 'pickRotateCandidate 非数组池返回 null');
    // #65 plum-blossom quote picker: deterministic around the previous index
    assert(P.pickQuoteIndex(0, -1) === -1, 'pickQuoteIndex 空列表返回 -1');
    assert(P.pickQuoteIndex(1, 0) === 0, 'pickQuoteIndex 单条恒取 0');
    assert(P.pickQuoteIndex(1, 7) === 0, 'pickQuoteIndex 单条忽略上次');
    const qi = P.pickQuoteIndex(5, 2);
    assert(qi >= 0 && qi < 5 && qi !== 2, 'pickQuoteIndex 跳过上一条（5 中 2）');
    assert(P.pickQuoteIndex(5, -1) >= 0 && P.pickQuoteIndex(5, -1) < 5, 'pickQuoteIndex 无上次随机取一条');
    // #66 wallpaper habit recommendation: derive preference profile from pick events
    const ev = (o) => Object.assign({ type: 'image', via: 'library', source: 'bing', at: 0 }, o);
    let prefs = P.deriveWallPrefs([]);
    assert(prefs.total === 0 && prefs.favoriteUrls.length === 0, 'deriveWallPrefs 空事件 → 全零画像');
    prefs = P.deriveWallPrefs([
      ev({ type: 'gradient', source: 'gradient', via: 'swatch' }),
      ev({ url: 'https://x/1.jpg', source: 'bing', via: 'library', at: 1000 }),
      ev({ url: 'https://x/1.jpg', source: 'bing', via: 'plum', at: 2000 }),
      ev({ url: 'https://x/2.jpg', source: 'wallhaven', via: 'library', at: 3000 }),
      ev({ type: 'image', source: 'upload', via: 'upload', light: true })
    ]);
    assert(prefs.total === 5, 'deriveWallPrefs 事件计数', String(prefs.total));
    assert(prefs.imageCount === 4 && prefs.gradientCount === 1, 'deriveWallPrefs 图/渐变计数');
    assert(prefs.sourceCounts.bing === 2 && prefs.sourceCounts.wallhaven === 1 && prefs.sourceCounts.upload === 1 && prefs.sourceCounts.gradient === 1, 'deriveWallPrefs 来源计数');
    assert(prefs.manualSourceCounts.bing === 2 && prefs.manualSourceCounts.upload === 1, 'deriveWallPrefs 手动来源计数');
    assert(prefs.lightPicks === 1 && prefs.darkPicks === 0, 'deriveWallPrefs 明暗计数');
    assert(prefs.favoriteUrls.length === 1 && prefs.favoriteUrls[0] === 'https://x/1.jpg', 'deriveWallPrefs 重复选择 = 收藏');
    assert(prefs.lastSeen['https://x/1.jpg'] === 2000, 'deriveWallPrefs lastSeen 取最新时间戳');
    // scoreWallCandidates: favorite boost + recency penalty + novelty bonus
    const pool2 = [
      { url: 'https://x/fav.jpg' },
      { url: 'https://x/recent.jpg' },
      { url: 'https://x/fresh.jpg' },
      { url: 'https://x/old.jpg' }
    ];
    const prefs2 = P.deriveWallPrefs([
      ev({ url: 'https://x/fav.jpg', via: 'library', at: 0 }),
      ev({ url: 'https://x/fav.jpg', via: 'plum', at: 0 }),
      ev({ url: 'https://x/recent.jpg', via: 'library', at: Date.now() }),
      ev({ url: 'https://x/old.jpg', via: 'library', at: Date.now() - 20 * 86400000 })
    ]);
    const ordered = P.scoreWallCandidates(pool2, prefs2);
    assert(Array.isArray(ordered) && ordered.length === 4, 'scoreWallCandidates 返回同长度数组');
    assert(ordered[0].url === 'https://x/fav.jpg', 'scoreWallCandidates 收藏优先', ordered.map(i => i.url).join(','));
    assert(ordered[3].url === 'https://x/recent.jpg', 'scoreWallCandidates 最近看过排末位', ordered.map(i => i.url).join(','));
    assert(P.pickRecommended(pool2, prefs2, '').url === 'https://x/fav.jpg', 'pickRecommended 空当前值取最优');
    assert(P.pickRecommended(pool2, prefs2, 'https://x/fav.jpg').url !== 'https://x/fav.jpg', 'pickRecommended 跳过当前');
    assert(P.pickRecommended([], prefs2, '') === null, 'pickRecommended 空池 null');
    assert(P.pickRecommended(null, prefs2, '') === null, 'pickRecommended 非数组池 null');
    assert(P.pickRecommended([{ url: 'https://x/only.jpg' }], prefs2, 'https://x/only.jpg').url === 'https://x/only.jpg', 'pickRecommended 全部为当前时回退');
  }
  void elStub;
}

// 4b-2) icondb.js：真实图标库的数据完整性（#59 起库内混有单色/多色/字标三种形态）
{
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const src = read('js/icondb.js');
  vm.runInContext(src, sandbox, { filename: 'icondb.js' });
  const DB = sandbox.window.LT_ICONDB;
  assert(!!DB, 'icondb.js 暴露 window.LT_ICONDB');
  if (DB) {
    const keys = Object.keys(DB);
    // 字面量条目数 === 运行时 key 数，否则说明有重名 host 被后者静默覆盖
    const literal = (src.match(/^ {2}"[^"]+":/gm) || []).length;
    assert(literal === keys.length, `图标库无重复 host（字面 ${literal} / 运行时 ${keys.length}）`);
    assert(keys.length >= 100, `图标库收录 ≥100 个站点（当前 ${keys.length}）`);

    const HEX = /^#[0-9a-fA-F]{6}$/;
    const bad = [];
    let mono = 0, multi = 0, tx = 0;
    // 与 iconGlyphHtml 中的对比度守卫同源：整张图都融进底色 = 渲染出一块空白板
    const lum = (h) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    for (const [host, e] of Object.entries(DB)) {
      if (!HEX.test(e.c)) { bad.push(`${host}: c=${e.c}`); continue; }
      if (e.p) {
        multi++;
        if (!Array.isArray(e.p) || !e.p.length) bad.push(`${host}: 空 p[]`);
        else {
          for (const s of e.p) {
            if (!s.d) bad.push(`${host}: 子路径缺 d`);
            if (!HEX.test(s.f)) bad.push(`${host}: 子路径 fill=${s.f}`);
          }
          const best = Math.max(...e.p.map((s) => (HEX.test(s.f) ? contrast(s.f, e.c) : 0)));
          if (best < 1.35) bad.push(`${host}: 全部填色融进底色 ${e.c}`);
        }
      } else if (e.tx) {
        tx++;
        if (!HEX.test(e.f)) bad.push(`${host}: 字标 f=${e.f}`);
        else if (contrast(e.f, e.c) < 1.35) bad.push(`${host}: 字标与底色无对比`);
        if ([...e.tx].length > 6) bad.push(`${host}: 字标过长 ${e.tx}`);
      } else if (e.d) {
        mono++;
      } else {
        bad.push(`${host}: 三种形态都不匹配`);
      }
    }
    assert(bad.length === 0, '图标库每条都结构完整且与底色有对比', bad.slice(0, 4).join(' | '));
    assert(mono > 0 && multi > 0 && tx > 0, `三种形态均有收录（单色 ${mono} / 多色 ${multi} / 字标 ${tx}）`);

    // #59 用户明确点名的站点必须在库里
    const MUST = ['cloud.tencent.com', 'intl.cloud.tencent.com', 'aws.amazon.com', 'azure.microsoft.com',
      'cloud.google.com', 'huaweicloud.com', 'console-intl.huaweicloud.com', 'aliyun.com', 'alibabacloud.com',
      'doubao.com', 'kimi.com', 'weread.qq.com', 'chat.google.com', 'outlook.com', 'docs.qq.com',
      'imooc.com', '51cto.com', 'time.geekbang.org', 'xiaoe-tech.com'];
    const missing = MUST.filter((h) => !DB[h]);
    assert(missing.length === 0, `#59 点名的 ${MUST.length} 个站点全部收录`, missing.join(', '));

    // 零网络：库内不得出现任何远程引用
    assert(!/https?:\/\//.test(src.replace(/^\/\*[\s\S]*?\*\//, '')), '图标库正文无远程 URL（保持零网络请求）');
  }
}

// 4c) i18n.js：字典 zh/en 完整性（每个 key 两份都有值），含本批新增的 sync.applied
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(read('js/i18n.js'), sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  assert(!!I && typeof I.t === 'function', 'i18n.js 暴露 window.LT_I18N.t');
  if (I) {
    assert(I.t('sync.applied') === '已从云端同步更新', "t('sync.applied') 中文词条");
    I.setLang('en');
    assert(I.t('sync.applied') === 'Updated from cloud sync', "t('sync.applied') 英文词条");
    I.setLang('zh');
    // #48 theme：gen.theme 标签 + 三个选项词条，中英各一份
    assert(I.t('gen.theme') === '主题' && I.t('theme.dark') === '深色' && I.t('theme.light') === '浅色' && I.t('theme.system') === '跟随系统', 'theme 词条 中文');
    I.setLang('en');
    assert(I.t('gen.theme') === 'Theme' && I.t('theme.dark') === 'Dark' && I.t('theme.light') === 'Light' && I.t('theme.system') === 'Follow system', 'theme 词条 英文');
    I.setLang('zh');
    // #49 wallpaper rotate keys: both languages must be actually translated (never echo the key back)
    const rotKeys = ['wall.rotate', 'wall.rotate_tip', 'wall.got_cached', 'toast.wall_rotate_on'];
    const allTranslated = lang => rotKeys.every(k => I.t(k) !== k && I.t(k).length > 0);
    assert(allTranslated('zh'), '壁纸轮换词条 中文已译', rotKeys.map(k => I.t(k)).join(' | '));
    I.setLang('en');
    assert(allTranslated('en'), '壁纸轮换词条 英文已译', rotKeys.map(k => I.t(k)).join(' | '));
    I.setLang('zh');
    // #50 custom icon keys: both languages translated
    const iconKeys = ['icon.label', 'icon.upload', 'icon.remove', 'icon.tip', 'toast.icon_invalid'];
    assert(iconKeys.every(k => I.t(k) !== k && I.t(k).length > 0), '自定义图标词条 中文已译', iconKeys.map(k => I.t(k)).join(' | '));
    I.setLang('en');
    assert(iconKeys.every(k => I.t(k) !== k && I.t(k).length > 0), '自定义图标词条 英文已译', iconKeys.map(k => I.t(k)).join(' | '));
    I.setLang('zh');
    // #62 多源壁纸（Bing / Wallhaven / Unsplash）：词条中英两份
    const srcKeys = ['wall.src', 'wall.src_bing', 'wall.src_wallhaven', 'wall.src_unsplash', 'wall.src_unsplash_key'];
    assert(srcKeys.every(k => I.t(k) !== k && I.t(k).length > 0), '壁纸源词条 中文已译', srcKeys.map(k => I.t(k)).join(' | '));
    I.setLang('en');
    assert(srcKeys.every(k => I.t(k) !== k && I.t(k).length > 0), '壁纸源词条 英文已译', srcKeys.map(k => I.t(k)).join(' | '));
    I.setLang('zh');
  }
}

// ---------- 5) newtab.html 干净 ----------
console.log('[5] newtab.html');
const injected = (htmlRaw.match(/data-page-node-id/g) || []).length;
if (injected) console.log(`  (preview 面板注入 ${injected} 个 data-page-node-id，已剥离，不影响断言)`);
assert(/<\/html>\s*$/.test(html), '文档以 </html> 收尾（结构完整）');

// ---------- 6) #48 主题静态结构 ----------
console.log('[6] #48 主题');
assert(/<html lang="en" data-theme="dark"/.test(html), 'html 标签默认 data-theme="dark"');
const themeSel = html.match(/<select id="f-theme">([\s\S]*?)<\/select>/);
assert(!!themeSel, '设置页含 #f-theme 下拉');
if (themeSel) {
  const opts = [...themeSel[1].matchAll(/<option value="(dark|light|system)"/g)].map(m => m[1]);
  assert(opts.join(',') === 'dark,light,system', '#f-theme 三个选项 dark/light/system', opts.join(','));
}
assert(/data-i18n="gen\.theme"/.test(html), '主题标签带 data-i18n="gen.theme"');

// ---------- 7) #49 壁纸轮换静态结构 ----------
console.log('[7] #49 壁纸轮换');
assert(/<input type="checkbox" id="f-wall-rotate">/.test(html), '设置页含 #f-wall-rotate 复选框');
assert(/data-i18n="wall\.rotate"/.test(html), '轮换标签带 data-i18n="wall.rotate"');
assert(/data-i18n="wall\.rotate_tip"/.test(html), '轮换提示带 data-i18n="wall.rotate_tip"');
assert(/walllib:\s*'lt\.walllib'/.test(appSrc), 'K 映射含 lt.walllib（本地缓存池）');
assert(/rot:\s*'lt\.rot'/.test(appSrc), 'K 映射含 lt.rot（每日轮换记账）');
assert(/function maybeAutoRotate/.test(appSrc), 'app.js 定义 maybeAutoRotate()');
assert(/function markManualPickToday/.test(appSrc), 'app.js 定义 markManualPickToday()');
assert(/pickRotateCandidate|todayStr/.test(appSrc), 'app.js 导出轮换纯函数到 LT_PURE');

// ---------- 7b) #62 多源壁纸静态结构 ----------
console.log('[7b] #62 多源壁纸');
assert(/<select id="f-wall-src"/.test(html), '设置页含 #f-wall-src 壁纸源下拉');
assert(/<option value="wallhaven"/.test(html), '下拉含 wallhaven 源');
assert(/<option value="bing"/.test(html), '下拉含 bing 源');
assert(/<option value="unsplash"/.test(html), '下拉含 unsplash 源（服务端配 Key 后启用）');
assert(/function syncWallSources/.test(appSrc), 'app.js 定义 syncWallSources()');
assert(/source:\s*src/.test(appSrc), 'fetchWallLib 按 source 拼接请求参数');
assert(/\/v1\/wallpapers\/sources/.test(appSrc), 'app.js 查询 /v1/wallpapers/sources 能力端点');
assert(/wall\.src_bing/.test(appSrc) || /wall\.src_bing/.test(html), '词条 wall.src_bing 被引用');


// ---------- 8) #50 自定义卡片图标静态结构 ----------
console.log('[8] #50 自定义图标');
assert(/<input id="f-icon" type="file"/.test(html), '快捷方式弹窗含 #f-icon 上传输入');
assert(/id="f-icon-preview"/.test(html), '弹窗含 #f-icon-preview 预览格');
assert(/id="f-icon-remove"/.test(html), '弹窗含 #f-icon-remove 移除按钮');
assert(/data-i18n="icon\.(label|upload|remove|tip)"/.test(html), '图标区词条钩子齐备');
assert(/function sanitizeIconDataUrl/.test(appSrc), 'app.js 定义 sanitizeIconDataUrl()');
assert(/function compressIconSquare/.test(appSrc), 'app.js 定义 compressIconSquare()');
assert(/let pendingIcon/.test(appSrc), 'app.js 定义 pendingIcon 模态暂存态');
assert(/logo-img/.test(appSrc) && /logo-img/.test(cssSrc), '卡片渲染/样式支持 .logo-img（img 分支）');
assert(/icon:\s*sanitizeIconDataUrl\(it\.icon\)/.test(appSrc), 'doImport 校验并保留 icon 字段');
assert(/it\.icon = icon/.test(appSrc), '编辑保存写入 icon 字段');
assert(/has-custom-icon/.test(appSrc) && /\.has-custom-icon/.test(cssSrc), '自定义图标卡片挂 has-custom-icon 类，CSS 给主题感知中性底');
assert(/function iconCropRect/.test(appSrc), 'app.js 定义 iconCropRect（内容感知裁切）');
assert(/iconCropRect/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'iconCropRect 已导出到 LT_PURE');

// ---------- 9) #60 左栏组件可删除 ----------
console.log('[9] #60 左栏组件可删除');
for (const id of ['wclock', 'wcal', 'wtodo', 'wmovie']) {
  assert(new RegExp(`class="w-del" data-widget="${id}"`).test(html), `${id} 组件挂了移除按钮`);
  assert(new RegExp(`id="f-w-${id}"`).test(html), `设置页含 #f-w-${id} 勾选框`);
}
assert(/data-i18n="gen\.widgets"/.test(html) && /data-i18n="gen\.widgets_tip"/.test(html), '设置页组件区词条钩子齐备');
assert(/data-i18n-aria="widget\.remove"/.test(html), '移除按钮带无障碍词条');
assert(/widgets:\s*\{\s*wclock:\s*true/.test(appSrc), 'DEFAULT_SETTINGS 含 widgets 默认全开');
assert(/const WIDGETS = \['wclock', 'wcal', 'wtodo', 'wmovie'\]/.test(appSrc), 'app.js 定义 WIDGETS 单一真源');
assert(/function normalizeWidgets/.test(appSrc), 'app.js 定义 normalizeWidgets()');
assert(/function applyWidgets/.test(appSrc), 'app.js 定义 applyWidgets()');
assert(/function removeWidget/.test(appSrc), 'app.js 定义 removeWidget()');
assert(/normalizeWidgets/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'normalizeWidgets 已导出到 LT_PURE');
assert(/\.widget \.w-del/.test(cssSrc) && /\.widget:hover \.w-del/.test(cssSrc), 'CSS 定义悬停出现的 .w-del');
assert(/@media \(hover: none\)[\s\S]{0,120}\.w-del/.test(cssSrc), '触屏无 hover 时移除按钮常驻');
assert(/\.wgt-rows/.test(cssSrc), 'CSS 定义设置页勾选组 .wgt-rows');
// widgets 必须存活在 settings 内，这样导出/导入/云同步零成本带上它
assert(!/'lt\.widgets'/.test(appSrc), 'widgets 不另开存储键（随 settings 走同步与导出）');
assert(/state\.settings\.widgets = normalizeWidgets\(state\.settings\.widgets\)/.test(appSrc), 'doImport 校验 widgets 字段');
// 删除/恢复/云拉取/重置四条路径都要重新应用一次
assert((appSrc.match(/applyWidgets\(\)/g) || []).length >= 6, 'applyWidgets 在启动/删除/导入/重置/云拉取各路径均被调用');
// 自由画布模式：坐标是冻结的，移除组件必须重算，且不能覆盖用户手拖的排布
// （画布实现已拆到 js/canvas.js，相关断言读 canvasSrc；启动调用点留在 app.js）
assert(/layout\.auto = true/.test(canvasSrc), 'captureLayout 标记 auto 布局');
assert((canvasSrc.match(/\.auto = false/g) || []).length >= 2, '块拖拽与卡片拖拽都会把布局标记为手动');
assert(/function widgetLayoutStale/.test(canvasSrc), 'canvas.js 定义 widgetLayoutStale()（冷启动陈旧坐标检测）');
assert(/function recaptureBlocksFromFlow/.test(canvasSrc), 'canvas.js 定义 recaptureBlocksFromFlow()');
assert(/if \(!l \|\| l\.auto === false\) return/.test(canvasSrc), '手动布局不被自动重算覆盖');
assert(/next\.cards = captureCardLayout\(\)/.test(canvasSrc), '重算时卡片坐标一并重新推导（网格变宽会改列数）');
assert(/if \(window\.LT_CANVAS\.widgetLayoutStale\(\)\) window\.LT_CANVAS\.recaptureBlocksFromFlow\(\)/.test(appSrc), '启动时修正陈旧的画布坐标');

// ---------- 10) #61 WorkBuddy 本地探测 + 时钟位置 ----------
console.log('[10] #61 WorkBuddy 探测 / 时钟位置');
// 探测协议必须与 WorkBuddy Desktop 自带的一致（端口表 / 路径 / 超时）
assert(/WB_PROBE_PORTS = \[18488, 18489, 18490\]/.test(appSrc), '端口表与 WorkBuddy 官方一致（18488-18490）');
assert(/WB_PROBE_PATH = '\/workbuddy\/probe'/.test(appSrc), '探测路径为 /workbuddy/probe');
assert(/WB_PROBE_TIMEOUT = 1500/.test(appSrc), '单端口超时 1500ms（与官方网页端一致）');
assert(/j\.app === 'workbuddy-desktop'/.test(appSrc), '校验应答 app 字段，拒绝冒名服务');
assert(/AbortController/.test(appSrc), '探测带 AbortController 超时，不会挂死页面');
assert(/function probeWorkBuddy/.test(appSrc), 'app.js 定义 probeWorkBuddy()');
assert(/function verifyWorkBuddyLaunch/.test(appSrc), 'app.js 定义 verifyWorkBuddyLaunch()（发射后回执）');
assert(/if \(dlN\) verifyWorkBuddyLaunch\(\)/.test(appSrc), '深链发射后异步复验');
assert(/window\.open\(deepLinkUrl/.test(appSrc), '深链仍在用户手势内同步 window.open');
assert(/window\.LT_PROBE_WB = probeWorkBuddy/.test(appSrc), '探测函数导出供离线校验驱动');
assert(/eng-state/.test(appSrc) && /\.eng-state\.on/.test(cssSrc), '引擎下拉有状态点样式');
assert(!/host_permissions/.test(read('manifest.json')), '不申请 host_permissions（靠对方 CORS 放行）');
for (const k of ['wb.running', 'wb.not_running', 'wb.not_detected', 'wb.get']) {
  assert(i18nSrc.includes(`'${k}'`), `i18n 含 ${k}`);
}
// ---------- #62 每组件位置（时钟 / 日历 / 待办 可各自放到搜索框上方）----------
assert(/widgetPos: \{ wclock: 'top', wcal: 'left', wtodo: 'left', wmovie: 'left' \}/.test(appSrc),
  'DEFAULT_SETTINGS 的 widgetPos 默认只有时钟在顶，日历/待办/电影在左栏');
// 顶部槽位要的是一眼可读的「时间 + 一行日期」，不是完整日期+农历+干支那句话
assert(/function compactDateLine/.test(appSrc), 'app.js 定义 compactDateLine()（顶部态紧凑日期行）');
assert(/function clockIsTop/.test(appSrc), 'app.js 定义 clockIsTop()');
assert(/top \? compactDateLine\(d\) : dateLine\(d\)/.test(appSrc), '时钟按位置切换日期行格式');
assert(/if \(lunarEl\) lunarEl\.textContent = top \? '' : lunarLine\(d\)/.test(appSrc),
  '顶部态不再单独渲染农历行（已并入紧凑行）');
// tick 只在跨天时改写文案，位置一变必须强制重画，否则日期行停留在旧格式
assert(/\|\$\{clockIsTop\(\) \? 't' : 'l'\}/.test(appSrc), '日期缓存键带上位置，位置变化即失效');
assert(/if \(clockTimer\) startClock\(\);/.test(appSrc), 'applyWidgetPos 后强制重画时钟');
assert(/\.widget\.wclock\.w-top \.clock-greet \{ display: none/.test(cssSrc)
  || /clock-lunar,\n\.widget\.wclock\.w-top \.clock-greet \{ display: none/.test(cssSrc),
  '顶部态隐藏农历行与问候语');
assert(/function normalizeWidgetPos/.test(appSrc), 'app.js 定义 normalizeWidgetPos()');
assert(/function applyWidgetPos/.test(appSrc), 'app.js 定义 applyWidgetPos()');
assert(/applyWidgetPos\(\);/.test(appSrc), 'applyWidgets 驱动 applyWidgetPos');
assert(/normalizeWidgetPos/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''),
  'normalizeWidgetPos 已导出到 LT_PURE');
assert(!/clockPos/.test(cssSrc) && !/wclock-top/.test(cssSrc), 'CSS 里旧的 wclock-top 已清除');
for (const id of ['wclock', 'wcal', 'wtodo', 'wmovie']) {
  assert(new RegExp(`id="f-pos-${id}"`).test(html), `设置页含 #f-pos-${id} 位置下拉`);
}
assert(/data-i18n="wpos\.top"/.test(html) && /data-i18n="wpos\.left"/.test(html), '位置选项词条齐备');
// 设置表单有三条全局规则（.modal-body label / label>span / select）特异性高于裸类选择器，
// 不加 .modal-body 限定会把这一行控件压成上下堆叠的整宽块（本次实测行高 29px→80px）
assert(/\.modal-body label\.wgt-row/.test(cssSrc), '.wgt-row 以 .modal-body label.wgt-row 提权');
assert(/\.modal-body \.wgt-row > span\.wgt-name/.test(cssSrc), '.wgt-name 以 .modal-body 限定提权');
assert(/\.modal-body select\.wgt-pos/.test(cssSrc), '.wgt-pos 以 .modal-body select 提权');
assert(!/(?:^|\})\s*\.wgt-row \{/m.test(cssSrc), '不存在裸 .wgt-row 规则（会被全局 label 规则击穿）');
assert(!/(?:^|\})\s*\.wgt-pos \{/m.test(cssSrc), '不存在裸 .wgt-pos 规则（会被全局 select 规则击穿）');
assert(i18nSrc.includes("'wpos.top'") && i18nSrc.includes("'wpos.left'"), 'i18n 含 wpos 两条');
assert(!/clockpos\./.test(i18nSrc) && !/gen\.clock_pos/.test(i18nSrc), '旧的 clockpos 词条已清除');
assert(/\.widget\.w-top \{/.test(cssSrc), 'CSS 定义通用 .widget.w-top');
// 顶部态样式必须以 .widget 限定，否则被文件后面同特异性的 .wclock/.wcal 规则覆盖
assert(!/^\.w-top /m.test(cssSrc), '顶部态选择器均以 .widget 限定（避免被后续同特异性规则覆盖）');
assert(/\.widget\.wclock\.w-top/.test(cssSrc) && /\.widget\.wcal\.w-top/.test(cssSrc),
  '时钟与日历各有顶部态专属样式');
// 顶部栈的 10px 间距只能在 flow 生效：画布模式坐标已含该间距，再加一次就会互相压 10px
assert(/\.layout:not\(\.canvas\) \.widget\.w-top \+ \.widget\.w-top/.test(cssSrc),
  '顶部栈间距限定在非画布模式（否则画布下重复施加）');
// 日历格子是「日期 + 农历」两行，钉死高度/行高会裁掉第二行
assert(!/\.widget\.wcal\.w-top \.cal-cell[^}]*line-height/.test(cssSrc),
  '日历顶部态未给格子写死 line-height（会裁掉农历行）');
// 陈旧检测与自愈重排
assert(/normalizeWidgetPos\(st && st\.widgetPos\)/.test(canvasSrc), '画布陈旧检测按每组件位置判定');
assert(/function topStackOverlaps/.test(canvasSrc), 'canvas.js 定义 topStackOverlaps()');
assert(/function relayoutTopStackIfNeeded/.test(canvasSrc), 'canvas.js 定义 relayoutTopStackIfNeeded()');
assert(/relayoutTopStackIfNeeded\(\); \}\);/.test(canvasSrc), 'ResizeObserver 里挂了顶部栈自愈');
assert(/relayoutBusy/.test(canvasSrc), '自愈带重入保护（避免重排触发重排）');
assert(/if \(!l \|\| l\.auto === false\) return; \/\/ a hand-dragged/.test(canvasSrc),
  '手拖过的布局不被自愈重排覆盖');
// schema 迁移：旧的单个 clockPos 必须平滑搬进 widgetPos
assert(/const SCHEMA_VERSION = 4;/.test(appSrc), 'SCHEMA_VERSION 提到 4');
assert(/3: \(d\) => \{/.test(appSrc), 'MIGRATIONS 含 v3→v4');
assert(/delete st\.clockPos/.test(appSrc), '迁移后清掉旧的 clockPos 字段');
assert(/state\.settings\.widgetPos = normalizeWidgetPos\(state\.settings\.widgetPos\)/.test(appSrc),
  'doImport 校验 widgetPos');
// 卡片坐标 GC：已删除卡片的格位必须回收，否则新卡片被挤到后面
assert(/for \(const id in map\) if \(!alive\.has\(id\)\)/.test(canvasSrc), 'assignInitialCardLayout 回收失效卡片坐标');
assert(/if \(pruned\) \{ setCardLayoutMap\(map\);/.test(canvasSrc), '坐标回收后落盘一次');


// ---------- 11) 玻璃质感 token ----------
console.log('[11] 玻璃质感');
// 深色主题的玻璃必须是「暗色微透」而不是白色叠加：白色会把亮壁纸越提越亮，
// 实测白 7% 时白字对比度只有 1.72:1（WCAG AA 要 4.5）
assert(/--glass: rgba\(12, 16, 28, 0\.48\)/.test(cssSrc), '深色玻璃为暗色微透 rgba(12,16,28,.48)');
assert(!/:root[\s\S]{0,900}--glass: rgba\(255, 255, 255/.test(cssSrc), '深色主题不再用白色玻璃');
assert(/--glass: rgba\(255, 255, 255, 0\.36\)/.test(cssSrc), '浅色玻璃降到 0.36（0.50 仍显白，0.36 透出壁纸）');
// 单一 blur token + saturate：纯 blur 会把背景去色，观感变塑料
assert(/--glass-blur: blur\(16px\) saturate\(155%\)/.test(cssSrc), '深色 glass-blur 带 saturate');
assert(/--glass-blur: blur\(16px\) saturate\(185%\)/.test(cssSrc), '浅色 glass-blur 带 saturate');
// 磨砂三要素：仅有 blur + 半透明色 = 塑料感。必须再有颗粒、斜向高光、边缘反光
assert(/--frost-grain:\s*url\("data:image\/svg\+xml/.test(cssSrc), '定义了磨砂颗粒（内联 SVG 噪声，无网络请求）');
assert(/feTurbulence/.test(cssSrc), '颗粒用 feTurbulence 生成');
assert(/--frost-sheen: linear-gradient\(135deg/.test(cssSrc), '定义了斜向高光 --frost-sheen');
assert((cssSrc.match(/--frost-sheen:/g) || []).length === 2, '深浅两套主题各有自己的高光强度');
assert((cssSrc.match(/--frost-edge:/g) || []).length === 2, '深浅两套主题各有自己的边缘反光');
assert((cssSrc.match(/box-shadow: var\(--frost-edge\)/g) || []).length >= 3, '主要玻璃面用 --frost-edge 做边缘');
assert(/background-image: var\(--frost-sheen\), var\(--frost-grain\)/.test(cssSrc), '高光+颗粒作为背景层叠加');
assert(/background-blend-mode: normal, var\(--frost-grain-blend\)/.test(cssSrc), '颗粒用 blend-mode 融入表面');
// 用背景层而不是 ::before：组件里已有绝对定位子元素（.w-del / 拖拽把手），
// 绝对定位的伪元素会盖在它们上面
assert(!/\.(widget|card|search)::before\s*\{/.test(cssSrc), '磨砂层不用 ::before（会压住绝对定位子元素）');
// shorthand background 会清掉 background-image，三大面必须用 background-color
assert(!/^\s*background: var\(--glass\);/m.test(cssSrc), '玻璃面用 background-color，避免 shorthand 清掉磨砂层');
assert((cssSrc.match(/backdrop-filter: var\(--glass-blur\)/g) || []).length >= 10,
  '主要玻璃面统一走 --glass-blur');
assert(!/backdrop-filter: blur\(1[468]px\)/.test(cssSrc), '不再有硬编码的 14/16/18px 模糊');
assert(/--glass-hl:/.test(cssSrc) && (cssSrc.match(/inset 0 1px 0 var\(--glass-hl\)/g) || []).length >= 2,
  '内高光走 --glass-hl（原先硬编码值在浅色主题下不可见）');

// ---------- 12) #63 右上角个人头像 ----------
console.log('[12] #63 右上角个人头像');
// 静态结构：右上角头像按钮 + 下拉菜单 + 设置页上传区（本地优先，登录态只镜像）
for (const id of ['btn-avatar', 'avatar-img', 'avatar-initial', 'avatar-fallback', 'avatar-menu',
  'avatar-big', 'avatar-open-set', 'avatar-sync', 'avatar-sync-label',
  'avatar-export', 'f-avatar', 'f-avatar-remove', 'avatar-preview']) {
  assert(new RegExp(`id="${id}"`).test(html), `newtab.html 含 #${id}`);
}
assert(/data-i18n-title="avatar\.title"/.test(html), '头像按钮带 data-i18n-title="avatar.title"');
assert(/aria-haspopup="menu"/.test(html) && /role="menu"/.test(html), '头像/菜单带 menu 无障碍语义');
assert(/id="f-avatar"[^>]*type="file"/.test(html), '设置页含 #f-avatar 文件上传输入');
assert(/accept="image\/png,image\/jpeg,image\/webp,image\/gif"/.test(html), '上传仅收光栅图（png/jpeg/webp/gif）');
// JS：头像 dataURL + 名称首字 + 默认人形三层回退；云同步登录态仅在下拉里镜像
assert(/avatar:\s*''/.test(appSrc), "DEFAULT_SETTINGS 含 avatar: '' 默认空");
assert(/function avatarState/.test(appSrc) && /function renderAvatar/.test(appSrc) && /function renderAvatarPreview/.test(appSrc),
  'app.js 定义 avatarState / renderAvatar / renderAvatarPreview');
assert(/function openSettingsTab/.test(appSrc) && /function bindAvatar/.test(appSrc), 'app.js 定义 openSettingsTab / bindAvatar');
assert(/const AVATAR_FALLBACK_SVG = '<svg/.test(appSrc), 'app.js 定义 AVATAR_FALLBACK_SVG 默认人形');
assert(/avatar = sanitizeIconDataUrl\(state\.settings\.avatar\)/.test(appSrc), '头像渲染前经 sanitizeIconDataUrl 守卫');
assert(/state\.settings\.avatar = await compressAvatarFit\(f, 96\)/.test(appSrc), '上传走 compressAvatarFit 保留完整照片（96px 画布）');
assert(/f\.size > 4 \* 1024 \* 1024/.test(appSrc), '上传限 4MB（超限提示 toast.image_too_big）');
assert(/bindAvatar\(\);\s*renderAvatar\(\)/.test(appSrc), 'boot 里绑定并首次渲染头像');
assert((appSrc.match(/renderAvatar\(\)/g) || []).length >= 6, 'renderAvatar 在启动/改名/导入/重置/云拉取/同步面板均被调用');
assert(/window\.LT_SYNC\.getState\(\)/.test(appSrc), '下拉登录态镜像自 window.LT_SYNC.getState()');
// i18n：头像词条中英各一份且均非空（不 echo key 回显）
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const avatarKeys = ['avatar.title', 'avatar.open_settings',
    'avatar.export', 'avatar.sync', 'avatar.logout', 'avatar.upload', 'avatar.remove', 'avatar.tip',
    'gen.avatar', 'toast.avatar_saved', 'toast.avatar_removed'];
  const tOk = (lang) => avatarKeys.every(k => I.t(k) !== k && I.t(k).length > 0);
  I.setLang('zh');
  assert(tOk('zh'), '头像词条 中文已译', avatarKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(tOk('en'), '头像词条 英文已译', avatarKeys.map(k => I.t(k)).join(' | '));
}
// CSS：头像按钮 / 下拉 / 预览 三处均有样式
for (const sel of ['.avatar-btn', '.avatar-menu', '.avatar-big', '.avatar-item', '.avatar-zone', '.avatar-preview']) {
  assert(cssSrc.includes(sel), `CSS 定义 ${sel}`);
}
assert(/\.avatar-item\.danger/.test(cssSrc), '登录态下拉项带 .danger 退出样式');
assert(/\.avatar-btn:hover/.test(cssSrc), '头像按钮有 hover 态');

// ---------- 13) #64 每日电影组件（route C：内置豆瓣年度最佳静态片单） ----------
console.log('[13] #64 每日电影');
// 静态结构：左栏卡片 + 头部日期 + 渲染容器 + 设置页开关/位置下拉
assert(/<section class="widget wmovie"/.test(html), 'newtab.html 含 .widget.wmovie 卡片');
assert(/id="movie-card"/.test(html), '卡片含 #movie-card 渲染容器');
assert(/id="movie-date"/.test(html), '头部含 #movie-date 日期标签');
assert(/data-i18n="widget\.movie"/.test(html), '卡片标题带 data-i18n="widget.movie"');
// 零网络：内置静态片单，不依赖后端或豆瓣接口
assert(/const DOUBAN_ANNUAL_BEST = \[/.test(appSrc), 'app.js 定义 DOUBAN_ANNUAL_BEST 静态片单');
assert((appSrc.match(/zh: '/g) || []).length >= 30, `内置片单条目充足（当前 ${(appSrc.match(/zh: '/g) || []).length} 部）`);
assert(/function renderMovie/.test(appSrc) && /function movieIndexForToday/.test(appSrc),
  'app.js 定义 renderMovie / movieIndexForToday（按一年第几天确定性取片）');
assert(/movieCursor/.test(appSrc), 'app.js 维护 movieCursor 手动浏览游标');
assert(/renderMovie\(\);/.test(appSrc), 'boot / reset 均调用 renderMovie');
assert(/encodeURIComponent\(m\.zh \|\| m\.en \|\| ''\)/.test(appSrc), '豆瓣跳转链接对片名做 URL 编码');
assert(/escape|&amp;/.test(appSrc), '片名/简介渲染前做 HTML 转义');
// 详情窗口：静态结构 + 可拖拽窗口壳
for (const id of ['movie-modal', 'movie-window', 'movie-window-head', 'movie-window-title', 'movie-window-close', 'movie-detail']) {
  assert(new RegExp(`id="${id}"`).test(html), `newtab.html 含 #${id}`);
}
assert(/id="movie-widget"/.test(html), '电影 widget 含 #movie-widget（供 canvas 拖拽识别）');
assert(/wmovie', sel: '#movie-widget'/.test(read('js/canvas.js')), 'canvas BLOCK_DEFS 含 wmovie，可拖拽');
assert(/function bindMovieDetailWindow/.test(appSrc) && /function openMovieDetailByIndex/.test(appSrc),
  'app.js 定义 bindMovieDetailWindow / openMovieDetailByIndex');
assert(/movie-window-head/.test(appSrc) && /pointerdown/.test(appSrc) && /pointermove/.test(appSrc),
  '详情窗口头部支持 pointer 拖拽');
assert(/const MOVIE_POSTER_MAP/.test(appSrc) && /function moviePoster/.test(appSrc),
  'app.js 定义海报映射与海报回退逻辑');
assert(/The Lovely Bones/.test(appSrc) && /The_Lovely_Bones_Poster/.test(appSrc), '片单含可爱的骨头与海报');

// CSS：新电影卡片 + 固定尺寸详情窗口
for (const sel of ['.movie-card', '.movie-tile', '.movie-tile-bg', '.movie-tile-date', '.movie-tile-title', '.movie-tile-rate', '.movie-tile-quote', '.movie-modal', '.movie-window', '.movie-window-head', '.movie-detail']) {
  assert(cssSrc.includes(sel), `CSS 定义 ${sel}`);
}
assert(/\.movie-window\s*\{[\s\S]*width:\s*min\(1120px/.test(cssSrc), '详情窗口固定主尺寸宽度 1120px（含小屏兜底）');
assert(/\.movie-window\s*\{[\s\S]*height:\s*min\(620px/.test(cssSrc), '详情窗口固定主尺寸高度 620px（含小屏兜底）');
assert(/\.widget\.wmovie\.w-top/.test(cssSrc), '电影顶部态有专属样式');
assert(/\.widget\.wmovie\.w-top \{\s*--wtop-del:\s*176px/.test(cssSrc), '电影顶部态定义 --wtop-del');

// i18n：电影详情词条中英各一份且非空
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const mvKeys = ['widget.movie', 'movie.rating', 'movie.rating_short', 'movie.next', 'movie.open', 'movie.source', 'movie.summary', 'movie.director', 'movie.cast', 'movie.unknown'];
  const mvOk = (lang) => mvKeys.every(k => I.t(k) !== k && I.t(k).length > 0);
  I.setLang('zh');
  assert(mvOk('zh'), '电影词条 中文已译', mvKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(mvOk('en'), '电影词条 英文已译', mvKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
}

// ---------- 14) #65 梅花（右下角）：换壁纸 + 励志名句 ----------
console.log('[14] #65 梅花 · 换壁纸 + 励志名句');
// 静态结构：右下角梅花按钮 + 居中名句浮层
assert(/<button class="plum-float" id="btn-plum"/.test(html), 'newtab.html 含 #btn-plum 梅花按钮');
assert(/id="quote" class="quote" hidden aria-live="polite"/.test(html), 'newtab.html 含 #quote 居中名句浮层（无障碍 aria-live）');
assert(/data-i18n-title="plum\.tip"/.test(html) && /data-i18n-aria="plum\.tip"/.test(html), '梅花按钮带 plum.tip 词条钩子');
// JS：引用现有轮换原语，避免重复造轮子
assert(/const QUOTES = \[/.test(appSrc), 'app.js 定义 QUOTES 励志名句池');
assert(/function pickQuoteIndex/.test(appSrc), 'app.js 定义 pickQuoteIndex()');
assert(/function showQuote/.test(appSrc), 'app.js 定义 showQuote()');
assert(/function rotateWallpaperAndQuote/.test(appSrc), 'app.js 定义 rotateWallpaperAndQuote()');
assert(/getElementById\('btn-plum'\)\.addEventListener\('click', rotateWallpaperAndQuote\)/.test(appSrc), 'boot 绑定梅花点击');
assert(/pickRecommended\(pool, await getWallPrefs\(\), cur\)/.test(appSrc), '梅花复用 pickRecommended（基于已学习偏好推荐）');
assert(/markManualPickToday\(\)/.test(appSrc), '梅花点击后标记当日手动选择');
assert(/pickQuoteIndex/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'pickQuoteIndex 已导出到 LT_PURE');
// 名句池：中英各一份且数量充足
assert((appSrc.match(/zh: '[^']*', en: '/g) || []).length >= 10, `励志名句池条目充足（当前 ${(appSrc.match(/zh: '[^']*', en: '/g) || []).length} 条）`);
// CSS：梅花按钮 + 名句浮层样式齐备
assert(/\.plum-float/.test(cssSrc) && /@keyframes plum-spin/.test(cssSrc), 'CSS 定义 .plum-float 及旋转动效');
assert(/\.quote/.test(cssSrc) && /\.quote-text/.test(cssSrc) && /\.quote-src/.test(cssSrc), 'CSS 定义 .quote / .quote-text / .quote-src');
assert(/@keyframes quote-in/.test(cssSrc) && /\.quote\.quote-out/.test(cssSrc), 'CSS 定义名句入场/退场动画');
// i18n：plum.tip 中英各一份且非空（不 echo key 回显）
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  I.setLang('zh');
  assert(I.t('plum.tip') === '换一张壁纸 · 励志名句', 'plum.tip 中文', I.t('plum.tip'));
  I.setLang('en');
  assert(I.t('plum.tip') === 'New wallpaper · a quote', 'plum.tip 英文', I.t('plum.tip'));
  I.setLang('zh');
}

// ---------- 15) #66 壁纸习惯收集 + 个性化推荐 ----------
console.log('[15] #66 壁纸习惯 · 学习偏好 + 推荐');
// 存储键：lt.wallhist 为本地独占（不入同步/导出，与 walllib/rot 同源）
assert(/wallhist:\s*'lt\.wallhist'/.test(appSrc), 'K 映射含 wallhist → lt.wallhist');
// 记录点：六处壁纸变更都带 via 标签（swatch/library/auto/plum/reset/upload）
for (const via of ['swatch', 'library', 'auto', 'plum', 'reset', 'upload']) {
  assert(new RegExp(`setWallpaper\\([^)]*, '${via}'\\)`).test(appSrc), `setWallpaper 记录 via='${via}'`);
}
// 核心函数齐备且纯函数导出到 LT_PURE
for (const fn of ['recordWallpaperPick', 'deriveWallPrefs', 'scoreWallCandidates', 'pickRecommended', 'getWallPrefs', 'renderWallRecoTip']) {
  assert(new RegExp(`function ${fn}`).test(appSrc), `app.js 定义 ${fn}()`);
}
assert(/deriveWallPrefs, scoreWallCandidates, pickRecommended/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), '推荐纯函数已导出到 LT_PURE');
// 上传 dataURL 永不落盘（隐私 + 体积）
assert(/never persist|startsWith\('data:image'\)/.test(appSrc), '上传 dataURL 不写入习惯记录');
// 梅花 / 每日轮换改为基于推荐，而非简单顺序轮换
assert(/pickRecommended\(pool, await getWallPrefs\(\), cur\)/.test(appSrc), '每日自动轮换复用 pickRecommended');
// 壁纸库网格按推荐排序 + 顶部推荐角标 + 学习提示行
assert(/scoreWallCandidates\(wallLibImages, prefs\)/.test(appSrc), '壁纸库网格按推荐排序');
assert(/wall-reco-badge/.test(appSrc) && /wall-reco-tip/.test(appSrc), '推荐角标 + 学习提示行注入');
assert(/id="wall-reco-tip"/.test(html), 'newtab.html 含 #wall-reco-tip 提示行');
// CSS：推荐角标 / 学习提示行样式
assert(/\.wall-reco-badge/.test(cssSrc) && /\.wall-reco-tip/.test(cssSrc), 'CSS 定义 .wall-reco-badge / .wall-reco-tip');
// i18n：推荐角标 + 学习提示中英各一份且非空
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  I.setLang('zh');
  assert(I.t('wall.reco_badge') === '推荐', 'wall.reco_badge 中文', I.t('wall.reco_badge'));
  assert(/\{n\}/.test(I.t('wall.reco_tip')), 'wall.reco_tip 中文含 {n} 占位', I.t('wall.reco_tip'));
  I.setLang('en');
  assert(I.t('wall.reco_badge') === 'For you', 'wall.reco_badge 英文', I.t('wall.reco_badge'));
  assert(/\{n\}/.test(I.t('wall.reco_tip')), 'wall.reco_tip 英文含 {n} 占位', I.t('wall.reco_tip'));
  I.setLang('zh');
}

console.log('');
if (failures) {
  console.error(`smoke: ${failures} 项失败`);
  process.exit(1);
}
console.log('smoke: 全部通过');

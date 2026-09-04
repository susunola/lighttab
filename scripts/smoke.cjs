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
 *  5) newtab.html 无编辑器残留的 data-page-node-id 属性
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
const html = read('newtab.html');
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
    assert(JSON.stringify(NW(undefined)) === JSON.stringify({ wclock: true, wcal: true, wtodo: true }),
      'normalizeWidgets(undefined) → 三个全可见');
    assert(JSON.stringify(NW(null)) === JSON.stringify({ wclock: true, wcal: true, wtodo: true }),
      'normalizeWidgets(null) → 三个全可见');
    assert(NW({ wcal: false }).wcal === false && NW({ wcal: false }).wclock === true,
      'normalizeWidgets 部分对象 → 缺的补 true');
    assert(NW({ wclock: 0, wcal: '', wtodo: null }).wclock === true,
      'normalizeWidgets 只认显式 false，其它假值仍可见');
    assert(NW({ bogus: false }).wclock === true && !('bogus' in NW({ bogus: false })),
      'normalizeWidgets 丢弃未知键');
    assert(Object.values(NW({ wclock: false, wcal: false, wtodo: false })).every((v) => v === false),
      'normalizeWidgets 允许三个全移除（左栏整列收起）');
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
  }
}

// ---------- 5) newtab.html 干净 ----------
console.log('[5] newtab.html');
assert(!/data-page-node-id/.test(html), '无 data-page-node-id 残留');
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
for (const id of ['wclock', 'wcal', 'wtodo']) {
  assert(new RegExp(`class="w-del" data-widget="${id}"`).test(html), `${id} 组件挂了移除按钮`);
  assert(new RegExp(`id="f-w-${id}"`).test(html), `设置页含 #f-w-${id} 勾选框`);
}
assert(/data-i18n="gen\.widgets"/.test(html) && /data-i18n="gen\.widgets_tip"/.test(html), '设置页组件区词条钩子齐备');
assert(/data-i18n-aria="widget\.remove"/.test(html), '移除按钮带无障碍词条');
assert(/widgets:\s*\{\s*wclock:\s*true/.test(appSrc), 'DEFAULT_SETTINGS 含 widgets 默认全开');
assert(/const WIDGETS = \['wclock', 'wcal', 'wtodo'\]/.test(appSrc), 'app.js 定义 WIDGETS 单一真源');
assert(/function normalizeWidgets/.test(appSrc), 'app.js 定义 normalizeWidgets()');
assert(/function applyWidgets/.test(appSrc), 'app.js 定义 applyWidgets()');
assert(/function removeWidget/.test(appSrc), 'app.js 定义 removeWidget()');
assert(/normalizeWidgets/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'normalizeWidgets 已导出到 LT_PURE');
assert(/\.widget \.w-del/.test(cssSrc) && /\.widget:hover \.w-del/.test(cssSrc), 'CSS 定义悬停出现的 .w-del');
assert(/@media \(hover: none\)[\s\S]{0,120}\.w-del/.test(cssSrc), '触屏无 hover 时移除按钮常驻');
assert(/\.wgt-checks/.test(cssSrc), 'CSS 定义设置页勾选组 .wgt-checks');
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
assert(/widgetPos: \{ wclock: 'top', wcal: 'top', wtodo: 'left' \}/.test(appSrc),
  'DEFAULT_SETTINGS 的 widgetPos 默认时钟+日历在顶、待办在左栏');
assert(/function normalizeWidgetPos/.test(appSrc), 'app.js 定义 normalizeWidgetPos()');
assert(/function applyWidgetPos/.test(appSrc), 'app.js 定义 applyWidgetPos()');
assert(/applyWidgetPos\(\);/.test(appSrc), 'applyWidgets 驱动 applyWidgetPos');
assert(/normalizeWidgetPos/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''),
  'normalizeWidgetPos 已导出到 LT_PURE');
assert(!/clockPos/.test(cssSrc) && !/wclock-top/.test(cssSrc), 'CSS 里旧的 wclock-top 已清除');
for (const id of ['wclock', 'wcal', 'wtodo']) {
  assert(new RegExp(`id="f-pos-${id}"`).test(html), `设置页含 #f-pos-${id} 位置下拉`);
}
assert(/data-i18n="wpos\.top"/.test(html) && /data-i18n="wpos\.left"/.test(html), '位置选项词条齐备');
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


console.log('');
if (failures) {
  console.error(`smoke: ${failures} 项失败`);
  process.exit(1);
}
console.log('smoke: 全部通过');

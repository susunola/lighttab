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
 *     sanitizeWallpaperUrl 白名单、resolveTheme（dark/light/system 映射）、i18n 字典 zh/en 完整性
 *  5) newtab.html 无编辑器残留的 data-page-node-id 属性
 *  6) #48 主题静态结构：html 默认 data-theme、#f-theme 三选项、主题词条钩子
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
const JS_FILES = ['js/app.js', 'js/sync.js', 'js/inject-ai.js', 'js/lunar.js', 'js/icondb.js', 'js/i18n.js'];
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
    // iconFor：精确命中 + 主域尾缀匹配 + 未收录返回 null
    sandbox.LT_ICONDB = { 'github.com': { c: '#1f2937', d: 'M0 0' }, 'wikipedia.org': { c: '#000', d: 'M1 1' } };
    assert(P.iconFor('https://github.com/susunola')?.d === 'M0 0', 'iconFor 精确匹配 github.com');
    assert(P.iconFor('https://zh.wikipedia.org/wiki/X')?.d === 'M1 1', 'iconFor 尾缀匹配 wikipedia.org');
    assert(P.iconFor('https://no-such-host-zzz.example/') === null, 'iconFor 未收录返回 null');
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
  }
  void elStub;
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

console.log('');
if (failures) {
  console.error(`smoke: ${failures} 项失败`);
  process.exit(1);
}
console.log('smoke: 全部通过');

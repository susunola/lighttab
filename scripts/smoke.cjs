#!/usr/bin/env node
/* LightTab offline smoke check (pure node, zero dependencies)
 * Usage: node scripts/smoke.cjs   — a non-zero exit code means failure
 *
 * Coverage:
 *  1) syntax check of all js files (equivalent to node --check)
 *  2) manifest.json is valid JSON and manifest_version === 3
 *  3) version consistency: manifest.json / newtab.html ver-line / app.js exportPayload() /
 *     gen.version in js/i18n.js (both zh and en)
 *  4) pure-function assertions: looksLikeUrl (URL detection), lunar known-date conversion,
 *     iconFor suffix matching, sanitizeWallpaperUrl whitelist,
 *     sanitizeIconDataUrl (#50 custom icon guard),
 *     resolveTheme (dark/light/system mapping),
 *     todayStr / pickRotateCandidate (#49 wallpaper rotation pure logic), i18n dict zh/en completeness
 *  5) newtab.html structural integrity (strip the data-page-node-id injected live by the preview panel while reading)
 *  6) #48 theme static structure: html default data-theme, #f-theme three options, theme entry hooks
 *  7) #49 wallpaper rotation static structure: #f-wall-rotate checkbox, entry hooks, K map contains walllib/rot
 *  8) #50 custom icon static structure: #f-icon upload, preview, remove, icon field import/render hooks
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
  console.error('FAIL  ' + name + (detail ? ' — ' + detail : ''));
}
function assert(cond, name, detail) { cond ? ok(name) : fail(name, detail); }

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ---------- 1) JS syntax ----------
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
  ok('manifest.json is valid JSON');
} catch (e) {
  fail('manifest.json is valid JSON', e.message);
}
if (manifest) {
  assert(manifest.manifest_version === 3, 'manifest_version === 3', String(manifest.manifest_version));
}

// ---------- 3) version consistency (after i18n, the actual render source of ver-line is gen.version in js/i18n.js) ----------
console.log('[3] version consistency');
// The preview panel live-injects data-page-node-id (even inside select/input tags);
// that is dev-environment noise, not a source defect, so strip it after reading before asserting.
const htmlRaw = read('newtab.html');
const html = htmlRaw.replace(/\s*data-page-node-id="[^"]*"/g, '');
const appSrc = read('js/app.js');
const canvasSrc = read('js/canvas.js'); // canvas layout was split out of app.js (v1.18.1)
const promptsSrc = read('js/prompts.js');
const cssSrc = read('css/style.css');
const i18nSrc = read('js/i18n.js');
const mHtml = html.match(/ver-line[^>]*>\s*LightTab v(\d+\.\d+\.\d+)/);
const mApp = appSrc.match(/\bversion:\s*'(\d+\.\d+\.\d+)'/);
const mI18nZh = i18nSrc.match(/'gen\.version':\s*\{\s*zh:\s*'LightTab v(\d+\.\d+\.\d+)/);
const mI18nEn = i18nSrc.match(/'gen\.version':\s*\{[^}]*en:\s*'LightTab v(\d+\.\d+\.\d+)/);
assert(!!mHtml, 'newtab.html ver-line carries the version (data-i18n fallback text)', mHtml && mHtml[0]);
assert(!!mApp, 'app.js exportPayload carries the version');
assert(!!mI18nZh && !!mI18nEn, 'i18n.js gen.version carries the version in both zh and en');
if (manifest && mHtml && mApp && mI18nZh && mI18nEn) {
  const vs = [manifest.version, mHtml[1], mApp[1], mI18nZh[1], mI18nEn[1]];
  assert(vs.every(v => v === vs[0]), `all five versions agree (${vs[0]})`, `manifest/html/app/i18n.zh/i18n.en = ${vs.join('/')}`);
}

// ---------- 4) pure-function assertions ----------
console.log('[4] pure functions');

// 4a) lunar.js: known date 2024-02-10 = Jiachen dragon year, lunar Jan 1 (Spring Festival)
{
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(read('js/lunar.js'), sandbox, { filename: 'lunar.js' });
  const L = sandbox.window.LT_LUNAR;
  assert(!!L, 'lunar.js exposes window.LT_LUNAR');
  if (L) {
    const lu = L.toLunar(2024, 2, 10);
    assert(!!lu && lu.year === 2024 && lu.month === 1 && lu.day === 1 && lu.isLeap === false,
      'toLunar(2024-02-10) = lunar 2024-01-01', JSON.stringify(lu));
    assert(L.ganzhiYear(2024) === '甲辰' && L.animalYear(2024) === '龙', '2024 = Jiachen dragon year',
      L.ganzhiYear(2024) + L.animalYear(2024));
    assert(L.monthName(1, false) === '正月' && L.dayName(1) === '初一', 'month/day name conversion');
  }
}

// 4b) app.js: load the IIFE in a stub environment (document.readyState='loading' → boot does not run), grab window.LT_PURE
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
  assert(!!P, 'app.js exposes window.LT_PURE');
  if (P) {
    // looksLikeUrl: a bare domain with path/query should be recognized as a URL; search terms with spaces must not misfire
    const urlCases = [
      ['github.com', true], ['github.com/susunola', true],
      ['example.com/path?q=a#f', true], ['https://foo.bar/x y', true],
      ['hello world', false], ['搜索 关键词', false], ['foo.c', false], ['a .com', false]
    ];
    for (const [input, want] of urlCases) {
      assert(P.looksLikeUrl(input) === want, `looksLikeUrl(${JSON.stringify(input)}) === ${want}`);
    }
    // sanitizeWallpaperUrl: whitelist + reject injection characters
    assert(P.sanitizeWallpaperUrl('data:image/jpeg;base64,AAAA') !== null, 'allow data:image/');
    assert(P.sanitizeWallpaperUrl('https://cdn.example.com/w.jpg') !== null, 'allow https:');
    assert(P.sanitizeWallpaperUrl("https://x.com/a');alert(1);//") === null, 'reject URLs containing quotes');
    assert(P.sanitizeWallpaperUrl('javascript:alert(1)') === null, 'reject javascript:');
    assert(P.sanitizeWallpaperUrl('http://x.com/a.jpg') === null, 'reject http:');
    // Factory default wallpaper: a local asset bundled in the extension
    assert(P.sanitizeWallpaperUrl('assets/wallpaper-dusk.jpg') !== null, 'allow bundled assets/ wallpapers');
    assert(P.sanitizeWallpaperUrl('assets/../etc/passwd') === null, 'reject assets/ path traversal');
    assert(fs.existsSync(path.join(ROOT, 'assets/wallpaper-dusk.jpg')), 'assets/wallpaper-dusk.jpg exists');
    assert(/BUNDLED_WALL = \{ type: 'image', value: 'assets\/wallpaper-dusk\.jpg'/.test(appSrc), 'factory default wallpaper is the bundled image');
    assert(/WALLPAPERS = \[[\s\S]{0,200}id: 'dusk',\s+name: 'Dusk Mountain', img: 'assets\/wallpaper-dusk\.jpg'/.test(appSrc), 'bundled wallpaper is the first preset swatch');
    assert(/'wp\.dusk':\s*\{\s*zh: '暮山', en: 'Dusk Mountain' \}/.test(i18nSrc), 'wp.dusk has both zh/en entries');
    assert(/replaceAll\('assets\/wallpaper-dusk\.jpg', 'data:image\/jpeg;base64,/.test(read('scripts/build-singlefile.cjs')),
      'single-file build inlines the bundled wallpaper as a dataURL');
    // Bundled Inter variable font: finer latin/digits, Chinese still uses system fonts, zero network
    assert(fs.existsSync(path.join(ROOT, 'assets/fonts/inter-var-latin.woff2')), 'assets/fonts/inter-var-latin.woff2 exists');
    assert(/@font-face/.test(cssSrc) && /font-family: "Inter";/.test(cssSrc) && /font-weight: 100 900/.test(cssSrc),
      'CSS declares Inter @font-face (variable weight)');
    assert(/--font-sans: "Inter",/.test(cssSrc) && /--font-num: "Inter",/.test(cssSrc), 'font stacks lead with Inter');
    assert(/replaceAll\('\.\.\/assets\/fonts\/inter-var-latin\.woff2', 'data:font\/woff2;base64,/.test(read('scripts/build-singlefile.cjs')),
      'single-file build inlines the font as a dataURL');
    // sanitizeIconDataUrl: #50 custom icons only accept local base64 raster images (png/jpeg/webp/gif)
    assert(P.sanitizeIconDataUrl('data:image/png;base64,iVBORw0KGgo=') !== null, 'allow data:image/png;base64');
    assert(P.sanitizeIconDataUrl('data:image/jpeg;base64,/9j/4AAQ') !== null, 'allow data:image/jpeg;base64');
    assert(P.sanitizeIconDataUrl('data:image/webp;base64,UklGR') !== null, 'allow data:image/webp;base64');
    assert(P.sanitizeIconDataUrl('data:image/svg+xml;base64,PHN2Zz4=') === null, 'reject svg dataURL');
    assert(P.sanitizeIconDataUrl('https://cdn.example.com/logo.png') === null, 'reject remote URL');
    assert(P.sanitizeIconDataUrl('data:text/html;base64,PGI+') === null, 'reject non-image dataURL');
    assert(P.sanitizeIconDataUrl("data:image/png;base64,AB'CD") === null, 'reject dataURL containing quotes');
    assert(P.sanitizeIconDataUrl('data:image/png;base64,' + 'A'.repeat(140 * 1024)) === null, 'reject icons over 128KiB');
    // iconCropRect: content-aware square crop (strips the tagline of tall images)
    const dense = (n) => Array(n).fill(0.6);
    let R = P.iconCropRect(300, 600, dense(600));
    assert(R.sx === 0 && R.sy === 0 && R.side === 300, 'tall image without gaps → top square', JSON.stringify(R));
    R = P.iconCropRect(300, 600, dense(200).concat(Array(400).fill(0)));
    assert(R.sx === 50 && R.sy === 0 && R.side === 200, 'tall image with gap below → take the first block only (the icon)', JSON.stringify(R));
    R = P.iconCropRect(400, 400, dense(400));
    assert(R.sx === 0 && R.sy === 0 && R.side === 400, 'near-square → whole image', JSON.stringify(R));
    R = P.iconCropRect(600, 300, null);
    assert(R.sx === 150 && R.sy === 0 && R.side === 300, 'wide image → center square crop', JSON.stringify(R));
    R = P.iconCropRect(300, 600, dense(200).concat(Array(200).fill(0)).concat(dense(200)));
    assert(R.sx === 50 && R.sy === 0 && R.side === 200, 'icon+gap+tagline → take the first block only', JSON.stringify(R));
    // iconFor: exact hit + apex-domain suffix matching + null when unlisted
    sandbox.LT_ICONDB = { 'github.com': { c: '#1f2937', d: 'M0 0' }, 'wikipedia.org': { c: '#000', d: 'M1 1' } };
    assert(P.iconFor('https://github.com/susunola')?.d === 'M0 0', 'iconFor exact match github.com');
    assert(P.iconFor('https://zh.wikipedia.org/wiki/X')?.d === 'M1 1', 'iconFor suffix match wikipedia.org');
    assert(P.iconFor('https://no-such-host-zzz.example/') === null, 'iconFor returns null when unlisted');
    // #59 iconGlyphHtml: the three entry shapes each render into the correct vector markup
    assert(P.iconGlyphHtml({ d: 'M0 0', c: '#1f2937' }).includes('<path fill="'), 'iconGlyphHtml mono → single path');
    const gMulti = P.iconGlyphHtml({ p: [{ d: 'M0 0', f: '#EA4335' }, { d: 'M1 1', f: '#4285F4' }], c: '#FFFFFF' });
    assert((gMulti.match(/<path /g) || []).length === 2 && gMulti.includes('#EA4335') && gMulti.includes('#4285F4'),
      'iconGlyphHtml multi-color → each subpath carries its own fill', gMulti);
    const gTx = P.iconGlyphHtml({ tx: '51CTO', c: '#FFFFFF', f: '#E60012' });
    assert(gTx.includes('logo-tx') && gTx.includes('>51CTO<') && gTx.includes('#E60012'),
      'iconGlyphHtml wordmark → <text> + brand color', gTx);
    assert(P.iconGlyphHtml({ tx: '<img src=x>', c: '#fff', f: '#000' }).includes('&lt;img'),
      'iconGlyphHtml wordmark escapes HTML');
    // More characters → smaller font, so long wordmarks never overflow the icon box
    const fsOf = (s) => Number(/font-size="([\d.]+)"/.exec(P.iconGlyphHtml({ tx: s, c: '#fff', f: '#000' }))[1]);
    assert(fsOf('O') > fsOf('文档') && fsOf('文档') > fsOf('小鹅通') && fsOf('小鹅通') > fsOf('51CTO'),
      'iconGlyphHtml wordmark font size shrinks as length grows');
    // #60 normalizeWidgets: missing/dirty data always falls back to DEFAULT_SETTINGS — the four legacy
    // widgets default to visible; the weather widget (opt-in) defaults off; only explicit booleans override defaults
    const NW = P.normalizeWidgets;
    assert(JSON.stringify(NW(undefined)) === JSON.stringify({ wclock: true, wcal: true, wtodo: true, wmovie: true, wweather: false }),
      'normalizeWidgets(undefined) → four visible by default, weather off');
    assert(JSON.stringify(NW(null)) === JSON.stringify({ wclock: true, wcal: true, wtodo: true, wmovie: true, wweather: false }),
      'normalizeWidgets(null) → four visible by default, weather off');
    assert(NW({ wcal: false }).wcal === false && NW({ wcal: false }).wclock === true && NW({ wcal: false }).wweather === false,
      'normalizeWidgets partial object → missing keys get defaults');
    assert(NW({ wweather: true }).wweather === true && NW({ wweather: true }).wmovie === true,
      'normalizeWidgets explicit true can turn on the default-off weather');
    assert(NW({ wclock: 0, wcal: '', wtodo: null, wweather: 1 }).wclock === true && NW({ wclock: 0, wcal: '', wtodo: null, wweather: 1 }).wweather === false,
      'normalizeWidgets non-boolean dirty values fall back to defaults (legacy visible / weather still off)');
    assert(NW({ bogus: false }).wclock === true && !('bogus' in NW({ bogus: false })),
      'normalizeWidgets drops unknown keys');
    assert(Object.values(NW({ wclock: false, wcal: false, wtodo: false, wmovie: false, wweather: false })).every((v) => v === false),
      'normalizeWidgets allows removing all (the whole left column collapses)');
    // resolveTheme: 'dark'/'light' map directly; 'system' falls back to dark without matchMedia, follows the system otherwise
    assert(P.resolveTheme('dark') === 'dark' && P.resolveTheme('light') === 'light', 'resolveTheme fixed dark/light');
    assert(P.resolveTheme('bogus') === 'dark', 'resolveTheme unknown value falls back to dark');
    assert(P.resolveTheme('system') === 'dark', 'resolveTheme system (no matchMedia) falls back to dark');
    const realMQ = sandbox.matchMedia;
    sandbox.matchMedia = () => ({ matches: true, addEventListener: () => {} });
    assert(P.resolveTheme('system') === 'light', 'resolveTheme system (prefers light) → light');
    sandbox.matchMedia = () => ({ matches: false, addEventListener: () => {} });
    assert(P.resolveTheme('system') === 'dark', 'resolveTheme system (prefers dark) → dark');
    sandbox.matchMedia = realMQ;
    // #49 wallpaper rotate: todayStr shape + pure candidate picker
    assert(/^\d{4}-\d{2}-\d{2}$/.test(P.todayStr()), 'todayStr() is YYYY-MM-DD', String(P.todayStr()));
    const rotPool = [
      { url: 'https://a.example/1.jpg', title: 'A' },
      { url: 'https://a.example/2.jpg', title: 'B' },
      null,
      { title: 'no url' }
    ];
    assert(P.pickRotateCandidate(rotPool, '') === rotPool[0], 'pickRotateCandidate empty current takes the pool head');
    assert(P.pickRotateCandidate(rotPool, 'https://a.example/1.jpg') === rotPool[1], 'pickRotateCandidate skips the current wallpaper');
    assert(P.pickRotateCandidate(rotPool, 'https://a.example/9.jpg') === rotPool[0], 'pickRotateCandidate takes the head when current is not in the pool');
    assert(P.pickRotateCandidate([], '') === null, 'pickRotateCandidate empty pool returns null');
    assert(P.pickRotateCandidate(null, '') === null, 'pickRotateCandidate non-array pool returns null');
    // #65 plum-blossom quote picker: deterministic around the previous index
    assert(P.pickQuoteIndex(0, -1) === -1, 'pickQuoteIndex empty list returns -1');
    assert(P.pickQuoteIndex(1, 0) === 0, 'pickQuoteIndex single entry always picks 0');
    assert(P.pickQuoteIndex(1, 7) === 0, 'pickQuoteIndex single entry ignores the previous one');
    const qi = P.pickQuoteIndex(5, 2);
    assert(qi >= 0 && qi < 5 && qi !== 2, 'pickQuoteIndex skips the previous one (2 of 5)');
    assert(P.pickQuoteIndex(5, -1) >= 0 && P.pickQuoteIndex(5, -1) < 5, 'pickQuoteIndex picks a random one without a previous');
  }
  void elStub;
}

// 4b-2) icondb.js: data integrity of the real icon library (since #59 the library mixes mono/multi-color/wordmark shapes)
{
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const src = read('js/icondb.js');
  vm.runInContext(src, sandbox, { filename: 'icondb.js' });
  const DB = sandbox.window.LT_ICONDB;
  assert(!!DB, 'icondb.js exposes window.LT_ICONDB');
  if (DB) {
    const keys = Object.keys(DB);
    // literal entry count === runtime key count, otherwise a duplicate host was silently overwritten by the later one
    const literal = (src.match(/^ {2}"[^"]+":/gm) || []).length;
    assert(literal === keys.length, `icon library has no duplicate hosts (${literal} literal / ${keys.length} runtime)`);
    assert(keys.length >= 100, `icon library covers >=100 sites (currently ${keys.length})`);

    const HEX = /^#[0-9a-fA-F]{6}$/;
    const bad = [];
    let mono = 0, multi = 0, tx = 0;
    // Same origin as the contrast guard in iconGlyphHtml: a glyph that melts into the background renders as a blank tile
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
        if (!Array.isArray(e.p) || !e.p.length) bad.push(`${host}: empty p[]`);
        else {
          for (const s of e.p) {
            if (!s.d) bad.push(`${host}: subpath missing d`);
            if (!HEX.test(s.f)) bad.push(`${host}: subpath fill=${s.f}`);
          }
          const best = Math.max(...e.p.map((s) => (HEX.test(s.f) ? contrast(s.f, e.c) : 0)));
          if (best < 1.35) bad.push(`${host}: all fills melt into the background ${e.c}`);
        }
      } else if (e.tx) {
        tx++;
        if (!HEX.test(e.f)) bad.push(`${host}: wordmark f=${e.f}`);
        else if (contrast(e.f, e.c) < 1.35) bad.push(`${host}: wordmark has no contrast against the background`);
        if ([...e.tx].length > 6) bad.push(`${host}: wordmark too long ${e.tx}`);
      } else if (e.d) {
        mono++;
      } else {
        bad.push(`${host}: matches none of the three shapes`);
      }
    }
    assert(bad.length === 0, 'every icon entry is structurally complete and contrasts with its background', bad.slice(0, 4).join(' | '));
    assert(mono > 0 && multi > 0 && tx > 0, `all three shapes present (mono ${mono} / multi ${multi} / wordmark ${tx})`);

    // #59 sites explicitly named by the user must be in the library
    const MUST = ['cloud.tencent.com', 'intl.cloud.tencent.com', 'aws.amazon.com', 'azure.microsoft.com',
      'cloud.google.com', 'huaweicloud.com', 'console-intl.huaweicloud.com', 'aliyun.com', 'alibabacloud.com',
      'doubao.com', 'kimi.com', 'weread.qq.com', 'chat.google.com', 'outlook.com', 'docs.qq.com',
      'imooc.com', '51cto.com', 'time.geekbang.org', 'xiaoe-tech.com'];
    const missing = MUST.filter((h) => !DB[h]);
    assert(missing.length === 0, `all ${MUST.length} sites named in #59 are covered`, missing.join(', '));

    // Zero network: no remote references may appear in the library body
    assert(!/https?:\/\//.test(src.replace(/^\/\*[\s\S]*?\*\//, '')), 'icon library body has no remote URLs (keeps zero network requests)');
  }
}

// 4c) i18n.js: dictionary zh/en completeness (every key has both values), incl. sync.applied added in this batch
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(read('js/i18n.js'), sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  assert(!!I && typeof I.t === 'function', 'i18n.js exposes window.LT_I18N.t');
  if (I) {
    assert(I.t('sync.applied') === '已从云端同步更新', "t('sync.applied') zh entry");
    I.setLang('en');
    assert(I.t('sync.applied') === 'Updated from cloud sync', "t('sync.applied') en entry");
    I.setLang('zh');
    // #48 theme: gen.theme label + three option entries, one per language
    assert(I.t('gen.theme') === '主题' && I.t('theme.dark') === '深色' && I.t('theme.light') === '浅色' && I.t('theme.system') === '跟随系统', 'theme entries zh');
    I.setLang('en');
    assert(I.t('gen.theme') === 'Theme' && I.t('theme.dark') === 'Dark' && I.t('theme.light') === 'Light' && I.t('theme.system') === 'Follow system', 'theme entries en');
    I.setLang('zh');
    // #49 wallpaper rotate keys: both languages must be actually translated (never echo the key back)
    const rotKeys = ['wall.rotate', 'wall.rotate_tip', 'wall.got_cached', 'toast.wall_rotate_on'];
    const allTranslated = lang => rotKeys.every(k => I.t(k) !== k && I.t(k).length > 0);
    assert(allTranslated('zh'), 'wallpaper rotation entries translated in zh', rotKeys.map(k => I.t(k)).join(' | '));
    I.setLang('en');
    assert(allTranslated('en'), 'wallpaper rotation entries translated in en', rotKeys.map(k => I.t(k)).join(' | '));
    I.setLang('zh');
    // #50 custom icon keys: both languages translated
    const iconKeys = ['icon.label', 'icon.upload', 'icon.remove', 'icon.tip', 'toast.icon_invalid'];
    assert(iconKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'custom icon entries translated in zh', iconKeys.map(k => I.t(k)).join(' | '));
    I.setLang('en');
    assert(iconKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'custom icon entries translated in en', iconKeys.map(k => I.t(k)).join(' | '));
    I.setLang('zh');
    // #62 multi-source wallpapers (Bing / Wallhaven / Unsplash): entries in both languages
    const srcKeys = ['wall.src', 'wall.src_bing', 'wall.src_wallhaven', 'wall.src_unsplash', 'wall.src_unsplash_key'];
    assert(srcKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'wallpaper source entries translated in zh', srcKeys.map(k => I.t(k)).join(' | '));
    I.setLang('en');
    assert(srcKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'wallpaper source entries translated in en', srcKeys.map(k => I.t(k)).join(' | '));
    I.setLang('zh');
  }
}

// ---------- 5) newtab.html is clean ----------
console.log('[5] newtab.html');
const injected = (htmlRaw.match(/data-page-node-id/g) || []).length;
if (injected) console.log(`  (preview panel injected ${injected} data-page-node-id attributes, stripped; does not affect assertions)`);
assert(/<\/html>\s*$/.test(html), 'document ends with </html> (structure complete)');

// ---------- 6) #48 theme static structure ----------
console.log('[6] #48 theme');
assert(/<html lang="en" data-theme="dark"/.test(html), 'html tag defaults to data-theme="dark"');
const themeSel = html.match(/<select id="f-theme">([\s\S]*?)<\/select>/);
assert(!!themeSel, 'settings page contains the #f-theme dropdown');
if (themeSel) {
  const opts = [...themeSel[1].matchAll(/<option value="(dark|light|system)"/g)].map(m => m[1]);
  assert(opts.join(',') === 'dark,light,system', '#f-theme has the three options dark/light/system', opts.join(','));
}
assert(/data-i18n="gen\.theme"/.test(html), 'theme label carries data-i18n="gen.theme"');

// ---------- 7) #49 wallpaper rotation static structure ----------
console.log('[7] #49 wallpaper rotation');
assert(/<input type="checkbox" id="f-wall-rotate">/.test(html), 'settings page contains the #f-wall-rotate checkbox');
assert(/data-i18n="wall\.rotate"/.test(html), 'rotation label carries data-i18n="wall.rotate"');
assert(/data-i18n="wall\.rotate_tip"/.test(html), 'rotation tip carries data-i18n="wall.rotate_tip"');
assert(/walllib:\s*'lt\.walllib'/.test(appSrc), 'K map contains lt.walllib (local cache pool)');
assert(/rot:\s*'lt\.rot'/.test(appSrc), 'K map contains lt.rot (daily rotation bookkeeping)');
assert(/function maybeAutoRotate/.test(appSrc), 'app.js defines maybeAutoRotate()');
assert(/function markManualPickToday/.test(appSrc), 'app.js defines markManualPickToday()');
assert(/pickRotateCandidate|todayStr/.test(appSrc), 'app.js exports the rotation pure functions to LT_PURE');

// ---------- 7b) #62 multi-source wallpaper static structure ----------
console.log('[7b] #62 multi-source wallpapers');
assert(/<select id="f-wall-src"/.test(html), 'settings page contains the #f-wall-src wallpaper source dropdown');
assert(/<option value="wallhaven"/.test(html), 'dropdown contains the wallhaven source');
assert(/<option value="bing"/.test(html), 'dropdown contains the bing source');
assert(/<option value="unsplash"/.test(html), 'dropdown contains the unsplash source (enabled once a key is configured server-side)');
assert(/function syncWallSources/.test(appSrc), 'app.js defines syncWallSources()');
assert(/source:\s*src/.test(appSrc), 'fetchWallLib builds request params from source');
assert(/\/v1\/wallpapers\/sources/.test(appSrc), 'app.js queries the /v1/wallpapers/sources capability endpoint');
assert(/wall\.src_bing/.test(appSrc) || /wall\.src_bing/.test(html), 'entry wall.src_bing is referenced');


// ---------- 8) #50 custom card icon static structure ----------
console.log('[8] #50 custom icons');
assert(/<input id="f-icon" type="file"/.test(html), 'shortcut modal contains the #f-icon upload input');
assert(/id="f-icon-preview"/.test(html), 'modal contains the #f-icon-preview preview cell');
assert(/id="f-icon-remove"/.test(html), 'modal contains the #f-icon-remove remove button');
assert(/data-i18n="icon\.(label|upload|remove|tip)"/.test(html), 'icon section entry hooks are complete');
assert(/function sanitizeIconDataUrl/.test(appSrc), 'app.js defines sanitizeIconDataUrl()');
assert(/function compressIconSquare/.test(appSrc), 'app.js defines compressIconSquare()');
assert(/let pendingIcon/.test(appSrc), 'app.js defines the pendingIcon modal staging state');
assert(/logo-img/.test(appSrc) && /logo-img/.test(cssSrc), 'card rendering/styling supports .logo-img (img branch)');
assert(/icon:\s*sanitizeIconDataUrl\(it\.icon\)/.test(appSrc), 'doImport validates and keeps the icon field');
assert(/it\.icon = icon/.test(appSrc), 'edit-save writes the icon field');
assert(/has-custom-icon/.test(appSrc) && /\.has-custom-icon/.test(cssSrc), 'custom-icon cards get the has-custom-icon class; CSS gives a theme-aware neutral base');
assert(/function iconCropRect/.test(appSrc), 'app.js defines iconCropRect (content-aware crop)');
assert(/iconCropRect/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'iconCropRect is exported to LT_PURE');

// ---------- 9) #60 removable left-column widgets ----------
console.log('[9] #60 removable left-column widgets');
for (const id of ['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather']) {
  assert(new RegExp(`class="w-del" data-widget="${id}"`).test(html), `${id} widget has a remove button`);
  assert(new RegExp(`id="f-w-${id}"`).test(html), `settings page contains the #f-w-${id} checkbox`);
}
assert(/data-i18n="gen\.widgets"/.test(html) && /data-i18n="gen\.widgets_tip"/.test(html), 'settings widget section entry hooks are complete');
assert(/data-i18n-aria="widget\.remove"/.test(html), 'remove button carries the a11y entry');
assert(/widgets:\s*\{\s*wclock:\s*true/.test(appSrc), 'DEFAULT_SETTINGS contains widgets defaulting to all on');
assert(/wweather: false/.test(appSrc), 'weather widget defaults off in DEFAULT_SETTINGS (opt-in)');
assert(/const WIDGETS = \['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather'\]/.test(appSrc), 'app.js defines WIDGETS as the single source of truth');
assert(/function normalizeWidgets/.test(appSrc), 'app.js defines normalizeWidgets()');
assert(/function applyWidgets/.test(appSrc), 'app.js defines applyWidgets()');
assert(/function removeWidget/.test(appSrc), 'app.js defines removeWidget()');
assert(/normalizeWidgets/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'normalizeWidgets is exported to LT_PURE');
assert(/\.widget \.w-del/.test(cssSrc) && /\.widget:hover \.w-del/.test(cssSrc), 'CSS defines hover-revealed .w-del');
assert(/@media \(hover: none\)[\s\S]{0,120}\.w-del/.test(cssSrc), 'remove button stays visible on touch devices without hover');
assert(/\.wgt-rows/.test(cssSrc), 'CSS defines the settings checkbox group .wgt-rows');
// widgets must live inside settings, so export/import/cloud sync carry it for free
assert(!/'lt\.widgets'/.test(appSrc), 'widgets does not get its own storage key (syncs and exports with settings)');
assert(/state\.settings\.widgets = normalizeWidgets\(state\.settings\.widgets\)/.test(appSrc), 'doImport validates the widgets field');
// All four paths — remove/restore/cloud pull/reset — must re-apply once
assert((appSrc.match(/applyWidgets\(\)/g) || []).length >= 6, 'applyWidgets is called on boot/remove/import/reset/cloud-pull paths');
// Free-canvas mode: coordinates are frozen, removing a widget must recompute them, and must not
// clobber the user's hand-dragged arrangement
// (the canvas implementation is split into js/canvas.js, related assertions read canvasSrc; boot call sites stay in app.js)
assert(/layout\.auto = true/.test(canvasSrc), 'captureLayout marks auto layout');
assert((canvasSrc.match(/\.auto = false/g) || []).length >= 2, 'both block dragging and card dragging mark the layout as manual');
assert(/function widgetLayoutStale/.test(canvasSrc), 'canvas.js defines widgetLayoutStale() (stale coordinate detection on cold start)');
assert(/function recaptureBlocksFromFlow/.test(canvasSrc), 'canvas.js defines recaptureBlocksFromFlow()');
assert(/if \(!l \|\| \(l\.auto === false && !force\)\) return/.test(canvasSrc), 'manual layouts are not overwritten by auto recompute');
assert(/recaptureBlocksFromFlow\(true\)/.test(appSrc), 'widget toggling/column switching is an explicit structural change: force re-flow (keep the manual flag)');
assert(/next\.auto = l\.auto !== false/.test(canvasSrc), 'forced re-flow only refreshes coordinates, keeping the manual layout flag');
assert(/next\.cards = captureCardLayout\(\)/.test(canvasSrc), 'card coordinates are re-derived during recompute (grid width changes the column count)');
assert(/if \(window\.LT_CANVAS\.widgetLayoutStale\(\)\) window\.LT_CANVAS\.recaptureBlocksFromFlow\(\)/.test(appSrc), 'stale canvas coordinates are fixed at startup');

// ---------- 10) #61 WorkBuddy local probing + clock position ----------
console.log('[10] #61 WorkBuddy probing / clock position');
// The probe protocol must match the one bundled with WorkBuddy Desktop (port table / path / timeout)
assert(/WB_PROBE_PORTS = \[18488, 18489, 18490\]/.test(appSrc), 'port table matches WorkBuddy official (18488-18490)');
assert(/WB_PROBE_PATH = '\/workbuddy\/probe'/.test(appSrc), 'probe path is /workbuddy/probe');
assert(/WB_PROBE_TIMEOUT = 1500/.test(appSrc), 'single-port timeout is 1500ms (matches the official web client)');
assert(/j\.app === 'workbuddy-desktop'/.test(appSrc), 'validates the app field of the response, rejecting impostor services');
assert(/AbortController/.test(appSrc), 'probe carries an AbortController timeout so the page never hangs');
assert(/function probeWorkBuddy/.test(appSrc), 'app.js defines probeWorkBuddy()');
assert(/function verifyWorkBuddyLaunch/.test(appSrc), 'app.js defines verifyWorkBuddyLaunch() (post-launch receipt)');
assert(/if \(dlN\) verifyWorkBuddyLaunch\(\)/.test(appSrc), 'async re-verify after deep-link launch');
assert(/window\.open\(deepLinkUrl/.test(appSrc), 'deep link still window.open synchronously inside the user gesture');
assert(/window\.LT_PROBE_WB = probeWorkBuddy/.test(appSrc), 'probe function is exported for offline verification drivers');
assert(/eng-state/.test(appSrc) && /\.eng-state\.on/.test(cssSrc), 'engine dropdown has a status dot style');
// Engine mini logos: engines with a brand icon reuse the icon library (baidu/google/github/bilibili/doubao/openai); others get a letter tile
assert(/function engLogoHtml/.test(appSrc), 'app.js defines engLogoHtml()');
assert(/ENG_ICON_HOST = \{[^}]*baidu: 'baidu\.com'/.test(appSrc) && /openai: 'openai\.com'/.test(appSrc), 'engine-to-icon-library host mapping is complete');
assert(!/eng-dot/.test(appSrc) && !/eng-dot/.test(cssSrc) && !/eng-dot/.test(html), 'the old eng-dot color dots are gone');
assert(/\.eng-logo \{/.test(cssSrc) && /\.eng-letter \{/.test(cssSrc), 'CSS defines .eng-logo / .eng-letter');
// Search engine management: custom add + built-in removable (undo), all going through the allEngines() runtime list
assert(/function allEngines\(\)/.test(appSrc) && /allEngines,/.test(appSrc), 'allEngines() is defined and exported to LT_APP');
assert(/customEngines: \[\]/.test(appSrc) && /hiddenEngines: \[\]/.test(appSrc), 'DEFAULT_SETTINGS contains customEngines/hiddenEngines');
assert(!/\bENGINES\.map/.test(appSrc) && !/\bENGINES\.find\(/.test(appSrc.replace(/ENG_ICON_HOST[\s\S]*?\};/, '')),
  'runtime no longer reads the built-in ENGINES list directly (allEngines is the fallback)');
assert(!/A\(\)\.ENGINES/.test(promptsSrc), 'prompts.js goes through allEngines()');
assert(/id="engm-list"/.test(html) && /id="engm-add"/.test(html) && /id="engm-restore"/.test(html), 'settings panel contains the engine management section');
assert(/url\.includes\('\{q\}'\)/.test(appSrc), 'custom engine URLs must contain the {q} placeholder');
assert(/toast\.eng_last/.test(appSrc), 'forbid deleting when only one engine remains');
assert(/toast\.eng_removed.*toast\.undo/.test(appSrc), 'engine deletion goes through an undo toast');
assert(!/if \(ttl\) toastTimer/.test(appSrc), 'toast without an explicit ttl still auto-dismisses (no permanent toast)');
assert(/const ms = ttl \|\| \(actionLabel \? 6000 : 2600\)/.test(appSrc), 'toast default ttl: 2.6s plain / 6s with action');
for (const k of ['engm.title','engm.name_ph','engm.url_ph','engm.add','engm.restore','engm.tip','engm.del','engm.deeplink','toast.eng_added','toast.eng_removed','toast.eng_invalid','toast.eng_last']) {
  const re = new RegExp("'" + k.replace('.', '\\.') + "':\\s*\\{\\s*zh: '[^']+', en: '[^']+' \\}");
  assert(re.test(i18nSrc), `i18n entry ${k} complete in zh/en`);
}
assert(!/host_permissions/.test(read('manifest.json')), 'no host_permissions requested (relies on the target site CORS)');
for (const k of ['wb.running', 'wb.not_running', 'wb.not_detected', 'wb.get']) {
  assert(i18nSrc.includes(`'${k}'`), `i18n contains ${k}`);
}
// ---------- #62 per-widget position (clock / calendar / todo can each be placed above the search box) ----------
assert(/widgetPos: \{ wclock: 'top', wcal: 'left', wtodo: 'left', wmovie: 'left', wweather: 'left' \}/.test(appSrc),
  'DEFAULT_SETTINGS widgetPos defaults to only the clock on top; calendar/todo/movie/weather in the left column');
// The top slot wants a glanceable "time + one-line date", not the full date+lunar+ganzhi sentence
assert(/function compactDateLine/.test(appSrc), 'app.js defines compactDateLine() (compact date line for the top state)');
assert(/function clockIsTop/.test(appSrc), 'app.js defines clockIsTop()');
assert(/top \? compactDateLine\(d\) : dateLine\(d\)/.test(appSrc), 'clock switches the date-line format by position');
assert(/if \(lunarEl\) lunarEl\.textContent = top \? '' : lunarLine\(d\)/.test(appSrc),
  'top state no longer renders a separate lunar line (merged into the compact line)');
// tick only rewrites the text across day boundaries; a position change must force a redraw, otherwise the date line keeps the old format
assert(/\|\$\{clockIsTop\(\) \? 't' : 'l'\}/.test(appSrc), 'date cache key carries the position, so a position change invalidates it');
assert(/if \(clockTimer\) startClock\(\);/.test(appSrc), 'clock is force-redrawn after applyWidgetPos');
assert(/\.widget\.wclock\.w-top \.clock-greet \{ display: none/.test(cssSrc)
  || /clock-lunar,\n\.widget\.wclock\.w-top \.clock-greet \{ display: none/.test(cssSrc),
  'top state hides the lunar line and the greeting');
assert(/function normalizeWidgetPos/.test(appSrc), 'app.js defines normalizeWidgetPos()');
assert(/function applyWidgetPos/.test(appSrc), 'app.js defines applyWidgetPos()');
assert(/applyWidgetPos\(\);/.test(appSrc), 'applyWidgets drives applyWidgetPos');
assert(/normalizeWidgetPos/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''),
  'normalizeWidgetPos is exported to LT_PURE');
assert(!/clockPos/.test(cssSrc) && !/wclock-top/.test(cssSrc), 'old wclock-top CSS is gone');
for (const id of ['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather']) {
  assert(new RegExp(`id="f-pos-${id}"`).test(html), `settings page contains the #f-pos-${id} position dropdown`);
}
assert(/data-i18n="wpos\.top"/.test(html) && /data-i18n="wpos\.left"/.test(html), 'position option entries are complete');
// The settings form has three global rules (.modal-body label / label>span / select) with higher specificity than bare class selectors;
// without the .modal-body qualifier this row of controls gets crushed into full-width stacked blocks (measured row height 29px→80px this time)
assert(/\.modal-body label\.wgt-row/.test(cssSrc), '.wgt-row is raised in specificity via .modal-body label.wgt-row');
assert(/\.modal-body \.wgt-row > span\.wgt-name/.test(cssSrc), '.wgt-name is raised in specificity via .modal-body');
assert(/\.modal-body select\.wgt-pos/.test(cssSrc), '.wgt-pos is raised in specificity via .modal-body select');
assert(!/(?:^|\})\s*\.wgt-row \{/m.test(cssSrc), 'no bare .wgt-row rule (it would be broken through by the global label rule)');
assert(!/(?:^|\})\s*\.wgt-pos \{/m.test(cssSrc), 'no bare .wgt-pos rule (it would be broken through by the global select rule)');
assert(i18nSrc.includes("'wpos.top'") && i18nSrc.includes("'wpos.left'"), 'i18n contains the two wpos entries');
assert(!/clockpos\./.test(i18nSrc) && !/gen\.clock_pos/.test(i18nSrc), 'old clockpos entries are gone');
assert(/\.widget\.w-top \{/.test(cssSrc), 'CSS defines the generic .widget.w-top');
// Top-state styles must be qualified with .widget, otherwise later same-specificity .wclock/.wcal rules override them
assert(!/^\.w-top /m.test(cssSrc), 'top-state selectors are all qualified with .widget (avoids being overridden by later same-specificity rules)');
assert(/\.widget\.wclock\.w-top/.test(cssSrc) && /\.widget\.wcal\.w-top/.test(cssSrc),
  'clock and calendar each have their own top-state styles');
// The top stack 10px gap may only apply in flow: canvas coordinates already include it, applying again would double-press by 10px
assert(/\.layout:not\(\.canvas\) \.widget\.w-top \+ \.widget\.w-top/.test(cssSrc),
  'top-stack spacing is limited to non-canvas mode (otherwise applied twice on canvas)');
// A calendar cell is two lines, "date + lunar"; pinning height/line-height would clip the second line
assert(!/\.widget\.wcal\.w-top \.cal-cell[^}]*line-height/.test(cssSrc),
  'calendar top state does not pin cell line-height (would clip the lunar line)');
// Top-state widgets always anchor their x/w to the search box (even manual layouts with stale coordinates won't drift); y stays the user's
assert(/pos\[b\.key\] === 'top'/.test(canvasSrc), 'applyCanvas recognizes top-state widgets');
assert(/sc\.x \+ \(\(typeof sc\.w === 'number' \? sc\.w : w\) - w\) \/ 2/.test(canvasSrc),
  'top-state widgets are horizontally centered on the search box (manual layouts with stale coordinates will not drift either)');
assert(/Math\.min\(typeof w === 'number' \? w : 640, 640\)/.test(canvasSrc),
  'top-state widget width converges to 640 (canvas mode max-width:none would unleash old coordinate widths)');
// Top state has no card background — text sits directly on the wallpaper: with a bright wallpaper + dark theme,
// white text needs a strong enough shadow, otherwise the 88px/light-weight clock fades to near-invisible ("the clock disappeared")
assert(/\.widget\.w-top \{[^}]*text-shadow/.test(cssSrc), 'top-state widgets carry an inherited text shadow (readable on bright wallpapers)');
assert(/\.widget\.wclock\.w-top \.clock-hhmm \{[^}]*text-shadow: 0 1px 3px/.test(cssSrc),
  'top clock uses a reinforced multi-layer shadow');
assert(!/\.widget\.wclock\.w-top \.clock-hhmm \{[^}]*font-weight: 200/.test(cssSrc),
  'top clock no longer uses weight 200 (nearly invisible on bright wallpapers)');
assert(/\.widget\.wclock\.w-top \.clock-date \{[^}]*color: var\(--ink\)/.test(cssSrc),
  'top clock date line uses --ink instead of the dimmer --ink-2');
// Stale detection and self-healing re-layout
assert(/normalizeWidgetPos\(st && st\.widgetPos\)/.test(canvasSrc), 'canvas staleness detection judges by per-widget position');
assert(/function topStackOverlaps/.test(canvasSrc), 'canvas.js defines topStackOverlaps()');
assert(/function relayoutTopStackIfNeeded/.test(canvasSrc), 'canvas.js defines relayoutTopStackIfNeeded()');
assert(/relayoutTopStackIfNeeded\(\); \}\);/.test(canvasSrc), 'top-stack self-healing is hooked into ResizeObserver');
assert(/relayoutBusy/.test(canvasSrc), 'self-healing has re-entry protection (avoids relayout triggering relayout)');
assert(/if \(!l \|\| l\.auto === false\) return; \/\/ a hand-dragged/.test(canvasSrc),
  'hand-dragged layouts are not overwritten by self-healing relayout');
// schema migration: the old single clockPos must move smoothly into widgetPos
assert(/const SCHEMA_VERSION = 4;/.test(appSrc), 'SCHEMA_VERSION bumped to 4');
assert(/3: \(d\) => \{/.test(appSrc), 'MIGRATIONS contains v3→v4');
assert(/delete st\.clockPos/.test(appSrc), 'old clockPos field is deleted after migration');
assert(/state\.settings\.widgetPos = normalizeWidgetPos\(state\.settings\.widgetPos\)/.test(appSrc),
  'doImport validates widgetPos');
// Card coordinate GC: grid slots of deleted cards must be reclaimed, otherwise new cards get pushed to the back
assert(/for \(const id in map\) if \(!alive\.has\(id\)\)/.test(canvasSrc), 'assignInitialCardLayout reclaims stale card coordinates');
assert(/if \(pruned\) \{/.test(canvasSrc) && /setCardLayoutMap\(map\)/.test(canvasSrc), 'coordinates are persisted once after reclamation');
// Deleting a card must not leave a hole: survivors are compacted into consecutive slots in reading order
assert(/a\[1\]\.row - b\[1\]\.row/.test(canvasSrc) && /col: i % cols, row: Math\.floor\(i \/ cols\)/.test(canvasSrc),
  'remaining card coordinates are compacted in reading order after reclamation');


// ---------- 11) glassmorphism tokens ----------
console.log('[11] glassmorphism');
// Dark-theme glass must be "dark and slightly translucent" rather than a white overlay: white brightens
// an already-bright wallpaper — measured white-text contrast is only 1.72:1 at 7% white (WCAG AA needs 4.5)
assert(/--glass: rgba\(12, 16, 28, 0\.48\)/.test(cssSrc), 'dark glass is dark-translucent rgba(12,16,28,.48)');
assert(!/:root[\s\S]{0,900}--glass: rgba\(255, 255, 255/.test(cssSrc), 'dark theme no longer uses white glass');
assert(/--glass: rgba\(255, 255, 255, 0\.36\)/.test(cssSrc), 'light glass reduced to 0.36 (0.50 still looks white, 0.36 lets the wallpaper through)');
// Single blur token + saturate: pure blur desaturates the background and looks plasticky
assert(/--glass-blur: blur\(20px\) saturate\(150%\)/.test(cssSrc), 'dark glass-blur carries saturate');
assert(/--glass-blur: blur\(20px\) saturate\(185%\)/.test(cssSrc), 'light glass-blur carries saturate');
// Frosted material: diagonal sheen + edge reflection. The earlier SVG noise grain looked dirty over
// photo wallpapers and was removed — this guards "no more grain" against regression
assert(!/--frost-grain/.test(cssSrc), 'glass no longer stacks noise grain (looked dirty on wallpapers)');
assert(!/background-blend-mode/.test(cssSrc), 'glass surfaces no longer blend grain with blend-mode');
assert(/--frost-sheen: linear-gradient\(135deg/.test(cssSrc), 'defines the diagonal sheen --frost-sheen');
assert((cssSrc.match(/--frost-sheen:/g) || []).length === 2, 'dark and light themes each have their own sheen strength');
assert((cssSrc.match(/--frost-edge:/g) || []).length === 2, 'dark and light themes each have their own edge reflection');
assert((cssSrc.match(/box-shadow: var\(--frost-edge\)/g) || []).length >= 2, 'main glass surfaces use --frost-edge for edges');
assert(/background-image: var\(--frost-sheen\);/.test(cssSrc), 'sheen is layered as a background image');
// Shortcut cards are not glass: at rest they sit directly on the wallpaper (iTab style); the glass pill only appears on hover
assert(!/\.widget,\s*\n\.card,/.test(cssSrc), 'cards are not in the shared frosted-layer rule');
assert(/\.card \{[^}]*background: none/.test(cssSrc), 'cards have no background at rest (sit directly on the wallpaper)');
assert(/\.card:hover \{[^}]*backdrop-filter/.test(cssSrc), 'the glass pill only appears on card hover');
assert(/\.card \.title \{[^}]*text-shadow/.test(cssSrc), 'card titles carry a text shadow (readable on wallpapers)');
// Add tile: the last cell of the grid (iTab convention); no more floating button in the bottom-right corner
assert(!/add-float/.test(html) && !/add-float/.test(cssSrc) && !/add-float/.test(appSrc), 'bottom-right floating add button has been removed');
assert(/class="card card-add" data-id="__add__"/.test(appSrc), 'renderGrid renders the __add__ add tile');
assert(/querySelector\('\.card-add'\)\.addEventListener\('click', \(\) => openSiteModal\(null\)\)/.test(appSrc),
  'clicking the add tile opens the create modal');
assert(/'__add__'\]\)/.test(canvasSrc), 'canvas coordinate reclamation keeps the __add__ tile slot');
assert(/\.card-add \.ico \{[^}]*dashed/.test(cssSrc), 'the add tile uses a dashed placeholder style');
// Use a background layer instead of ::before: widgets already have absolutely positioned children (.w-del / drag handles),
// and an absolutely positioned pseudo-element would cover them
assert(!/\.(widget|card|search)::before\s*\{/.test(cssSrc), 'frost layer does not use ::before (would cover absolutely positioned children)');
// The background shorthand wipes background-image, so the three major surfaces must use background-color
assert(!/^\s*background: var\(--glass\);/m.test(cssSrc), 'glass surfaces use background-color, avoiding the shorthand wiping the frost layer');
assert((cssSrc.match(/backdrop-filter: var\(--glass-blur\)/g) || []).length >= 10,
  'main glass surfaces uniformly go through --glass-blur');
assert(!/backdrop-filter: blur\(1[468]px\)/.test(cssSrc), 'no more hardcoded 14/16/18px blurs');
assert(/--glass-hl:/.test(cssSrc) && (cssSrc.match(/inset 0 1px 0 var\(--glass-hl\)/g) || []).length >= 2,
  'inner highlight goes through --glass-hl (the previously hardcoded value was invisible in the light theme)');

// ---------- 12) #63 top-right profile avatar ----------
console.log('[12] #63 top-right avatar');
// Static structure: top-right avatar button + dropdown menu + settings upload area (local-first, login state only mirrored)
for (const id of ['btn-avatar', 'avatar-img', 'avatar-initial', 'avatar-fallback', 'avatar-menu',
  'avatar-big', 'avatar-open-set', 'avatar-sync', 'avatar-sync-label',
  'avatar-export', 'f-avatar', 'f-avatar-remove', 'avatar-preview']) {
  assert(new RegExp(`id="${id}"`).test(html), `newtab.html contains #${id}`);
}
assert(/data-i18n-title="avatar\.title"/.test(html), 'avatar button carries data-i18n-title="avatar.title"');
assert(/aria-haspopup="menu"/.test(html) && /role="menu"/.test(html), 'avatar/menu carry menu a11y semantics');
assert(/id="f-avatar"[^>]*type="file"/.test(html), 'settings page contains the #f-avatar file upload input');
assert(/accept="image\/png,image\/jpeg,image\/webp,image\/gif"/.test(html), 'upload only accepts raster images (png/jpeg/webp/gif)');
// JS: avatar dataURL + name initial + default person silhouette, three fallback layers; cloud-sync login state is only mirrored in the dropdown
assert(/avatar:\s*''/.test(appSrc), "DEFAULT_SETTINGS contains avatar: '' empty by default");
assert(/engine:\s*'google'/.test(appSrc), 'DEFAULT_SETTINGS default search engine is google');
// The fallback silhouette is an <svg>: SVGElement's hidden property and attribute are out of sync, must use toggleAttribute explicitly
assert(!/fb\.hidden =/.test(appSrc), 'SVG fallback icon no longer assigns the .hidden property (attribute out of sync)');
assert(/fb\.toggleAttribute\('hidden',/.test(appSrc), 'SVG fallback icon uses toggleAttribute to control visibility');
assert(/function avatarState/.test(appSrc) && /function renderAvatar/.test(appSrc) && /function renderAvatarPreview/.test(appSrc),
  'app.js defines avatarState / renderAvatar / renderAvatarPreview');
assert(/function openSettingsTab/.test(appSrc) && /function bindAvatar/.test(appSrc), 'app.js defines openSettingsTab / bindAvatar');
assert(/const AVATAR_FALLBACK_SVG = '<svg/.test(appSrc), 'app.js defines the AVATAR_FALLBACK_SVG default silhouette');
assert(/avatar = sanitizeIconDataUrl\(state\.settings\.avatar\)/.test(appSrc), 'avatar passes the sanitizeIconDataUrl guard before rendering');
assert(/state\.settings\.avatar = await compressIconSquare\(f, 96\)/.test(appSrc), 'upload goes through compressIconSquare, cropped to a 96px square');
assert(/f\.size > 4 \* 1024 \* 1024/.test(appSrc), 'upload limited to 4MB (toast.image_too_big beyond that)');
assert(/bindAvatar\(\);\s*renderAvatar\(\)/.test(appSrc), 'boot binds and first-renders the avatar');
assert((appSrc.match(/renderAvatar\(\)/g) || []).length >= 6, 'renderAvatar is called on boot/rename/import/reset/cloud-pull/sync-panel paths');
assert(/window\.LT_SYNC\.getState\(\)/.test(appSrc), 'dropdown login state mirrors window.LT_SYNC.getState()');
// i18n: avatar entries exist in both languages and are non-empty (no key echo)
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
  assert(tOk('zh'), 'avatar entries translated in zh', avatarKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(tOk('en'), 'avatar entries translated in en', avatarKeys.map(k => I.t(k)).join(' | '));
}
// CSS: avatar button / dropdown / preview all styled
for (const sel of ['.avatar-btn', '.avatar-menu', '.avatar-big', '.avatar-item', '.avatar-zone', '.avatar-preview']) {
  assert(cssSrc.includes(sel), `CSS defines ${sel}`);
}
assert(/\.avatar-item\.danger/.test(cssSrc), 'login-state dropdown item carries the .danger logout style');
assert(/\.avatar-btn:hover/.test(cssSrc), 'avatar button has a hover state');

// ---------- 13) #64 daily movie widget (route C: built-in Douban annual-best static list) ----------
console.log('[13] #64 daily movie');
// Static structure: left-column card + header date + render container + settings toggle/position dropdown
assert(/<section class="widget wmovie"/.test(html), 'newtab.html contains the .widget.wmovie card');
assert(/id="movie-card"/.test(html), 'card contains the #movie-card render container');
assert(/id="movie-date"/.test(html), 'header contains the #movie-date date label');
assert(/data-i18n="widget\.movie"/.test(html), 'card title carries data-i18n="widget.movie"');
// Zero network: built-in static list, no dependence on a backend or the Douban API
assert(/const DOUBAN_ANNUAL_BEST = \[/.test(appSrc), 'app.js defines the DOUBAN_ANNUAL_BEST static list');
assert((appSrc.match(/zh: '/g) || []).length >= 30, `built-in movie list is large enough (currently ${(appSrc.match(/zh: '/g) || []).length} entries)`);
assert(/function renderMovie/.test(appSrc) && /function movieIndexForToday/.test(appSrc),
  'app.js defines renderMovie / movieIndexForToday (deterministic pick by day of year)');
assert(/movieCursor/.test(appSrc), 'app.js maintains the movieCursor manual-browsing cursor');
assert(/renderMovie\(\);/.test(appSrc), 'boot / reset both call renderMovie');
assert(/encodeURIComponent\(m\.zh\)/.test(appSrc), 'Douban jump link URL-encodes the title');
assert(/esc\(m\.zh\)/.test(appSrc) && /esc\(m\.blurb\)/.test(appSrc) && /esc\(m\.genre\)/.test(appSrc),
  'title/blurb/genre are HTML-escaped via esc() before rendering');
// Regression guard: every widget must be registered in canvas BLOCK_DEFS, otherwise in canvas mode
// (>1024px default) the widget is absolutely positioned without coordinates and piles in the top-left corner over other blocks (wmovie was once missed)
{
  const wMatch = appSrc.match(/const WIDGETS = \[([^\]]*)\]/);
  const defsMatch = canvasSrc.match(/const BLOCK_DEFS = \[([\s\S]*?)\];/);
  assert(!!wMatch && !!defsMatch, 'WIDGETS and BLOCK_DEFS definitions are parseable');
  if (wMatch && defsMatch) {
    const ids = [...wMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    for (const id of ids) {
      assert(defsMatch[1].includes(`key: '${id}'`), `canvas BLOCK_DEFS covers widget ${id}`);
    }
  }
  // Exiting canvas mode must restore card dragging and remove canvas handles
  const clearFn = canvasSrc.match(/function clearCardCanvas\(\) \{([\s\S]*?)\n  \}/);
  assert(!!clearFn && clearFn[1].includes("setAttribute('draggable', 'true')") && clearFn[1].includes('card-drag-handle'),
    'clearCardCanvas restores draggable and removes drag handles');
}
// Regression guard: deleting all shortcuts is a legal state; must not fall back to default sites after restart
assert(/Array\.isArray\(data\.items\) \? data\.items/.test(appSrc),
  'loadDataIntoState accepts an empty items array (no more falling back to DEFAULT_SITES)');
// CSS: card layout (rating badge + body + action row)
for (const sel of ['.movie-card', '.movie-rate', '.movie-title', '.movie-en', '.movie-genre', '.movie-blurb', '.movie-actions', '.movie-link', '.movie-next']) {
  assert(cssSrc.includes(sel), `CSS defines ${sel}`);
}
assert(/\.widget\.wmovie\.w-top/.test(cssSrc), 'movie top state has dedicated styles');
assert(/\.widget\.wmovie\.w-top \{\s*--wtop-del:\s*176px/.test(cssSrc), 'movie top state defines --wtop-del');
// i18n: title / rating / Douban / next-one entries in both languages, non-empty
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const mvKeys = ['widget.movie', 'movie.rating', 'movie.douban', 'movie.next'];
  const mvOk = (lang) => mvKeys.every(k => I.t(k) !== k && I.t(k).length > 0);
  I.setLang('zh');
  assert(mvOk('zh'), 'movie entries translated in zh', mvKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(mvOk('en'), 'movie entries translated in en', mvKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
}

// ---------- 13b) weather widget (opt-in, direct Open-Meteo) ----------
console.log('[13b] weather widget');
// Static structure: left-column card + updated-time label + render container + settings toggle/position dropdown/city input
assert(/<section class="widget wweather"/.test(html), 'newtab.html contains the .widget.wweather card');
assert(/id="weather-card"/.test(html), 'card contains the #weather-card render container');
assert(/id="weather-updated"/.test(html), 'header contains the #weather-updated updated-time label');
assert(/data-i18n="widget\.weather"/.test(html), 'card title carries data-i18n="widget.weather"');
assert(/id="f-weather-city"/.test(html), 'settings page contains the #f-weather-city city input');
assert(/data-i18n-ph="weather\.city_ph"/.test(html), 'city input carries a placeholder entry');
assert(/data-i18n="weather\.city_tip"/.test(html), 'city input carries a data-source tip entry');
assert(!/id="f-w-wweather" checked/.test(html), 'weather checkbox in settings is statically unchecked by default (consistent with DEFAULT_SETTINGS)');
// Data source and request shape: forecast + geocoding, both Open-Meteo (key-free, CORS-open)
assert(/https:\/\/api\.open-meteo\.com\/v1\/forecast/.test(appSrc), 'app.js uses the Open-Meteo forecast endpoint');
assert(/current=temperature_2m,relative_humidity_2m,weather_code/.test(appSrc), 'forecast request carries current temperature/humidity/weather code');
assert(/daily=temperature_2m_max,temperature_2m_min/.test(appSrc), 'forecast request carries today high/low temperatures');
assert(/https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/.test(appSrc), 'app.js uses the Open-Meteo geocoding endpoint');
// Timeout and refresh strategy: all fetches carry an AbortController 5s cap; cache 30-minute TTL; the page refreshes every 30 minutes while resident
assert(/AbortController/.test(appSrc) && /WEATHER_TIMEOUT_MS = 5000/.test(appSrc), 'weather requests carry an AbortController 5s timeout');
assert(/WEATHER_REFRESH_MS = 30 \* 60 \* 1000/.test(appSrc), 'weather cache TTL / refresh period is 30 minutes');
assert(/setInterval\(maybeFetchWeather, WEATHER_REFRESH_MS\)/.test(appSrc), 'auto-refresh every 30 minutes while the page is open');
// Zero-network principle: never send a request when no city is configured. A configured city is
// the opt-in — with the widget hidden, the weather rides on the clock's date line instead.
const mfb = appSrc.match(/function maybeFetchWeather\(\) \{([\s\S]*?)\n  \}/);
assert(!!mfb && mfb[1].includes('if (!weatherConfigured()) return;') && !mfb[1].includes('widgetVisible'),
  'maybeFetchWeather gates on city config only (hidden widget still feeds the clock line)');
// Clock date line carries a compact weather tail when the widget is hidden
assert(/function clockWeatherText\(\)/.test(appSrc), 'app.js defines clockWeatherText()');
assert(/if \(widgetVisible\('wweather'\)\) return '';/.test(appSrc), 'clock weather tail only when the widget is hidden');
assert(/lastDay = dayKey[\s\S]{0,400}\+ clockWeatherText\(\)/.test(appSrc), 'clock date line appends the weather tail');
assert(/clockIsTop\(\) \? 't' : 'l'\}\|\$\{clockWeatherText\(\)\}/.test(appSrc), 'weather tail participates in the date cache key');
// Settings: the avatar upload label must not be crushed by the global modal label rules
assert(/\.modal-body label\.file-btn \{[^}]*display: inline-flex/.test(cssSrc)
  && /\.modal-body label\.file-btn > span/.test(cssSrc),
  'avatar upload/remove buttons stay aligned (label specificity override)');
// Canvas: a block dropped on the icon grid displaces the covered cards instead of overlapping
assert(/function resolveCardCollisions/.test(canvasSrc), 'canvas.js defines resolveCardCollisions()');
assert(/resolveCardCollisions\(block\.key\)/.test(canvasSrc), 'block drag end resolves card collisions');
assert(/if \(movedKey === 'grid'\) return;/.test(canvasSrc), 'moving the grid itself never displaces its own cards');
// WMO code mapping: covers clear/partly cloudy/overcast/fog/drizzle/rain/snow/showers/thunderstorm, one per language
assert(/const WMO_TEXT = \[/.test(appSrc), 'app.js defines the WMO_TEXT weather-code mapping');
for (const pair of ["0, 0, '晴', 'Clear'", "1, 2, '多云', 'Partly cloudy'", "3, 3, '阴', 'Overcast'",
  "45, 48, '雾', 'Fog'", "51, 57, '毛毛雨', 'Drizzle'", "61, 67, '雨', 'Rain'",
  "71, 77, '雪', 'Snow'", "80, 82, '阵雨', 'Showers'", "95, 99, '雷暴', 'Thunderstorm'"]) {
  assert(appSrc.includes('[' + pair + ']'), `WMO mapping covers [${pair}]`);
}
assert(/function weatherText/.test(appSrc) && /function weatherIcon/.test(appSrc), 'app.js defines weatherText / weatherIcon');
assert(/function renderWeather/.test(appSrc) && /function fetchWeatherNow/.test(appSrc), 'app.js defines renderWeather / fetchWeatherNow');
assert(/function resolveWeatherCity/.test(appSrc) && /function saveWeatherCity/.test(appSrc), 'app.js defines resolveWeatherCity / saveWeatherCity');
assert(/weather: null/.test(appSrc), 'DEFAULT_SETTINGS contains weather: null (syncs/exports with settings)');
assert(/weather-setup/.test(appSrc), 'renders a "set city" onboarding state when no city is configured');
assert(/weather\.stale/.test(appSrc), 'renders a subtle "data may be stale" hint when the cache expires');
assert(/openSettingsTab\('gen'\)/.test(appSrc), 'onboarding state click opens the settings panel');
// CSS: card layout + onboarding/unavailable states + top-state dedicated styles
for (const sel of ['.weather-top', '.weather-icon', '.weather-temp', '.weather-desc', '.weather-meta', '.weather-setup', '.weather-empty', '.weather-updated']) {
  assert(cssSrc.includes(sel), `CSS defines ${sel}`);
}
assert(/\.widget\.wweather\.w-top/.test(cssSrc), 'weather top state has dedicated styles');
assert(/\.widget\.wweather\.w-top \{\s*--wtop-del:/.test(cssSrc), 'weather top state defines --wtop-del');
assert(/\.modal-body \.wgt-city/.test(cssSrc), 'settings city input row is raised in specificity via .modal-body');
// i18n: weather entries exist in both languages and are non-empty (no key echo)
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const wKeys = ['widget.weather', 'weather.set_city', 'weather.unavailable', 'weather.stale',
    'weather.humidity', 'weather.city_ph', 'weather.city_tip', 'weather.city_saved',
    'weather.city_not_found', 'weather.city_fail'];
  I.setLang('zh');
  assert(wKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'weather entries translated in zh', wKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(wKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'weather entries translated in en', wKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
  assert(I.t('weather.city_saved', { name: '北京' }) === '天气城市已设为 北京', 'weather.city_saved supports {name} interpolation');
}

// ---------- 14) #65 plum blossom (bottom-right): wallpaper rotation + inspirational quotes ----------
console.log('[14] #65 plum blossom · wallpaper rotation + quotes');
// Static structure: bottom-right plum button + centered quote overlay
assert(/<button class="plum-float" id="btn-plum"/.test(html), 'newtab.html contains the #btn-plum plum button');
assert(/id="quote" class="quote" hidden aria-live="polite"/.test(html), 'newtab.html contains the #quote quote overlay (a11y aria-live)');
assert(/data-i18n-title="plum\.tip"/.test(html) && /data-i18n-aria="plum\.tip"/.test(html), 'plum button carries the plum.tip entry hooks');
// JS: reuse the existing rotation primitives, avoid reinventing the wheel
assert(/const QUOTES = \[/.test(appSrc), 'app.js defines the QUOTES inspirational-quote pool');
assert(/function pickQuoteIndex/.test(appSrc), 'app.js defines pickQuoteIndex()');
assert(/function showQuote/.test(appSrc), 'app.js defines showQuote()');
assert(/function rotateWallpaperAndQuote/.test(appSrc), 'app.js defines rotateWallpaperAndQuote()');
assert(/getElementById\('btn-plum'\)\.addEventListener\('click', rotateWallpaperAndQuote\)/.test(appSrc), 'boot binds the plum click');
assert(/pickRotateCandidate\(pool, cur\)/.test(appSrc), 'plum reuses pickRotateCandidate (same source as daily rotation)');
assert(/markManualPickToday\(\)/.test(appSrc), 'plum click marks the day as a manual pick');
assert(/pickQuoteIndex/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'pickQuoteIndex is exported to LT_PURE');
// Quote pool: one per language and plentiful
assert((appSrc.match(/zh: '[^']*', en: '/g) || []).length >= 10, `quote pool is large enough (currently ${(appSrc.match(/zh: '[^']*', en: '/g) || []).length} entries)`);
// CSS: plum button + quote overlay styles are complete
assert(/\.plum-float/.test(cssSrc) && /@keyframes plum-spin/.test(cssSrc), 'CSS defines .plum-float and its spin animation');
// Plum petal burst: canvas overlay, corner origin, reduced-motion guard, self-cleanup
assert(/function petalBurst\(\)/.test(appSrc), 'app.js defines petalBurst()');
assert(/petalBurst\(\);/.test(appSrc), 'plum click triggers the petal burst');
assert(/prefers-reduced-motion/.test(appSrc), 'petal burst respects prefers-reduced-motion');
assert(/function drawPetal\(ctx, s\)/.test(appSrc), 'petal path drawn with bezier curves');
assert(/petalRaf = 0; ctx\.clearRect/.test(appSrc), 'petal canvas self-cleans when the last petal lands');
assert(/\.petal-canvas \{[^}]*pointer-events: none/.test(cssSrc), 'petal canvas never intercepts clicks');
assert(/\.quote/.test(cssSrc) && /\.quote-text/.test(cssSrc) && /\.quote-src/.test(cssSrc), 'CSS defines .quote / .quote-text / .quote-src');
assert(/@keyframes quote-in/.test(cssSrc) && /\.quote\.quote-out/.test(cssSrc), 'CSS defines quote enter/exit animations');
// The quote is a single small line at the bottom (iTab convention), not a centered glass card
assert(/\.quote \{[^}]*bottom: 18px/.test(cssSrc), 'quote overlay is pinned to the bottom');
assert(!/\.quote::before/.test(cssSrc), 'quote overlay no longer has a glass card backing');
assert(/\.quote \.quote-text \{[^}]*font-size: 13px/.test(cssSrc), 'quote body text is small');
// i18n: plum.tip exists in both languages and is non-empty (no key echo)
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  I.setLang('zh');
  assert(I.t('plum.tip') === '换一张壁纸 · 励志名句', 'plum.tip zh', I.t('plum.tip'));
  I.setLang('en');
  assert(I.t('plum.tip') === 'New wallpaper · a quote', 'plum.tip en', I.t('plum.tip'));
  I.setLang('zh');
}

console.log('');
if (failures) {
  console.error(`smoke: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('smoke: all checks passed');

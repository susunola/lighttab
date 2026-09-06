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
 *  9) shortcut folders: folder data model (type:'folder' in lt.items, schema v4→v5), create/merge/
 *     dissolve pure functions, i18n keys (zh+en), CSS for the folder tile / merge indicator / popup
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
const JS_FILES = ['js/app.js', 'js/canvas.js', 'js/prompts.js', 'js/sync.js', 'js/inject-ai.js', 'js/lunar.js', 'js/holidays.js', 'js/icondb.js', 'js/i18n.js'];
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
    const W_DEFAULTS = { wclock: true, wcal: true, wtodo: true, wmovie: true, wweather: false, wcount: false, wpomodoro: false };
    assert(JSON.stringify(NW(undefined)) === JSON.stringify(W_DEFAULTS),
      'normalizeWidgets(undefined) → four visible by default, weather/countdown/pomodoro off');
    assert(JSON.stringify(NW(null)) === JSON.stringify(W_DEFAULTS),
      'normalizeWidgets(null) → four visible by default, weather/countdown/pomodoro off');
    assert(NW({ wcal: false }).wcal === false && NW({ wcal: false }).wclock === true && NW({ wcal: false }).wweather === false,
      'normalizeWidgets partial object → missing keys get defaults');
    assert(NW({ wweather: true }).wweather === true && NW({ wweather: true }).wmovie === true,
      'normalizeWidgets explicit true can turn on the default-off weather');
    assert(NW({ wclock: 0, wcal: '', wtodo: null, wweather: 1 }).wclock === true && NW({ wclock: 0, wcal: '', wtodo: null, wweather: 1 }).wweather === false,
      'normalizeWidgets non-boolean dirty values fall back to defaults (legacy visible / weather still off)');
    assert(NW({ bogus: false }).wclock === true && !('bogus' in NW({ bogus: false })),
      'normalizeWidgets drops unknown keys');
    assert(Object.values(NW({ wclock: false, wcal: false, wtodo: false, wmovie: false, wweather: false, wcount: false, wpomodoro: false })).every((v) => v === false),
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
    // Search-history dedupe: case-insensitive (casing varies between sessions), trims blanks,
    // keeps the first original spelling, cleans legacy case-duplicates, caps the list length
    assert(JSON.stringify(P.updateHistory(['GitHub', 'github', 'git  '], '', 10)) === JSON.stringify(['GitHub', 'git']),
      'updateHistory dedupes case-insensitively and trims blanks');
    assert(JSON.stringify(P.updateHistory(['a b', 'AB', 'a b'], 'ab', 10)) === JSON.stringify(['ab', 'a b']),
      'updateHistory new query wins casing, existing entries dedupe against it');
    assert(P.updateHistory(['1', '2', '3'], '', 2).length === 2, 'updateHistory respects the cap');
    assert(JSON.stringify(P.updateHistory(['x'], 'x', 10)) === JSON.stringify(['x']), 'updateHistory drops an exact re-search');
    // Read-time sanitizers: corrupt/foreign/crafted records are coerced or dropped, never trusted
    assert(P.sanitizeItems(null, new Set()) === null, 'sanitizeItems(null) signals a missing key');
    assert(JSON.stringify(P.sanitizeItems([], new Set())) === '[]', 'sanitizeItems([]) stays empty (user cleared)');
    assert(P.sanitizeItems([{ id: 'x', title: 'X', url: 'javascript:alert(1)', group: '' }], new Set()).length === 0,
      'sanitizeItems drops non-http(s) (javascript:) records');
    const clean = P.sanitizeItems([null, 42, { url: 'https://ok.com', title: 'OK' }], new Set());
    assert(clean.length === 1 && clean[0].url === 'https://ok.com' && clean[0].title === 'OK' && clean[0].group === ''
      && typeof clean[0].id === 'string' && clean[0].id.length > 0,
      'sanitizeItems skips non-objects and fills a fresh id');
    const twoKids = { type: 'folder', id: 'f', name: 'F', children: [{ url: 'https://a.com', title: 'A' }, { url: 'https://b.com', title: 'B' }] };
    assert(P.sanitizeItems([twoKids], new Set())[0].type === 'folder' && P.sanitizeItems([twoKids], new Set())[0].children.length === 2,
      'sanitizeItems keeps a healthy folder');
    assert(P.sanitizeItems([{ type: 'folder', id: 'f', name: 'F', children: [{ url: 'https://a.com', title: 'A' }] }], new Set()).length === 1
      && P.sanitizeItems([{ type: 'folder', id: 'f', name: 'F', children: [{ url: 'https://a.com', title: 'A' }] }], new Set())[0].type !== 'folder',
      'sanitizeItems dissolves a degenerate folder into a plain shortcut');
    assert(P.sanitizeItems([{ url: 'https://a.com', title: 'A', group: 'gone' }], new Set('gone'))[0].group === '',
      'sanitizeItems re-groups items whose group no longer exists');
    assert(P.sanitizeItems([{ url: 'https://a.com', title: 'A', color: 'red' }], new Set())[0].color === undefined,
      'sanitizeItems strips non-hex colors');
    assert(P.sanitizeTodos(null) === null && P.sanitizeTodos([{ text: 'hi', done: 1, due: 'not-a-date' }]).length === 1
      && P.sanitizeTodos([{ text: 'hi', done: 1, due: 'not-a-date' }])[0].done === true
      && !('due' in P.sanitizeTodos([{ text: 'hi', done: 1, due: 'not-a-date' }])[0]),
      'sanitizeTodos keeps text/done, drops malformed due');
    assert(P.sanitizeGroups(['bad', { name: 'Work' }, { id: 'g', name: 'A' }, { id: 'g', name: 'B' }]).length === 2,
      'sanitizeGroups drops non-objects and dedupes ids');
    assert(P.sanitizeCustomEngines([{ id: 'u1', name: 'P', url: 'https://p.com/s?q={q}', color: 'red' }])[0].color === '#3b82f6',
      'sanitizeCustomEngines keeps valid engines, fixes colour');
    assert(P.sanitizeCustomEngines([{ name: 'Nope', url: 'https://n.com' }]).length === 0,
      'sanitizeCustomEngines rejects URLs without {q}');
  }
  void elStub;
}

// Reliability hardening (offline guards): the engine-name escaping gap, the calc-vs-template
// Enter precedence, and the wallpaper-upload input reset live in app.js; assert their shapes here.
{
  assert(/function maybeCopyCalc\(\) \{\s*if \(activePrompt\) return false;/.test(appSrc),
    'calc row never steals Enter while an AI template is active');
  assert(/<span>\$\{escapeHtml\(engName\(e\)\)\}<\/span>/.test(appSrc),
    'engine dropdown escapes engine names (custom/imported names are user input)');
  assert(/async function onUpload\(e\) \{[\s\S]{0,260}e\.target\.value = '';/.test(appSrc),
    'wallpaper upload clears the file input so the same file can be re-picked');
  assert(/function updateHistory\(list, q, cap\) \{[\s\S]{0,140}const seen = new Set\(\);/.test(appSrc),
    'updateHistory uses a seen-set (case-insensitive dedupe)');
  assert(/const key = clean\.toLowerCase\(\)/.test(appSrc), 'updateHistory lowercases for dedupe');
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
      } else if (e.img) {
        // Raster entries (bundled data-URI, e.g. the 小鹅通 goose): must be a small local png
        // data-URI with a sane hex tile colour — still zero network at runtime.
        if (e.img.length > 9000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(e.img)) {
          bad.push(`${host}: img must be a small bundled data:image/png;base64`);
        }
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
const ALL_WIDGET_IDS = ['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather', 'wcount', 'wpomodoro'];
for (const id of ALL_WIDGET_IDS) {
  assert(new RegExp(`class="w-del" data-widget="${id}"`).test(html), `${id} widget has a remove button`);
  assert(new RegExp(`id="f-w-${id}"`).test(html), `settings page contains the #f-w-${id} checkbox`);
}
assert(/data-i18n="gen\.widgets"/.test(html) && /data-i18n="gen\.widgets_tip"/.test(html), 'settings widget section entry hooks are complete');
assert(/data-i18n-aria="widget\.remove"/.test(html), 'remove button carries the a11y entry');
assert(/widgets:\s*\{\s*wclock:\s*true/.test(appSrc), 'DEFAULT_SETTINGS contains widgets defaulting to all on');
assert(/wweather: false/.test(appSrc), 'weather widget defaults off in DEFAULT_SETTINGS (opt-in)');
assert(/const WIDGETS = \['wclock', 'wcal', 'wtodo', 'wmovie', 'wweather', 'wcount', 'wpomodoro'\]/.test(appSrc), 'app.js defines WIDGETS as the single source of truth');
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
// WorkBuddy ships a bundled logo instead of a letter tile (no public site icon to reuse)
assert(fs.existsSync(path.join(ROOT, 'assets/engines/workbuddy.png')), 'bundled WorkBuddy engine logo exists');
assert(/e\.id === 'wbai'[^\n]*assets\/engines\/workbuddy\.png/.test(appSrc.replace(/\s+/g, ' ')) ||
       /'wbai'\)[\s\S]{0,200}assets\/engines\/workbuddy\.png/.test(appSrc),
  'engLogoHtml special-cases wbai with the bundled logo');
assert(/\.eng-logo img \{/.test(cssSrc), 'CSS defines .eng-logo img sizing');
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
// Suggestions fetch() the three provider APIs directly (see [15]); host_permissions is what lets that
// bypass their missing CORS headers, so it must be declared and scoped to just those three hosts.
{
  const manifest = JSON.parse(read('manifest.json'));
  assert(Array.isArray(manifest.host_permissions), 'manifest declares host_permissions for the suggestion providers');
  for (const host of ['https://suggestion.baidu.com/*', 'https://suggestqueries.google.com/*', 'https://api.bing.com/*']) {
    assert(manifest.host_permissions.includes(host), `manifest host_permissions includes ${host}`);
  }
  assert(manifest.host_permissions.length === 3, 'manifest host_permissions is scoped to exactly the three suggestion hosts');
}
for (const k of ['wb.running', 'wb.not_running', 'wb.not_detected', 'wb.get']) {
  assert(i18nSrc.includes(`'${k}'`), `i18n contains ${k}`);
}
// ---------- #62 per-widget position (clock / calendar / todo can each be placed above the search box) ----------
assert(/widgetPos: \{ wclock: 'top', wcal: 'left', wtodo: 'left', wmovie: 'left', wweather: 'left', wcount: 'left', wpomodoro: 'left' \}/.test(appSrc),
  'DEFAULT_SETTINGS widgetPos defaults to only the clock on top; every other widget starts in the left column');
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
for (const id of ALL_WIDGET_IDS) {
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
assert(/const SCHEMA_VERSION = 5;/.test(appSrc), 'SCHEMA_VERSION bumped to 5 (folders)');
assert(/3: \(d\) => \{/.test(appSrc), 'MIGRATIONS contains v3→v4');
// Fresh profiles have no lt.items at all: migrations must NOT materialize a missing items key into
// an empty array, or loadDataIntoState would keep the [] instead of falling back to DEFAULT_SITES.
assert(/if \(Array\.isArray\(d\.items\)\) d\.items = d\.items\.map/.test(appSrc),
  'migration v1→v2 leaves a missing items key untouched (fresh-profile default set)');
assert(/if \(Array\.isArray\(d\.items\)\) d\.items = d\.items\.flatMap/.test(appSrc),
  'migration v4→v5 leaves a missing items key untouched (fresh-profile default set)');
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
assert(/const items = sanitizeItems\(data\.items, gids\);\s*state\.items = items !== null \? items : structuredClone\(DEFAULT_SITES\)/.test(appSrc),
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
assert(/daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7/.test(appSrc),
  'forecast request pulls 7 days of daily weather code + high/low');
assert(/https:\/\/geocoding-api\.open-meteo\.com\/v1\/search/.test(appSrc), 'app.js uses the Open-Meteo geocoding endpoint');
// Multi-day forecast: the daily array is cached next to the current reading (one row per day, today first)
assert(/day\.time\.map\(\(date, i\) => \(\{/.test(appSrc) && /daily\n?\s*\}/.test(appSrc),
  'fetchWeatherNow builds and caches a daily[] array from the 7-day payload');
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

// ---------- 15) search suggestions (JSONP dropdown) ----------
console.log('[15] search suggestions');
// Static structure: the dropdown lives inside #search; the settings toggle sits in the General pane
assert(/<ul id="suggest-list" class="suggest-list" role="listbox" hidden><\/ul>/.test(html), 'newtab.html contains the #suggest-list dropdown');
assert(/<input type="checkbox" id="f-suggest" checked>/.test(html), 'settings page contains the #f-suggest checkbox (statically on, matching DEFAULT_SETTINGS)');
assert(/data-i18n="gen\.suggest"/.test(html), 'suggest label carries data-i18n="gen.suggest"');
assert(/data-i18n="gen\.suggest_tip"/.test(html), 'suggest tip carries data-i18n="gen.suggest_tip"');
// Defaults and the per-engine provider table
assert(/suggest: true/.test(appSrc), 'DEFAULT_SETTINGS enables suggestions by default');
assert(/const SUGGEST = \{/.test(appSrc), 'app.js defines the SUGGEST provider table');
for (const id of ['baidu', 'google', 'bing']) {
  assert(new RegExp(`\\n    ${id}: \\{`).test(appSrc), `SUGGEST covers ${id}`);
}
assert(/suggestion\.baidu\.com\/su\?wd=/.test(appSrc), 'baidu suggestion endpoint');
assert(/suggestqueries\.google\.com\/complete\/search\?client=chrome/.test(appSrc), 'google suggestion endpoint');
assert(/api\.bing\.com\/qsonhs\.aspx/.test(appSrc), 'bing suggestion endpoint (JSONP variant — osjson.aspx has no CORS headers)');
// fetch() against declared host_permissions replaced the old <script>-injection JSONP trick, which was
// permanently dead under MV3's page CSP (script-src 'self' cannot allow-list remote script hosts).
assert(/function jsonp\(urlFn, timeoutMs = SUGGEST_TIMEOUT_MS\)/.test(appSrc), 'jsonp helper carries a timeout parameter');
assert(/SUGGEST_TIMEOUT_MS = 5000/.test(appSrc), 'suggestion timeout is 5s');
assert(/SUGGEST_DEBOUNCE_MS = 150/.test(appSrc), 'suggestion debounce is 150ms');
assert(/SUGGEST_MAX = 8/.test(appSrc), 'suggestions are capped at 8 rows');
assert(!/document\.createElement\('script'\)/.test(appSrc), 'suggestions no longer inject a <script> tag (remote code execution risk)');
assert(/new AbortController\(\)/.test(appSrc) && /controller\.abort\(\)/.test(appSrc), 'jsonp aborts the fetch on timeout');
assert(/clearTimeout\(timer\)/.test(appSrc), 'jsonp always clears its timeout timer');
assert(/function parseJsonpText\(text\)/.test(appSrc), 'app.js defines parseJsonpText to strip the JSONP wrapper without eval');
assert(/host_permissions/.test(read('manifest.json')), 'manifest declares host_permissions so suggestions can fetch() past missing CORS headers');
// Interaction: keyboard navigation, URL suppression, blur close, engine-switch reset, boot wiring
assert(/e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/.test(appSrc), 'ArrowDown/ArrowUp move the highlight');
assert(/e\.key === 'Enter'\) \{\s*const row = suggestNav\[suggestHl\];\s*if \(suggestHl >= 0 && row\)/.test(appSrc), 'Enter opens the highlighted row');
assert(/e\.key === 'Escape'/.test(appSrc) && /closeSuggest\(\);/.test(appSrc), 'Escape closes the dropdown');
assert(/if \(!q\) \{ suggestItems = \[\]; renderSuggest\(\); return; \}/.test(appSrc) && /if \(looksLikeUrl\(q\)\) \{ closeSuggest\(\); return; \}/.test(appSrc),
  'empty input shows history instead of suggestions, and URLs never trigger suggestions');
assert(/setTimeout\(closeSuggest, 150\)/.test(appSrc), 'the dropdown closes 150ms after blur');
assert(/function resetSuggest\(\)/.test(appSrc) && /suggestCache\.clear\(\)/.test(appSrc), 'engine switch closes the dropdown and clears the cache');
assert(/resetSuggest\(\); \/\/ engine switch/.test(appSrc), 'setEngine calls resetSuggest');
assert(/bindSuggest\(\);/.test(appSrc), 'boot wires bindSuggest');
assert(/state\.settings\.suggest === false/.test(appSrc), 'the settings toggle gates suggestions (default on for older profiles)');
// CSS: same glass material as the engine list, full-width under the search box
assert(/\.engine-list, \.suggest-list, \.palette, \.menu/.test(cssSrc), 'suggest dropdown shares the glass overlay rule');
assert(/\.suggest-list \{[^}]*z-index: 90/.test(cssSrc), 'suggest z-index sits below modals (100) and the engine list (95)');
assert(/\.suggest-list li\.active/.test(cssSrc) || /\.suggest-list li:hover, \.suggest-list li\.active/.test(cssSrc), 'highlighted suggestion row is styled');
// i18n: suggest entries exist in both languages and are non-empty (no key echo)
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  I.setLang('zh');
  assert(I.t('gen.suggest') === '搜索建议' && I.t('gen.suggest_tip').length > 0, 'gen.suggest zh entries', I.t('gen.suggest'));
  I.setLang('en');
  assert(I.t('gen.suggest') === 'Search suggestions' && I.t('gen.suggest_tip') === 'Suggestions are sent directly to your chosen search engine.', 'gen.suggest en entries', I.t('gen.suggest'));
  I.setLang('zh');
}
assert(/sent directly to your chosen search engine/.test(read('README.md')), 'README Privacy documents that suggestions go straight to the chosen engine');

// ---------- 16) shortcut folders (iOS style: drag one tile onto another) ----------
console.log('[16] shortcut folders');
// Data model: a folder is an item in lt.items with type:'folder' + name + group + children[];
// plain shortcut items carry no `type` and load unchanged (backward compat with schema 4 data).
assert(/type: 'folder'/.test(appSrc), "folder items carry type:'folder'");
assert(/4: \(d\) => \{/.test(appSrc), 'MIGRATIONS contains v4→v5 (folder normalization)');
assert(/normalizeFolderRecord\(it, t\('folder\.default_name'\)\)/.test(appSrc), 'v4→v5 migration normalizes folder records');
for (const fn of ['isFolder', 'makeFolder', 'folderMergeItems', 'folderRemoveChild', 'folderRename',
  'normalizeFolderRecord', 'folderCardHtml', 'openFolderPopup', 'renderFolderPopup', 'closeFolderPopup', 'dissolveFolder']) {
  assert(new RegExp('function ' + fn + '\\b').test(appSrc), `app.js defines ${fn}()`);
}
{
  const ltPure = appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || '';
  for (const fn of ['isFolder', 'makeFolder', 'folderMergeItems', 'folderRemoveChild', 'folderRename', 'normalizeFolderRecord']) {
    assert(new RegExp('\\b' + fn + '\\b').test(ltPure), `${fn} is exported to LT_PURE`);
  }
}
// Rendering / interaction hooks
assert(/cardHtml\(it\) \{\n\s+if \(isFolder\(it\)\) return folderCardHtml\(it\);/.test(appSrc), 'cardHtml delegates folder items to folderCardHtml');
assert(/class="card card-folder"/.test(appSrc), 'folder tiles render with .card.card-folder (same footprint as shortcut tiles)');
assert(/folder-mini-grid/.test(appSrc), 'folder tile renders the 2x2 mini grid');
assert(/document\.querySelectorAll\('#grid \.card:not\(\.card-add\)'\)/.test(appSrc), 'drag & drop covers folder tiles too (add tile excluded)');
assert(/FOLDER_DWELL_MS = 550/.test(appSrc), 'folder merge is armed by a hover dwell');
assert(/drag-merge/.test(appSrc), 'dwell-armed merge target gets the .drag-merge indicator');
assert(/bindFolderGlobal\(\);/.test(appSrc), 'boot binds the folder popup/drop globals');
assert(/id="folder-pop"/.test(html), 'newtab.html contains the #folder-pop popup');
// doImport validates folder records (kids validated one by one, degenerate folders dissolve)
assert(/if \(it && it\.type === 'folder'\)/.test(appSrc), 'doImport handles folder items');
// Pure create / merge / dissolve behaviour (sandboxed app.js, same convention as section 4b)
{
  const noop = () => {};
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
  vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
  const P = sandbox.LT_PURE;
  assert(!!P && typeof P.folderMergeItems === 'function', 'folder pure functions available in sandbox');
  if (P) {
    const s = (id, group) => ({ id, title: id.toUpperCase(), url: 'https://' + id + '.example.com', group: group || '' });
    // create: drop b onto a -> one folder at a's slot holding [a, b]; the folder inherits a's group
    let items = [s('a', 'g1'), s('b'), s('c')];
    let next = P.folderMergeItems(items, 'b', 'a', 'Folder');
    assert(next.length === 2 && P.isFolder(next[0]) && next[1].id === 'c', 'drop shortcut on shortcut creates a folder at the target slot');
    assert(next[0].children.map(k => k.id).join(',') === 'a,b', 'new folder holds target first, dragged one last');
    assert(next[0].group === 'g1' && !('group' in next[0].children[0]), 'folder inherits the target group; kids drop their own group');
    assert(next[0].name === 'Folder', 'new folder gets the default name');
    // merge: drop c onto the folder -> 3 kids
    const fid = next[0].id;
    next = P.folderMergeItems(next, 'c', fid, 'Folder');
    assert(next.length === 1 && next[0].children.length === 3, 'drop shortcut onto a folder tile adds it to the folder');
    // folder -> folder: kids merge
    const pair = P.folderMergeItems([s('x'), s('y')], 'y', 'x', 'Folder');
    next = P.folderMergeItems(next.concat(pair), pair[0].id, fid, 'Folder');
    assert(next.length === 1 && next[0].children.length === 5, 'dropping a folder onto a folder merges the kids');
    // folder -> shortcut: not a folder operation (stays a plain reorder)
    assert(P.folderMergeItems([next[0], s('z')], fid, 'z', 'Folder') === null, 'folder onto shortcut is not a folder operation (no nesting)');
    // remove one of 3 -> folder survives with 2
    let res = P.folderRemoveChild(P.folderMergeItems([s('a'), s('b'), s('c')], 'b', 'a', 'Folder'), undefined, 'nope');
    assert(res === null, 'folderRemoveChild with an unknown id returns null');
    let base = P.folderMergeItems([s('a', 'g2'), s('b'), s('c')], 'b', 'a', 'Folder');
    base = P.folderMergeItems(base, 'c', base[0].id, 'Folder');
    res = P.folderRemoveChild(base, base[0].id, 'c');
    assert(P.isFolder(res.items[0]) && res.items[0].children.length === 2 && res.child.id === 'c', 'removing one of 3 kids keeps the folder');
    assert(res.child.group === 'g2', 'the removed kid inherits the folder group back');
    // remove one of 2 -> the folder dissolves, the survivor returns to its slot
    const two = P.folderMergeItems([s('a', 'g2'), s('b'), s('d')], 'b', 'a', 'Folder');
    res = P.folderRemoveChild(two, two[0].id, 'b');
    assert(!P.isFolder(res.items[0]) && res.items[0].id === 'a' && res.items[1].id === 'd' && res.items.length === 2,
      'a folder below 2 kids auto-dissolves (survivor back at the folder slot)');
    assert(res.items[0].group === 'g2' && res.child.group === 'g2', 'dissolve restores the folder group on both kids');
    // rename
    const renamed = P.folderRename(two, two[0].id, 'Tools');
    assert(renamed[0].name === 'Tools', 'folderRename sets the name');
    // normalizeFolderRecord: plain items pass through; degenerate folders dissolve
    const plain = s('p');
    assert(P.normalizeFolderRecord(plain, 'Folder')[0] === plain, 'normalization leaves plain shortcut items untouched (backward compat)');
    const degen = P.normalizeFolderRecord({ id: 'f0', type: 'folder', name: '', group: 'g9', children: [s('solo')] }, 'Folder');
    assert(degen.length === 1 && degen[0].id === 'solo' && degen[0].group === 'g9', 'a 1-kid folder record dissolves on read');
    const foreign = P.normalizeFolderRecord({ id: 'f1', type: 'folder', children: [{ url: 'https://a.example.com' }, { bad: true }, s('k2')] }, 'Folder');
    assert(foreign.length === 1 && foreign[0].children.length === 2 && foreign[0].name === 'Folder',
      'foreign folder records get a default name and invalid kids dropped');
  }
}
// i18n: folder entries exist in both languages and are non-empty (no key echo)
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const fKeys = ['folder.default_name', 'folder.name_ph', 'folder.hint', 'toast.folder_created',
    'ctx.open_folder', 'ctx.rename_folder', 'ctx.ungroup_folder'];
  I.setLang('zh');
  assert(fKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'folder entries translated in zh', fKeys.map(k => I.t(k)).join(' | '));
  assert(I.t('folder.default_name') === '文件夹', "folder.default_name zh is 文件夹");
  I.setLang('en');
  assert(fKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'folder entries translated in en', fKeys.map(k => I.t(k)).join(' | '));
  assert(I.t('folder.default_name') === 'Folder', "folder.default_name en is Folder");
  I.setLang('zh');
}
// CSS: folder tile + mini grid + merge indicator + popup are all styled
for (const sel of ['.card-folder', '.folder-ico', '.folder-mini-grid', '.folder-mini',
  '.card.drag-merge', '.folder-pop', '.folder-pop-grid', '.folder-name-input', '.fcard', '.fcard-ico', '.folder-pop-hint']) {
  assert(cssSrc.includes(sel), `CSS defines ${sel}`);
}

// ---------- 17) first-run onboarding hint ----------
console.log('[17] onboarding hint');
// Static structure: one quiet tip card with an i18n'd text hook and a dismiss button
assert(/id="onboard-tip" class="onboard-tip"[^>]*hidden/.test(html), 'newtab.html contains the #onboard-tip card (hidden by default)');
assert(/data-i18n="onboard\.hint"/.test(html), 'onboarding text carries data-i18n="onboard.hint"');
assert(/id="onboard-close"/.test(html) && /data-i18n-aria="onboard\.dismiss"/.test(html), 'onboarding dismiss button carries data-i18n-aria="onboard.dismiss"');
// Data model: a flag inside lt.settings (no new storage key); existing profiles (saved settings) never see it
assert(!/'lt\.onboard/.test(appSrc), 'onboarding flag lives inside lt.settings (no separate storage key)');
assert(/state\.settings\.onboarded = true/.test(appSrc), 'dismissal persists settings.onboarded = true');
assert(/if \(raw && raw\.settings\) return;/.test(appSrc), 'onboarding only shows when lt.settings was never persisted (genuine first run)');
assert(/function maybeShowOnboarding/.test(appSrc) && /function dismissOnboarding/.test(appSrc), 'app.js defines maybeShowOnboarding / dismissOnboarding');
assert(/maybeShowOnboarding\(raw\)/.test(appSrc), 'boot calls maybeShowOnboarding with the raw store snapshot');
assert(/getElementById\('onboard-close'\)\.addEventListener\('click', dismissOnboarding\)/.test(appSrc), 'the × button dismisses the hint');
assert(/onboardEl\.addEventListener\('click', dismissOnboarding\)/.test(appSrc), 'clicking the card dismisses the hint');
assert(/e\.key === 'Escape'[\s\S]{0,300}dismissOnboarding\(\);/.test(appSrc), 'Esc dismisses the hint');
// CSS: glass-consistent card + close button
assert(/\.onboard-tip \{/.test(cssSrc) && /\.onboard-close/.test(cssSrc), 'CSS defines .onboard-tip / .onboard-close');
// i18n: both languages, non-empty
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const oKeys = ['onboard.hint', 'onboard.dismiss'];
  I.setLang('zh');
  assert(oKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'onboarding entries translated in zh', oKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(oKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'onboarding entries translated in en', oKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
}

// ---------- 18) motion polish ----------
console.log('[18] motion polish');
// The context menu was the only overlay without the shared pop-in animation
assert(/\.menu \{[^}]*animation: pop \.14s ease/.test(cssSrc), 'context menu now pops in like the other overlays');
// Settings pane switches fade in
assert(/\.tab-pane \{ animation: fade \.16s ease/.test(cssSrc), 'settings pane switches fade in');
// Widget cards lift on hover (top-stack widgets excluded — they have no card chrome)
assert(/\.widget \{[^}]*transition: transform \.18s ease/.test(cssSrc), 'widget cards carry a transform transition');
assert(/\.widget:not\(\.w-top\):hover \{[^}]*transform: translateY\(-2px\)/.test(cssSrc), 'widget cards lift 2px on hover');
// Wallpaper swatches / library thumbs: lift + slow image zoom
assert(/\.swatch:hover \{ transform: translateY\(-2px\)/.test(cssSrc), 'swatches lift 2px on hover');
assert(/\.wall-thumb:hover img \{ transform: scale\(1\.05\)/.test(cssSrc), 'library thumbs zoom their image on hover');
assert(/\.wall-thumb img \{[^}]*transition: transform \.25s ease/.test(cssSrc), 'thumb zoom is eased over 250ms');
// Onboarding card pops in
assert(/\.onboard-tip \{[^}]*animation: pop \.18s ease/.test(cssSrc), 'onboarding card pops in');
// Every animation/transition is disabled under prefers-reduced-motion (blanket rule, covers all of the above)
assert(/@media \(prefers-reduced-motion: reduce\) \{\s*\* \{ animation: none !important; transition: none !important; \}\s*\}/.test(cssSrc),
  'prefers-reduced-motion media query disables all animations/transitions');

// ---------- 19) 12/24-hour clock ----------
console.log('[19] 12/24-hour clock');
// Data model: a boolean inside lt.settings (no new storage key), default off (24h)
assert(/clock12h: false/.test(appSrc), 'DEFAULT_SETTINGS keeps the 24h default (clock12h: false)');
assert(!/'lt\.clock/.test(appSrc), 'clock format lives inside lt.settings (no separate storage key)');
// Static structure: the General-pane toggle + the meridiem span in the clock row
assert(/<input type="checkbox" id="f-clock12h">/.test(html), 'settings page contains the #f-clock12h checkbox');
assert(/data-i18n="gen\.clock12h"/.test(html) && /data-i18n="gen\.clock12h_tip"/.test(html), 'clock format label/tip entry hooks are complete');
assert(/<span class="clock-ampm" id="clock-ampm" hidden><\/span>/.test(html), 'clock row contains the hidden #clock-ampm meridiem span');
// JS: pure formatter exported + tick + settings wiring + import validation
assert(/function formatClock/.test(appSrc), 'app.js defines formatClock()');
assert(/formatClock/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'formatClock is exported to LT_PURE');
assert(/formatClock\(hh, mm, state\.settings\.clock12h === true, isEn\(\)\)/.test(appSrc), 'clock tick renders via formatClock()');
assert(/getElementById\('f-clock12h'\)/.test(appSrc), 'settings toggle is bound');
assert(/state\.settings\.clock12h = state\.settings\.clock12h === true/.test(appSrc), 'doImport validates clock12h');
// CSS: meridiem styles for both placements
assert(/\.wclock \.clock-ampm \{/.test(cssSrc), 'CSS defines .clock-ampm');
assert(/\.widget\.wclock\.w-top \.clock-ampm/.test(cssSrc), 'top-state clock has a dedicated meridiem size');
// i18n: both languages, non-empty
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const cKeys = ['gen.clock12h', 'gen.clock12h_tip'];
  I.setLang('zh');
  assert(cKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'clock format entries translated in zh', cKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(cKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'clock format entries translated in en', cKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
}
// formatClock behaviour (sandboxed app.js, same convention as section 4b)
{
  const noop = () => {};
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
  vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
  const P = sandbox.LT_PURE;
  assert(!!P && typeof P.formatClock === 'function', 'formatClock available in sandbox');
  if (P && P.formatClock) {
    assert(P.formatClock(8, 49, false, false).hhmm === '08:49' && P.formatClock(8, 49, false, false).ampm === '', '24h: zero-padded, no meridiem');
    assert(P.formatClock(23, 5, false, true).hhmm === '23:05', '24h keeps 23:05');
    assert(P.formatClock(8, 49, true, false).hhmm === '8:49' && P.formatClock(8, 49, true, false).ampm === '上午', '12h zh morning: 8:49 上午');
    assert(P.formatClock(13, 5, true, true).hhmm === '1:05' && P.formatClock(13, 5, true, true).ampm === 'PM', '12h en afternoon: 1:05 PM');
    assert(P.formatClock(0, 0, true, true).hhmm === '12:00' && P.formatClock(0, 0, true, true).ampm === 'AM', 'midnight is 12:00 AM');
    assert(P.formatClock(12, 0, true, false).hhmm === '12:00' && P.formatClock(12, 0, true, false).ampm === '下午', 'noon is 12:00 下午');
  }
}

// ---------- 20) wallpaper library favorites ----------
console.log('[20] wallpaper favorites');
// Data model: a `fav` flag on the existing lt.walllib entries (no new storage key)
assert(!/'lt\.wallfav/.test(appSrc) && !/lt\.fav/.test(appSrc), 'favorites live inside lt.walllib entries (no separate storage key)');
assert(/im\.fav = true/.test(appSrc) && /delete im\.fav/.test(appSrc), 'favorite toggle sets/clears a fav flag on the image entry');
assert(/function persistWallLib/.test(appSrc) && /savedAt: wallLibSavedAt, images: wallLibImages/.test(appSrc),
  'persistWallLib writes the pool back without touching savedAt');
assert(/function toggleWallFav/.test(appSrc), 'app.js defines toggleWallFav()');
// Static structure: heart buttons on thumbs + a favorites-only filter toggle in the library header
assert(/id="btn-wall-favs"/.test(html) && /data-i18n="wall\.fav_only"/.test(html), 'library header contains the favorites-only filter toggle');
assert(/class="wall-fav/.test(appSrc) && /aria-pressed/.test(appSrc), 'library thumbs render a wall-fav heart button with aria-pressed');
assert(/e\.stopPropagation\(\); \/\/ a favorite toggle must not apply the wallpaper/.test(appSrc), 'favorite clicks never apply the wallpaper');
assert(/wallFavOnly = !wallFavOnly/.test(appSrc), 'filter toggle flips wallFavOnly');
assert(/pool\.filter\(im => !wallFavOnly \|\| im\.fav\)/.test(appSrc), 'favorites-only filter narrows the grid');
// CSS: heart button states + filter toggle active state
assert(/\.wall-fav \{/.test(cssSrc) && /\.wall-fav\.on/.test(cssSrc), 'CSS defines .wall-fav / .wall-fav.on');
assert(/#btn-wall-favs\.on/.test(cssSrc), 'CSS defines the filter toggle active state');
// i18n: both languages, non-empty
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const fKeys = ['wall.fav', 'wall.fav_only'];
  I.setLang('zh');
  assert(fKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'wallpaper favorite entries translated in zh', fKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(fKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'wallpaper favorite entries translated in en', fKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
}

// ---------- 21) Tab engine cycling + inline calculator + search history ----------
console.log('[21] search box interactions (Tab cycle / calc / history)');
// Tab cycling: hijacked only in the search input, wraps around, quiet cue, no toast
assert(/e\.key === 'Tab' && document\.activeElement === qEl/.test(appSrc), 'Tab is hijacked only while #q is focused');
assert(/e\.preventDefault\(\);\s*\n\s*cycleEngine\(e\.shiftKey \? -1 : 1\)/.test(appSrc), 'Tab / Shift+Tab cycle forwards / backwards with preventDefault');
assert(/function cycleEngine\(dir\)/.test(appSrc) && /\(idx \+ dir \+ engines\.length\) % engines\.length/.test(appSrc), 'cycleEngine wraps around allEngines()');
assert(/state\.settings\.engine = next\.id/.test(appSrc) && /Store\.set\(K\.settings, state\.settings\)/.test(appSrc), 'Tab cycling persists the engine setting');
assert(/classList\.add\('eng-flash'\)/.test(appSrc), 'Tab cycling flashes the engine button as the quiet cue');
// Calculator: hand-written parser, never eval()
assert(/function calcEval\(/.test(appSrc), 'app.js defines calcEval()');
assert(!/\beval\(/.test(appSrc.replace(/\/\/[^\n]*/g, '')), 'no eval() anywhere in app.js code');
assert(/calcEval/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'calcEval is exported to LT_PURE');
assert(/maybeCopyCalc\(\)/.test(appSrc), 'Enter / click on a calc row copies via maybeCopyCalc()');
// History: own key, out of lt.settings, out of the sync getAll set, capped, deduped
assert(/history: 'lt\.history'/.test(appSrc), "K maps history to 'lt.history'");
assert(/chrome\.storage\.local\.get\(\[K\.settings, K\.items, K\.wallpaper, K\.todos, K\.prompts, K\.schema\]\)/.test(appSrc),
  'Store.getAll does not read lt.history (stays out of sync/export)');
assert(/const HISTORY_MAX = 10/.test(appSrc), 'history is capped at 10 entries');
assert(/function updateHistory/.test(appSrc) && /function histMatches/.test(appSrc), 'app.js defines updateHistory() / histMatches()');
assert(/localRawSet\(K\.history/.test(appSrc), 'history persists via localRawSet (never marked dirty for cloud sync)');
// Sandboxed behaviour tests (same convention as section 4b)
{
  const noop = () => {};
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
  vm.runInContext(appSrc, sandbox, { filename: 'app.js' });
  const P = sandbox.LT_PURE;
  assert(!!P && typeof P.calcEval === 'function' && typeof P.updateHistory === 'function' && typeof P.histMatches === 'function',
    'calcEval / updateHistory / histMatches available in sandbox');
  if (P && P.calcEval) {
    assert(P.calcEval('128*3.5').result === '448' && P.calcEval('128*3.5').display === '128 × 3.5 = 448', 'calc: 128*3.5 -> "128 × 3.5 = 448"');
    assert(P.calcEval('2+3*4').result === '14', 'calc: precedence 2+3*4 = 14');
    assert(P.calcEval('(2+3)*4').result === '20', 'calc: parentheses (2+3)*4 = 20');
    assert(P.calcEval('10%3').result === '1', 'calc: modulo 10%3 = 1');
    assert(P.calcEval('-3+1').result === '-2' && P.calcEval('2*-3').result === '-6', 'calc: unary minus');
    assert(P.calcEval('0.1+0.2').result === '0.3', 'calc: float noise trimmed (0.1+0.2 = 0.3)');
    assert(P.calcEval('1/0') === null && P.calcEval('0/0') === null, 'calc: division by zero fails silent');
    assert(P.calcEval('1+') === null && P.calcEval('(1+2') === null && P.calcEval('()') === null, 'calc: malformed input fails silent');
    assert(P.calcEval('2024') === null, 'calc: a bare number is not a calculation');
    assert(P.calcEval('hello') === null && P.calcEval('1+1;alert(1)') === null && P.calcEval('') === null && P.calcEval(null) === null,
      'calc: non-arithmetic input rejected by the whitelist');
    assert(P.calcEval('１２８×３.５').result === '448', 'calc: full-width digits and × operator evaluate');
    assert(P.calcEval('８÷２').result === '4', 'calc: full-width ÷ operator evaluates');
  }
  if (P && P.updateHistory) {
    const h1 = P.updateHistory([], 'alpha', 10);
    assert(h1.length === 1 && h1[0] === 'alpha', 'history: first entry recorded');
    const h2 = P.updateHistory(['beta', 'alpha'], 'alpha', 10);
    assert(h2.length === 2 && h2[0] === 'alpha' && h2[1] === 'beta', 'history: dedupe moves the repeat to the front');
    let h3 = [];
    for (let n = 0; n < 14; n++) h3 = P.updateHistory(h3, 'q' + n, 10);
    assert(h3.length === 10 && h3[0] === 'q13' && h3[9] === 'q4', 'history: capped at 10, newest first');
    assert(P.updateHistory(['a'], '  ', 10).length === 1 && P.updateHistory(['a'], '', 10).length === 1,
      'history: blank queries are not recorded');
    assert(P.updateHistory(['a', 'x', 1, null], 'b', 10).join(',') === 'b,a,x', 'history: non-string / blank entries are dropped');
  }
  if (P && P.histMatches) {
    const list = ['github actions', 'gmail', 'google maps'];
    assert(P.histMatches(list, 'git', 3).join(',') === 'github actions', 'history match: prefix match');
    assert(P.histMatches(list, 'maps', 3).join(',') === 'google maps', 'history match: substring match');
    assert(P.histMatches(list, 'G', 3).join(',') === 'github actions,gmail,google maps', 'history match: case-insensitive');
    assert(P.histMatches(list, 'g', 2).length === 2, 'history match: capped');
    assert(P.histMatches(list, '', 10).length === 3, 'history match: empty query returns the recent list');
  }
}
// i18n: both languages, non-empty
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const sKeys = ['calc.enter_copy', 'hist.recent', 'hist.clear', 'hist.del'];
  I.setLang('zh');
  assert(sKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'calc/history entries translated in zh', sKeys.map(k => I.t(k)).join(' | '));
  I.setLang('en');
  assert(sKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'calc/history entries translated in en', sKeys.map(k => I.t(k)).join(' | '));
  I.setLang('zh');
}
// CSS: calc row, history rows, header/clear, delete × and the Tab-cycle flash
for (const sel of ['.sg-calc', '.sg-calc-hint', '.sg-head', '.sg-clear', '.sg-hist', '.sg-hist-del', '#engine-btn.eng-flash']) {
  assert(cssSrc.includes(sel), `CSS defines ${sel}`);
}

// ---------- 22) time features: seconds, clock fonts, holidays, countdown, pomodoro ----------
console.log('[22] time features (seconds / clock font / holidays / countdown / pomodoro)');
const holidaysSrc = read('js/holidays.js');
// --- 22a) seconds toggle ---
assert(/clockSeconds: false/.test(appSrc), 'DEFAULT_SETTINGS keeps seconds off by default (clockSeconds: false)');
assert(!/'lt\.clocksec/.test(appSrc), 'seconds flag lives inside lt.settings (no separate storage key)');
assert(/<input type="checkbox" id="f-clockseconds">/.test(html), 'settings page contains the #f-clockseconds checkbox');
assert(/data-i18n="gen\.clockseconds"/.test(html) && /data-i18n="gen\.clockseconds_tip"/.test(html), 'seconds label/tip entry hooks are complete');
assert(/getElementById\('f-clockseconds'\)/.test(appSrc), 'seconds toggle is bound');
assert(/state\.settings\.clockSeconds = state\.settings\.clockSeconds === true/.test(appSrc), 'doImport validates clockSeconds');
assert(/secEl\.hidden = !showSec/.test(appSrc), 'clock tick hides the seconds span when the toggle is off');
assert(/if \(showSec\) secEl\.textContent = ss/.test(appSrc), 'clock tick only writes seconds when enabled');
assert(/setInterval\(tick, 1000\)/.test(appSrc), 'clock tick keeps the 1s cadence (seconds on) / current cadence (off)');
assert(/classList\.toggle\('clock-sec-on', state\.settings\.clockSeconds === true\)/.test(appSrc),
  'startClock flags the widget so an explicit seconds opt-in overrides the top-state hide rule');
assert(/\.widget\.wclock\.w-top:not\(\.clock-sec-on\) \.clock-sec \{ display: none/.test(cssSrc),
  'top-state clock hides seconds only when the toggle is off');
// --- 22b) clock font choice ---
assert(/clockFont: 'modern'/.test(appSrc), "DEFAULT_SETTINGS keeps the modern (Inter) clock font by default");
assert(/const CLOCK_FONTS = \['modern', 'serif', 'mono'\]/.test(appSrc), 'app.js defines the three clock fonts');
assert(/<select id="f-clockfont">/.test(html), 'settings page contains the #f-clockfont dropdown');
assert(/data-i18n="gen\.clockfont"/.test(html) && /data-i18n="clockfont\.modern"/.test(html)
  && /data-i18n="clockfont\.serif"/.test(html) && /data-i18n="clockfont\.mono"/.test(html),
  'clock font label/option entry hooks are complete');
assert(/function applyClockFont/.test(appSrc) && /clock-font-serif/.test(appSrc) && /clock-font-mono/.test(appSrc),
  'applyClockFont toggles the serif/mono classes on the clock widget');
assert(/getElementById\('f-clockfont'\)/.test(appSrc), 'clock font select is bound');
assert(/state\.settings\.clockFont = CLOCK_FONTS\.includes/.test(appSrc), 'doImport validates clockFont');
assert(/\.wclock\.clock-font-serif \.clock-hhmm/.test(cssSrc) && /Georgia, "Times New Roman"/.test(cssSrc),
  'CSS defines the serif clock font (system stack, no bundled font)');
assert(/\.wclock\.clock-font-mono \.clock-hhmm/.test(cssSrc) && /ui-monospace/.test(cssSrc),
  'CSS defines the mono clock font (system stack, no bundled font)');
// --- 22c) statutory holidays (js/holidays.js) ---
assert(/<script src="js\/holidays\.js"><\/script>/.test(html), 'newtab.html loads js/holidays.js');
assert(/2026年部分节假日安排的通知/.test(holidaysSrc) && /国办发明电〔2025〕7号/.test(holidaysSrc),
  'holidays.js cites the official 2026 State Council notice');
assert(/covers calendar year 2026 ONLY/.test(holidaysSrc), 'holidays.js notes the table needs a yearly refresh');
{
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(holidaysSrc, sandbox, { filename: 'holidays.js' });
  const H = sandbox.window.LT_HOLIDAYS;
  assert(!!H && H.table && typeof H.table === 'object', 'holidays.js exposes window.LT_HOLIDAYS.table');
  if (H && H.table) {
    const dates = Object.keys(H.table);
    assert(dates.every(d => /^2026-\d{2}-\d{2}$/.test(d)), 'holiday table covers 2026 only', dates.filter(d => !/^2026-/.test(d)).join(','));
    const rests = dates.filter(d => H.table[d].h);
    const works = dates.filter(d => H.table[d].work);
    assert(rests.length === 33, `holiday table has the 33 statutory rest days of 2026 (3+9+3+5+3+3+7, got ${rests.length})`);
    assert(works.length === 6, `holiday table has the 6 调休 make-up workdays of 2026 (got ${works.length})`);
    assert(H.table['2026-01-01'].h === 'newyear' && H.table['2026-01-04'].work === true, 'New Year: Jan 1 rest, Jan 4 work');
    assert(H.table['2026-02-15'].h === 'spring' && H.table['2026-02-23'].h === 'spring'
      && H.table['2026-02-14'].work === true && H.table['2026-02-28'].work === true,
      'Spring Festival: Feb 15-23 rest, Feb 14 & 28 work');
    assert(H.table['2026-10-01'].h === 'national' && H.table['2026-10-07'].h === 'national'
      && H.table['2026-09-20'].work === true && H.table['2026-10-10'].work === true,
      'National Day: Oct 1-7 rest, Sep 20 & Oct 10 work');
    assert(H.table['2026-09-25'].h === 'midautumn', 'Mid-Autumn: Sep 25 rest');
    assert(!H.table['2026-09-06'], 'an ordinary day has no entry');
    // nextHoliday (LT_PURE, app.js sandbox — same convention as section 4b)
    const noop2 = () => {};
    const asb = {
      document: { readyState: 'loading', addEventListener: noop2, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
      localStorage: { getItem: () => null, setItem: noop2, removeItem: noop2, key: () => null, length: 0 },
      navigator: {}, structuredClone, URL, URLSearchParams,
      setTimeout, clearTimeout, setInterval, clearInterval,
      requestAnimationFrame: noop2, cancelAnimationFrame: noop2, console
    };
    asb.window = asb;
    vm.createContext(asb);
    vm.runInContext(appSrc, asb, { filename: 'app.js' });
    const P2 = asb.LT_PURE;
    assert(!!P2 && typeof P2.nextHoliday === 'function', 'nextHoliday is exported to LT_PURE');
    if (P2 && P2.nextHoliday) {
      const nh1 = P2.nextHoliday('2026-09-06', H.table);
      assert(!!nh1 && nh1.key === 'midautumn' && nh1.date === '2026-09-25' && nh1.days === 19,
        'nextHoliday(2026-09-06) → Mid-Autumn in 19 days', JSON.stringify(nh1));
      const nh2 = P2.nextHoliday('2026-10-01', H.table);
      assert(!!nh2 && nh2.key === 'national' && nh2.days === 0, 'nextHoliday on a holiday itself → days 0');
      const nh3 = P2.nextHoliday('2026-10-08', H.table);
      assert(nh3 === null, 'nextHoliday after the last holiday of the dataset → null (line hidden)');
      const nh4 = P2.nextHoliday('2025-12-31', H.table);
      assert(!!nh4 && nh4.key === 'newyear' && nh4.date === '2026-01-01', 'nextHoliday before the dataset starts → New Year');
      assert(P2.nextHoliday('bogus', H.table) === null && P2.nextHoliday('2026-09-06', null) === null,
        'nextHoliday rejects malformed input');
    }
  }
}
assert(/id="cal-next-holiday"/.test(html), 'calendar card contains the #cal-next-holiday line');
assert(/cal-badge/.test(appSrc) && /cal-badge/.test(cssSrc), 'calendar cells render the 休/班 corner badges');
assert(/t\('hol\.' \+ nh\.key\)/.test(appSrc), 'the next-holiday line resolves names via the hol.* i18n entries');
assert(/\.cal-next-holiday \{/.test(cssSrc), 'CSS defines .cal-next-holiday');
assert(/\.cal-badge\.hol/.test(cssSrc) && /\.cal-badge\.work/.test(cssSrc), 'CSS defines both badge variants');
// --- 22d) countdown widget (wcount) ---
assert(/<section class="widget wcount"/.test(html) && /id="count-card"/.test(html), 'newtab.html contains the .widget.wcount card');
assert(/data-i18n="widget\.countdown"/.test(html), 'countdown card title carries data-i18n="widget.countdown"');
assert(/wcount: false/.test(appSrc), 'countdown widget defaults off in DEFAULT_SETTINGS (opt-in)');
assert(/countdown: \{ off: '18:00', days: \[\] \}/.test(appSrc), 'DEFAULT_SETTINGS contains countdown { off, days }');
assert(!/'lt\.countdown/.test(appSrc), 'countdown data lives inside lt.settings (no separate storage key)');
assert(/function renderCountdown/.test(appSrc) && /function countTick/.test(appSrc) && /function bindCountdown/.test(appSrc),
  'app.js defines renderCountdown / countTick / bindCountdown');
assert(/function normalizeCountdown/.test(appSrc) && /function daysUntil/.test(appSrc), 'app.js defines normalizeCountdown / daysUntil');
assert(/state\.settings\.countdown = normalizeCountdown\(state\.settings\.countdown\)/.test(appSrc), 'doImport validates the countdown field');
assert(/const COUNT_DAYS_MAX = 5/.test(appSrc), 'custom countdown days are capped at 5');
assert(/count-guide/.test(appSrc), 'renders a guide state when no countdown day is configured');
assert(/setInterval\(countTick, 1000\)/.test(appSrc), 'countdown ticks once per second');
assert(/if \(countEditing\) return;/.test(appSrc), 'the tick never re-renders while the off-time editor is open');
{
  const ltPure22 = appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || '';
  for (const fn of ['nextHoliday', 'daysUntil', 'normalizeCountdown', 'pomoInitial', 'pomoAdvance']) {
    assert(new RegExp('\\b' + fn + '\\b').test(ltPure22), `${fn} is exported to LT_PURE`);
  }
  // daysUntil / normalizeCountdown behaviour (sandboxed app.js, same convention as section 4b)
  const noop3 = () => {};
  const csb = {
    document: { readyState: 'loading', addEventListener: noop3, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: noop3, removeItem: noop3, key: () => null, length: 0 },
    navigator: {}, structuredClone, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: noop3, cancelAnimationFrame: noop3, console
  };
  csb.window = csb;
  vm.createContext(csb);
  vm.runInContext(appSrc, csb, { filename: 'app.js' });
  const P3 = csb.LT_PURE;
  assert(!!P3 && typeof P3.daysUntil === 'function', 'daysUntil available in sandbox');
  if (P3 && P3.daysUntil) {
    assert(P3.daysUntil('2026-09-06', '2026-10-01') === 25, 'daysUntil: Sep 6 → Oct 1 = 25 days');
    assert(P3.daysUntil('2026-10-01', '2026-10-01') === 0, 'daysUntil: same day = 0');
    assert(P3.daysUntil('2026-10-02', '2026-10-01') === -1, 'daysUntil: past dates go negative');
    assert(P3.daysUntil('2026-09-06', 'bogus') === null && P3.daysUntil('', '2026-10-01') === null, 'daysUntil rejects malformed input');
    const nc = P3.normalizeCountdown({ off: '19:30', days: [{ name: 'Trip', date: '2026-10-01' }, { name: '', date: '2026-01-01' }, { name: 'x', date: 'nope' }] });
    assert(nc.off === '19:30' && nc.days.length === 1 && nc.days[0].name === 'Trip' && !!nc.days[0].id,
      'normalizeCountdown keeps valid entries, drops dirty ones, assigns ids', JSON.stringify(nc));
    assert(P3.normalizeCountdown({ off: '99:99' }).off === '18:00', 'normalizeCountdown falls back to 18:00 on a bad time');
    assert(P3.normalizeCountdown({ off: '18:00', days: Array(9).fill({ name: 'a', date: '2026-10-01' }) }).days.length === 5,
      'normalizeCountdown caps the days list at 5');
    assert(JSON.stringify(P3.normalizeCountdown(null)) === JSON.stringify({ off: '18:00', days: [] }), 'normalizeCountdown(null) → defaults');
  }
}
// --- 22e) pomodoro widget (wpomodoro) ---
assert(/<section class="widget wpomodoro"/.test(html) && /id="pomo-card"/.test(html) && /id="pomo-dots"/.test(html),
  'newtab.html contains the .widget.wpomodoro card with the cycle dots');
assert(/data-i18n="widget\.pomodoro"/.test(html), 'pomodoro card title carries data-i18n="widget.pomodoro"');
assert(/wpomodoro: false/.test(appSrc), 'pomodoro widget defaults off in DEFAULT_SETTINGS (opt-in)');
assert(/const POMO_FOCUS_S = 25 \* 60/.test(appSrc) && /const POMO_BREAK_S = 5 \* 60/.test(appSrc), 'pomodoro is 25 min focus / 5 min break');
assert(/function renderPomodoro/.test(appSrc) && /function pomoTick/.test(appSrc) && /function bindPomodoro/.test(appSrc),
  'app.js defines renderPomodoro / pomoTick / bindPomodoro');
assert(/setInterval\(pomoTick, 1000\)/.test(appSrc), 'pomodoro ticks once per second');
assert(/showToast\(t\(wasFocus \? 'pomo\.toast_break' : 'pomo\.toast_focus'\)\)/.test(appSrc), 'a toast fires on every phase switch');
{
  // pomo state machine behaviour (sandboxed app.js, same convention as section 4b)
  const noop4 = () => {};
  const psb = {
    document: { readyState: 'loading', addEventListener: noop4, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: noop4, removeItem: noop4, key: () => null, length: 0 },
    navigator: {}, structuredClone, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: noop4, cancelAnimationFrame: noop4, console
  };
  psb.window = psb;
  vm.createContext(psb);
  vm.runInContext(appSrc, psb, { filename: 'app.js' });
  const P4 = psb.LT_PURE;
  assert(!!P4 && typeof P4.pomoInitial === 'function' && typeof P4.pomoAdvance === 'function', 'pomo pure functions available in sandbox');
  if (P4 && P4.pomoInitial) {
    const s0 = P4.pomoInitial();
    assert(s0.phase === 'focus' && s0.left === 1500 && s0.running === false && s0.done === 0, 'pomoInitial → idle 25:00 focus');
    const s1 = P4.pomoAdvance(s0);
    assert(s1.phase === 'break' && s1.left === 300 && s1.done === 1, 'focus done → 5:00 break, one dot');
    const s2 = P4.pomoAdvance(s1);
    assert(s2.phase === 'focus' && s2.left === 1500 && s2.done === 1, 'break done → back to focus, dot kept');
    let sN = s0;
    for (let i = 0; i < 8; i++) sN = P4.pomoAdvance(sN);
    assert(sN.done === 0 && sN.phase === 'focus', 'four focus sessions wrap the dot counter (one full set)');
  }
}
// i18n: every new entry exists in both languages and is non-empty (no key echo)
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const tKeys = ['gen.clockseconds', 'gen.clockseconds_tip', 'gen.clockfont', 'clockfont.modern', 'clockfont.serif', 'clockfont.mono',
    'widget.countdown', 'widget.pomodoro',
    'hol.newyear', 'hol.spring', 'hol.qingming', 'hol.labour', 'hol.dragonboat', 'hol.midautumn', 'hol.national',
    'cal.badge_rest', 'cal.badge_work', 'cal.next_holiday', 'cal.holiday_today',
    'cd.offwork', 'cd.relax', 'cd.relax_weekend', 'cd.off_edit', 'cd.guide', 'cd.name_ph', 'cd.add', 'cd.del',
    'cd.days_left', 'cd.days_passed', 'cd.today', 'cd.limit', 'cd.invalid',
    'pomo.focus', 'pomo.break', 'pomo.start', 'pomo.pause', 'pomo.reset', 'pomo.toast_break', 'pomo.toast_focus'];
  I.setLang('zh');
  assert(tKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'time-feature entries translated in zh',
    tKeys.filter(k => I.t(k) === k || !I.t(k)).join(' | '));
  assert(I.t('cal.badge_rest') === '休' && I.t('cal.badge_work') === '班', 'badge entries zh are 休/班');
  I.setLang('en');
  assert(tKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'time-feature entries translated in en',
    tKeys.filter(k => I.t(k) === k || !I.t(k)).join(' | '));
  assert(I.t('cal.next_holiday', { name: 'National Day', n: 7 }) === 'Next holiday: National Day · in 7 days',
    'cal.next_holiday interpolates {name}/{n}', I.t('cal.next_holiday', { name: 'National Day', n: 7 }));
  I.setLang('zh');
}
// CSS: new widget / badge / font styles
for (const sel of ['.cal-badge', '.cal-next-holiday', '.count-card', '.count-off-time', '.count-guide',
  '.count-row', '.count-add', '.pomo-time', '.pomo-dot', '.pomo-btn',
  '.wclock.clock-font-serif', '.wclock.clock-font-mono', '.widget.wcount.w-top', '.widget.wpomodoro.w-top']) {
  assert(cssSrc.includes(sel), `CSS defines ${sel}`);
}

// ---------- 23) personalization (hide search/clock, icon sizing, add-current-tab, temp trend) ----------
console.log('[23] personalization');
// --- 23a) hide search bar / hide clock ---
assert(/hideSearch: false/.test(appSrc), 'DEFAULT_SETTINGS keeps the search bar visible by default (hideSearch: false)');
assert(/hideClock: false/.test(appSrc), 'DEFAULT_SETTINGS keeps the clock visible by default (hideClock: false)');
assert(!/'lt\.hidesearch|'lt\.hideclock/.test(appSrc), 'hide flags live inside lt.settings (no separate storage keys)');
assert(/<input type="checkbox" id="f-hidesearch">/.test(html), 'settings page contains the #f-hidesearch checkbox');
assert(/<input type="checkbox" id="f-hideclock">/.test(html), 'settings page contains the #f-hideclock checkbox');
assert(/data-i18n="gen\.hidesearch"/.test(html) && /data-i18n="gen\.hidesearch_tip"/.test(html), 'hide-search label/tip entry hooks are complete');
assert(/data-i18n="gen\.hideclock"/.test(html) && /data-i18n="gen\.hideclock_tip"/.test(html), 'hide-clock label/tip entry hooks are complete');
assert(/getElementById\('f-hidesearch'\)/.test(appSrc) && /getElementById\('f-hideclock'\)/.test(appSrc), 'both hide toggles are bound');
assert(/state\.settings\.hideSearch = state\.settings\.hideSearch === true/.test(appSrc)
  && /state\.settings\.hideClock = state\.settings\.hideClock === true/.test(appSrc), 'doImport validates the hide flags');
assert(/function applySearchVis/.test(appSrc) && /search\.hidden = state\.settings\.hideSearch === true/.test(appSrc),
  'applySearchVis removes the search bar from the layout via [hidden] (display:none)');
assert(/id === 'wclock' && state\.settings\.hideClock === true/.test(appSrc), 'applyWidgets folds the hideClock preference into clock visibility');
assert(/\[hidden\] \{ display: none !important; \}/.test(cssSrc), 'CSS guarantees [hidden] is display:none, not just opacity');
assert(/if \(qInput && state\.settings\.hideSearch !== true\) qInput\.focus/.test(appSrc),
  'boot focus is guarded so a hidden #q is never focused');
assert(/closeSuggest\(\); \/\/ a hidden box can hold no open dropdown/.test(appSrc),
  'hiding the search bar closes the suggestions dropdown first');
// --- 23b) icon size / corner radius sliders ---
assert(/iconSize: 64/.test(appSrc) && /iconRadius: 28/.test(appSrc), 'DEFAULT_SETTINGS carries the shipped icon geometry (64px / 28%)');
assert(/<input type="range" id="f-iconsize" min="48" max="80"/.test(html), 'settings page contains the #f-iconsize slider (48–80px)');
assert(/<input type="range" id="f-iconradius" min="20" max="50"/.test(html), 'settings page contains the #f-iconradius slider (20–50%)');
assert(/data-i18n="gen\.iconsize"/.test(html) && /data-i18n="gen\.iconradius"/.test(html), 'icon slider label entry hooks are complete');
assert(/--icon-size: 64px;/.test(cssSrc) && /--icon-radius: 28%;/.test(cssSrc), ':root declares the --icon-size / --icon-radius custom properties');
assert(/\.card \.ico \{[\s\S]{0,200}width: var\(--icon-size\); height: var\(--icon-size\);[\s\S]{0,200}border-radius: var\(--icon-radius\);/.test(cssSrc),
  '.card .ico consumes both custom properties');
assert(/\.folder-mini-grid \{[\s\S]{0,200}gap: calc\(var\(--icon-size\)/.test(cssSrc)
  && /\.card-folder \.folder-ico \{[\s\S]{0,300}padding: calc\(var\(--icon-size\)/.test(cssSrc),
  'folder mini-grids scale proportionally with --icon-size');
assert(/function applyIconSizing/.test(appSrc)
  && /setProperty\('--icon-size', size \+ 'px'\)/.test(appSrc) && /setProperty\('--icon-radius', radius \+ '%'\)/.test(appSrc),
  'applyIconSizing writes both custom properties on :root');
assert(/applyIconSizing\(\); \/\/ --icon-size/.test(appSrc), 'boot applies the icon geometry before first paint');
// --- 23c) add current tab (optional "tabs" permission) ---
assert(manifest && Array.isArray(manifest.optional_permissions) && manifest.optional_permissions.includes('tabs'),
  'manifest optional_permissions contains tabs (mirroring bookmarks)');
assert(/<button type="button" class="btn ghost sm curtab-btn" id="f-curtab"[^>]*hidden>/.test(html),
  'shortcut dialog contains the #f-curtab button, hidden by default');
assert(/data-i18n="site\.add_current_tab"/.test(html), 'the add-current-tab button carries its entry hook');
assert(/curtabBtn\.hidden = !!id \|\| !\(window\.chrome && chrome\.permissions && chrome\.tabs\)/.test(appSrc),
  'the button is gated on extension mode (no chrome.permissions/tabs under file://) and hidden in edit mode');
assert(/chrome\.permissions\.request\(\{ permissions: \['tabs'\] \}\)/.test(appSrc),
  'the tabs permission is requested on demand, inside the click gesture');
assert(/chrome\.tabs\.query\(\{ active: true, currentWindow: true \}\)/.test(appSrc), 'the active tab is queried for title + url');
// --- 23d) 7-day temperature trend (pure helper + SVG wiring) ---
assert(/function tempTrendPoints\(daily, w, h\)/.test(appSrc), 'app.js defines tempTrendPoints(daily, w, h)');
assert(/tempTrendPoints/.test(appSrc.match(/window\.LT_PURE = \{[^}]*\}/)?.[0] || ''), 'tempTrendPoints is exported to LT_PURE');
assert(/class="weather-trend" viewBox/.test(appSrc) && /weather-trend-hi/.test(appSrc) && /weather-trend-lo/.test(appSrc),
  'the expanded forecast renders the trend SVG with hi/lo polylines');
assert(/\.weather-trend \.weather-trend-hi \{ stroke: #fbbf24/.test(cssSrc) && /\.weather-trend \.weather-trend-lo \{ stroke: var\(--accent\)/.test(cssSrc),
  'CSS paints the hi line warm and the lo line cool');
{
  // tempTrendPoints behaviour (sandboxed app.js, same convention as section 4b)
  const noop5 = () => {};
  const tsb = {
    document: { readyState: 'loading', addEventListener: noop5, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: noop5, removeItem: noop5, key: () => null, length: 0 },
    navigator: {}, structuredClone, URL, URLSearchParams,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: noop5, cancelAnimationFrame: noop5, console
  };
  tsb.window = tsb;
  vm.createContext(tsb);
  vm.runInContext(appSrc, tsb, { filename: 'app.js' });
  const P5 = tsb.LT_PURE;
  assert(!!P5 && typeof P5.tempTrendPoints === 'function', 'tempTrendPoints available in sandbox');
  if (P5 && P5.tempTrendPoints) {
    const week = [31, 30, 28, 27, 29, 32, 33].map((hi, i) => ({ date: '2026-09-0' + (i + 1), code: 2, hi, lo: hi - 8 }));
    const tp = P5.tempTrendPoints(week, 280, 44);
    assert(!!tp && typeof tp.hi === 'string' && typeof tp.lo === 'string', 'tempTrendPoints returns { hi, lo } point strings');
    assert(tp.hi.split(' ').length === 7 && tp.lo.split(' ').length === 7, 'tempTrendPoints maps all 7 days', JSON.stringify(tp));
    // min/max scaling: the coldest lo (19) sits at the bottom pad (h-4=40), the hottest hi (33) at the top pad (4)
    const loPts = tp.lo.split(' ').map(p => p.split(',').map(Number));
    const hiPts = tp.hi.split(' ').map(p => p.split(',').map(Number));
    assert(Math.min(...hiPts.map(p => p[1])) === 4, 'the hottest hi touches the top pad', tp.hi);
    assert(Math.max(...loPts.map(p => p[1])) === 40, 'the coldest lo touches the bottom pad', tp.lo);
    assert(hiPts[0][0] === 4 && hiPts[6][0] === 276, 'the first/last points sit at the horizontal pads', tp.hi);
    assert(hiPts.every((p, i) => p[1] <= loPts[i][1]), 'every hi point sits above its lo point on the chart');
    // a flat week must not divide by zero: both lines park at mid-height
    const flat = P5.tempTrendPoints(Array(7).fill({ date: '2026-09-01', code: 2, hi: 25, lo: 25 }), 280, 44);
    assert(flat.hi.split(' ').every(p => p.endsWith(',22')) && flat.lo === flat.hi, 'flat week parks both lines at mid-height', JSON.stringify(flat));
    assert(P5.tempTrendPoints(null, 280, 44) === null && P5.tempTrendPoints([], 280, 44) === null, 'tempTrendPoints rejects missing/empty data');
    assert(P5.tempTrendPoints([{ date: 'x', code: 2 }], 280, 44) === null, 'tempTrendPoints drops rows without numeric hi/lo');
  }
}
// --- 23e) i18n: every new entry exists in both languages and is non-empty (no key echo) ---
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  const pKeys = ['gen.hidesearch', 'gen.hidesearch_tip', 'gen.hideclock', 'gen.hideclock_tip',
    'gen.iconsize', 'gen.iconradius', 'site.add_current_tab', 'toast.tabs_denied'];
  I.setLang('zh');
  assert(pKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'personalization entries translated in zh',
    pKeys.filter(k => I.t(k) === k || !I.t(k)).join(' | '));
  I.setLang('en');
  assert(pKeys.every(k => I.t(k) !== k && I.t(k).length > 0), 'personalization entries translated in en',
    pKeys.filter(k => I.t(k) === k || !I.t(k)).join(' | '));
  I.setLang('zh');
}

// ---------- 24) AI auto-submit robustness (inject-ai.js v4) ----------
console.log('[24] AI injection: dola.com match, tiered input pick, pointer fallback, verified send');
const injectSrc = read('js/inject-ai.js');
{
  const manifest = JSON.parse(read('manifest.json'));
  assert(manifest.content_scripts && manifest.content_scripts[0].matches.includes('https://www.dola.com/chat*'),
    'manifest content_scripts cover dola.com (doubao.com redirects there and strips the query string)');
}
// Tiered input picking: rich editors (contenteditable / ProseMirror) outrank a bare textarea
assert(/const INPUT_TIERS = \[/.test(injectSrc) && !/INPUT_SELECTORS/.test(injectSrc), 'inject-ai.js uses tiered INPUT_TIERS');
assert(/div\[contenteditable="true"\][\s\S]*?\],\s*\n\s*\['textarea'\]/.test(injectSrc),
  'contenteditable tier outranks textarea (Doubao mounts a decoy textarea before tiptap)');
// Composer settle: the picked element must survive a settle window before it is trusted
assert(/document\.contains\(cand\) && pickInput\(\) === cand/.test(injectSrc),
  'main() waits for the composer to settle before filling');
// Verified send: click -> waitCleared -> Enter fallback -> re-pick, up to 3 rounds
assert(/async function sendWithVerify/.test(injectSrc) && /round <= 3/.test(injectSrc), 'sendWithVerify retries up to 3 rounds');
assert(/function pressEnter/.test(injectSrc), 'Enter fallback exists as pressEnter()');
assert(/!document\.contains\(input\)\) return true/.test(injectSrc), 'a re-mounted composer counts as a confirmed send');
// Redirect fallback: storage pointer, peeked at arm time and cleared when an armed run finishes
assert(/POINTER_KEY = PENDING_PREFIX \+ 'current'/.test(injectSrc) && /POINTER_TTL = 90000/.test(injectSrc),
  'inject-ai.js defines the storage pointer (90s TTL — redirect chains can sit 20s+ on a region gate)');
assert(/function clearPointer\(\)/.test(injectSrc) && /main\(text\)\.finally\(clearPointer\)/.test(injectSrc),
  'the pointer is cleared when an armed run finishes (a mid-flight redirect never finishes, by design)');
assert(/armed via storage pointer/.test(injectSrc), 'inject-ai.js can arm from the pointer alone');
// newtab side: pointer written with every nonce; sweep treats it on its own TTL
assert(/\[POINTER_KEY\]: \{ k: nonce, t: Date\.now\(\) \}/.test(appSrc), 'putPending writes the pointer next to the nonce');
assert(/if \(k === POINTER_KEY\)/.test(appSrc), 'sweepPending handles the pointer record shape separately');
// Preview-mode degradation: no content script out there -> copy the prompt and say so
assert(/ai\.preview_copied/.test(appSrc) && /webN && !hasChromeStorage/.test(appSrc),
  'preview mode copies the prompt instead of a silent bare launch');
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  I.setLang('zh');
  assert(I.t('ai.preview_copied') !== 'ai.preview_copied' && I.t('ai.preview_copied').length > 0, 'ai.preview_copied translated in zh');
  I.setLang('en');
  assert(I.t('ai.preview_copied') !== 'ai.preview_copied' && I.t('ai.preview_copied').length > 0, 'ai.preview_copied translated in en');
  I.setLang('zh');
}

// ---------- 25) Downgrade experience / read-time hardening references ----------
console.log('[25] downgrade UX: stale holiday note, boot guard, sanitizer wiring');
{
  const sandbox = { window: {}, document: { documentElement: {}, querySelectorAll: () => [] } };
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc, sandbox, { filename: 'i18n.js' });
  const I = sandbox.window.LT_I18N;
  for (const lang of ['zh', 'en']) {
    I.setLang(lang);
    for (const k of ['cal.data_stale', 'boot.fatal']) {
      assert(I.t(k) !== k && I.t(k).length > 0, `${k} translated in ${lang}`);
    }
  }
  I.setLang('zh');
}
assert(/t\('cal\.data_stale', \{ y: cov \}\)/.test(appSrc), 'calendar shows the stale-data note past the table year');
assert(/async function bootGuarded\(\)/.test(appSrc) && /DOMContentLoaded', bootGuarded/.test(appSrc),
  'boot runs through a guarded wrapper (storage/context failures surface a toast, not a blank tab)');
assert(/sanitizeGroups, sanitizeCustomEngines, sanitizeHiddenEngines, sanitizeTodos, sanitizePrompts, sanitizeItems/.test(appSrc),
  'read-time sanitizers are exported to LT_PURE for offline assertions');

// ---------- 26) Accessibility / keyboard operation ----------
console.log('[26] a11y: grid keys, modal focus return, visible focus rings');
assert(/function bindGridKeys\(\)/.test(appSrc) && /bindGridKeys\(\);/.test(appSrc), 'grid keyboard navigation is bound at boot');
assert(/ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1/.test(appSrc), 'arrow keys move across grid cards');
assert(/e\.key === 'Delete' \|\| e\.key === 'Backspace'/.test(appSrc), 'Delete removes the focused card (keyboard)');
assert(/e\.key === 'e' \|\| e\.key === 'E'/.test(appSrc), 'E opens the editor for the focused shortcut');
assert(/deleteItem\(id\)\.then\(\(\) => \{[\s\S]{0,160}visibleGridCards\(\)/.test(appSrc),
  'focus returns to the grid after a keyboard delete');
assert(/aria-expanded="false"/.test(appSrc), 'folder tiles expose aria-expanded');
assert(/tile\.setAttribute\('aria-expanded', 'true'\)/.test(appSrc), 'opening a folder popup marks the tile expanded');
assert(/if \(was\) setFolderTileExpanded\(was, false\)/.test(appSrc), 'closing a folder popup clears the tile state');
assert(/let modalReturnFocus = null;/.test(appSrc) && /function hideModal\(m, refocus\)/.test(appSrc),
  'modal openers are remembered and restored on close');
assert(/openModals\.forEach\(m => hideModal\(m\)\)/.test(appSrc), 'Escape closes modals through hideModal (focus return)');
assert(/\.card:focus-visible/.test(cssSrc), 'CSS ships a visible keyboard focus ring for cards');

console.log('');
if (failures) {
  console.error(`smoke: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('smoke: all checks passed');

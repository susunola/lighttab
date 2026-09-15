#!/usr/bin/env node
/* Split the heavy raster brand icons out of js/icondb.js into assets/brand-icons/*.
 *
 * Why: js/icondb.js carries ~860 KB of base64 PNG/JPEG brand marks inside the script that the
 * new-tab page parses on every open, and the icon library is read-only at runtime and consumed
 * through a single <img src> helper in js/app.js. As separate files the browser loads only the
 * icons the grid actually shows and keeps the bytes out of the JS heap. Vector entries ({p}/{d}),
 * small inline SVGs and letter tiles stay inline — they are cheap and some code branches on the
 * `data:image/svg+xml` prefix.
 *
 * The image bytes are copied verbatim — no re-encode, no quality change (brand marks stay pixel
 * identical). Around 20 rasters move out; the DB keeps every host key and falls back to a
 * brand-coloured letter tile if a file ever goes missing.
 * Idempotent: exits early once the data has been split.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'js/icondb.js');
const OUT = path.join(ROOT, 'assets/brand-icons');
// Below this the file is smaller than the path that replaces it, so keep the data URI inline.
const MIN_BYTES = 2048;

const src = fs.readFileSync(DATA, 'utf8');
if (!/"img":\s*"data:image\/(?:png|jpe?g);base64,/.test(src)) {
  console.log('build-brand-icons: no heavy raster icons found, nothing to do');
  process.exit(0);
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const db = sandbox.window.LT_ICONDB;

const header = (src.match(/^(\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\n)+/) || [''])[0];
fs.mkdirSync(OUT, { recursive: true });

const out = {};
const taken = new Set();
const aliases = {};
const seen = new Map();          // exact data URI -> first host that carries it
let written = 0;
let saved = 0;
for (const [host, entry] of Object.entries(db)) {
  const img = entry && typeof entry.img === 'string' ? entry.img : null;
  if (!img || !img.startsWith('data:image/')) { out[host] = entry; continue; }
  if (seen.has(img)) {           // byte-identical mark (PNG/JPEG/SVG alike): share one object
    aliases[host] = seen.get(img);
    saved += img.length;
    continue;
  }
  seen.set(img, host);
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(img);
  if (!m || m[2].length < MIN_BYTES) { out[host] = entry; continue; }  // vectors and small marks stay inline
  const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  let name = `${host.replace(/[^\w.]+/g, '_')}.${ext}`;
  for (let i = 2; taken.has(name); i++) name = name.replace(/(\.[a-z]+)$/, `-${i}$1`);
  taken.add(name);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(m[2], 'base64'));
  out[host] = { ...entry, img: `assets/brand-icons/${name}` };
  written++;
}

const aliasBlock = Object.keys(aliases).length
  ? `\n// Hosts whose brand mark is byte-identical to an earlier entry share that entry instead of\n`
    + `// storing the same image twice (~${Math.round(saved / 1024)} KB).\n`
    + `for (const [alias, canonical] of Object.entries(${JSON.stringify(aliases)})) {\n`
    + '  if (window.LT_ICONDB[canonical]) window.LT_ICONDB[alias] = window.LT_ICONDB[canonical];\n}\n'
  : '';

fs.writeFileSync(DATA, `${header}window.LT_ICONDB = ${JSON.stringify(out, null, 1)};\n${aliasBlock}`);
console.log(`build-brand-icons: moved ${written} rasters to assets/brand-icons/, aliased ${Object.keys(aliases).length} duplicate marks (~${Math.round(saved / 1024)} KB)`);

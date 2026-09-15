#!/usr/bin/env node
/* Split the bundled movie posters out of js/movie-data.js into assets/movies/*.jpg.
 *
 * Why: the posters are ~1.07 MB of base64 inside a script that the new-tab page parses on every
 * open, while a visit only ever displays one poster (the day's pick, plus its detail dialog). As
 * separate files the browser loads just the one it shows and keeps the bytes out of the JS heap.
 * The image bytes are copied verbatim — no re-encode, no quality change.
 *
 * js/movie-data.js keeps every metadata field and points `poster` at the relative asset path, which
 * is exactly what the four call sites already expect (a URL for url(...) / <img src>).
 * Idempotent: exits early once the data has been split. Run it after editing movie metadata that
 * still carries inline data URIs.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'js/movie-data.js');
const OUT = path.join(ROOT, 'assets/movies');

const src = fs.readFileSync(DATA, 'utf8');
if (!/data:image\//.test(src)) {
  console.log('build-movie-posters: no inline posters found, nothing to do');
  process.exit(0);
}

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const data = sandbox.window.LT_MOVIE_DATA;

const header = (src.match(/^(\s*\/\/[^\n]*\n)+/) || [''])[0];
let ext = 'jpg';
fs.mkdirSync(OUT, { recursive: true });

const out = {};
const taken = new Set();
let written = 0;
for (const [title, movie] of Object.entries(data)) {
  const m = /^data:image\/([a-z+]+);base64,(.+)$/i.exec(movie.poster || '');
  if (!m) { out[title] = movie; continue; }
  ext = m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg';
  // Prefer the stable Douban photo id so a refresh keeps the same file names.
  const id = (/\/public\/([A-Za-z0-9_-]+)\.(?:jpe?g|png|webp)/i.exec(movie.posterSource || '') || [])[1];
  let name = `${id || title.replace(/[^\w]+/g, '_')}.${ext}`;
  for (let i = 2; taken.has(name); i++) name = name.replace(/(\.[a-z]+)$/, `-${i}$1`);
  taken.add(name);
  fs.writeFileSync(path.join(OUT, name), Buffer.from(m[2], 'base64'));
  written++;
  out[title] = { ...movie, poster: `assets/movies/${name}` };
}

fs.writeFileSync(DATA, `${header}window.LT_MOVIE_DATA = ${JSON.stringify(out)};\n`);
console.log(`build-movie-posters: wrote ${written} posters to assets/movies/ and rewrote js/movie-data.js`);

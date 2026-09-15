#!/usr/bin/env node
/* Build a single-file preview: inlines css/style.css and all js/*.js into one HTML file.
   Output: dist/newtab.html — double-click to preview in a browser (localStorage mode).
   The extension itself keeps using the split files; this is a distribution/preview artifact. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let html = read('newtab.html');

// Inline the stylesheet.
const css = read('css/style.css');
if (/^\s*\(\(\)\s*=>/m.test(css) || !css.includes(':root') || !css.includes('display:')) {
  throw new Error('Invalid stylesheet: css/style.css must contain CSS, not JavaScript.');
}
html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  () => '<style>\n' + css + '\n</style>'
);

// Inline every local script in order. </script> inside JS strings would close the tag early — escape it.
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => {
  const js = read(src).replace(/<\/script/gi, '<\\/script');
  return '<script>\n/* inlined from ' + src + ' */\n' + js + '\n</script>';
});

// Inline the bundled wallpaper so the single file stays truly self-contained
// (the split-file extension loads it as a relative asset; dist cannot).
const plum = fs.readFileSync(path.join(ROOT, 'assets/wallpaper-blue-hour-plum.jpg'));
html = html.replaceAll('assets/wallpaper-blue-hour-plum.jpg', 'data:image/jpeg;base64,' + plum.toString('base64'));
const wall = fs.readFileSync(path.join(ROOT, 'assets/wallpaper-dusk.jpg'));
html = html.replaceAll('assets/wallpaper-dusk.jpg', 'data:image/jpeg;base64,' + wall.toString('base64'));

// Same for the bundled WorkBuddy engine logo.
const wbLogo = fs.readFileSync(path.join(ROOT, 'assets/engines/workbuddy.png'));
html = html.replaceAll('assets/engines/workbuddy.png', 'data:image/png;base64,' + wbLogo.toString('base64'));

// Movie posters live as separate assets so the extension parses only a small metadata file
// (scripts/build-movie-posters.cjs). The split-file build fetches them on demand; the single file
// has no assets/ next to it, so inline every one back by path.
const movieDir = path.join(ROOT, 'assets/movies');
if (fs.existsSync(movieDir)) {
  for (const name of fs.readdirSync(movieDir).sort()) {
    const kind = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const bytes = fs.readFileSync(path.join(movieDir, name));
    html = html.replaceAll('assets/movies/' + name, 'data:' + kind + ';base64,' + bytes.toString('base64'));
  }
}

// Raster brand icons are separate assets for the same reason (scripts/build-brand-icons.cjs).
const brandDir = path.join(ROOT, 'assets/brand-icons');
if (fs.existsSync(brandDir)) {
  for (const name of fs.readdirSync(brandDir).sort()) {
    const kind = name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    const bytes = fs.readFileSync(path.join(brandDir, name));
    html = html.replaceAll('assets/brand-icons/' + name, 'data:' + kind + ';base64,' + bytes.toString('base64'));
  }
}

// Same for the bundled variable font: the inlined <style> resolves relative URLs against the
// document, not the stylesheet, so '../assets/…' would break outside the repo layout.
const font = fs.readFileSync(path.join(ROOT, 'assets/fonts/inter-var-latin.woff2'));
html = html.replaceAll('../assets/fonts/inter-var-latin.woff2', 'data:font/woff2;base64,' + font.toString('base64'));

const outDir = path.join(ROOT, 'dist');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'newtab.html'), html);

const leftover = html.match(/<(script src|link rel="stylesheet")/g);
if (leftover) {
  console.error('WARN: unresolved external refs:', leftover.join(', '));
  process.exitCode = 1;
} else {
  console.log('dist/newtab.html written (' + Math.round(html.length / 1024) + ' KB, fully self-contained)');
}

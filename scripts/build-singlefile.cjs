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
html = html.replace(
  /<link rel="stylesheet" href="css\/style\.css">/,
  () => '<style>\n' + css + '\n</style>'
);

// Inline every local script in order. </script> inside JS strings would close the tag early — escape it.
html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => {
  const js = read(src).replace(/<\/script/gi, '<\\/script');
  return '<script>\n/* inlined from ' + src + ' */\n' + js + '\n</script>';
});

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

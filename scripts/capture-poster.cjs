#!/usr/bin/env node
/* Verify the scale-independent placeholder poster reads correctly at BOTH sizes and that the
 * title-derived hue makes consecutive picks distinguishable. */
'use strict';
const fs = require('fs');
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');
const BASE = 'http://127.0.0.1:8755/newtab.html';
const OUT = '/Users/atom/WorkBuddy/2026-09-02-23-50-18/outputs';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('8755')) return route.continue();
    if (u.includes('/v1/wallpapers')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [], images: [] }) });
    // block the 6 remote wikipedia posters so every card exercises the placeholder path
    if (u.includes('upload.wikimedia.org')) return route.abort();
    return route.abort();
  });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1300);

  // strip mode: capture the widget for 4 consecutive picks and record the placeholder hue
  const hues = [];
  for (let i = 0; i < 4; i++) {
    const info = await page.evaluate(() => {
      const img = document.querySelector('#movie-widget .movie-tile-bg');
      const title = document.querySelector('#movie-widget .movie-tile-title');
      const src = img ? img.getAttribute('src') : '';
      const dec = decodeURIComponent(src.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
      const m = dec.match(/hsl\((\d+)\s/);
      return {
        title: (title && title.textContent) || '',
        isPlaceholder: src.startsWith('data:image/svg'),
        hue: m ? Number(m[1]) : null,
        hasFilmMark: /circle cx="231"/.test(dec),
        hasBakedText: /<text/.test(dec)
      };
    });
    hues.push(info);
    await page.locator('#movie-widget').screenshot({ path: `${OUT}/movie-strip-${i + 1}.png` });
    await page.click('#movie-next');
    await page.waitForTimeout(320);
  }
  console.log('strip picks:');
  hues.forEach(h => console.log(`   ${h.title.padEnd(14)} placeholder=${h.isPlaceholder} hue=${h.hue} filmMark=${h.hasFilmMark} bakedText=${h.hasBakedText}`));
  const uniq = new Set(hues.map(h => h.hue));
  console.log(`   → 不同色相数 ${uniq.size}/4 ; 全部无内嵌文字 = ${hues.every(h => !h.hasBakedText)} ; 全部含胶片标记 = ${hues.every(h => h.hasFilmMark)}`);

  // top mode: same placeholder rendered large
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('lt.settings') || '{}');
    s.widgetPos = Object.assign({}, s.widgetPos, { wmovie: 'top' });
    localStorage.setItem('lt.settings', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(1300);
  await page.locator('#movie-widget').screenshot({ path: `${OUT}/movie-tile-top.png` });
  console.log('captured: movie-strip-1..4.png, movie-tile-top.png');
  await browser.close();
})().catch(e => { console.error('crashed:', e); process.exit(1); });

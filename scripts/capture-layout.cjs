#!/usr/bin/env node
/* Before/after review shots of the default layout at the two most common viewports.
 * "before" is reconstructed by re-injecting the pre-fix CSS values at runtime, so the pair is
 * an apples-to-apples comparison of exactly the four things this pass changed. */
'use strict';
const fs = require('fs');
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');
const BASE = 'http://127.0.0.1:8755/newtab.html';
const OUT = '/Users/atom/WorkBuddy/2026-09-02-23-50-18/outputs';
fs.mkdirSync(OUT, { recursive: true });

// Exactly the pre-fix declarations, re-applied with higher precedence.
const REVERT_CSS = `
  .layout { padding: clamp(18px, 3vh, 30px) 40px 90px !important; }
  .widget.wclock.w-top { padding: clamp(4px, 1.4vh, 14px) 0 clamp(8px, 1.4vh, 16px) !important; }
  #grid-wrap { margin-top: clamp(22px, 3.5vh, 34px) !important; }
  .widget.wmovie:not(.w-top) { padding: 20px 20px 18px !important; }
  .widget.wmovie:not(.w-top) .w-head { margin-bottom: 12px !important; }
  .widget.wmovie:not(.w-top) .movie-tile {
    display: block !important; min-height: 420px !important; padding: 0 !important;
    border: 1px solid var(--line) !important; border-radius: 22px !important;
    background: linear-gradient(135deg, #334155, #0f172a) !important; overflow: hidden !important;
  }
  .widget.wmovie:not(.w-top) .movie-tile::after { content: '' !important; }
  .widget.wmovie:not(.w-top) .movie-tile-bg {
    position: absolute !important; inset: 0 !important;
    width: 100% !important; height: 100% !important; border: 0 !important; border-radius: 0 !important;
  }
  .widget.wmovie:not(.w-top) .movie-tile-date,
  .widget.wmovie:not(.w-top) .movie-tile-tag { display: block !important; }
  .widget.wmovie:not(.w-top) .movie-tile-info {
    position: absolute !important; left: 20px !important; right: 20px !important; bottom: 54px !important;
    color: #fff !important;
  }
  .widget.wmovie:not(.w-top) .movie-tile-title { font-size: 28px !important; color: #fff !important; white-space: normal !important; }
  .widget.wmovie:not(.w-top) .movie-tile-quote { font-size: 16px !important; color: #fff !important; -webkit-line-clamp: 4 !important; }
`;

async function shot(browser, { w, h }, revert, name) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('8755')) return route.continue();
    if (u.includes('/v1/wallpapers')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [], images: [] }) });
    return route.abort();
  });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  if (revert) await page.addStyleTag({ content: REVERT_CSS });
  await page.reload();
  if (revert) await page.addStyleTag({ content: REVERT_CSS });
  await page.waitForTimeout(1400);
  const m = await page.evaluate(() => {
    const mv = document.getElementById('movie-widget');
    const b = mv ? mv.getBoundingClientRect() : null;
    return { movieH: b ? Math.round(b.height) : 0, movieBottom: b ? Math.round(b.bottom) : 0, vh: innerHeight, scrollH: document.documentElement.scrollHeight };
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: 电影 h=${m.movieH} bottom=${m.movieBottom} / 视口 ${m.vh}  溢出=${Math.max(0, m.movieBottom - m.vh)}  scrollH=${m.scrollH}`);
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  await shot(browser, { w: 1440, h: 790 }, true, 'layout-before-1440x790');
  await shot(browser, { w: 1440, h: 790 }, false, 'layout-after-1440x790');
  await shot(browser, { w: 1280, h: 720 }, true, 'layout-before-1280x720');
  await shot(browser, { w: 1280, h: 720 }, false, 'layout-after-1280x720');
  await browser.close();
})().catch(e => { console.error('crashed:', e); process.exit(1); });

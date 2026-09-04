#!/usr/bin/env node
/* Capture review screenshots for avatar cover-fill + purple plum button. */
'use strict';
const path = require('path');
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');

const BASE = 'http://127.0.0.1:8755/newtab.html';
const OUT = '/Users/atom/WorkBuddy/2026-09-02-23-50-18/outputs';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.includes('127.0.0.1:8755') || u.includes('localhost:8755')) return route.continue();
    if (u.includes('/v1/wallpapers/sources')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [] }) });
    if (u.includes('/v1/wallpapers?')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [] }) });
    return route.abort();
  });

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);

  // 1) avatar before (fallback icon)
  const bb0 = await page.locator('#btn-avatar').boundingBox();
  await page.locator('#btn-avatar').screenshot({ path: path.join(OUT, 'avatar-before-fallback.png') });

  // 2) upload the quadrant image -> circle fully filled by the photo
  await page.setInputFiles('#f-avatar', path.join(__dirname, 'assets', 'quad-600x800.png'));
  await page.waitForFunction(() => {
    const el = document.getElementById('avatar-img');
    const img = el && el.querySelector('img');
    return !!el && !el.hidden && !!img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.locator('#btn-avatar').screenshot({ path: path.join(OUT, 'avatar-cover-fill.png') });

  // 3) full top-right region for context (avatar + menu open)
  await page.click('#btn-avatar');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'avatar-menu-open.png'), clip: { x: 0, y: 0, width: 1440, height: 400 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // 4) purple plum button close-up
  await page.locator('#btn-plum').screenshot({ path: path.join(OUT, 'plum-purple-button.png') });
  console.log('captured:', fs.readdirSync(OUT).filter(f => f.includes('avatar') || f.includes('plum')).join(', '));
  await browser.close();
})().catch(e => { console.error('capture crashed:', e); process.exit(1); });

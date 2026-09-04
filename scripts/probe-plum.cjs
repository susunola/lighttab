#!/usr/bin/env node
/* Playwright probe for #65 plum blossom: click -> wallpaper rotates + centered inspirational quote.
 * Usage: node scripts/probe-plum.cjs   (requires a static server on 127.0.0.1:8755 serving the repo root)
 * Exit code non-zero on any failure. */
'use strict';
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');

const BASE = 'http://127.0.0.1:8755/newtab.html';
let failures = 0;
const ok = (n, d) => console.log('  ok  ' + n + (d ? ' — ' + d : ''));
const fail = (n, d) => { failures++; console.error('FAIL  ' + n + (d ? ' —— ' + d : '')); };
const assert = (c, n, d) => (c ? ok(n, d) : fail(n, d));

(async () => {
  const WALLS = [
    { url: 'https://cdn.example.test/a.jpg', title: 'Wall A' },
    { url: 'https://cdn.example.test/b.jpg', title: 'Wall B' },
    { url: 'https://cdn.example.test/c.jpg', title: 'Wall C' }
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    // Generic resource failures come from our own route.abort() stubbing out the real
    // backend / WorkBuddy probe ports — a test artifact, not a page defect.
    if (/Failed to load resource/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.includes('127.0.0.1:8755') || u.includes('localhost:8755')) return route.continue();
    if (u.includes('/v1/wallpapers/sources')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: ['bing', 'wallhaven'] }) });
    }
    if (u.includes('/v1/wallpapers?')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: WALLS }) });
    }
    return route.abort();
  });

  await page.goto(BASE);
  await page.waitForTimeout(900);

  // 1) static presence
  assert(await page.$('#btn-plum'), '#btn-plum 存在');
  assert(await page.$('#quote'), '#quote 存在');
  assert(await page.$eval('#quote', el => el.hidden), '#quote 初始隐藏');
  assert(await page.$eval('#quote', el => el.getAttribute('aria-live') === 'polite'), '#quote aria-live=polite');

  // 2) plum blossom SVG: 5 big outer petals + per-petal inner tint + stamens/center cluster
  //    Enriched design = 10 ellipses (5 outer white rx=4.8 + 5 inner tint rx=2.4) and 7 circles
  //    (5 stamen tips + center disk + center dot). Contract: exactly 5 big petals, tint layer
  //    present, and a stamen/center cluster of >= 6 circles.
  const petalInfo = await page.$eval('#btn-plum svg', svg => ({
    big: svg.querySelectorAll('ellipse[rx="4.8"]').length,
    tint: svg.querySelectorAll('ellipse[rx="2.4"]').length,
    ellipse: svg.querySelectorAll('ellipse').length,
    circle: svg.querySelectorAll('circle').length,
    fill: svg.getAttribute('fill')
  }));
  assert(petalInfo.big === 5 && petalInfo.tint === 5 && petalInfo.ellipse === 10 && petalInfo.circle >= 6,
    `梅花 SVG 5 大瓣+5 晕染层+花心簇（big=${petalInfo.big} tint=${petalInfo.tint} ellipse=${petalInfo.ellipse} circle=${petalInfo.circle}, fill=${petalInfo.fill}）`);

  // 3) geometry: bottom-right, left of the + button, no overlap
  const plumBox = await page.locator('#btn-plum').boundingBox();
  const addBox = await page.locator('#add-float').boundingBox();
  assert(!!plumBox && !!addBox, '两个浮动按钮均有布局盒');
  if (plumBox && addBox) {
    const vw = 1440, vh = 900;
    assert(Math.abs(plumBox.x + plumBox.width - (vw - 90)) < 3 && Math.abs(plumBox.y + plumBox.height - (vh - 30)) < 3,
      `梅花按钮定位右下（x=${Math.round(plumBox.x)}, right 边距≈${Math.round(vw - plumBox.x - plumBox.width)}px, bottom≈${Math.round(vh - plumBox.y - plumBox.height)}px）`);
    assert(plumBox.x + plumBox.width <= addBox.x + 0.5, '梅花按钮不与 ＋ 按钮重叠（在其左侧）');
  }

  // 4) first click: wallpaper rotates to a.jpg, quote shows with text
  const bg0 = await page.$eval('#wallpaper', el => el.style.background || '');
  await page.click('#btn-plum');
  await page.waitForTimeout(700);
  const bg1 = await page.$eval('#wallpaper', el => el.style.background || '');
  const quoteShown = await page.$eval('#quote', el => !el.hidden);
  const quoteText = await page.$eval('#quote .quote-text', el => el.textContent || '');
  const quoteSrc = await page.$eval('#quote .quote-src', el => (el ? el.textContent : '') || '');
  assert(bg1.includes('a.jpg') && bg0 !== bg1, `首次点击换到池首 a.jpg（${bg1.slice(0, 80)}）`);
  assert(quoteShown, '点击后 #quote 显示');
  assert(quoteText.length > 0 && /^[“"]/.test(quoteText), `名句正文出现（${quoteText.slice(0, 40)}）`);
  assert(quoteSrc.includes('—'), `名句出处出现（${quoteSrc.slice(0, 40)}）`);
  const quoteBox = await page.locator('#quote .quote-text').boundingBox();
  if (quoteBox) {
    const cx = quoteBox.x + quoteBox.width / 2, cy = quoteBox.y + quoteBox.height / 2;
    assert(Math.abs(cx - 720) < 40 && Math.abs(cy - 450) < 80, `名句居中（中心 ≈ ${Math.round(cx)},${Math.round(cy)}）`);
  }

  // 5) quote auto-hides ~4.6s later
  await page.waitForTimeout(5300);
  assert(await page.$eval('#quote', el => el.hidden), '名句约 4.6s 后自动淡出隐藏');

  // 6) second click: wallpaper flips to b.jpg (skips current), quote shows again
  await page.click('#btn-plum');
  await page.waitForTimeout(700);
  const bg2 = await page.$eval('#wallpaper', el => el.style.background || '');
  const quoteShown2 = await page.$eval('#quote', el => !el.hidden);
  assert(bg2.includes('b.jpg'), `第二次点击换到 b.jpg（跳过当前）`);
  assert(quoteShown2, '第二次点击再次显示名句');

  // 7) no page errors
  assert(errors.length === 0, '无页面错误', errors.slice(0, 3).join(' | '));

  console.log('');
  await browser.close();
  if (failures) { console.error(`probe-plum: ${failures} 项失败`); process.exit(1); }
  console.log('probe-plum: 全部通过');
})().catch(e => { console.error('probe crashed:', e); process.exit(1); });

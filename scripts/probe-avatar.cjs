#!/usr/bin/env node
/* Playwright probe for avatar upload: the uploaded photo must FILL the whole circle via a real
 * <img> + object-fit:cover (no letterboxing, no fit-with-padding, no fallback icon on top), and a
 * solid-matte screenshot border must be auto-trimmed so the portrait fills the circle.
 * Usage: node scripts/probe-avatar.cjs   (requires a static server on 127.0.0.1:8755 serving repo root)
 * Exit code non-zero on any failure. */
'use strict';
const path = require('path');
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');

const BASE = 'http://127.0.0.1:8755/newtab.html';
const A = path.join(__dirname, 'assets', 'quad-600x800.png');   // portrait, 4 quadrant colors
const M = path.join(__dirname, 'assets', 'matte-900x900.png');  // white matte + centered 300x300 block
let failures = 0;
const ok = (n, d) => console.log('  ok  ' + n + (d ? ' — ' + d : ''));
const fail = (n, d) => { failures++; console.error('FAIL  ' + n + (d ? ' —— ' + d : '')); };
const assert = (c, n, d) => (c ? ok(n, d) : fail(n, d));

async function uploadAndWait(page, file) {
  await page.setInputFiles('#f-avatar', file);
  // the handler is async: poll until the avatar <img> is live or a timeout elapses
  await page.waitForFunction(() => {
    const el = document.getElementById('avatar-img');
    const img = el && el.querySelector('img');
    return !!el && !el.hidden && !!img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 8000 });
  await page.waitForTimeout(250);
}

// Read the stored dataURL and decode quadrant colors at 1/4 / 3/4 positions of the stored bitmap.
async function storedQuadrantColors(page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('lt.settings') || '{}');
    const avatar = s.avatar || '';
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const pts = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
        const hex = pts.map(([fx, fy]) => {
          const d = ctx.getImageData(Math.floor(img.naturalWidth * fx), Math.floor(img.naturalHeight * fy), 1, 1).data;
          return [d[0], d[1], d[2]];
        });
        resolve({ w: img.naturalWidth, h: img.naturalHeight, hex });
      };
      img.onerror = () => resolve({ w: 0, h: 0, hex: [] });
      img.src = avatar;
    });
  });
}

// Squared distance between two RGB colors; near() <= tol.
function near(a, b, tol) {
  const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  return d <= tol * tol * 3;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
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
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [] }) });
    }
    return route.abort();
  });

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(800);

  const RED = [255, 0, 0], GREEN = [0, 255, 0], BLUE = [0, 0, 255], YELLOW = [255, 255, 0], WHITE = [255, 255, 255];
  const TOL = 80;

  // ---------- Part 1: full-bleed portrait ----------
  await uploadAndWait(page, A);

  const st = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('lt.settings') || '{}');
    const avatar = s.avatar || '';
    const imgEl = document.getElementById('avatar-img');
    const img = imgEl && imgEl.querySelector('img');
    const cs = img ? getComputedStyle(img) : null;
    const boxImg = img ? img.getBoundingClientRect() : null;
    const boxEl = imgEl ? imgEl.getBoundingClientRect() : null;
    return {
      avatarLen: avatar.length,
      isDataPng: avatar.startsWith('data:image/png'),
      imgVisible: !!imgEl && !imgEl.hidden,
      imgOk: !!img && img.complete && img.naturalWidth > 0,
      objectFit: cs ? cs.objectFit : null,
      boxMatch: !!boxImg && !!boxEl &&
        Math.abs(boxImg.width - boxEl.width) < 0.5 && Math.abs(boxImg.height - boxEl.height) < 0.5,
      fallbackHidden: document.getElementById('avatar-fallback').hidden,
      initialHidden: document.getElementById('avatar-initial').hidden,
      bigImg: !!document.querySelector('#avatar-big img'),
      previewImg: !!document.querySelector('#avatar-preview img')
    };
  });

  assert(errors.length === 0, '无页面错误', errors.slice(0, 3).join(' | '));
  assert(st.isDataPng && st.avatarLen > 500, `头像已持久化（data:image/png, ${st.avatarLen} chars）`);
  assert(st.imgVisible && st.imgOk, '头像区显示真实 <img> 且已解码');
  assert(st.objectFit === 'cover', `object-fit 为 cover（实际 ${st.objectFit}）`);
  assert(st.boxMatch, '图片铺满头像容器（img 盒 == 容器盒）');
  assert(st.fallbackHidden && st.initialHidden, 'fallback 图标与首字母均已隐藏');
  assert(st.bigImg && st.previewImg, '菜单大头像与设置预览同步为图片');

  const q1 = await storedQuadrantColors(page);
  const expect1 = [RED, GREEN, BLUE, YELLOW];
  const good1 = q1.hex.length === 4 && expect1.every((c, i) => near(q1.hex[i], c, TOL));
  assert(good1, `存储位图四象限颜色正确（${q1.w}x${q1.h}, ${JSON.stringify(q1.hex)}）`, '期望 红/绿/蓝/黄');
  const anyWhiteish = q1.hex.some(c => near(c, WHITE, 60));
  assert(!anyWhiteish, '无留白/透明边（非 fit-with-padding）');

  // ---------- Part 2: matte-border screenshot ----------
  await uploadAndWait(page, M);

  const q2 = await storedQuadrantColors(page);
  const good2 = q2.hex.length === 4 && expect1.every((c, i) => near(q2.hex[i], c, TOL));
  assert(good2, `matte 边框已裁剪、四象限颜色正确（存储 ${q2.w}x${q2.h}, ${JSON.stringify(q2.hex)}）`);
  assert(q2.w <= 300, `裁剪后尺寸不超过原内容区（实际 ${q2.w}x${q2.h}）`);
  assert(errors.length === 0, '第二部分后仍无页面错误', errors.slice(0, 3).join(' | '));

  console.log('');
  await browser.close();
  if (failures) { console.error(`probe-avatar: ${failures} 项失败`); process.exit(1); }
  console.log('probe-avatar: 全部通过');
})().catch(e => { console.error('probe crashed:', e); process.exit(1); });

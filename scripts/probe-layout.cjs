#!/usr/bin/env node
/* Playwright probe for the DEFAULT layout envelope.
 *
 * Guards the two regressions fixed in this pass:
 *   1. The left stack (calendar + to-do + movie) used to total ~1010px because the movie widget
 *      rendered the full-bleed 525px poster tile there — taller than every common viewport, so the
 *      movie card was clipped by 145-368px out of the box.
 *   2. refreshCanvasHeight() always added 90px of drag drop-room, which forced a permanent
 *      scrollbar on the default layout even though the content itself fit above the fold.
 *
 * Also pins the two-mode movie design: compact strip in the left column, full poster tile in the
 * top stack / detail window.
 *
 * Usage: node scripts/probe-layout.cjs   (requires a static server on 127.0.0.1:8755 serving repo root)
 * Exit code non-zero on any failure. */
'use strict';
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');

const BASE = 'http://127.0.0.1:8755/newtab.html';
const SIZES = [
  { w: 1280, h: 720, label: '小窗 1280x720' },
  { w: 1440, h: 790, label: 'MacBook 13" 可视区' },
  { w: 1512, h: 860, label: 'MacBook 14"' },
  { w: 1440, h: 900, label: 'MacBook 13" 全屏' },
  { w: 1920, h: 950, label: '1080p 浏览器' }
];
const STRIP_MAX_H = 220;   // compact strip incl. widget chrome; the old poster tile was 525
let failures = 0;
const ok = (n, d) => console.log('  ok  ' + n + (d ? ' — ' + d : ''));
const fail = (n, d) => { failures++; console.error('FAIL  ' + n + (d ? ' —— ' + d : '')); };
const assert = (c, n, d) => (c ? ok(n, d) : fail(n, d));

async function stub(page) {
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('127.0.0.1:8755') || u.includes('localhost:8755')) return route.continue();
    if (u.includes('/v1/wallpapers')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [], images: [] }) });
    }
    return route.abort();
  });
}

async function fresh(page) {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------- 1) default envelope across viewports ----------
  for (const s of SIZES) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    page.on('pageerror', e => errors.push(`${s.label} pageerror: ` + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${s.label} console: ` + m.text()); });
    await stub(page);
    await fresh(page);

    const m = await page.evaluate(() => {
      const box = sel => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { y: Math.round(b.y), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
      const grid = document.getElementById('grid');
      return {
        vh: innerHeight,
        cal: box('.wcal'), todo: box('.wtodo'), movie: box('#movie-widget'),
        gridBottom: grid ? Math.round(grid.getBoundingClientRect().bottom) : null,
        scrollH: document.documentElement.scrollHeight,
        widgetPos: (JSON.parse(localStorage.getItem('lt.settings') || '{}').widgetPos) || null
      };
    });

    assert(m.movie && m.movie.bottom <= m.vh,
      `${s.label}：左栏三件套不溢出视口`,
      m.movie ? `电影 bottom=${m.movie.bottom} / 视口 ${m.vh}（溢出 ${Math.max(0, m.movie.bottom - m.vh)}px）` : '找不到电影组件');
    assert(m.movie && m.movie.h <= STRIP_MAX_H,
      `${s.label}：电影为紧凑条形态`,
      m.movie ? `h=${m.movie.h}（上限 ${STRIP_MAX_H}）` : '-');
    assert(m.scrollH <= m.vh + 1,
      `${s.label}：默认态无滚动条`,
      `scrollHeight=${m.scrollH} / 视口 ${m.vh}`);
    await page.close();
  }

  // ---------- 2) two-mode movie design ----------
  const page = await browser.newPage({ viewport: { width: 1440, height: 790 } });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await stub(page);
  await fresh(page);

  const strip = await page.evaluate(() => {
    const tile = document.querySelector('#movie-widget .movie-tile');
    const bg = document.querySelector('#movie-widget .movie-tile-bg');
    const info = document.querySelector('#movie-widget .movie-tile-info');
    const date = document.querySelector('#movie-widget .movie-tile-date');
    const tag = document.querySelector('#movie-widget .movie-tile-tag');
    const cs = el => el ? getComputedStyle(el) : null;
    const b = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) }; };
    return {
      tileDisplay: cs(tile) && cs(tile).display,
      tileCols: cs(tile) && cs(tile).gridTemplateColumns,
      bgPosition: cs(bg) && cs(bg).position,
      bgBox: b(bg),
      infoPosition: cs(info) && cs(info).position,
      infoBox: b(info),
      dateHidden: cs(date) && cs(date).display === 'none',
      tagHidden: cs(tag) && cs(tag).display === 'none',
      // strip must be side-by-side: the text column starts to the right of the thumb
      sideBySide: b(bg) && b(info) ? b(info).x >= b(bg).x + b(bg).w - 1 : false,
      titleText: (document.querySelector('#movie-widget .movie-tile-title') || {}).textContent || '',
      hasActions: !!document.querySelector('#movie-widget .movie-actions .movie-next')
    };
  });

  assert(strip.tileDisplay === 'grid', `左栏条：.movie-tile 为 grid 横排（实际 ${strip.tileDisplay}）`);
  assert(strip.bgPosition === 'static', `左栏条：海报脱离绝对定位铺底（position=${strip.bgPosition}）`);
  assert(strip.bgBox && strip.bgBox.w > 0 && strip.bgBox.w <= 70 && strip.bgBox.h <= 100,
    `左栏条：海报为缩略图`, strip.bgBox ? `${strip.bgBox.w}x${strip.bgBox.h}` : '-');
  assert(strip.infoPosition === 'static', `左栏条：文字列脱离绝对定位（position=${strip.infoPosition}）`);
  assert(strip.sideBySide, '左栏条：文字列在海报右侧（真横排，非叠层）',
    strip.bgBox && strip.infoBox ? `thumb right=${strip.bgBox.x + strip.bgBox.w}, info x=${strip.infoBox.x}` : '-');
  assert(strip.dateHidden && strip.tagHidden, '左栏条：日期角标与底部标签隐藏（信息已在组件头部）');
  assert(strip.titleText.includes('《'), `左栏条：片名可见（${strip.titleText.slice(0, 24)}）`);
  assert(strip.hasActions, '左栏条：仍保留「换一部」');

  // top-stack mode must keep the big poster tile
  const top = await page.evaluate(async () => {
    const s = JSON.parse(localStorage.getItem('lt.settings') || '{}');
    s.widgetPos = Object.assign({}, s.widgetPos, { wmovie: 'top' });
    localStorage.setItem('lt.settings', JSON.stringify(s));
    return true;
  });
  await page.reload();
  await page.waitForTimeout(1200);
  const topMode = await page.evaluate(() => {
    const w = document.getElementById('movie-widget');
    const tile = document.querySelector('#movie-widget .movie-tile');
    const bg = document.querySelector('#movie-widget .movie-tile-bg');
    return {
      isTop: !!w && w.classList.contains('w-top'),
      tileH: tile ? Math.round(tile.getBoundingClientRect().height) : 0,
      bgPosition: bg ? getComputedStyle(bg).position : null,
      tileDisplay: tile ? getComputedStyle(tile).display : null
    };
  });
  assert(top && topMode.isTop, '顶部态：电影组件挂上 .w-top');
  assert(topMode.tileDisplay === 'block' && topMode.bgPosition === 'absolute',
    `顶部态：仍是整幅海报叠层（display=${topMode.tileDisplay}, bg=${topMode.bgPosition}）`);
  assert(topMode.tileH >= 280, `顶部态：海报保持大尺寸（h=${topMode.tileH}）`);

  // ---------- 3) detail window unchanged ----------
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('lt.settings') || '{}');
    s.widgetPos = Object.assign({}, s.widgetPos, { wmovie: 'left' });
    localStorage.setItem('lt.settings', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForTimeout(1100);
  await page.click('#movie-widget .movie-tile');
  await page.waitForTimeout(500);
  const win = await page.evaluate(() => {
    const modal = document.getElementById('movie-modal');
    const w = document.getElementById('movie-window');
    const poster = document.querySelector('#movie-detail .movie-detail-poster');
    const b = w ? w.getBoundingClientRect() : null;
    return {
      open: !!modal && !modal.hidden,
      w: b ? Math.round(b.width) : 0,
      h: b ? Math.round(b.height) : 0,
      hasPoster: !!poster && poster.getBoundingClientRect().width > 40
    };
  });
  assert(win.open, '点紧凑条可打开详情窗');
  assert(win.w === 1120 && win.h === 620, `详情窗仍为固定 1120x620（实际 ${win.w}x${win.h}）`);
  assert(win.hasPoster, '详情窗右侧大海报在位');

  assert(errors.length === 0, '全程无页面错误', errors.slice(0, 3).join(' | '));

  console.log('');
  await browser.close();
  if (failures) { console.error(`probe-layout: ${failures} 项失败`); process.exit(1); }
  console.log('probe-layout: 全部通过');
})().catch(e => { console.error('probe crashed:', e); process.exit(1); });

#!/usr/bin/env node
/* Alignment / geometry audit for the DEFAULT layout.
 *
 * The user reported "没对齐啊 所有的都检查一下" against a screenshot of the default new-tab page.
 * Instead of guessing which element they meant, measure every visible box and check the alignment
 * invariants the layout is *supposed* to hold, then dump a full box map so a human (or the model)
 * can spot the offenders. Also writes a screenshot for eyeballing.
 *
 * Usage: node scripts/probe-align.cjs [width height out.png]
 * Requires a static server on 127.0.0.1:8755 serving the repo root.
 * Exit code non-zero when an invariant is violated. */
'use strict';
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8755/newtab.html';
const W = parseInt(process.argv[2] || '1440', 10);
const H = parseInt(process.argv[3] || '790', 10);
const SHOT = process.argv[4] || '/Users/atom/WorkBuddy/2026-09-02-23-50-18/outputs/align-audit.png';
const EPS = 2;   // px slop for float rounding
const EPS2 = 2.5;
let failures = 0;
const ok = (n, d) => console.log('  ok  ' + n + (d ? ' — ' + d : ''));
const fail = (n, d) => { failures++; console.error('FAIL  ' + n + (d ? ' —— ' + d : '')); };
const assert = (c, n, d) => (c ? ok(n, d) : fail(n, d));
const near = (a, b, eps = EPS) => Math.abs(a - b) <= eps;

async function stub(page) {
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('127.0.0.1:8755')) return route.continue();
    if (u.includes('/v1/wallpapers')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [], images: [] }) });
    }
    return route.abort();
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await stub(page);
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1300);

  const audit = await page.evaluate(() => {
    const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), r: +(b.x + b.width).toFixed(1), btm: +(b.y + b.height).toFixed(1), cx: +(b.x + b.width / 2).toFixed(1), cy: +(b.y + b.height / 2).toFixed(1) }; };
    const q = s => document.querySelector(s);
    const qa = s => Array.from(document.querySelectorAll(s));
    const vis = el => el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden]');
    const boxv = el => (vis(el) ? box(el) : null);
    const boxes = {};
    const add = (k, s) => { const b = boxv(q(s)); if (b) boxes[k] = b; };
    const rootRect = q('.layout').getBoundingClientRect();
    // Keep the same key set as box() — cx/cy used to be missing here, which let a centre-based
    // assertion silently read `undefined` instead of failing loudly.
    const rel = b => b && { x: +(b.x - rootRect.x).toFixed(1), y: +(b.y - rootRect.y).toFixed(1), w: b.w, h: b.h, r: +(b.r - rootRect.x).toFixed(1), btm: +(b.btm - rootRect.y).toFixed(1), cx: +(b.cx - rootRect.x).toFixed(1), cy: +(b.cy - rootRect.y).toFixed(1) };

    // --- structural (canvas mode: absolute blocks) ---
    add('topbar', '#topbar');
    add('date-chip', '#date-chip');
    add('avatar-btn', '#btn-avatar');
    add('layout', '.layout');
    for (const id of ['wclock', 'wcal', 'wtodo', 'wmovie']) {
      add('w-' + id, '.widget.' + id);
      add('whead-' + id, '.widget.' + id + ' .w-head');
      add('wtitle-' + id, '.widget.' + id + ' .w-title');
    }
    add('search', '#search');
    add('search-go', '#search-go');
    add('engine-btn', '#engine-btn');
    add('grid-wrap', '#grid-wrap');
    add('grid', '#grid');
    add('add-float', '#add-float');
    add('plum-float', '#btn-plum');
    add('cal-week', '.wcal .cal-week');
    add('cal-grid', '.wcal .cal-grid');
    add('todo-add', '.wtodo .todo-add');
    add('todo-list', '.wtodo .todo-list');
    add('movie-card', '.wmovie .movie-card');
    add('movie-tile', '.wmovie .movie-tile');
    add('movie-bg', '.wmovie .movie-tile-bg');
    add('movie-info', '.wmovie .movie-tile-info');
    add('quote', '#quote');

    const weekSpans = qa('.wcal .cal-week span').filter(vis).map(box);
    const calCells = qa('.wcal .cal-cell').filter(vis).map(box);
    const cards = qa('#grid .card').filter(vis).map(c => ({ box: box(c), t: (c.querySelector('.title') || {}).textContent || '' }));
    const m = { tile: boxv(q('#movie-widget .movie-tile')), bg: boxv(q('#movie-widget .movie-tile-bg')), info: boxv(q('#movie-widget .movie-tile-info')), title: boxv(q('#movie-widget .movie-tile-title')), rate: boxv(q('#movie-widget .movie-tile-rate')), quote: boxv(q('#movie-widget .movie-tile-quote')) };
    const clock = { row: boxv(q('.wclock .clock-row')), hhmm: boxv(q('#clock-hhmm')), date: boxv(q('#clock-date')), lunar: boxv(q('#clock-lunar')) };

    const isCanvas = q('.layout').classList.contains('canvas');
    const st = JSON.parse(localStorage.getItem('lt.settings') || '{}');
    const relBoxes = {};
    for (const [k, b] of Object.entries(boxes)) relBoxes[k] = rel(b);
    return { isCanvas, boxes, relBoxes, weekSpans, calCells, cards, m, clock, pos: st.widgetPos || null, layoutCoords: st.layout ? { wclock: st.layout.wclock, wcal: st.layout.wcal, wtodo: st.layout.wtodo, wmovie: st.layout.wmovie, search: st.layout.search, grid: st.layout.grid } : null };
  });

  const B = audit.boxes;
  const R = audit.relBoxes;
  const d = (msg, a, b) => `${msg}: ${a} vs ${b}`;

  console.log(`viewport ${W}x${H}  canvas=${audit.isCanvas}  widgetPos=${JSON.stringify(audit.pos)}`);
  if (audit.layoutCoords) console.log(`layout coords (rel .layout): ${JSON.stringify(audit.layoutCoords, null, 0)}`);

  // ===== invariants (canvas-aware: absolute blocks, compare relative to .layout) =====
  // 1. Top bar chip / avatar vertical center
  if (B['date-chip'] && B['avatar-btn']) {
    const cy1 = B['date-chip'].cy, cy2 = B['avatar-btn'].cy;
    assert(near(cy1, cy2, EPS2), '顶栏：日期胶囊与右上角操作钮垂直居中', d('中心', cy1.toFixed(1), cy2.toFixed(1)));
  }
  // 2. Widgets sharing the left column (x == left-most block x): same x, same width, clean left edge
  const widgetKeys = ['w-wclock', 'w-wcal', 'w-wtodo', 'w-wmovie'].filter(k => R[k]);
  if (widgetKeys.length >= 2) {
    const minX = Math.min(...widgetKeys.map(k => R[k].x));
    const col = widgetKeys.filter(k => R[k].x <= minX + EPS);
    const row = widgetKeys.filter(k => R[k].x > minX + EPS);
    if (col.length >= 2) {
      const x0 = R[col[0]].x, w0 = R[col[0]].w;
      for (const k of col.slice(1)) {
        assert(near(R[k].x, x0, EPS), `左栏卡片左缘对齐（${k}）`, d('x', R[k].x, x0));
        assert(near(R[k].w, w0, EPS), `左栏卡片等宽（${k}）`, d('w', R[k].w, w0));
      }
    }
    // column-to-column: left column right edge vs right column left edge -> gap sanity
    if (col.length && row.length) {
      const colRight = Math.max(...col.map(k => R[k].r));
      const rowLeft = Math.min(...row.map(k => R[k].x));
      console.log(`  info  左栏右缘=${colRight.toFixed(1)} 右块左缘=${rowLeft.toFixed(1)} 列间距=${(rowLeft - colRight).toFixed(1)}px`);
    }
  }
  // 3. Clock and search pill share a horizontal CENTER (iTab top-stack contract).
  //
  //    This used to assert left-edge equality (`search.x === wclock.x`). That was correct in the
  //    pre-iTab era: the clock was promoted into the search column as a `.w-top` block, so it
  //    inherited the same 640px width and therefore the same left edge as the pill.
  //
  //    In the iTab shell the clock is a content-width element centred inside `.top-stack`
  //    (typ. w≈171), while the pill is a fixed 640px centred box. Their left edges legitimately
  //    differ by ~235px; what must hold is that both are centred on the same vertical axis.
  if (B['w-wclock'] && B['search']) {
    const ccx = R['w-wclock'].cx, scx = R['search'].cx;
    assert(near(ccx, scx, EPS2), '时钟与搜索框水平中心对齐', d('中心', ccx.toFixed(1), scx.toFixed(1)));
    console.log(`  info  时钟宽=${B['w-wclock'].w} 搜索宽=${B['search'].w} 左缘: 时钟=${R['w-wclock'].x.toFixed(1)} 搜索=${R['search'].x.toFixed(1)}`);
    // The clock must sit ABOVE the pill, not beside it.
    assert(R['w-wclock'].btm <= R['search'].y + EPS, '时钟位于搜索框上方', d('时钟底/搜索顶', R['w-wclock'].btm.toFixed(1), R['search'].y.toFixed(1)));
  }
  // 3b. Search pill and icon grid form ONE centred column, not two offset strips.
  //     canvas.js clamps the grid to 640 (= the pill width) and re-anchors it on the pill's centre
  //     line; without the re-anchor the grid keeps the flow column's left edge and sits ~4px off.
  if (B['search'] && B['grid-wrap']) {
    assert(near(R['grid-wrap'].x, R['search'].x, EPS), '搜索框与图标区左缘对齐', d('x', R['grid-wrap'].x, R['search'].x));
    assert(near(R['grid-wrap'].r, R['search'].r, EPS), '搜索框与图标区右缘对齐', d('r', R['grid-wrap'].r, R['search'].r));
  }
  // 4. Search pill internals vertical center
  if (B['engine-btn'] && B['search-go'] && B['search']) {
    const c1 = B['engine-btn'].cy, c2 = B['search'].y + B['search'].h / 2, c3 = B['search-go'].cy;
    assert(near(c1, c2, EPS2) && near(c2, c3, EPS2), '搜索框内部垂直居中', d('中心', [c1, c2, c3].map(v => v.toFixed(1)).join('/'), '一致'));
  }
  // 5. Calendar: weekday header columns line up with day cells
  if (audit.weekSpans.length === 7 && audit.calCells.length >= 7) {
    let worst = 0;
    for (let i = 0; i < 7; i++) worst = Math.max(worst, Math.abs(audit.weekSpans[i].cx - audit.calCells[i].cx));
    assert(worst <= EPS2, `日历：星期表头与日期列中心对齐（最差列差 ${worst.toFixed(1)}px）`);
  }
  // 6. Cards: rows share y (canvas: cards are absolute too)
  if (audit.cards.length) {
    const ys = [...new Set(audit.cards.map(c => Math.round(c.box.y)))].sort((a, b) => a - b);
    const rows = ys.length;
    console.log(`  info  图标卡片 ${audit.cards.length} 个，行数=${rows}，行 y=${ys.join(',')}`);
    if (ys.length >= 2) {
      const step = ys[1] - ys[0];
      assert(step > 0, '图标区存在多行');
    }
    const row0 = audit.cards.filter(c => near(c.box.y, audit.cards[0].box.y, EPS));
    if (row0.length >= 2) {
      const w0 = row0[0].box.w;
      for (const c of row0.slice(1)) assert(near(c.box.w, w0, EPS), `图标卡片行内等宽（${c.t}）`, d('w', c.box.w, w0));
    }
  }
  // 7. Movie strip thumb vs text column top
  if (audit.m.bg && audit.m.info) {
    assert(near(audit.m.bg.y, audit.m.info.y, EPS), '电影条：海报与文字列同顶', d('y', audit.m.bg.y, audit.m.info.y));
  }
  // 8. Floating buttons bottom line
  if (B['add-float'] && B['plum-float']) {
    assert(near(B['add-float'].btm, B['plum-float'].btm, EPS), '右下浮动钮底边对齐', d('btm', B['add-float'].btm, B['plum-float'].btm));
  }

  assert(errors.length === 0, '无页面错误', errors.slice(0, 3).join(' | '));

  // dump box map
  console.log('\n--- box map (x,y,w,h  rel .layout) ---');
  for (const [k, b] of Object.entries(R)) {
    console.log(`  ${k.padEnd(16)} x=${String(b.x).padStart(7)} y=${String(b.y).padStart(6)}  w=${String(b.w).padStart(6)} h=${String(b.h).padStart(5)}  r=${String(b.r).padStart(7)} btm=${String(b.btm).padStart(6)}  cx=${String(b.x + b.w / 2).padStart(7)}`);
  }
  const cardFirst = audit.cards[0];
  if (cardFirst) console.log(`  first card: ${cardFirst.t}  x=${cardFirst.box.x} y=${cardFirst.box.y} w=${cardFirst.box.w} h=${cardFirst.box.h}`);

  await page.screenshot({ path: SHOT, fullPage: false });
  console.log(`\nscreenshot -> ${SHOT}`);

  await browser.close();
  if (failures) { console.error(`probe-align: ${failures} 项对齐不变量失败`); process.exit(1); }
  console.log('probe-align: 全部通过');
})().catch(e => { console.error('probe crashed:', e); process.exit(1); });

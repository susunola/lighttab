#!/usr/bin/env node
/* iTab-style shell regression.
 *
 * Pins the layout shape the iTab pass introduced (a top-stack of clock + search above a
 * body-row of feature card + shortcut grid), the per-widget placement contract the JS
 * enforces (the clock is the page header, not a slot occupant), and the responsive
 * collapses (body-row stacks vertically at <=1024; the hero shrinks to a strip at <=720).
 *
 * The shipped default for >=1024 viewports is canvas mode (free canvas auto-applies at boot),
 * so both modes are asserted — a change that breaks either path gets caught. Viewports below
 * 1024 never enter canvas, so they are checked in flow only.
 *
 * Usage: node scripts/probe-itab.cjs   (needs a static server on 127.0.0.1:8755 serving repo root)
 * Exit code non-zero on any failure. */
'use strict';
const { chromium } = require('/Users/atom/.workbuddy/binaries/node/workspace/node_modules/playwright');

const BASE = 'http://127.0.0.1:8755/newtab.html';
let failures = 0;
const ok = (n, d) => console.log('  ok  ' + n + (d ? ' — ' + d : ''));
const fail = (n, d) => { failures++; console.error('FAIL  ' + n + (d ? ' —— ' + d : '')); };
const assert = (c, n, d) => (c ? ok(n, d) : fail(n, d));

async function stub(page) {
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.includes('8755')) return route.continue();
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
  await page.waitForTimeout(1300);
}
/* Drop the free-canvas class and the inline coordinates canvas mode wrote, so a wide viewport
 * shows what a flow user sees. A no-op below 1024 (those viewports never enter canvas). */
async function toFlow(page) {
  await page.evaluate(() => {
    const root = document.querySelector('.layout');
    if (root) { root.classList.remove('canvas'); root.style.height = ''; }
    for (const el of document.querySelectorAll('.wclock, .wcal, #todo-widget, #movie-widget, #search, #grid-wrap')) {
      el.style.left = ''; el.style.top = ''; el.style.width = '';
    }
  });
  await page.waitForTimeout(120);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------- 1) iTab shell: DOM shape + widget placement ----------
  for (const mode of ['canvas', 'flow']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(`${mode} pageerror: ` + e.message));
    await stub(page);
    await fresh(page);
    if (mode === 'flow') await toFlow(page);

    const info = await page.evaluate(() => {
      const ts = document.querySelector('.layout > .top-stack');
      const br = document.querySelector('.layout > .body-row');
      const extra = document.querySelector('.top-stack > .top-stack-extra');
      const wclock = document.querySelector('.widget.wclock');
      const wcal = document.querySelector('.widget.wcal');
      const wtodo = document.querySelector('.widget.wtodo');
      const wmovie = document.querySelector('.widget.wmovie');
      const search = document.getElementById('search');
      const gridWrap = document.getElementById('grid-wrap');
      const hhmm = document.getElementById('clock-hhmm');
      const greet = document.getElementById('clock-greet');
      const cs = el => (el ? getComputedStyle(el) : null);
      return {
        topStackKids: ts ? [...ts.children].map(c => c.className || c.tagName) : null,
        bodyRowKids: br ? [...br.children].map(c => c.className || c.tagName) : null,
        wclockParent: wclock ? wclock.parentElement.className : null,
        wclockHasWTop: wclock ? wclock.classList.contains('w-top') : null,
        hhmmFont: cs(hhmm) && cs(hhmm).fontSize,
        hhmmWeight: cs(hhmm) && cs(hhmm).fontWeight,
        greetDisplay: cs(greet) && cs(greet).display,
        greetText: greet ? greet.textContent : null,
        wcalDisplay: cs(wcal) && cs(wcal).display,
        wtodoDisplay: cs(wtodo) && cs(wtodo).display,
        wmovieParent: wmovie ? wmovie.parentElement.className : null,
        wmovieHasWTop: wmovie ? wmovie.classList.contains('w-top') : null,
        extraKids: extra ? [...extra.children].map(c => c.className) : [],
        searchInTopStack: !!(ts && search && ts.contains(search)),
        gridInBodyRow: !!(br && gridWrap && br.contains(gridWrap)),
        // Header chrome must be fully off — including backdrop-filter, which paints a visible
        // saturated rectangle over the wallpaper even with a transparent background.
        clockChrome: wclock ? (c => ({ bg: c.backgroundColor, border: c.borderTopWidth, shadow: c.boxShadow, backdrop: c.backdropFilter }))(cs(wclock)) : null
      };
    });

    assert(info.topStackKids && info.topStackKids.some(c => /wclock/.test(c)),
      `${mode}：.top-stack 容纳 wclock`, info.topStackKids ? info.topStackKids.join(' | ') : '-');
    assert(info.searchInTopStack, `${mode}：搜索框搬进 .top-stack`);
    assert(info.bodyRowKids && info.bodyRowKids.some(c => /left/.test(c)) && info.bodyRowKids.some(c => /right/.test(c)),
      `${mode}：.body-row 容纳 .left + .right`, info.bodyRowKids ? info.bodyRowKids.join(' | ') : '-');
    assert(info.gridInBodyRow, `${mode}：#grid-wrap 在 .body-row 内`);
    /* The clock must stay a DIRECT child of .top-stack: the new `.top-stack > .widget.wclock`
     * rules only match that shape. Landing it inside .top-stack-extra fell back to the older
     * `.widget.wclock.w-top` contract (66px / weight 300) and the clock stopped reading as a
     * page header. */
    assert(info.wclockParent === 'top-stack',
      `${mode}：wclock 是 .top-stack 直接子元素`, `父=${info.wclockParent}`);
    assert(info.wclockHasWTop === false,
      `${mode}：wclock 不带 .w-top（否则旧 w-top 规则同特异性后写会抢样式）`, `w-top=${info.wclockHasWTop}`);
    /* Clock is the page header: no card chrome at all. backdrop-filter is the sneaky one — it
     * survives a background/border/shadow reset and saturates the wallpaper into a visible
     * rectangle around the clock text. */
    {
      const c = info.clockChrome || {};
      const transparent = /rgba\(0, 0, 0, 0\)|transparent/.test(c.bg || '');
      assert(transparent && c.border === '0px' && c.shadow === 'none' && c.backdrop === 'none',
        `${mode}：时钟无卡片装饰（含 backdrop-filter）`,
        `bg=${c.bg} border=${c.border} shadow=${c.shadow} backdrop=${c.backdrop}`);
    }
    assert(parseFloat(info.hhmmFont) >= 48 && info.hhmmWeight === '600',
      `${mode}：时钟为大号粗体 iTab 风`, `font=${info.hhmmFont} weight=${info.hhmmWeight}`);
    assert(info.greetDisplay !== 'none',
      `${mode}：问候行可见`, `display=${info.greetDisplay} text="${(info.greetText || '').slice(0, 12)}"`);
    if (mode === 'flow') {
      assert(info.wcalDisplay === 'none' && info.wtodoDisplay === 'none',
        'flow：默认隐藏日历 + 待办（iTab 默认排版）', `wcal=${info.wcalDisplay} wtodo=${info.wtodoDisplay}`);
    }
    assert(info.wmovieParent === 'left', `${mode}：电影落在 .left`, `父=${info.wmovieParent}`);
    assert(info.wmovieHasWTop === false, `${mode}：电影不带 .w-top`, `w-top=${info.wmovieHasWTop}`);
    assert(info.extraKids.length === 0,
      `${mode}：默认没有 widget 落进 .top-stack-extra`, info.extraKids.join(' | ') || 'none');
    await page.close();
  }

  // ---------- 2) Promoting a widget into the top slot still works ----------
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push('promote pageerror: ' + e.message));
    await stub(page);
    await fresh(page);
    // What Settings → General does under the hood: re-enable wcal and place it 'top'.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('lt.settings') || '{}');
      s.widgets = Object.assign({}, s.widgets, { wclock: true, wcal: true, wtodo: false, wmovie: true });
      s.widgetPos = Object.assign({}, s.widgetPos, { wclock: 'top', wcal: 'top', wtodo: 'left', wmovie: 'left' });
      localStorage.setItem('lt.settings', JSON.stringify(s));
    });
    await page.reload();
    await page.waitForTimeout(1200);
    await toFlow(page);
    const promo = await page.evaluate(() => {
      const extra = document.querySelector('.top-stack-extra');
      const wcal = document.querySelector('.widget.wcal');
      const wclock = document.querySelector('.widget.wclock');
      return {
        extraKids: extra ? [...extra.children].map(c => c.className) : [],
        wcalWTop: wcal ? wcal.classList.contains('w-top') : null,
        wcalDisplay: wcal ? getComputedStyle(wcal).display : null,
        wclockParent: wclock ? wclock.parentElement.className : null,
        wclockHasWTop: wclock ? wclock.classList.contains('w-top') : null
      };
    });
    assert(promo.extraKids.some(c => /wcal/.test(c)),
      '提升到顶部：wcal 进入 .top-stack-extra', promo.extraKids.join(' | ') || 'none');
    assert(promo.wcalWTop === true, '提升到顶部：wcal 获得 .w-top（去卡片 chrome）', `w-top=${promo.wcalWTop}`);
    assert(promo.wcalDisplay !== 'none', '提升到顶部：wcal 不再被默认隐藏规则命中（它已不在 .left 下）',
      `display=${promo.wcalDisplay}`);
    assert(promo.wclockParent === 'top-stack' && promo.wclockHasWTop === false,
      '提升到顶部：wclock 仍是 .top-stack 直接子元素且不带 w-top',
      `父=${promo.wclockParent} w-top=${promo.wclockHasWTop}`);
    await page.close();
  }

  // ---------- 3) Responsive collapses ----------
  /* The movie card uses the compact strip at every width, so one bound covers all three:
   * a 92px poster thumb + text column. A taller tile here means a "hero" variant crept back in
   * and left a void under the content once the body-row stacked. */
  for (const s of [
    { w: 1024, h: 768, label: 'tablet',       tileMax: 98 },
    { w: 768,  h: 900, label: 'small-tablet', tileMax: 98 },
    { w: 390,  h: 844, label: 'phone',        tileMax: 98 }
  ]) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
    page.on('pageerror', e => errors.push(`${s.label} pageerror: ` + e.message));
    await stub(page);
    await fresh(page);
    const m = await page.evaluate(() => {
      const br = document.querySelector('.body-row');
      const left = document.querySelector('.body-row > .left');
      const right = document.querySelector('.body-row > .right');
      const tile = document.querySelector('#movie-widget .movie-tile');
      const grid = document.getElementById('grid');
      const wmovie = document.getElementById('movie-widget');
      const gridWrap = document.getElementById('grid-wrap');
      const cs = el => (el ? getComputedStyle(el) : null);
      const b = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), r: Math.round(r.right) }; };
      const layout = document.querySelector('.layout');
      const ls = cs(layout);
      return {
        bodyDir: cs(br) && cs(br).flexDirection,
        left: b(left), right: b(right),
        // Heights, to catch the flex-basis-on-the-wrong-axis trap (see the assertion below).
        leftH: left ? Math.round(left.getBoundingClientRect().height) : 0,
        movieH: wmovie ? Math.round(wmovie.getBoundingClientRect().height) : 0,
        // Vertical gap between the movie card's bottom and the grid block's top.
        movieToGrid: (wmovie && gridWrap)
          ? Math.round(gridWrap.getBoundingClientRect().top - wmovie.getBoundingClientRect().bottom)
          : 0,
        search: b(document.getElementById('search')),
        movie: b(wmovie),
        gridWrap: b(gridWrap),
        // Content box of .layout — the widest a stacked column may become before the 720px cap.
        contentW: Math.round(layout.clientWidth - parseFloat(ls.paddingLeft) - parseFloat(ls.paddingRight)),
        tileH: tile ? Math.round(tile.getBoundingClientRect().height) : 0,
        tileDisplay: cs(tile) && cs(tile).display,
        gridOverflow: grid ? Math.round(grid.getBoundingClientRect().right - window.innerWidth) : 0
      };
    });
    assert(m.bodyDir === 'column', `${s.label} ${s.w}x${s.h}：.body-row 改列排`, `实际 ${m.bodyDir}`);
    // One centred column: the two stacked blocks must share an x and a width.
    assert(m.left && m.right && m.left.x === m.right.x && m.left.w === m.right.w,
      `${s.label}：左右两块收成同一列（同 x 同宽）`,
      `left=${m.left && m.left.x}/${m.left && m.left.w} right=${m.right && m.right.x}/${m.right && m.right.w}`);
    // Width = the content box, capped at the 720px top-stack width.
    {
      const want = Math.min(720, m.contentW);
      assert(Math.abs(m.left.w - want) <= 1, `${s.label}：列宽 = min(720, 内容宽)`, `实际 ${m.left.w} / 期望 ${want}（内容宽 ${m.contentW}）`);
    }
    /* Flush edges. Before the stacked-mode cap these three ran down the page at three different
     * edges (at 1024: search x=152 w=720, grid x=20 w=640, movie x=20 w=984) because the pill
     * centred itself in the top-stack while the grid kept its desktop-only 640px cap left-anchored. */
    for (const [k, box] of [['搜索框', m.search], ['电影卡', m.movie], ['图标区', m.gridWrap]]) {
      if (!box) continue;
      assert(box.x === m.search.x && box.r === m.search.r,
        `${s.label}：${k} 与搜索框左右缘齐平`, `x=${box.x} r=${box.r} / 搜索 x=${m.search.x} r=${m.search.r}`);
    }
    assert(m.gridOverflow <= 0, `${s.label}：网格不溢出右边界`, `grid.right - ${s.w} = ${m.gridOverflow}px`);
    /* No phantom vertical space. `.left { flex: 0 0 320px }` sizes the flex MAIN axis, so once
     * .body-row flips to `column` that 320px becomes a fixed HEIGHT — the left column rendered
     * 320px tall around a 167px card and pushed the grid down by ~153px of nothing. The media query
     * must reset `flex`, not only `width`. */
    assert(Math.abs(m.leftH - m.movieH) <= 2,
      `${s.label}：左块高度贴合电影卡（无 flex-basis 撑出的空洞）`, `left=${m.leftH} movie=${m.movieH}`);
    assert(m.movieToGrid >= 0 && m.movieToGrid <= 60,
      `${s.label}：电影卡到图标区的竖向间距合理`, `${m.movieToGrid}px（上限 60）`);
    assert(m.tileH > 0 && m.tileH <= s.tileMax,
      `${s.label}：电影卡压到紧凑高度`, `tile=${m.tileH}px（上限 ${s.tileMax}）`);
    assert(m.tileDisplay === 'grid', `${s.label}：电影卡为 grid 横排`, `display=${m.tileDisplay}`);
    await page.close();
  }

  assert(errors.length === 0, '全程无页面错误', errors.slice(0, 3).join(' | '));
  console.log('');
  await browser.close();
  if (failures) { console.error(`probe-itab: ${failures} 项失败`); process.exit(1); }
  console.log('probe-itab: 全部通过');
})().catch(e => { console.error('probe crashed:', e); process.exit(1); });

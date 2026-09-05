/* LightTab - canvas.js
   Free canvas layout: draggable blocks and cards, snap-to-grid, ResizeObserver coalescing.
   Split out of app.js unchanged. Loads BEFORE app.js (see newtab.html) and reaches shared
   state through window.LT_APP at call time; exposes window.LT_CANVAS for app.js to call.
*/
(() => {
  'use strict';

  const A = () => window.LT_APP; // lazy: app.js loads after this file

  // ---------- Free canvas layout (draggable blocks) ----------
  const BLOCK_DEFS = [
    { key: 'wclock', sel: '.wclock' },
    { key: 'wcal',   sel: '.wcal' },
    { key: 'wtodo',  sel: '#todo-widget' },
    { key: 'wmovie', sel: '.wmovie' },
    { key: 'search', sel: '#search' },
    { key: 'grid',   sel: '#grid-wrap' }
  ];
  const CANVAS_MIN_W = 1024;
  const DRAG_THRESHOLD = 6;
  const DRAG_INTERACTIVE = 'input,button,a,select,textarea,.card,.gchip,.todo-item,.cal-nav-btn,.cal-cell,.engine-list,.menu,.palette,[data-act]';

  function blockEls() {
    return BLOCK_DEFS.map(b => ({ ...b, el: document.querySelector(b.sel) })).filter(b => b.el);
  }
  function canvasRoot() { return document.querySelector('.layout'); }
  function canvasEligible() { return window.innerWidth > CANVAS_MIN_W; }
  function getLayout() {
    const l = A().state.settings && A().state.settings.layout;
    return (l && typeof l === 'object') ? l : null;
  }

  function applyCanvas() {
    const root = canvasRoot();
    const l = getLayout();
    if (!root || !l) return;
    root.classList.add('canvas');
    for (const b of blockEls()) {
      const c = l[b.key];
      if (!c || typeof c.x !== 'number' || typeof c.y !== 'number') continue;
      b.el.style.left = c.x + 'px';
      b.el.style.top = c.y + 'px';
      b.el.style.width = c.w ? c.w + 'px' : '';
    }
    applyCardCanvas();
    refreshCanvasHeight();
  }

  function leaveCanvas() {
    const root = canvasRoot();
    if (!root) return;
    root.classList.remove('canvas');
    root.style.height = '';
    for (const b of blockEls()) {
      b.el.style.left = ''; b.el.style.top = ''; b.el.style.width = '';
    }
    clearCardCanvas();
  }

  // First entry into canvas mode: measure the current flow positions and freeze them as coordinates, so switching to absolute positioning causes zero jump.
  function captureLayout() {
    const root = canvasRoot();
    if (!root) return null;
    const rr = root.getBoundingClientRect();
    const layout = {};
    for (const b of blockEls()) {
      const r = b.el.getBoundingClientRect();
      layout[b.key] = {
        x: Math.round(r.left - rr.left),
        y: Math.round(r.top - rr.top),
        w: Math.round(r.width)
      };
    }
    // Card grid coordinates: on first entry, map the current flow positions to (col, row).
    // With no cells (extremely narrow window, or no cards) captureCardLayout returns an empty object.
    layout.cards = captureCardLayout();
    // auto=true marks coordinates the app derived from the flow layout rather than the user dragging
    // blocks around. Only an auto layout may be silently re-derived (see recaptureBlocksFromFlow).
    layout.auto = true;
    A().state.settings.layout = layout;
    A().Store.set(A().K.settings, A().state.settings);
    return layout;
  }

  function refreshCanvasHeight() {
    const root = canvasRoot();
    if (!root || !root.classList.contains('canvas')) return;
    let maxBottom = 0;
    const rr = root.getBoundingClientRect();
    for (const b of blockEls()) {
      const r = b.el.getBoundingClientRect();
      const bottom = r.bottom - rr.top;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    // Cards are absolutely positioned inside #grid, so take the max of the grid-wrap bottom and each card's bottom.
    const grid = document.getElementById('grid');
    const gridWrap = document.getElementById('grid-wrap');
    if (grid && gridWrap) {
      const gw = gridWrap.getBoundingClientRect();
      const cards = grid.querySelectorAll('.card');
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        const bottom = (r.bottom - rr.top);
        if (bottom > maxBottom) maxBottom = bottom;
      }
      // Count grid-wrap's own bottom too (covers having no cards but a custom grid-wrap height).
      const gwb = gw.bottom - rr.top;
      if (gwb > maxBottom) maxBottom = gwb;
    }
    root.style.height = (maxBottom + 90) + 'px';
  }

  // ---------- Canvas mode: free card dragging with snap-to-grid ----------
  // In canvas mode cards are absolutely positioned; their (col, row) grid coordinates live in layout.cards[id].
  // Cell size is derived from the #grid container width, matching the CSS repeat(auto-fill, minmax(118px, 1fr)).
  const CARD_MIN_W = 118;
  const CARD_GAP = 13;
  const CARD_GRID_PADDING = 0; // #grid itself has no padding

  function getCardLayout() {
    const l = getLayout();
    return (l && l.cards && typeof l.cards === 'object') ? l.cards : {};
  }
  function setCardLayoutMap(map) {
    const l = getLayout();
    if (!l) return;
    l.cards = map;
  }

  // Max column count the grid can hold, matching CSS auto-fill: floor((W + gap) / (minW + gap)).
  function getCardCols(gridW) {
    return Math.max(1, Math.floor((gridW + CARD_GAP) / (CARD_MIN_W + CARD_GAP)));
  }
  // Single track width (under auto-fill, 1fr splits the remaining space evenly) - matches the real CSS column width.
  function getCardTrackW(gridW) {
    const cols = getCardCols(gridW);
    return (gridW - (cols - 1) * CARD_GAP) / cols;
  }

  // Cell size: column width is derived from the container width, because once cards are absolutely positioned
  // they shrink to their content width and offsetWidth is useless. Row height comes from the first card (height is content-driven, unaffected by positioning).
  function getCardCellSize() {
    const grid = document.getElementById('grid');
    if (!grid) return null;
    const gridW = grid.clientWidth;
    if (!gridW) return null;
    const first = grid.querySelector('.card');
    const cardH = first ? first.offsetHeight : 0;
    if (!cardH) return null;
    const cardW = getCardTrackW(gridW);
    return { cardW, cardH, stepX: cardW + CARD_GAP, stepY: cardH + CARD_GAP };
  }

  // Map each visible card's visual row/column inside #grid back to (col, row) and persist it.
  function captureCardLayout() {
    const grid = document.getElementById('grid');
    if (!grid) return {};
    const cell = getCardCellSize();
    if (!cell) return {};
    const visible = Array.from(grid.querySelectorAll('.card'));
    if (!visible.length) return {};
    const gridRect = grid.getBoundingClientRect();
    const map = {};
    for (const c of visible) {
      const r = c.getBoundingClientRect();
      const col = Math.max(0, Math.round((r.left - gridRect.left) / cell.stepX));
      const row = Math.max(0, Math.round((r.top - gridRect.top) / cell.stepY));
      map[c.dataset.id] = { col, row };
    }
    return map;
  }

  // On first canvas entry, or when some cards lack coordinates, assign (col, row) in visible order.
  function assignInitialCardLayout() {
    const grid = document.getElementById('grid');
    if (!grid) return {};
    const cell = getCardCellSize();
    if (!cell) return {};
    const visible = Array.from(grid.querySelectorAll('.card'));
    const cols = getCardCols(grid.clientWidth);
    const map = getCardLayout();
    // Garbage-collect coordinates whose card is gone. Without this their cells stay marked occupied
    // forever, so freshly added cards get pushed into later rows and the grid looks scrambled
    // (a short first row above a full one). Keyed on the whole state.items set rather than the
    // currently rendered subset, so switching groups never discards a coordinate.
    const alive = new Set((A().state.items || []).map((it) => it.id));
    let pruned = 0;
    for (const id in map) if (!alive.has(id)) { delete map[id]; pruned++; }
    // map is the live layout.cards object, so persist once when something was actually dropped -
    // otherwise every deleted shortcut would leave a coordinate behind on disk forever.
    if (pruned) { setCardLayoutMap(map); A().Store.set(A().K.settings, A().state.settings); }
    // Existing coordinates are marked occupied; missing ones take the first free cell, scanning column by column then row by row.
    const occupied = new Set();
    for (const id in map) {
      const p = map[id];
      if (p && typeof p.col === 'number' && typeof p.row === 'number') {
        occupied.add(p.col + ',' + p.row);
      }
    }
    function nextFree(fromCol, fromRow) {
      let col = fromCol, row = fromRow;
      while (occupied.has(col + ',' + row)) {
        col++;
        if (col >= cols) { col = 0; row++; }
      }
      return { col, row };
    }
    let cur = { col: 0, row: 0 };
    for (const c of visible) {
      const id = c.dataset.id;
      if (map[id] && typeof map[id].col === 'number' && typeof map[id].row === 'number') continue;
      cur = nextFree(cur.col, cur.row);
      map[id] = { col: cur.col, row: cur.row };
      occupied.add(cur.col + ',' + cur.row);
    }
    return map;
  }

  // Apply layout.cards to the DOM (only for cards visible in canvas mode).
  function applyCardCanvas() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const cell = getCardCellSize();
    if (!cell) return;
    const map = assignInitialCardLayout();
    setCardLayoutMap(map);
    for (const c of grid.querySelectorAll('.card')) {
      const id = c.dataset.id;
      const p = map[id];
      if (!p) continue;
      c.style.width = cell.cardW + 'px';
      c.style.left = (p.col * cell.stepX) + 'px';
      c.style.top = (p.row * cell.stepY) + 'px';
      // Disable HTML5 drag in canvas mode: it fights pointer dragging and could open the link via the address bar.
      c.setAttribute('draggable', 'false');
    }
    injectCardDragHandles();
    refreshCanvasHeight();
  }

  function clearCardCanvas() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    for (const c of grid.querySelectorAll('.card')) {
      c.style.left = '';
      c.style.top = '';
      c.style.width = '';
      // Restore what applyCardCanvas changed: flow mode uses HTML5 drag-to-reorder,
      // and the canvas-only drag handle is unstyled (and useless) outside it.
      c.setAttribute('draggable', 'true');
      const h = c.querySelector('.card-drag-handle');
      if (h) h.remove();
    }
  }

  // Inject a small drag handle into canvas-mode cards (top-left, revealed on hover).
  function injectCardDragHandles() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    for (const c of grid.querySelectorAll('.card')) {
      if (c.querySelector('.card-drag-handle')) continue;
      const h = document.createElement('span');
      h.className = 'card-drag-handle';
      h.title = A().t('drag.card');
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
      c.appendChild(h);
    }
  }

  // Canvas mode: pointer-drag a card, snap it to the nearest cell, and swap with whatever card already sits there.
  function bindCardCanvasDrag() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    let active = null;
    let dragMoved = false; // whether this press turned into a drag (used to suppress the follow-up click)

    function onPointerDown(e) {
      if (!canvasEligible() || e.button !== 0) return;
      const card = e.target.closest('.card');
      if (!card) return;
      // Only the edit/delete buttons opt out of dragging; icon, title and blank space are all draggable - a movement threshold separates click from drag.
      if (e.target.closest('.card-actions')) return;
      const rr = grid.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      dragMoved = false;
      active = {
        card,
        id: card.dataset.id,
        baseX: r.left - rr.left,
        baseY: r.top - rr.top,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId
      };
      // Do not preventDefault yet, so a plain click can still open the link.
    }

    function onPointerMove(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      if (!active.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        active.moved = true;
        dragMoved = true;
        active.card.classList.add('card-dragging');
        try { active.card.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
      } else {
        e.preventDefault();
      }
      const rr = grid.getBoundingClientRect();
      let nx = Math.round(active.baseX + dx);
      let ny = Math.round(active.baseY + dy);
      nx = Math.max(0, nx);
      ny = Math.max(0, ny);
      active.card.style.left = nx + 'px';
      active.card.style.top = ny + 'px';
    }

    function onPointerUp(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const { card, id, moved } = active;
      active = null;
      card.classList.remove('card-dragging');
      try { card.releasePointerCapture(e.pointerId); } catch {}
      if (!moved) { dragMoved = false; return; }
      e.preventDefault();

      const cell = getCardCellSize();
      if (!cell) return;
      const r = card.getBoundingClientRect();
      const rr = grid.getBoundingClientRect();
      let col = Math.max(0, Math.round((r.left - rr.left) / cell.stepX));
      let row = Math.max(0, Math.round((r.top - rr.top) / cell.stepY));
      // Swap with whatever card occupies the target cell, so neither ends up overlapping.
      const map = getCardLayout();
      let swapId = null;
      for (const otherId in map) {
        if (otherId === id) continue;
        const p = map[otherId];
        if (p && p.col === col && p.row === row) { swapId = otherId; break; }
      }
      if (swapId) {
        map[swapId] = map[id] || { col: 0, row: 0 };
      }
      map[id] = { col, row };
      setCardLayoutMap(map);
      const lay = getLayout();
      if (lay) lay.auto = false; // hand-arranged icon grid: stop auto re-deriving it
      // Re-apply positions for every visible card, including the swapped one.
      applyCardCanvas();
      A().Store.set(A().K.settings, A().state.settings);
    }

    // Suppress the click that follows a drag, otherwise finishing a drag would open the link.
    function onClickCapture(e) {
      if (!dragMoved) return;
      if (!e.target.closest('.card')) return;
      e.preventDefault();
      e.stopPropagation();
      dragMoved = false;
    }

    grid.addEventListener('pointerdown', onPointerDown);
    grid.addEventListener('pointermove', onPointerMove);
    grid.addEventListener('pointerup', onPointerUp);
    grid.addEventListener('pointercancel', onPointerUp);
    grid.addEventListener('click', onClickCapture, true);
  }

  function injectDragHandles() {
    for (const b of blockEls()) {
      if (b.el.querySelector('.drag-handle')) continue;
      const h = document.createElement('span');
      h.className = 'drag-handle';
      h.title = A().t('drag.block');
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
      b.el.appendChild(h);
    }
  }

  function bindBlockDrag() {
    const root = canvasRoot();
    if (!root) return;
    let active = null;

    function onPointerDown(e) {
      if (!canvasEligible() || e.button !== 0) return;
      const handle = e.target.closest('.drag-handle');
      const block = blockEls().find(b => b.el === e.target.closest('.widget, #search, #grid-wrap'));
      if (!block) return;
      // Outside the handle: only blank areas start a drag (interactive elements keep normal click behaviour).
      if (!handle && e.target.closest(DRAG_INTERACTIVE)) return;
      e.preventDefault();
      const rr = root.getBoundingClientRect();
      const r = block.el.getBoundingClientRect();
      active = {
        block,
        baseX: r.left - rr.left,
        baseY: r.top - rr.top,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId
      };
      block.el.classList.add('block-dragging');
      try { block.el.setPointerCapture(e.pointerId); } catch {}
    }

    function onPointerMove(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const dx = e.clientX - active.startX;
      const dy = e.clientY - active.startY;
      if (!active.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      active.moved = true;
      const rootW = root.clientWidth;
      const w = active.block.el.offsetWidth;
      let nx = Math.round(active.baseX + dx);
      let ny = Math.round(active.baseY + dy);
      nx = Math.max(0, Math.min(nx, rootW - w));
      ny = Math.max(0, ny);
      active.block.el.style.left = nx + 'px';
      active.block.el.style.top = ny + 'px';
    }

    function onPointerUp(e) {
      if (!active || e.pointerId !== active.pointerId) return;
      const { block, moved } = active;
      active = null;
      block.el.classList.remove('block-dragging');
      try { block.el.releasePointerCapture(e.pointerId); } catch {}
      if (!moved) return; // below the threshold: treat as a click and do not persist coordinates
      const l = getLayout();
      if (!l) return;
      const rr = root.getBoundingClientRect();
      const r = block.el.getBoundingClientRect();
      l[block.key] = {
        x: Math.round(r.left - rr.left),
        y: Math.round(r.top - rr.top),
        w: Math.round(r.width)
      };
      l.auto = false; // hand-placed from now on: never silently re-derive these coordinates
      A().Store.set(A().K.settings, A().state.settings);
      refreshCanvasHeight();
    }

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
  }

  // True when the frozen canvas coordinates still describe a page whose left column looked different.
  // Only auto layouts are considered — a hand-dragged arrangement is never second-guessed.
  // The signal is exact rather than geometric: recaptureBlocksFromFlow drops the key of every hidden
  // block, so a leftover key for a removed widget means these coordinates predate the removal.
  // (Don't compare x against a constant — coordinates are relative to .layout's border box, so the
  // left-most block legitimately sits at the container's 40px padding.)
  function widgetLayoutStale() {
    const l = getLayout();
    if (!l || l.auto === false) return false;
    const st = A().state.settings;
    const vis = A().normalizeWidgets(st && st.widgets);
    if (A().WIDGETS.some((id) => !vis[id] && l[id])) return true;
    // A visible widget with no coordinates at all (e.g. wmovie on a layout frozen before the
    // movie widget existed) would park at the origin over another block — re-derive.
    if (A().WIDGETS.some((id) => vis[id] && !l[id])) return true;
    // Placement has to agree with the frozen coordinates too. Lifted above the search box means the
    // widget shares the right column's left edge; parked in the left column means it starts further
    // left. Compare blocks against each other, never against a constant (coordinates are relative to
    // .layout's border box, so the left-most block legitimately sits at the container's 40px padding).
    const pos = A().normalizeWidgetPos(st && st.widgetPos);
    for (const id of A().WIDGETS) {
      if (!l[id] || !l.search) continue;
      const sharesRightColumn = Math.abs(l[id].x - l.search.x) <= 2;
      if ((pos[id] === 'top') !== sharesRightColumn) return true;
    }
    return false;
  }

  // Removing a left-column widget leaves a hole in the frozen canvas coordinates, so re-derive the
  // block positions from a fresh flow pass. Only ever applied to an auto layout — once the user has
  // dragged a block or a card the arrangement is theirs and we leave it exactly as they left it.
  function recaptureBlocksFromFlow() {
    const root = canvasRoot();
    if (!root || !root.classList.contains('canvas')) return; // flow layout reflows on its own
    const l = getLayout();
    if (!l || l.auto === false) return;
    leaveCanvas(); // drop absolute positioning so the browser reflows around the hidden widgets
    const rr = root.getBoundingClientRect();
    const next = {};
    for (const b of blockEls()) {
      const r = b.el.getBoundingClientRect();
      if (!r.width && !r.height) continue; // a removed widget contributes no coordinates
      next[b.key] = { x: Math.round(r.left - rr.left), y: Math.round(r.top - rr.top), w: Math.round(r.width) };
    }
    // Card coordinates are (col, row) against the grid's track width. A collapsed left column makes
    // the grid wider, which changes the track count — so the card map has to be re-derived too,
    // otherwise old column indices scatter the icons across the new width.
    next.cards = captureCardLayout();
    next.auto = true;
    A().state.settings.layout = next;
    A().Store.set(A().K.settings, A().state.settings);
    applyCanvas();
  }

  // Switch between flow and canvas based on window width and layout data (idempotent; reused after import/reset).
  function reinitCanvas() {    leaveCanvas();
    if (!canvasEligible()) return;
    if (getLayout()) applyCanvas();
    else { captureLayout(); applyCanvas(); }
  }

  // Blocks lifted above the search box stack vertically, but canvas coordinates are frozen at capture
  // time. If one of them changes height afterwards — the calendar's lunar labels arrive late, a month
  // needs six week rows instead of five, webfonts settle — the frozen y values stop stacking cleanly
  // and blocks overlap. Detect that geometrically (cheap, no guessing) and re-derive once.
  function topStackOverlaps() {
    const st = A().state.settings;
    const pos = A().normalizeWidgetPos(st && st.widgetPos);
    const order = A().WIDGETS.filter((id) => pos[id] === 'top');
    if (!order.length) return false;
    const els = blockEls();
    let prevBottom = -Infinity;
    for (const key of [...order, 'search', 'grid']) {
      const b = els.find((x) => x.key === key);
      if (!b || b.el.hidden) continue;
      const r = b.el.getBoundingClientRect();
      if (!r.height) continue;
      if (r.top < prevBottom - 0.5) return true;
      prevBottom = r.bottom;
    }
    return false;
  }
  let relayoutBusy = false;
  function relayoutTopStackIfNeeded() {
    if (relayoutBusy) return;
    const l = getLayout();
    if (!l || l.auto === false) return; // a hand-dragged arrangement is the user's business
    if (!topStackOverlaps()) return;
    relayoutBusy = true;
    try { recaptureBlocksFromFlow(); } finally {
      // Release on the next frame: the reflow we just caused must not re-enter this.
      requestAnimationFrame(() => { relayoutBusy = false; });
    }
  }

  function initCanvasLayout() {
    injectDragHandles();
    bindBlockDrag();
    bindCardCanvasDrag();

    if (window.ResizeObserver) {
      // Several observed targets can fire in the same frame; coalesce with rAF to avoid re-measuring repeatedly.
      let rafId = 0;
      const ro = new ResizeObserver(() => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => { rafId = 0; refreshCanvasHeight(); relayoutTopStackIfNeeded(); });
      });
      blockEls().forEach(b => ro.observe(b.el));
      const grid = document.getElementById('grid');
      if (grid) ro.observe(grid);
    }

    window.addEventListener('resize', () => {
      if (!canvasEligible()) { leaveCanvas(); return; }
      if (getLayout()) {
        if (!canvasRoot().classList.contains('canvas')) applyCanvas();
        else refreshCanvasHeight();
      }
    });

    reinitCanvas();
    // First paint can still land mid-render (calendar cells, fonts); settle the stack once.
    requestAnimationFrame(() => relayoutTopStackIfNeeded());
  }


  window.LT_CANVAS = {
    canvasRoot, canvasEligible, applyCardCanvas,
    reinitCanvas, initCanvasLayout, widgetLayoutStale, recaptureBlocksFromFlow,
    topStackOverlaps, relayoutTopStackIfNeeded
  };
})();

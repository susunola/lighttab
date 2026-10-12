'use strict';
const path = require('path');
const { test, expect } = require('playwright/test');
const NEWTAB = 'file://' + path.join(__dirname, '..', '..', 'newtab.html');

async function seed(page, canvas = false) {
  await page.goto(NEWTAB);
  await page.evaluate(async canvas => {
    const a = window.LT_APP;
    a.state.settings.widgetPos.wmovie = canvas ? 'top' : 'left';
    a.state.settings.widgets.wmovie = true;
    delete a.state.settings.layout;
    await a.Store.set(a.K.settings, a.state.settings);
    await a.Store.set(a.K.items, ['a', 'b', 'c', 'd'].map(id => ({ id, title: id.toUpperCase(), url: `https://${id}.example.com/`, group: '' })));
  }, canvas);
  await page.reload();
  await expect(page.locator('#grid .card:not(.card-add)')).toHaveCount(4);
  await expect(page.locator('.layout')).toHaveClass(canvas ? /canvas/ : /movie-grid/);
}
async function beginDrag(page, source, target, fraction) {
  const from = await page.locator(`#grid .card[data-id="${source}"]`).boundingBox();
  const to = await page.locator(`#grid .card[data-id="${target}"]`).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await page.mouse.move(to.x + to.width * fraction, to.y + to.height / 2, { steps: 12 });
  // Chromium starts native drag at the first move; a second move delivers dragover at the destination.
  await page.mouse.move(to.x + to.width * fraction + 1, to.y + to.height / 2);
  return to;
}
async function order(page) { return page.evaluate(() => window.LT_APP.state.items.map(it => it.id)); }

for (const canvas of [false, true]) {
  for (const before of [true, false]) {
    test(`${canvas ? 'canvas' : 'flow'} inserts ${before ? 'before' : 'after'} even after a long edge hover`, async ({ page }) => {
      await seed(page, canvas);
      await beginDrag(page, 'd', 'b', before ? .12 : .88);
      const target = page.locator('#grid .card[data-id="b"]');
      await expect(target).toHaveClass(before ? /drag-before/ : /drag-after/);
      await page.waitForTimeout(700);
      await expect(target).not.toHaveClass(/drag-merge/);
      await page.mouse.up();
      const expected = before ? ['a', 'd', 'b', 'c'] : ['a', 'b', 'd', 'c'];
      await expect.poll(() => order(page)).toEqual(expected);
      await expect(page.locator('.drag-before, .drag-after')).toHaveCount(0);
      await page.reload();
      expect(await order(page)).toEqual(expected);
      if (canvas) {
        const spatial = await page.locator('#grid .card:not(.card-add)').evaluateAll(cards => cards
          .map(c => ({ id: c.dataset.id, r: c.getBoundingClientRect() }))
          .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left).map(c => c.id));
        expect(spatial).toEqual(expected);
      }
    });
  }
}

test('moving from an armed center to an edge cancels the folder merge', async ({ page }) => {
  await seed(page);
  const r = await beginDrag(page, 'd', 'b', .5);
  const target = page.locator('#grid .card[data-id="b"]');
  await expect(target).toHaveClass(/drag-merge/);
  await page.mouse.move(r.x + r.width * .12, r.y + r.height / 2, { steps: 3 });
  await expect(target).toHaveClass(/drag-before/);
  await expect(target).not.toHaveClass(/drag-merge/);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['a', 'd', 'b', 'c']);
});

test('holding in the center still creates a folder', async ({ page }) => {
  await seed(page);
  await beginDrag(page, 'd', 'b', .5);
  await expect(page.locator('#grid .card[data-id="b"]')).toHaveClass(/drag-merge/);
  await page.mouse.up();
  await expect(page.locator('#grid .card-folder')).toHaveCount(1);
  expect(await page.evaluate(() => window.LT_APP.state.items.find(it => it.type === 'folder').children.map(it => it.id))).toEqual(['b', 'd']);
});

test('the gap before a card is an insertion target', async ({ page }) => {
  await seed(page);
  const r = await beginDrag(page, 'd', 'b', .12);
  await page.mouse.move(r.x - 6, r.y + r.height / 2, { steps: 3 });
  await expect(page.locator('#grid .card[data-id="b"]')).toHaveClass(/drag-before/);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['a', 'd', 'b', 'c']);
});

test('moving forward inserts after the target rather than swapping', async ({ page }) => {
  await seed(page);
  await beginDrag(page, 'a', 'c', .88);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['b', 'c', 'a', 'd']);
});

test('escaping a drag removes the insertion line and preserves order', async ({ page }) => {
  await seed(page);
  await beginDrag(page, 'd', 'b', .12);
  await expect(page.locator('.drag-before')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-before, .drag-after, .drag-merge')).toHaveCount(0);
  expect(await order(page)).toEqual(['a', 'b', 'c', 'd']);
});

test('canvas insertion preserves order and avoids overlap with larger tiles', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const a = window.LT_APP;
    a.state.items.find(it => it.id === 'b').tileSize = '2x2';
    await a.Store.set(a.K.items, a.state.items);
  });
  await page.reload();
  await beginDrag(page, 'd', 'b', .12);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['a', 'd', 'b', 'c']);
  await page.reload();
  const layout = await page.locator('#grid .card:not(.card-add)').evaluateAll(cards => {
    const rects = cards.map(c => ({ id: c.dataset.id, r: c.getBoundingClientRect() }));
    let overlaps = false;
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r, b = rects[j].r;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps = true;
    }
    return { overlaps, ids: rects.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left).map(c => c.id) };
  });
  expect(layout).toEqual({ overlaps: false, ids: ['a', 'd', 'b', 'c'] });
});

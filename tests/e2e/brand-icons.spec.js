'use strict';
const path = require('path');
const { test, expect } = require('playwright/test');
const NEWTAB = 'file://' + path.join(__dirname, '..', '..', 'newtab.html');

test('wide built-in marks fit folder tiles, popup and shortcut preview', async ({ page }) => {
  await page.goto(NEWTAB);
  await page.evaluate(async () => {
    const a = window.LT_APP;
    await a.Store.set(a.K.items, [{ id: 'brands', type: 'folder', name: 'Brands', group: '',
      children: [{ id: 'tmall', title: 'Tmall', url: 'https://www.tmall.com/' },
        { id: 'disney', title: 'Disney+', url: 'https://www.disneyplus.com/' }] }]);
  });
  await page.reload();
  const minis = page.locator('.folder-mini.brand-vector-mark img');
  await expect(minis).toHaveCount(2);
  expect(await minis.first().evaluate(i => getComputedStyle(i).objectFit)).toBe('contain');
  await page.locator('#grid .card[data-id="brands"]').click();
  const popup = page.locator('.fcard-ico.brand-vector-mark img');
  await expect(popup).toHaveCount(2);
  expect(await popup.first().evaluate(i => getComputedStyle(i).objectFit)).toBe('contain');
  await page.keyboard.press('Escape');
  await page.locator('#grid .card-add').click();
  await page.locator('#f-url').fill('https://www.tmall.com/');
  const preview = page.locator('#f-icon-preview');
  await expect(preview).toHaveClass(/brand-vector-mark/);
  expect(await preview.locator('img').evaluate(i => getComputedStyle(i).objectFit)).toBe('contain');
  await page.locator('#f-url').fill('https://example.com/');
  await expect(preview).not.toHaveClass(/has-brand-icon|brand-vector-mark/);
});

test('Shimo vector has visible ink on its white tile', async ({ page }) => {
  await page.goto(NEWTAB);
  const pixels = await page.evaluate(async () => {
    const img = new Image();
    img.src = window.LT_PURE.iconFor('https://shimo.im/').img;
    await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = 176; canvas.height = 40;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, 176, 40);
    const data = ctx.getImageData(0, 0, 176, 40).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128 && Math.max(data[i], data[i + 1], data[i + 2]) < 180) ink++;
    }
    return ink;
  });
  expect(pixels).toBeGreaterThan(100);
});

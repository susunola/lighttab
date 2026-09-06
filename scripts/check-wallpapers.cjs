'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    await page.route(/^https?:/, route => route.abort());
    await page.goto(pathToFileURL(path.resolve(process.argv[2] || path.join(__dirname, '../newtab.html'))).href);
    await page.locator('#btn-wall').click();
    const count = await page.locator('.swatch:not([data-i="img"])').count();
    assert.equal(count, 7);
    for (let index = 0; index < count; index++) {
      const tile = page.locator(`.swatch[data-i="${index}"]`);
      const expected = await tile.evaluate(el => el.style.backgroundImage);
      await tile.click();
      await page.waitForFunction(index => document.querySelector(`.swatch[data-i="${index}"]`)?.classList.contains('active'), index);
      assert.equal(await page.locator('#wallpaper').evaluate(el => el.style.backgroundImage), expected, `Wallpaper ${index} applies the selected image/gradient`);
      if (expected.startsWith('url(')) {
        const loaded = await page.evaluate(async value => {
          const img = new Image();
          img.src = value.slice(4, -1).replace(/^"|"$/g, '');
          try { await img.decode(); return img.naturalWidth > 0; } catch { return false; }
        }, expected);
        assert(loaded, `Wallpaper ${index} image decodes`);
      }
    }
    await page.locator('.swatch[data-i="0"]').click();
    await page.waitForFunction(() => document.querySelector('.swatch[data-i="0"]')?.classList.contains('active'));
    const expected = await page.locator('#wallpaper').evaluate(el => el.style.backgroundImage);
    await page.reload();
    await page.locator('#btn-wall').click();
    await page.waitForFunction(() => document.querySelector('.swatch[data-i="0"]')?.classList.contains('active'));
    assert.equal(await page.locator('#wallpaper').evaluate(el => el.style.backgroundImage), expected, 'Image choice persists after reload');
    console.log('PASS: all 7 presets switch; factory image decodes; factory choice persists after reload.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

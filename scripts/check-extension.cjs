#!/usr/bin/env node
'use strict';

// Install Playwright separately: npm install --no-save playwright
// Then: npx playwright install chromium && node scripts/check-extension.cjs
// Real MV3 installation, isolated profile, no live external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

(async () => {
  const root = fs.realpathSync(process.argv[2] || path.join(__dirname, '..'));
  const id = crypto.createHash('sha256').update(root).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, c => String.fromCharCode(97 + parseInt(c, 16)));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lighttab-extension-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    context.setDefaultTimeout(15000);
    console.log('Chromium started; loading extension', id);
    const requests = [];
    await context.route(/^https?:/, route => {
      requests.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' && message.text().includes('[LightTab]')) console.error(message.text()); });
    await page.goto(`chrome-extension://${id}/newtab.html`);
    console.log('Extension page loaded');
    await page.locator('#clock-hhmm').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('#grid .card').length > 1);
    assert.equal(await page.evaluate(() => chrome.runtime.getManifest().manifest_version), 3);
    assert.deepEqual(errors, [], 'Extension boot should not throw');
    // Wait for boot work, including the loopback desktop-app probe.
    await page.waitForTimeout(1500);
    const external = requests.filter(url => !url.startsWith('http://127.0.0.1:'));
    assert(external.every(url => /^https:\/\/(movie\.douban\.com\/j\/search_subjects|img\d*\.doubanio\.com\/)/.test(url)), 'Fresh boot only contacts the default movie provider');
    // Deterministic provider response: ensure strict CSP still allows fetch-based suggestions.
    await context.route('https://suggestqueries.google.com/**', route => {
      const url = new URL(route.request().url());
      const callback = url.searchParams.get('jsonp');
      return route.fulfill({ contentType: 'application/javascript',
        body: `${callback}(${JSON.stringify(['release readiness', ['release readiness checklist']])})` });
    });
    await page.locator('#q').fill('release readiness');
    await page.waitForFunction(() => document.querySelector('#suggest-list')?.textContent.includes('release readiness checklist'));
    await page.locator('#q').fill('');
    await page.locator('#btn-wall').click();
    await page.waitForFunction(() => !document.querySelector('#modal-set').hidden);
    // Request interception records attempted access even when the service is offline.
    await page.waitForTimeout(200);
    assert(requests.some(url => url.includes('/v1/wallpapers/sources')), 'Opening wallpaper settings discovers sources');
    await page.keyboard.press('Escape');
    await page.evaluate(async()=>{const a=window.LT_APP;a.state.settings.widgets.wtodo=true;await a.Store.set(a.K.settings,a.state.settings);});
    await page.reload();
    await page.locator('#todo-input').fill('Extension persistence check');
    await page.locator('#todo-form button[type="submit"]').click();
    await page.waitForFunction(async () => JSON.stringify(await chrome.storage.local.get('lt.todos')).includes('Extension persistence check'));
    await page.waitForFunction(() => document.querySelector('#todo-list')?.textContent.includes('Extension persistence check'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#todo-list')?.textContent.includes('Extension persistence check'));
    assert.deepEqual(errors, [], 'Reload should not throw');
    // Add-shortcut dialog: the Name follows whatever URL is typed, but never at the expense of a
    // name the user picked — and editing a saved shortcut leaves its stored name alone.
    await page.locator('.card-add').click();
    await page.waitForFunction(() => !document.querySelector('#modal-site').hidden);
    // The modal focuses the Name field on a 30ms timer. That timer used to fire unconditionally, so
    // reaching the URL field inside that window and typing put the text into the Name field instead
    // (truncated by its maxlength) — a rare input-stealing bug for a user, and a flaky failure for
    // the assertions just below. Reaching a field must be enough to keep it.
    await page.locator('#f-url').focus();
    await page.waitForTimeout(150); // let the focus timer fire
    assert.equal(await page.evaluate(() => document.activeElement.id), 'f-url',
      'the modal never steals focus back from the field the user already reached');
    await page.locator('#f-url').fill('https://fast.com/zh/cn/');
    assert.equal(await page.locator('#f-title').inputValue(), 'Fast', 'typing a URL derives the Name from its host');
    await page.locator('#f-title').fill('My Fast');
    await page.locator('#f-url').fill('https://example.org/x');
    assert.equal(await page.locator('#f-title').inputValue(), 'My Fast', 'a hand-typed Name survives later URL edits');
    await page.locator('#f-title').fill(''); // emptying the Name re-arms the auto-fill
    await page.locator('#f-url').fill('https://www.tencentcloud.com/');
    assert.equal(await page.locator('#f-title').inputValue(), 'Tencentcloud', 'clearing the Name re-arms auto-fill (www is stripped)');
    // Save a shortcut under a URL no default card already owns, so no duplicate prompt appears.
    await page.locator('#f-title').fill('Auto Named');
    await page.locator('#f-url').fill('https://lt-autoname-check.test/');
    assert.equal(await page.locator('#f-title').inputValue(), 'Auto Named', 'a typed Name is kept when the URL changes afterwards');
    await page.locator('#site-form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#modal-site').hidden);
    // Editing that card and changing its URL must not rewrite the stored name.
    await page.locator('#grid .card:not(.card-add)', { hasText: 'Auto Named' }).first().focus();
    await page.keyboard.press('e');
    await page.waitForFunction(() => !document.querySelector('#modal-site').hidden);
    await page.locator('#f-url').fill('https://example.net/other');
    assert.equal(await page.locator('#f-title').inputValue(), 'Auto Named', 'editing never rewrites the stored Name');
    await page.locator('#modal-site .close-btn').click();
    await page.waitForFunction(() => document.querySelector('#modal-site').hidden);
    console.log('PASS: MV3 installed; only expected movie startup requests; fetch suggestions under strict CSP; deferred wallpaper discovery; chrome.storage persistence after reload.');

    // Exercise recovery through the real settings UI with a fully mocked cloud service.
    const cloud = { 'lt.items': { rev: 1, updatedAt: 1, payload: JSON.stringify([
      { id: 'cloud', title: '云端项目', url: 'https://example.com/cloud', group: '' }
    ]) } };
    let revision = 1;
    await context.route('https://lighttab.atomwangnus.com/**', route => {
      const req = route.request();
      let data;
      if (req.url().endsWith('/auth/login')) data = { token: 'mock-token', user: { email: 'demo@example.com', userId: 'demo' } };
      else if (req.method() === 'GET') data = { docs: cloud, serverTime: revision };
      else {
        data = { results: req.postDataJSON().ops.map(op => {
          if (op.baseRev !== (cloud[op.key]?.rev || 0)) return { key: op.key, conflict: true, serverDoc: cloud[op.key] };
          cloud[op.key] = { rev: ++revision, updatedAt: revision, payload: op.payload };
          return { key: op.key, newRev: revision };
        }), serverTime: revision };
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.evaluate(async () => {
      await window.LT_SYNC.writeLocal('lt.items', [{ id: 'local', title: '本机项目', url: 'https://example.com/local', group: '' }]);
    });
    await page.reload();
    await page.locator('#btn-set').click();
    await page.locator('.tab[data-tab="sync"]').click();
    await page.locator('#sync-email').fill('demo@example.com');
    await page.locator('#sync-pass').fill('mock-password');
    await page.locator('[data-sync="login"]').click();
    await page.locator('.sync-conflict').waitFor();
    assert.equal(await page.evaluate(() => window.LT_SYNC.getState().status), 'conflict');
    for (const detail of await page.locator('.sync-compare details').all()) await detail.locator('summary').click();
    assert((await page.locator('.sync-compare').textContent()).includes('本机项目'));
    assert((await page.locator('.sync-compare').textContent()).includes('云端项目'));
    assert(await page.locator('#sync-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Sync panel should not overflow horizontally');
    const screenshot = path.join(root, 'test-results', 'sync-review.png');
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
    const backupId = await page.evaluate(() => window.LT_SYNC.getState().backups.find(b => b.reason === 'before-login').id);
    const downloadPromise = page.waitForEvent('download');
    await page.locator(`[data-sync="export-backup"][data-id="${backupId}"]`).click();
    const download = await downloadPromise;
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.items[0].title, '本机项目');
    assert(!JSON.stringify(exported).includes('mock-token'));
    await page.locator('[data-sync="use-cloud"]').click();
    await page.waitForFunction(async () => (await chrome.storage.local.get('lt.items'))['lt.items'][0].title === '云端项目');
    page.once('dialog', dialog => dialog.accept());
    await page.locator(`[data-sync="restore-backup"][data-id="${backupId}"]`).click();
    await page.locator('#sync-email').waitFor();
    assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('lt.items'))['lt.items'][0].title), '本机项目');
    assert.equal(await page.evaluate(() => window.LT_SYNC.getState().loggedIn), false);
    assert.equal(JSON.parse(cloud['lt.items'].payload)[0].title, '云端项目');
    assert.deepEqual(errors, [], 'Sync review, export and recovery should not throw');
    console.log('PASS: real extension UI conflict preview, backup download without credentials, cloud choice and offline restoration.');

    // Free-canvas mode. Moving the movie card above the search box (instead of letting it integrate
    // into the icon grid) is what switches the layout engine, and it used to be unusable: three CSS
    // cascade accidents left the movie block in the flow, uncapped, pushing the icon grid below the
    // fold. Measure all three instead of trusting a screenshot, then drag the calendar — that is the
    // behaviour a user actually asked for.
    await page.evaluate(async () => {
      const a = window.LT_APP;
      a.state.settings.widgets.wmovie = true;
      a.state.settings.widgets.wcal = true;
      a.state.settings.widgetPos.wmovie = 'top';
      await a.Store.set(a.K.settings, a.state.settings);
    });
    await page.reload();
    await page.locator('.wcal .cal-grid').waitFor();
    await page.waitForTimeout(900);
    const geo = await page.evaluate(() => {
      const movie = document.querySelector('.wmovie');
      const card = movie.querySelector('.movie-card');
      const wrap = document.querySelector('#grid-wrap');
      const rect = el => el.getBoundingClientRect();
      return {
        canvas: document.querySelector('.layout').classList.contains('canvas'),
        moviePosition: getComputedStyle(movie).position,
        cardWidth: Math.round(rect(card).width),
        gridTop: Math.round(rect(wrap).top),
        viewportHeight: window.innerHeight
      };
    });
    assert(geo.canvas, 'the movie above the search box selects free-canvas mode');
    assert.equal(geo.moviePosition, 'absolute', 'in canvas mode the movie block leaves the flow');
    assert(geo.cardWidth <= 320, `the movie card stays capped in canvas mode (got ${geo.cardWidth}px)`);
    assert(geo.gridTop < geo.viewportHeight,
      `the movie block must not push the icon grid below the fold (grid top ${geo.gridTop} vs viewport ${geo.viewportHeight})`);
    const calBefore = await page.locator('.wcal').boundingBox();
    await page.mouse.move(calBefore.x + calBefore.width / 2, calBefore.y + 6);
    await page.waitForTimeout(200);
    const calHandle = await page.locator('.wcal .drag-handle').boundingBox();
    assert(calHandle, 'the calendar exposes a drag handle in canvas mode');
    await page.mouse.move(calHandle.x + calHandle.width / 2, calHandle.y + calHandle.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(calHandle.x + calHandle.width / 2 + i * 18, calHandle.y + calHandle.height / 2 + i * 8);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const calAfter = await page.locator('.wcal').boundingBox();
    assert(Math.abs(calAfter.x - calBefore.x) > 20 || Math.abs(calAfter.y - calBefore.y) > 20,
      'the calendar actually moves when dragged in free-canvas mode');
    // Grabbing the calendar by a day cell must work too — a month grid is almost entirely cells, so
    // a handle-only affordance leaves the calendar effectively undraggable while every other widget
    // can be dragged by its body. A click on that same cell has to keep opening the day popover:
    // that is why the cell press is not pointer-captured (capture retargets the click to the block)
    // and why the click is suppressed only after a real drag.
    await page.evaluate(() => {
      window.__calClicks = 0;
      document.getElementById('cal-grid').addEventListener('click', () => { window.__calClicks++; }, true);
    });
    const cellBox = await page.locator('.wcal .cal-grid .cal-cell').nth(12).boundingBox();
    const cellX = cellBox.x + cellBox.width / 2;
    const cellY = cellBox.y + cellBox.height / 2;
    const clickBefore = await page.locator('.wcal').boundingBox();
    await page.evaluate(() => { window.__calClicks = 0; });
    await page.mouse.move(cellX, cellY);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(200);
    const clickAfter = await page.locator('.wcal').boundingBox();
    assert.equal(await page.evaluate(() => window.__calClicks), 1, 'a plain click on a day cell still reaches the calendar');
    assert(Math.abs(clickAfter.x - clickBefore.x) < 2 && Math.abs(clickAfter.y - clickBefore.y) < 2,
      'a plain click on a day cell does not move the block');
    const cellDragBefore = await page.locator('.wcal').boundingBox();
    await page.evaluate(() => { window.__calClicks = 0; });
    await page.mouse.move(cellX, cellY);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(cellX + i * 14, cellY + i * 7);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(250);
    const cellDragAfter = await page.locator('.wcal').boundingBox();
    assert.equal(await page.evaluate(() => window.__calClicks), 0, 'the click that follows a drag is suppressed');
    assert(Math.abs(cellDragAfter.x - cellDragBefore.x) > 20 || Math.abs(cellDragAfter.y - cellDragBefore.y) > 20,
      'the calendar can be dragged by grabbing a day cell, not only by its handle');
    assert.deepEqual(errors, [], 'Canvas layout should not throw');
    console.log('PASS: free-canvas mode drags blocks; the movie card leaves the flow, stays capped, and keeps the icon grid on screen.');

    // Switching engines LIVE, through the Settings dropdown, with no reload. That transition is what
    // enables the canvas, and it used to be a dead end: applyWidgets called recaptureBlocksFromFlow(),
    // whose first guard bailed whenever `.canvas` was absent — precisely the state this switch starts
    // from. The page then sat in neither engine: canvasEligible() true, so a block accepted the press
    // and followed the pointer through inline left/top, while nothing was absolutely positioned, no
    // coordinates were captured, and `.drag-handle` stayed at opacity 0. The block drifted and lost
    // its place on the very screen the setting was changed on, until a reload. Boot never showed it
    // because reinitCanvas()/captureLayout() have no such guard — so this section has to drive the
    // dropdown itself instead of writing storage and reloading, which is exactly how the bug got
    // through the two sections above.
    await page.evaluate(async () => {
      const a = window.LT_APP;
      a.state.settings.widgets.wcal = true;
      a.state.settings.widgetPos.wmovie = 'left';
      await a.Store.set(a.K.settings, a.state.settings);
    });
    await page.reload();
    await page.locator('.wcal .cal-grid').waitFor();
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => document.querySelector('.layout').className), 'layout movie-grid',
      'the shipped default keeps the movie card inside the icon grid');
    // A refused drag has to say why rather than do nothing.
    const hintCell = await page.locator('.wcal .cal-grid .cal-cell').nth(12).boundingBox();
    const hintX = hintCell.x + hintCell.width / 2, hintY = hintCell.y + hintCell.height / 2;
    await page.mouse.move(hintX, hintY);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(hintX + i * 7, hintY + i * 4); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(250);
    const hint = await page.evaluate(() => {
      const b = document.getElementById('toast');
      return { hidden: b.hidden, text: b.textContent, action: !!b.querySelector('button') };
    });
    assert(!hint.hidden, 'a drag attempt in the icon-grid layout is not silent');
    assert(/自由画布|free canvas/i.test(hint.text), `the hint names the free canvas (showed "${hint.text}")`);
    assert(hint.action, 'the hint carries the one-click remedy');

    // The remedy it offers must actually engage the canvas, and the drag must then persist.
    await page.locator('#toast button').click();
    await page.waitForTimeout(700);
    const fixed = await page.evaluate(() => ({
      cls: document.querySelector('.layout').className,
      captured: !!window.LT_APP.state.settings.layout
    }));
    assert(fixed.cls.includes('canvas'), `the one-click fix engages the canvas (class "${fixed.cls}")`);
    assert(fixed.captured, 'the one-click fix captures block coordinates');
    const fixBefore = await page.locator('.wcal').boundingBox();
    const fixCell = await page.locator('.wcal .cal-grid .cal-cell').nth(12).boundingBox();
    const fx = fixCell.x + fixCell.width / 2, fy = fixCell.y + fixCell.height / 2;
    await page.mouse.move(fx, fy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(fx + i * 14, fy + i * 7); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const fixAfter = await page.locator('.wcal').boundingBox();
    assert(Math.abs(fixAfter.x - fixBefore.x) > 20 || Math.abs(fixAfter.y - fixBefore.y) > 20,
      'after the one-click fix the calendar really moves');

    // Back into the icon grid: the canvas has to let go of its absolute positioning.
    await page.evaluate(() => { document.getElementById('f-pos-wmovie').value = 'left'; });
    await page.locator('#f-pos-wmovie').dispatchEvent('change');
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => document.querySelector('.layout').className), 'layout movie-grid',
      'moving the movie card back into the icon grid releases the canvas');

    // The regression itself: forward again through the dropdown, no reload.
    await page.evaluate(() => { document.getElementById('f-pos-wmovie').value = 'top'; });
    await page.locator('#f-pos-wmovie').dispatchEvent('change');
    await page.waitForTimeout(700);
    const live = await page.evaluate(() => ({
      cls: document.querySelector('.layout').className,
      captured: !!window.LT_APP.state.settings.layout,
      calPosition: getComputedStyle(document.querySelector('.wcal')).position
    }));
    assert(live.cls.includes('canvas'),
      `the dropdown must engage the canvas without a reload (layout class was "${live.cls}")`);
    assert(live.captured, 'the live switch captures block coordinates');
    assert.equal(live.calPosition, 'absolute', 'the canvas positions the calendar after the live switch');
    const liveBefore = await page.locator('.wcal').boundingBox();
    const liveCell = await page.locator('.wcal .cal-grid .cal-cell').nth(12).boundingBox();
    const lx = liveCell.x + liveCell.width / 2, ly = liveCell.y + liveCell.height / 2;
    await page.mouse.move(lx, ly);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(lx + i * 15, ly + i * 8); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(300);
    const liveAfter = await page.locator('.wcal').boundingBox();
    assert(Math.abs(liveAfter.x - liveBefore.x) > 20 || Math.abs(liveAfter.y - liveBefore.y) > 20,
      'the calendar moves right after the live switch, with no reload');
    assert(await page.evaluate(() => {
      const l = window.LT_APP.state.settings.layout;
      return !!(l && l.wcal);
    }), 'a drag that follows the live switch persists its coordinates');
    assert.deepEqual(errors, [], 'Switching layout engines live should not throw');
    console.log('PASS: the movie placement dropdown switches engines live, a refused drag explains itself, and the calendar drags and persists without a reload.');
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

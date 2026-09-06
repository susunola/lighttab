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
    assert.deepEqual(external, [], 'Fresh boot must not contact online services');
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
    await page.locator('#todo-input').fill('Extension persistence check');
    await page.locator('#todo-form button[type="submit"]').click();
    await page.waitForFunction(async () => JSON.stringify(await chrome.storage.local.get('lt.todos')).includes('Extension persistence check'));
    await page.waitForFunction(() => document.querySelector('#todo-list')?.textContent.includes('Extension persistence check'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#todo-list')?.textContent.includes('Extension persistence check'));
    assert.deepEqual(errors, [], 'Reload should not throw');
    console.log('PASS: MV3 installed; no external startup requests; fetch suggestions under strict CSP; deferred wallpaper discovery; chrome.storage persistence after reload.');

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
  } finally {
    if (context) await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

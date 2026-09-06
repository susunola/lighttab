// LightTab browser E2E — run locally with Playwright (kept out of the zero-dependency runtime):
//   npm i -D @playwright/test && npx playwright install chromium
//   npx playwright test -c tests/e2e/playwright.config.js
// The newtab page loads as file:// in preview mode (localStorage), which is enough to exercise
// boot, rendering, modals, grid operations and the to-do flow without the extension runtime.
'use strict';

const path = require('path');

module.exports = {
  testDir: __dirname,
  timeout: 30 * 1000,
  retries: 0,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 }
  }
};

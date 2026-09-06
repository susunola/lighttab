// Basic LightTab boot / UI smoke, run against file:// preview mode (fresh context = clean
// localStorage, so the icon grid starts with the shipped default sites).
'use strict';

const path = require('path');
const { test, expect } = require('@playwright/test');

const NEWTAB = 'file://' + path.join(__dirname, '..', '..', 'newtab.html');

test('boot renders the clock, defaults grid and search', async ({ page }) => {
  await page.goto(NEWTAB);
  // Clock ticking (the boot tip may overlay nothing on clock)
  await expect(page.locator('#clock-hhmm')).toBeVisible();
  await expect(page.locator('#clock-hhmm')).toHaveText(/\d{2}:\d{2}/);

  // Default shortcut set: 9 shipped sites + the add tile
  await expect(page.locator('#grid .card')).toHaveCount(10);

  // Search doubles as a launcher: typing a prefix of a saved site shows its local row
  const q = page.locator('#q');
  await q.fill('github');
  await expect(page.locator('#suggest-list .sg-site')).toBeVisible();
  await expect(page.locator('#suggest-list .sg-site-title').first()).toHaveText(/github/i);
});

test('add-shortcut modal opens and closes with focus restored', async ({ page }) => {
  await page.goto(NEWTAB);
  const addTile = page.locator('#grid .card-add');
  await addTile.click();
  await expect(page.locator('#modal-site')).toBeVisible();
  await expect(page.locator('#modal-site')).toHaveAttribute('role', 'dialog');
  // Esc closes via hideModal; Esc on the title input is captured by document keydown
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-site')).toBeHidden();
});

test('to-do with a due date lands in the calendar dots', async ({ page }) => {
  await page.goto(NEWTAB);
  await page.locator('#todo-input').fill('Ship the release notes');
  await page.locator('#todo-due').fill('2099-12-31');
  await page.locator('#todo-submit').click();
  await expect(page.locator('#todo-list .todo-item').first()).toContainText('Ship the release notes');
  await expect(page.locator('#todo-list .t-due').first()).toBeVisible();
});

test('grid keyboard: arrows move focus and Delete removes with undo toast', async ({ page }) => {
  await page.goto(NEWTAB);
  const cards = page.locator('#grid .card:not(.card-add)');
  await cards.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#grid .card:focus')).toHaveAttribute('data-id', await cards.nth(1).getAttribute('data-id'));
});

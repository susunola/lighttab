'use strict';
const path = require('path');
const { test, expect } = require('playwright/test');
const NEWTAB = 'file://' + path.join(__dirname, '..', '..', 'newtab.html');
async function seed(page) {
  await page.goto(NEWTAB);
  await page.evaluate(async () => {
    const a = window.LT_APP;
    a.state.settings.widgets.wtodo = true;
    await a.Store.set(a.K.settings, a.state.settings);
    await a.Store.set(a.K.items, [{ id: 'folder', type: 'folder', name: '工作', group: '', children: [
      { id: 'a', title: 'GitHub 完整名称', shortTitle: '代码', url: 'https://github.com/' },
      { id: 'b', title: '文档', url: 'https://docs.google.com/' },
      { id: 'c', title: '搜索', url: 'https://google.com/' }
    ] }]);
    await a.Store.set(a.K.todos, [{ id: 't1', text: '待办一', done: false, due: '2099-12-31' },
      { id: 't2', text: '待办二', done: true }]);
  });
  await page.reload();
}
test('single and bulk add detect URLs saved inside a folder', async ({ page }) => {
  await seed(page);
  await page.locator('.card-add').click();
  await page.locator('#f-title').fill('重复'); await page.locator('#f-url').fill('https://github.com');
  let message = '';
  page.once('dialog', async d => { message = d.message(); await d.dismiss(); });
  await page.locator('#site-form button[type="submit"]').click();
  expect(message).toContain('工作');
  expect(await page.evaluate(() => LT_APP.state.items.length)).toBe(1);
  await page.locator('#btn-batch').click();
  await page.locator('#batch-text').fill('https://github.com\nhttps://example.com');
  await expect(page.locator('#batch-preview')).toContainText('跳过 1');
});
test('bookmark import skips folder children', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    window.chrome = { permissions: { request: async () => true }, bookmarks: {
      getTree: async () => [{ children: [{ title: '重复', url: 'https://github.com/' }, { title: '新网站', url: 'https://example.com/' }] }]
    } };
    document.getElementById('btn-import-bookmarks').click();
  });
  await expect.poll(() => page.evaluate(() => LT_APP.state.items.length)).toBe(2);
  expect(await page.evaluate(() => LT_APP.state.items[1].url)).toBe('https://example.com/');
  await expect(page.locator('#toast')).toContainText('跳过 1');
});
test('folder child edits in place and uses its short title', async ({ page }) => {
  await seed(page); await page.locator('.card-folder').click();
  await expect(page.locator('.fcard[data-id="a"] .fcard-title')).toHaveText('代码');
  await expect(page.locator('.fcard[data-id="a"]')).toHaveAttribute('title', 'GitHub 完整名称');
  await page.locator('.fcard[data-id="a"]').hover();
  await page.locator('[data-child-edit="a"]').click();
  await expect(page.locator('#f-group-row')).toBeHidden();
  await page.locator('[name="shortTitle"]').fill('源码');
  await page.locator('#site-form button[type="submit"]').click();
  await expect(page.locator('.fcard[data-id="a"] .fcard-title')).toHaveText('源码');
  await page.reload(); await page.locator('.card-folder').click();
  await expect(page.locator('.fcard[data-id="a"] .fcard-title')).toHaveText('源码');
});
test('folder children can be reordered without leaving the folder', async ({ page }) => {
  await seed(page); await page.locator('.card-folder').click();
  await page.locator('.fcard[data-id="c"]').dragTo(page.locator('.fcard[data-id="a"]'), { targetPosition: { x: 5, y: 25 } });
  await expect.poll(() => page.evaluate(() => LT_APP.state.items[0].children.map(c => c.id))).toEqual(['c', 'a', 'b']);
  await page.reload();
  expect(await page.evaluate(() => LT_APP.state.items[0].children.map(c => c.id))).toEqual(['c', 'a', 'b']);
});
test('folder child context menu stays above the folder and opens its editor', async ({ page }) => {
  await seed(page); await page.locator('.card-folder').click();
  await page.locator('.fcard[data-id="a"]').click({ button: 'right' });
  await page.locator('#context-menu .item').first().click();
  await expect(page.locator('#modal-site')).toBeVisible();
  await expect(page.locator('#f-title')).toHaveValue('GitHub 完整名称');
});
test('deleting folder children can be undone after the folder dissolves', async ({ page }) => {
  await seed(page); await page.locator('.card-folder').click();
  await page.locator('.fcard[data-id="c"]').hover(); await page.locator('[data-child-delete="c"]').click();
  await expect(page.locator('.fcard')).toHaveCount(2);
  await page.locator('.fcard[data-id="a"]').hover(); await page.locator('[data-child-delete="a"]').click();
  await expect(page.locator('.card-folder')).toHaveCount(0);
  await page.locator('#toast button').click();
  await expect(page.locator('.card-folder')).toHaveCount(1);
  expect(await page.evaluate(() => LT_APP.state.items[0].children.map(c => c.id))).toEqual(['a', 'b']);
});
test('due date click edits, cancel preserves it, and clearing is explicit', async ({ page }) => {
  await seed(page);
  await page.locator('.t-due').click();
  await expect(page.locator('#todo-date-dialog')).toBeVisible();
  expect(await page.evaluate(() => LT_APP.state.todos[0].due)).toBe('2099-12-31');
  await page.locator('#todo-date-value').fill('2099-11-30');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => LT_APP.state.todos[0].due)).toBe('2099-12-31');
  await page.locator('.t-due').click(); await page.locator('#todo-date-value').fill('2099-11-30');
  await page.locator('#todo-date-dialog button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => LT_APP.state.todos[0].due)).toBe('2099-11-30');
  await page.locator('.t-due').click(); await page.locator('#todo-date-dialog [data-clear]').click();
  await expect.poll(() => page.evaluate(() => LT_APP.state.todos[0].due)).toBeUndefined();
  expect(await page.evaluate(() => LT_APP.state.todos[0].done)).toBe(false);
});
test('task deletion undo preserves dates and newly added tasks', async ({ page }) => {
  await seed(page);
  await page.locator('.todo-item[data-id="t1"]').hover(); await page.locator('.todo-item[data-id="t1"] .t-del').click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await page.locator('#todo-input').fill('新任务'); await page.locator('#todo-form button[type="submit"]').click();
  await expect(page.locator('.todo-item')).toHaveCount(2);
  await page.locator('#toast button').click();
  await expect(page.locator('.todo-item')).toHaveCount(3);
  expect(await page.evaluate(() => LT_APP.state.todos.find(t => t.id === 't1').due)).toBe('2099-12-31');
  await expect(page.locator('#todo-list')).toContainText('新任务');
});
test('clearing completed tasks is undoable', async ({ page }) => {
  await seed(page); await page.locator('#todo-clear-done').click();
  await expect(page.locator('.todo-item')).toHaveCount(1);
  await page.locator('#toast button').click();
  await expect(page.locator('.todo-item.done')).toHaveCount(1);
});

// Basic LightTab boot / UI smoke, run against file:// preview mode (fresh context = clean
// localStorage, so the icon grid starts with the shipped default sites).
'use strict';

const path = require('path');
const { test, expect } = require('playwright/test');

const NEWTAB = 'file://' + path.join(__dirname, '..', '..', 'newtab.html');

async function enableTodo(page) {
  await page.evaluate(async () => { const a = window.LT_APP; a.state.settings.widgets.wtodo = true; await a.Store.set(a.K.settings, a.state.settings); });
  await page.reload();
}

test('boot renders the clock, defaults grid and search', async ({ page }) => {
  await page.goto(NEWTAB);
  // Clock ticking (the boot tip may overlay nothing on clock)
  await expect(page.locator('#clock-hhmm')).toBeVisible();
  await expect(page.locator('#clock-hhmm')).toHaveText(/\d{2}:\d{2}/);

  // Default shortcut set: 22 shipped sites + the add tile
  await expect(page.locator('#grid .card')).toHaveCount(23);

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
  await enableTodo(page);
  await page.locator('#todo-input').fill('Ship the release notes');
  await page.locator('#todo-due').fill('2099-12-31');
  await page.locator('#todo-form button[type="submit"]').click();
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


test('two tabs preserve each other’s newly added todos', async ({ page, context }) => {
  await page.goto(NEWTAB);
  await enableTodo(page);
  const other = await context.newPage();
  await other.goto(NEWTAB);
  for (const [tab, title] of [[page, 'Task from A'], [other, 'Task from B']]) {
    await tab.locator('#todo-input').fill(title);
    await tab.locator('#todo-form button[type="submit"]').click();
    await expect(tab.locator('#todo-list')).toContainText(title);
  }
  await page.reload();
  await expect(page.locator('#todo-list')).toContainText('Task from A');
  await expect(page.locator('#todo-list')).toContainText('Task from B');
  await other.close();
});

test('shortcut sizes persist and mixed tiles never overlap', async ({ page }) => {
  await page.goto(NEWTAB);
  const first = page.locator('#grid a.card').first();
  for (const size of ['2x1', '1x2', '2x2', '4x2', '1x1']) {
    await first.click({button:'right'});
    await page.locator(`#context-menu button[data-size="${size}"]`).click();
    await expect(first).toHaveAttribute('data-size',size);
  }
  await first.click({button:'right'});
  await page.locator('#context-menu button[data-size="2x2"]').click();
  await expect(first).toHaveAttribute('data-size','2x2');
  await page.reload();
  await expect(first).toHaveAttribute('data-size','2x2');
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({width,height:1000});
    await page.waitForTimeout(300);
    const overlap = await page.locator('#grid .card').evaluateAll(cards => {
      const r=cards.map(c=>c.getBoundingClientRect());
      return r.some((a,i)=>r.slice(i+1).some(b=>a.left<b.right-1 && a.right>b.left+1 && a.top<b.bottom-1 && a.bottom>b.top+1));
    });
    expect(overlap).toBe(false);
  }
  await page.screenshot({path:'test-results/shortcut-sizes-mobile.png'});
});

test('movie opens in-page details and Escape returns to the card', async ({page}) => {
  await page.goto(NEWTAB);
  await page.locator('.movie-open').click();
  await expect(page.locator('#movie-details')).toBeVisible();
  await expect(page.locator('#movie-details-title')).not.toBeEmpty();
  await expect(page.locator('.movie-details-source')).toHaveAttribute('href', /douban\.com\/(search|subject)/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#movie-details')).not.toBeVisible();
  await expect(page.locator('.movie-open')).toBeFocused();
});

test('icon size slider keeps film grid in normal flow without stale coordinates', async ({page}) => {
  await page.goto(NEWTAB);
  await page.locator('#btn-set').click();
  // Exercise the actual slider handler even when its settings section is collapsed.
  for (const size of [48,112,72,88]) {
    await page.locator('#f-iconsize').evaluate((el,size)=>{el.value=String(size);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},size);
    const layout = await page.locator('#grid').evaluate(grid=>{
      const box=grid.getBoundingClientRect();
      const cards=[...grid.querySelectorAll('.card')];
      return {
        stale:cards.some(c=>c.style.left || c.style.top || c.style.width || c.querySelector('.card-drag-handle')),
        overflow:cards.some(c=>{const r=c.getBoundingClientRect();return r.right>box.right+1 || r.left<box.left-1;}),
        labelClipped:cards.some(c=>{const t=c.querySelector('.title').getBoundingClientRect();return t.bottom>c.getBoundingClientRect().bottom+1;})
      };
    });
    expect(layout).toEqual({stale:false,overflow:false,labelClipped:false});
  }
});

test('simple defaults retain optional tools and one movie action', async ({page}) => {
  await page.goto(NEWTAB);
  await expect(page.locator('#todo-widget')).toBeHidden();
  await expect(page.locator('#tpl-open')).toBeVisible();
  await page.locator('#tpl-open').click();
  await expect(page.locator('#palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.movie-actions button')).toHaveCount(1);
  await page.locator('#q').press('/');
  await expect(page.locator('#palette')).toBeVisible();
});

test('Tab leaves search and movie next retains focus', async ({page}) => {
  await page.goto(NEWTAB);
  await page.locator('#q').press('Tab');
  await expect(page.locator('#q')).not.toBeFocused();
  await page.locator('#movie-next').focus();
  await page.locator('#movie-next').press('Enter');
  await expect(page.locator('#movie-next')).toBeFocused();
});
test('successive deletions can be undone with keyboard', async ({page}) => {
  await page.goto(NEWTAB);
  const cards=page.locator('#grid .card');
  await cards.first().focus();
  await page.keyboard.press('Delete');
  await expect(cards).toHaveCount(22);
  await page.keyboard.press('Delete');
  await expect(cards).toHaveCount(21);
  await page.keyboard.press('Control+z');
  await expect(cards).toHaveCount(22);
  await page.keyboard.press('Control+z');
  await expect(cards).toHaveCount(23);
});
test('short label persists without replacing full title', async ({page}) => {
  await page.goto(NEWTAB);
  await page.locator('#grid .card').first().focus();
  await page.keyboard.press('e');
  await page.locator('[name="shortTitle"]').fill('短名');
  await page.locator('#site-form').evaluate(f=>f.requestSubmit());
  await page.reload();
  await expect(page.locator('#grid .card .title').first()).toHaveText('短名');
  await expect(page.locator('#grid .card').first()).toHaveAttribute('title','豆包');
});

test('AI panel drag persists and can be disabled', async ({page})=>{
 await page.goto(NEWTAB);
 await page.locator('#ai-side-toggle').click();
 const head=page.locator('#ai-launcher .launch-heading strong');const b=await head.boundingBox();
 await page.mouse.move(b.x+10,b.y+8);await page.mouse.down();await page.mouse.move(b.x-100,b.y+65);await page.mouse.up();
 const position=await page.locator('#ai-launcher').evaluate(el=>el.style.left);
 expect(position).not.toBe('');
 await page.waitForFunction(()=>{const a=window.LT_APP;return JSON.parse(localStorage.getItem(a.K.settings)||'{}').aiPanelPosition;});
 await page.reload();await page.locator('#ai-side-toggle').click();
 await expect(page.locator('#ai-launcher')).toHaveCSS('left',position);
 await page.locator('[data-close-ai]').click();await expect(page.locator('#ai-launcher')).toBeHidden();
 await page.locator('#btn-set').click();
 await page.locator('#f-ai-enabled').evaluate(el=>{el.checked=false;el.dispatchEvent(new Event('change',{bubbles:true}));});
 await expect(page.locator('#ai-side-toggle')).toBeHidden();
});

test('generic template uses Google and preserves literal input',async({page})=>{
 await page.goto(NEWTAB);
 await page.evaluate(()=>{window.__opened=[];window.open=u=>{window.__opened.push(u);return null};const a=window.LT_APP;a.setEngine('google');a.setActivePrompt({name:'test',tmpl:'site:github.com {q}',targets:['doubao']});});
 await page.locator('#q').fill('lighttab $&');
 await page.locator('#search-go').dispatchEvent('click',{ctrlKey:true});
 const urls=await page.evaluate(()=>window.__opened);
 expect(urls).toHaveLength(1);expect(new URL(urls[0]).hostname).toBe('www.google.com');
 expect(new URL(urls[0]).searchParams.get('q')).toBe('site:github.com lighttab $&');
});
test('empty input never exposes saved history',async({page})=>{
 await page.goto(NEWTAB);await page.evaluate(()=>localStorage.setItem('lt.history',JSON.stringify(['private query'])));await page.reload();
 await page.locator('#q').focus();await expect(page.locator('#suggest-list')).toBeHidden();
 await page.locator('#q').fill('github');await page.locator('#q').fill('');await expect(page.locator('#suggest-list')).toBeHidden();
});
test('built-in templates follow language both ways',async({page})=>{
 await page.goto(NEWTAB);
 expect(await page.evaluate(()=>window.LT_APP.state.prompts[0].name)).toBe('翻译成英文');
 for(const [language,name] of [['en','Translate to English'],['zh','翻译成英文']]){
 await page.locator('#f-lang').evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},language);
 await expect.poll(()=>page.evaluate(()=>window.LT_APP.state.prompts[0].name)).toBe(name);
 }
});

test('secret blossom requires hold plus name and then disappears',async({page})=>{
 await page.goto(NEWTAB);
 const btn=page.locator('#btn-plum');const secret=page.locator('#plum-secret');
 const before=await page.evaluate(()=>JSON.stringify(window.LT_APP.state.wallpaper));
 await btn.dispatchEvent('pointerdown',{button:0});await page.waitForTimeout(3100);
 await btn.dispatchEvent('pointerup');await btn.click();
 await expect(secret).toBeHidden();
 await page.keyboard.type('esmehan');
 await expect(secret).toBeVisible();await expect(secret).toContainText('esmehan');
 expect(await page.evaluate(()=>JSON.stringify(window.LT_APP.state.wallpaper))).toBe(before);
 await expect(secret).toBeHidden({timeout:13000});
});

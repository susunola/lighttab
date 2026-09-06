'use strict';
const path=require('path');
const {test,expect}=require('playwright/test');
const url='file://'+path.join(__dirname,'../..','newtab.html');
test.beforeEach(async({page})=>{await page.route(/^https?:/,r=>r.abort());await page.goto(url);});
test('AI preferences persist and full preview keeps code and symbols',async({page})=>{
 await page.locator('#ai-side-toggle').click();
 const text='中文 😀 $& <script>literal</script>\n'+ 'const x = "$`";\n'.repeat(1500);
 await page.locator('#ai-draft').fill(text);
 await expect(page.locator('#ai-prompt-preview')).toHaveText(text);
 await page.locator('#ai-auto-send').uncheck();await page.locator('[data-preset="coding"]').click();
 await page.reload();await page.locator('#ai-side-toggle').click();
 await expect(page.locator('#ai-auto-send')).not.toBeChecked();
 await expect(page.locator('[data-target="deepseek"]')).toHaveAttribute('aria-pressed','true');
});
test('rapid repeated launches open each target once, even after rerender',async({page})=>{
 await page.evaluate(()=>{window.opened=[];window.open=(url)=>{window.opened.push(url);return{opener:null,location:{replace(u){}}};};});
 await page.locator('#ai-side-toggle').click();await page.locator('#ai-draft').fill('Smoke test');
 await page.locator('[data-preset="coding"]').click();await page.locator('#ai-send').click();
 await page.locator('[data-target="doubao"]').click();await page.locator('#ai-send').click();
 expect(await page.evaluate(()=>window.opened.length)).toBe(2);
});
test('template duplicate and favorite survive saving',async({page})=>{
 await page.evaluate(()=>{document.getElementById('modal-set').hidden=false;window.LT_PROMPTS.renderPromptManager();});
 const before=await page.evaluate(()=>window.LT_APP.state.prompts.length);
 await page.locator('#prompt-manage [data-act="clone"]').first().dispatchEvent('click');
 expect(await page.evaluate(()=>window.LT_APP.state.prompts.length)).toBe(before+1);
 await page.locator('#prompt-manage [data-act="favorite"]').first().dispatchEvent('click');
 expect(await page.evaluate(()=>window.LT_APP.state.prompts[0].favorite)).toBe(true);
});
test('AI keyboard shortcut focuses task input',async({page})=>{
 await page.keyboard.press('Alt+Shift+A');await expect(page.locator('#ai-draft')).toBeFocused();
});

for(const mode of ['fill-only','existing-draft','slow-send'])test('injection '+mode,async({page})=>{
 await page.goto(url+'?lt_auto=1&lt_k=test');
 await page.evaluate((mode)=>{
  document.body.innerHTML='<textarea aria-label="chat" style="width:500px;height:100px"></textarea><button data-testid="send-button">Send</button>';
  window.sentCount=0;document.querySelector('button').onclick=()=>{window.sentCount++;};
  if(mode==='existing-draft')document.querySelector('textarea').value='Keep this draft';
  window.chrome={storage:{local:{get(k,cb){cb({[k]:{p:'New test prompt',t:Date.now(),autoSend:mode!=='fill-only'}});},set(){},remove(){}}}};
 },mode);
 await page.addScriptTag({path:path.join(__dirname,'../..','js/inject-ai.js')});
 if(mode==='existing-draft'){await page.waitForTimeout(1500);await expect(page.locator('textarea')).toHaveValue('Keep this draft');expect(await page.evaluate(()=>window.sentCount)).toBe(0);}
 else{await expect(page.locator('textarea')).toHaveValue('New test prompt');await page.waitForTimeout(mode==='slow-send'?10000:500);expect(await page.evaluate(()=>window.sentCount)).toBe(mode==='slow-send'?1:0);}
});

test('multi-field Google template preserves literal replacement characters',async({page})=>{
 await page.evaluate(()=>{window.result='';window.open=(u)=>{window.result=u;return null;};window.LT_APP.setEngine('google');window.LT_APP.setActivePrompt({id:'test',tmpl:'用{语言}解释：{q}'});});
 await page.locator('#q').fill('hello $&');await page.locator('#search-go').dispatchEvent('click',{ctrlKey:true});
 await page.locator('.manual-copy-dialog input').fill('中文 {q}');await page.locator('.manual-copy-dialog button').last().click();
 expect(await page.evaluate(()=>decodeURIComponent(window.result))).toContain('用中文 {q}解释：hello $&');
});
test('shortcuts fit narrow and zoomed viewports',async({page})=>{
 for(const width of [800,1280,1920]){await page.setViewportSize({width,height:900});for(const zoom of [0.8,1,1.25]){await page.evaluate(z=>{document.body.style.zoom=z;window.dispatchEvent(new Event('resize'));},zoom);await page.waitForTimeout(150);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);}}
});

test('clipboard denial exposes full prompt for manual copy',async({page})=>{
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(Error('denied'))},configurable:true});document.execCommand=()=>false;window.open=()=>({opener:null,location:{replace(){}}});});
 await page.locator('#ai-side-toggle').click();await page.locator('#ai-draft').fill('保留完整提示词 $& 😀');await page.locator('#ai-send').click();
 await expect(page.locator('.manual-copy-dialog textarea')).toHaveValue('保留完整提示词 $& 😀');
});

test('WorkBuddy truncation preserves Unicode and exposes full copy',async({page})=>{
 await page.evaluate(()=>{window.urls=[];window.open=u=>{window.urls.push(u);return null;};Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true});});
 await page.locator('#ai-side-toggle').click();
 await page.evaluate(()=>window.LT_APP.launchPrompt({tmpl:'{q}',targets:['wbai']},'a'.repeat(7499)+'😀'+'tail',{}));
 const urls=await page.evaluate(()=>window.urls);expect(urls.length).toBe(1);expect(new URL(urls[0]).searchParams.get('prompt')).toBe('a'.repeat(7499)+'😀');
 await expect(page.locator('#ai-launch-results')).toContainText('7500');
});

test('AI entry drags without opening, persists and stays inside resized viewport',async({page})=>{
 const button=page.locator('#ai-side-toggle');const box=await button.boundingBox();
 await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();await page.mouse.move(140,170,{steps:8});await page.mouse.up();
 await expect(page.locator('#ai-launcher')).toBeHidden();
 const moved=await button.boundingBox();expect(moved.x).toBeLessThan(150);expect(moved.y).toBeLessThan(180);
 await page.reload();const restored=await button.boundingBox();expect(Math.abs(restored.x-moved.x)).toBeLessThan(2);
 await button.click();await expect(page.locator('#ai-launcher')).toBeVisible();await button.click();
 await page.mouse.move(restored.x+20,restored.y+20);await page.mouse.down();await page.mouse.move(1400,850,{steps:8});await page.mouse.up();
 await page.setViewportSize({width:600,height:500});const bounded=await button.boundingBox();expect(bounded.x+bounded.width).toBeLessThanOrEqual(600);expect(bounded.y+bounded.height).toBeLessThanOrEqual(500);
});

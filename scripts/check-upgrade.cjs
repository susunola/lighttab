'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),cp=require('child_process');
const {chromium}=require('playwright');
(async()=>{
const repo=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lighttab-upgrade-')),root=path.join(tmp,'extension'),profile=path.join(tmp,'profile');fs.mkdirSync(root);
cp.execFileSync('git',['archive','ab52350'],{cwd:repo,stdio:['ignore',fs.openSync(path.join(tmp,'old.tar'),'w'),'pipe']});cp.execFileSync('tar',['-xf',path.join(tmp,'old.tar'),'-C',root]);
assert.equal(JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,'1.18.0');
const id=crypto.createHash('sha256').update(fs.realpathSync(root)).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
let context;
async function open(){context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`]});await context.route(/^https?:/,r=>r.abort());const p=await context.newPage();await p.goto(`chrome-extension://${id}/newtab.html`);await p.waitForFunction(()=>document.querySelectorAll('#grid .card').length>1);return p;}
try{
let page=await open();await page.evaluate(async()=>{const d=await chrome.storage.local.get(null);d['lt.items']=[{id:'upgrade-link',title:'升级保留测试',url:'https://example.com',color:'#2563eb'},{id:'upgrade-second',title:'第二个链接',url:'https://example.org'}];d['lt.settings']={...(d['lt.settings']||{}),name:'升级用户'};d['lt.wallpaper']={type:'gradient',value:'linear-gradient(135deg, #102030, #304050)'};d['lt.prompts']=[{id:'upgrade-prompt',name:'升级模板',tmpl:'总结：{q}',hint:'内容',targets:[],wb:null}];d['lt.todos']=[{id:'upgrade-todo',text:'升级后仍保留',done:false,due:'2099-12-31'}];await chrome.storage.local.set(d);});await page.reload();await page.locator('#clock-hhmm').waitFor();await page.waitForTimeout(500);const keys=['lt.items','lt.todos','lt.wallpaper','lt.prompts'];const before=await page.evaluate(keys=>chrome.storage.local.get(keys),keys);const oldSettings=await page.evaluate(()=>chrome.storage.local.get('lt.settings'));await context.close();context=null;
for(const f of ['manifest.json','newtab.html','js','css','assets','icons'])fs.cpSync(path.join(repo,f),path.join(root,f),{recursive:true});
page=await open();await page.waitForTimeout(700);const after=await page.evaluate(keys=>chrome.storage.local.get(keys),keys);assert.deepEqual(after,before);assert.equal(await page.evaluate(async()=> (await chrome.storage.local.get('lt.settings'))['lt.settings'].name),'升级用户');assert.equal(await page.evaluate(()=>chrome.runtime.getManifest().version),JSON.parse(fs.readFileSync(path.join(repo,'manifest.json'))).version);assert(await page.locator('#grid').innerText().then(s=>s.includes('升级保留测试')));assert(await page.locator('#todo-list').innerText().then(s=>s.includes('升级后仍保留')));
console.log('PASS: real MV3 1.18.0 → current manifest version; same extension ID/profile; shortcuts, todos, wallpaper and prompts unchanged; display name retained; UI renders saved data.');console.log('Fixture:',tmp);
}finally{if(context)await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

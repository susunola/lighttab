'use strict';
chrome.runtime.onInstalled.addListener(()=>{
 chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'lighttab-ai',title:'LightTab · AI',contexts:['selection']}));
});
// Apply a downloaded update right away.
//
// Chrome only *installs* a pending update while the extension is idle, and an open extension page
// counts as "in use". LightTab overrides the new-tab page, so the extension is essentially never
// idle — the update is downloaded, then sits unused until the browser restarts. That is why an
// uninstall + reinstall (which bypasses the idle rule) used to be the only reliable way to upgrade.
// onUpdateAvailable fires once the new version is already on disk; reload() applies it immediately.
// All user state is written to chrome.storage as it changes, so the reload cannot lose data — at
// worst it interrupts a half-typed search, once per release.
chrome.runtime.onUpdateAvailable.addListener(()=>{
 chrome.runtime.reload();
});
chrome.contextMenus.onClicked.addListener(async info=>{
 if(info.menuItemId!=='lighttab-ai'||!info.selectionText)return;
 const key='lt.selection.'+crypto.randomUUID();
 await chrome.storage.local.set({[key]:{text:info.selectionText,t:Date.now()}});
 await chrome.tabs.create({url:chrome.runtime.getURL('newtab.html')+'?selection='+encodeURIComponent(key)});
});
chrome.commands.onCommand.addListener(command=>{
 if(command==='open-ai')chrome.tabs.create({url:chrome.runtime.getURL('newtab.html')+'?ai=1'});
});

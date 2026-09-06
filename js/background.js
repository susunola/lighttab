'use strict';
chrome.runtime.onInstalled.addListener(()=>{
 chrome.contextMenus.removeAll(()=>chrome.contextMenus.create({id:'lighttab-ai',title:'LightTab · AI',contexts:['selection']}));
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

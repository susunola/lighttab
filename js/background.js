'use strict';

const TEMP_PREFIXES = ['lt.selection.', 'lt.delivery.', 'lt.pending.'];
const TEMP_TTL_MS = 30 * 60 * 1000;

function nid() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) { /* fall through */ }
  return 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function sweepTemps() {
  try {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const drop = [];
    for (const [key, value] of Object.entries(all)) {
      if (!TEMP_PREFIXES.some(p => key.startsWith(p))) continue;
      const t = value && Number(value.t);
      if (!Number.isFinite(t) || now - t > TEMP_TTL_MS) drop.push(key);
    }
    if (drop.length) await chrome.storage.local.remove(drop);
  } catch (_) { /* service worker may be torn down mid-read */ }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({
    id: 'lighttab-ai',
    title: 'LightTab · AI',
    contexts: ['selection']
  }));
  sweepTemps();
});
chrome.runtime.onStartup.addListener(sweepTemps);

// Apply a downloaded update right away.
//
// Chrome only *installs* a pending update while the extension is idle, and an open extension page
// counts as "in use". LightTab overrides the new-tab page, so the extension is essentially never
// idle — the update is downloaded, then sits unused until the browser restarts. That is why an
// uninstall + reinstall (which bypasses the idle rule) used to be the only reliable way to upgrade.
// onUpdateAvailable fires once the new version is already on disk; reload() applies it immediately.
// All user state is written to chrome.storage as it changes, so the reload cannot lose data — at
// worst it interrupts a half-typed search, once per release.
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.runtime.reload();
});

chrome.contextMenus.onClicked.addListener(async info => {
  if (info.menuItemId !== 'lighttab-ai' || !info.selectionText) return;
  await sweepTemps();
  const key = 'lt.selection.' + nid();
  await chrome.storage.local.set({ [key]: { text: info.selectionText, t: Date.now() } });
  await chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') + '?selection=' + encodeURIComponent(key) });
});

chrome.commands.onCommand.addListener(command => {
  if (command === 'open-ai') chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') + '?ai=1' });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'lt.cal.fetch' || !msg.url) return;
  (async () => {
    try {
      const headers = {};
      if (msg.etag) headers['If-None-Match'] = msg.etag;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(String(msg.url), {
        signal: ctrl.signal,
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
        headers
      });
      clearTimeout(timer);
      if (res.status === 304) { sendResponse({ ok: true, notModified: true }); return; }
      if (!res.ok) { sendResponse({ ok: false, error: 'http' + res.status }); return; }
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 2 * 1024 * 1024) { sendResponse({ ok: false, error: 'too_large' }); return; }
      sendResponse({
        ok: true,
        ics: new TextDecoder('utf-8').decode(buf),
        etag: res.headers.get('ETag') || ''
      });
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.name === 'AbortError') ? 'timeout' : 'network' });
    }
  })();
  return true;
});

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

// A new-tab page is commonly left open while the user is typing. Do not force-reload it: drafts in
// forms and the AI launcher are deliberately in-memory. Tell extension pages an update is ready and
// let the user decide when to refresh; Chrome will still apply it automatically once it is idle.
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.runtime.sendMessage({ type: 'lt.update.ready' }).catch(() => {});
});

function isOwnExtensionPage(sender) {
  return !!(sender && sender.id === chrome.runtime.id && typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL('')));
}

async function isSavedCalendarUrl(raw) {
  try {
    const url = new URL(String(raw));
    if (url.protocol !== 'https:') return false;
    const data = await chrome.storage.local.get('lt.calendars');
    return Array.isArray(data['lt.calendars']) && data['lt.calendars'].some(feed => feed && feed.url === url.toString());
  } catch (_) {
    return false;
  }
}

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
      // This is intentionally not a generic privileged fetch proxy. Only the new-tab page may
      // request a URL, and it must be an exact, already-saved HTTPS calendar subscription.
      if (!isOwnExtensionPage(_sender) || !(await isSavedCalendarUrl(msg.url))) {
        sendResponse({ ok: false, error: 'forbidden' });
        return;
      }
      const headers = {};
      if (msg.etag) headers['If-None-Match'] = msg.etag;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      let res;
      try {
        res = await fetch(String(msg.url), {
          signal: ctrl.signal,
          credentials: 'omit',
          redirect: 'follow',
          cache: 'no-store',
          headers
        });
        if (res.status === 304) { sendResponse({ ok: true, notModified: true }); return; }
        if (!res.ok) { sendResponse({ ok: false, error: 'http' + res.status }); return; }
        // Keep the abort armed while the body streams in: a slow-drip response must not park the
        // worker past the 15s budget just because the headers arrived in time.
        const buf = await res.arrayBuffer();
        if (buf.byteLength > 2 * 1024 * 1024) { sendResponse({ ok: false, error: 'too_large' }); return; }
        sendResponse({
          ok: true,
          ics: new TextDecoder('utf-8').decode(buf),
          etag: res.headers.get('ETag') || ''
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.name === 'AbortError') ? 'timeout' : 'network' });
    }
  })();
  return true;
});

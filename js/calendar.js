/* LightTab calendar subscriptions — the network + permission half of the calendar feature.

   Why this exists at all: Apple's iCloud does not send Access-Control-Allow-Origin, so a plain
   fetch() from the new-tab page is blocked. Feeding hosts therefore live in the manifest's
   optional_host_permissions and are granted *on demand*, the first time the user subscribes to a
   feed, via chrome.permissions.request(). Credentials are never involved: a published Apple
   calendar is a public, read-only ICS URL, so this module only ever does an anonymous GET.

   Storage and rendering deliberately live in app.js — this file stays a pure transport layer so the
   permission and parsing behaviour can be exercised without a DOM. */
window.LT_CAL = (function () {
  'use strict';

  const TIMEOUT_MS = 15000;
  const MAX_BYTES = 2 * 1024 * 1024;   // a published calendar far past this is not a new-tab concern
  const MAX_FEEDS = 8;
  const REFRESH_AFTER_MS = 30 * 60 * 1000;
  const WINDOW_BACK_MS = 14 * 86400000;   // keep a fortnight of history so "yesterday" still renders
  const WINDOW_FORWARD_MS = 150 * 86400000;

  // Feed dot colours. Chosen to stay legible on both themes; the index is stable per feed id.
  const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

  function colorFor(seed) {
    let h = 0;
    for (const ch of String(seed || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  /* ---------- URL handling ---------- */

  // Apple hands out webcal:// links from the Share menu; they are plain https underneath.
  function normalizeFeedUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return null;
    u = u.replace(/^webcal:\/\//i, 'https://').replace(/^webcals:\/\//i, 'https://');
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try {
      const x = new URL(u);
      if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
      if (!x.hostname || x.hostname.indexOf('.') < 0) return null;
      return x.toString();
    } catch { return null; }
  }

  // chrome.permissions wants an origin pattern, not a full URL. Ports are dropped on purpose: a
  // pattern with a port would only match that port, and published calendar hosts are all on 443.
  function originPattern(url) {
    try {
      const x = new URL(url);
      if (x.protocol !== 'http:' && x.protocol !== 'https:') return null;
      return x.protocol + '//' + x.hostname + '/*';
    } catch { return null; }
  }

  /* ---------- permissions ---------- */

  function permsApi() {
    return (window.chrome && chrome.permissions) ? chrome.permissions : null;
  }

  // 'granted' | 'prompt' | 'unsupported'. 'unsupported' is the honest answer when the page is not
  // running as an extension (file:// preview, tests) — the caller should say so rather than fail later.
  function permissionState(url) {
    const api = permsApi(), p = originPattern(url);
    if (!api || !p) return Promise.resolve('unsupported');
    try {
      return Promise.resolve(api.contains({ origins: [p] })).then(v => (v ? 'granted' : 'prompt'));
    } catch { return Promise.resolve('unsupported'); }
  }

  // Must be called from a user gesture. A host outside optional_host_permissions simply cannot be
  // requested, so a rejection here is reported as "this host isn't supported" by the caller.
  function requestAccess(url) {
    const api = permsApi(), p = originPattern(url);
    if (!api || !api.request || !p) return Promise.resolve(false);
    try {
      return Promise.resolve(api.request({ origins: [p] })).catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  // Chrome match-pattern containment: does `pattern` (from the manifest) cover `target` (an origin
  // pattern)? Only the shapes we declare are handled — scheme, host, optional "*." prefix.
  function patternCovers(pattern, target) {
    const mp = /^(\*|https?):\/\/([^/]*)\//.exec(pattern);
    const tp = /^(https?):\/\/([^/]*)\//.exec(target);
    if (!mp || !tp) return false;
    if (mp[1] !== '*' && mp[1] !== tp[1]) return false;
    const mh = mp[2], th = tp[2];
    if (mh === '*') return true;
    if (mh.slice(0, 2) === '*.') {
      const base = mh.slice(2);
      return th === base || th.slice(-(base.length + 1)) === '.' + base;
    }
    return th === mh;
  }

  // A host we cannot even ask about. Checking this up front turns Chrome's opaque "request rejected"
  // into an honest "that host isn't supported yet" message.
  function isDeclared(url) {
    const p = originPattern(url);
    if (!p) return false;
    const api = permsApi();
    if (!api) return false; // not running as an extension at all
    try {
      const mf = window.chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest();
      const list = (mf && mf.optional_host_permissions) || [];
      return list.some(pat => patternCovers(pat, p));
    } catch { return false; }
  }

  /* ---------- fetch ---------- */

  async function fetchFeed(url, etag) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const headers = {};
      if (etag) headers['If-None-Match'] = etag;
      const res = await fetch(url, {
        signal: ctrl.signal,
        credentials: 'omit',   // public feed; sending cookies would only widen the blast radius
        redirect: 'follow',
        cache: 'no-store',
        headers
      });
      if (res.status === 304) return { ok: true, notModified: true };
      if (!res.ok) return { ok: false, error: 'http' + res.status };
      const buf = await res.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) return { ok: false, error: 'too_large' };
      return { ok: true, ics: new TextDecoder('utf-8').decode(buf), etag: res.headers.get('ETag') || '' };
    } catch (err) {
      // A cross-origin feed with no CORS header and no granted permission surfaces as a bare
      // TypeError, which is indistinguishable from a real network failure — hence 'network'.
      const aborted = err && err.name === 'AbortError';
      return { ok: false, error: aborted ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- sync ---------- */

  // Fetch (or reuse the cache), parse, and expand into the render window. Returns a cache entry
  // shaped { fetchedAt, etag, events, error } — never throws, so a dead feed cannot break the page.
  async function syncFeed(feed, cached, nowMs) {
    const now = nowMs || Date.now();
    const prev = cached || {};
    const fresh = prev.fetchedAt && (now - prev.fetchedAt) < REFRESH_AFTER_MS;
    if (fresh && !prev.error && prev.events) return prev;

    const res = await fetchFeed(feed.url, prev.etag);
    if (!res.ok) {
      // Keep the last good events: a flaky network should not blank out the user's calendar.
      return { fetchedAt: prev.fetchedAt || 0, etag: prev.etag || '', events: prev.events || [], error: res.error };
    }
    if (res.notModified) {
      return { fetchedAt: now, etag: prev.etag || '', events: prev.events || [], error: '' };
    }

    let raw = [];
    try { raw = window.LT_ICS.parseICS(res.ics); }
    catch { return { fetchedAt: prev.fetchedAt || 0, etag: prev.etag || '', events: prev.events || [], title: prev.title || '', error: 'parse' }; }

    const events = window.LT_ICS.expandAll(raw, now - WINDOW_BACK_MS, now + WINDOW_FORWARD_MS, 200);
    // X-WR-CALNAME is the feed's own display name — nicer than showing the user a hostname.
    let title = '';
    try { title = window.LT_ICS.parseCalendarName(res.ics); } catch {}
    return {
      fetchedAt: now,
      etag: res.etag || '',
      title: title || prev.title || '',
      error: '',
      events: events.map(o => ({
        s: o.startMs, e: o.endMs, d: o.allDay ? 1 : 0,
        t: o.summary.slice(0, 120), l: o.location.slice(0, 80)
      }))
    };
  }

  // Feed events, indexed by local day key, so the month grid is a map lookup instead of a scan.
  function groupByDay(events, allDayFlags) {
    const map = new Map();
    for (const ev of events) {
      const allDay = allDayFlags ? allDayFlags(ev) : !!ev.d;
      for (const key of window.LT_ICS.occurrenceDays({ startMs: ev.s, endMs: ev.e, allDay })) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(ev);
      }
    }
    for (const list of map.values()) list.sort((a, b) => (b.d - a.d) || (a.s - b.s));
    return map;
  }

  return {
    normalizeFeedUrl, originPattern, permissionState, requestAccess, isDeclared, patternCovers,
    fetchFeed, syncFeed, groupByDay, colorFor,
    COLORS, MAX_FEEDS, REFRESH_AFTER_MS, WINDOW_BACK_MS, WINDOW_FORWARD_MS
  };
})();

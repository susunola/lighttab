/* LightTab iCalendar (RFC 5545) reader — pure, no DOM / storage / network.
   Scope: enough of the format to put calendar events on the month grid, and nothing more.
     * line unfolding, content-line params, TEXT escaping
     * DATE / DATE-TIME (floating, UTC, TZID) with real timezone maths via Intl
     * VEVENT with SUMMARY / LOCATION / DTSTART / DTEND / DURATION / RRULE / EXDATE
     * RRULE expansion for DAILY / WEEKLY / MONTHLY / YEARLY + INTERVAL / COUNT / UNTIL / BYDAY / BYMONTHDAY
   Out of scope, on purpose (a new-tab widget does not need them): VTODO / VJOURNAL, VALARM, ATTENDEE,
   VTIMEZONE definitions (we resolve TZID through the browser's own tz database instead), RDATE,
   BYSETPOS / BYWEEKNO and other exotic rule parts, and RECURRENCE-ID overrides (an edited instance
   shows as an extra occurrence rather than replacing its parent).

   Note on all-day events: DTSTART;VALUE=DATE:20260910 is stored as the UTC midnight of that date, so a
   day key for it must be read back in UTC too — otherwise a viewer west of Greenwich would see the
   event one day early. occurrenceDays() handles that; use it rather than reading the Date directly. */
window.LT_ICS = (function () {
  'use strict';

  const DAY_MS = 86400000;
  const WEEKDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const MAX_OCCURRENCES = 200;   // per event, per expansion window
  const MAX_STEPS = 4000;        // hard loop guard for pathological rules

  /* ---------- text → lines ---------- */

  // RFC 5545 §3.1: a line break followed by a single space or tab continues the previous line.
  function unfold(text) {
    return String(text || '')
      .replace(/\r\n[ \t]/g, '')
      .replace(/\n[ \t]/g, '')
      .replace(/\r\n?/g, '\n');
  }

  // NAME;PARAM=VALUE;PARAM="quoted":VALUE — the colon that ends the header is the first one outside quotes.
  function parseLine(line) {
    let inQuote = false, at = -1;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ':' && !inQuote) { at = i; break; }
    }
    if (at < 0) return null;
    const segs = line.slice(0, at).split(';');
    const params = {};
    for (let i = 1; i < segs.length; i++) {
      const eq = segs[i].indexOf('=');
      if (eq < 0) continue;
      let v = segs[i].slice(eq + 1);
      if (v.length > 1 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      params[segs[i].slice(0, eq).toUpperCase()] = v;
    }
    return { name: segs[0].toUpperCase(), params, value: line.slice(at + 1) };
  }

  function unescapeText(s) {
    return String(s || '')
      .replace(/\\[nN]/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }

  /* ---------- timezones ---------- */

  const fmtCache = new Map(); // tzid → Intl.DateTimeFormat | null (null = unknown zone)

  function tzFormat(tz) {
    if (fmtCache.has(tz)) return fmtCache.get(tz);
    let f = null;
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { f = null; } // unknown zone id → fall back to treating it as UTC
    fmtCache.set(tz, f);
    return f;
  }

  // Wall-clock fields of `ms` as seen in `tz`.
  function partsInZone(ms, tz) {
    const f = tzFormat(tz);
    const dt = new Date(ms);
    if (!f) {
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
               hh: dt.getUTCHours(), mm: dt.getUTCMinutes(), ss: dt.getUTCSeconds() };
    }
    const p = {};
    for (const part of f.formatToParts(dt)) p[part.type] = part.value;
    return { y: +p.year, m: +p.month, d: +p.day,
             hh: p.hour === '24' ? 0 : +p.hour, mm: +p.minute, ss: +p.second };
  }

  function zoneOffsetMs(ms, tz) {
    const p = partsInZone(ms, tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss) - ms;
  }

  // There is no API that turns "2026-09-10 10:00 in Asia/Shanghai" into an instant, so guess with
  // Date.UTC and then subtract the zone's offset at that guess; a second pass settles DST edges.
  function wallToUTC(p, tz) {
    const guess = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    let ms = guess - zoneOffsetMs(guess, tz);
    ms = guess - zoneOffsetMs(ms, tz);
    return ms;
  }

  /* ---------- property values ---------- */

  // "20260910" | "20260910T100000" | "20260910T100000Z", optionally with TZID=…
  // `kind` records how to read the wall-clock fields back later, which recurrence needs.
  function parseDT(value, params) {
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(String(value || '').trim());
    if (!m) return null;
    const p = { y: +m[1], m: +m[2], d: +m[3], hh: +(m[4] || 0), mm: +(m[5] || 0), ss: +(m[6] || 0) };
    const dateOnly = m[4] === undefined || (params && params.VALUE === 'DATE');
    const tzid = (params && params.TZID) || null;
    let kind, ms;
    if (dateOnly) { kind = 'date'; ms = Date.UTC(p.y, p.m - 1, p.d); }
    else if (m[7] === 'Z') { kind = 'utc'; ms = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss); }
    else if (tzid) { kind = 'zoned'; ms = wallToUTC(p, tzid); }
    else { kind = 'floating'; ms = new Date(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss).getTime(); }
    return { ms, dateOnly, kind, tzid, parts: p };
  }

  // P1D / PT1H30M / P1W / -PT15M
  function parseDuration(s) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(String(s || '').trim());
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    const secs = (+m[2] || 0) * 604800 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0);
    return sign * secs * 1000;
  }

  function parseRRule(s) {
    const out = {};
    for (const kv of String(s || '').split(';')) {
      const eq = kv.indexOf('=');
      if (eq < 0) continue;
      const k = kv.slice(0, eq).toUpperCase().trim();
      const v = kv.slice(eq + 1).trim();
      if (k === 'FREQ') out.freq = v.toUpperCase();
      else if (k === 'INTERVAL') out.interval = Math.max(1, parseInt(v, 10) || 1);
      else if (k === 'COUNT') out.count = Math.max(0, parseInt(v, 10) || 0);
      else if (k === 'UNTIL') out.until = v;
      else if (k === 'BYDAY') out.byday = v.split(',').map(x => x.trim().toUpperCase()).filter(Boolean);
      else if (k === 'BYMONTHDAY') out.bymonthday = v.split(',').map(x => parseInt(x, 10)).filter(n => !isNaN(n));
      else if (k === 'BYMONTH') out.bymonth = v.split(',').map(x => parseInt(x, 10)).filter(n => !isNaN(n));
    }
    return out.freq ? out : null;
  }

  /* ---------- civil-date arithmetic ---------- */

  function dowOf(p) { return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function addDays(p, n) {
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  // Month arithmetic with day clamping: Jan 31 + 1 month lands on Feb 28 rather than being skipped.
  function addMonths(p, n) {
    const total = p.y * 12 + (p.m - 1) + n;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12 + 1;
    return { y, m, d: Math.min(p.d, daysInMonth(y, m)) };
  }

  function partsOf(ms, kind, tz) {
    if (kind === 'date' || kind === 'utc') {
      const dt = new Date(ms);
      return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
               hh: dt.getUTCHours(), mm: dt.getUTCMinutes(), ss: dt.getUTCSeconds() };
    }
    if (kind === 'zoned') return partsInZone(ms, tz);
    const dt = new Date(ms);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate(),
             hh: dt.getHours(), mm: dt.getMinutes(), ss: dt.getSeconds() };
  }
  function toMs(p, kind, tz) {
    if (kind === 'date') return Date.UTC(p.y, p.m - 1, p.d);
    if (kind === 'utc') return Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
    if (kind === 'zoned') return wallToUTC(p, tz);
    return new Date(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss).getTime();
  }

  /* ---------- parsing ---------- */

  const NESTED = /^(VALARM|VTODO|VJOURNAL|VFREEBUSY|VTIMEZONE|STANDARD|DAYLIGHT)$/;

  function parseICS(text) {
    const events = [];
    let cur = null, nested = 0;
    for (const raw of unfold(text).split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const begin = /^BEGIN:([A-Za-z-]+)$/.exec(line);
      const end = /^END:([A-Za-z-]+)$/.exec(line);
      if (begin) {
        // Components we do not model still contain properties that would otherwise be mistaken for
        // the parent event's (a VALARM has its own SUMMARY/DESCRIPTION), so skip their innards.
        if (NESTED.test(begin[1].toUpperCase())) nested++;
        else if (begin[1].toUpperCase() === 'VEVENT') cur = { exdate: [] };
        continue;
      }
      if (end) {
        if (NESTED.test(end[1].toUpperCase())) { if (nested > 0) nested--; }
        else if (end[1].toUpperCase() === 'VEVENT') { if (cur) events.push(cur); cur = null; }
        continue;
      }
      if (!cur || nested > 0) continue;
      const L = parseLine(line);
      if (!L) continue;
      switch (L.name) {
        case 'UID': cur.uid = L.value.trim(); break;
        case 'SUMMARY': cur.summary = unescapeText(L.value); break;
        case 'LOCATION': cur.location = unescapeText(L.value); break;
        case 'DESCRIPTION': cur.description = unescapeText(L.value); break;
        case 'STATUS': cur.status = L.value.trim().toUpperCase(); break;
        case 'DTSTART': cur.dtstart = parseDT(L.value, L.params); break;
        case 'DTEND': cur.dtend = parseDT(L.value, L.params); break;
        case 'DURATION': cur.duration = parseDuration(L.value); break;
        case 'RRULE': cur.rrule = parseRRule(L.value); break;
        case 'EXDATE':
          for (const one of L.value.split(',')) {
            const dt = parseDT(one, L.params);
            if (dt) cur.exdate.push(dt.ms);
          }
          break;
        default: break;
      }
    }
    return events.filter(e => e.dtstart && e.status !== 'CANCELLED');
  }

  /* ---------- recurrence ---------- */

  // NB: the window end is `winTo`, not `toMs` — naming it `toMs` shadows the helper of the same
  // name and every recurrence that needs a date→ms conversion dies with "toMs is not a function".
  function expandEvent(ev, fromMs, winTo, cap) {
    const out = [];
    const d = ev.dtstart;
    if (!d) return out;
    const limit = cap || MAX_OCCURRENCES;
    const durMs = ev.dtend ? Math.max(0, ev.dtend.ms - d.ms) : (ev.duration || 0);
    // EXDATE compares at minute precision: sources rarely agree on sub-minute seconds.
    const ex = new Set((ev.exdate || []).map(x => Math.round(x / 60000)));
    const r = ev.rrule;

    function consider(startMs) {
      if (out.length >= limit) return;
      if (ex.has(Math.round(startMs / 60000))) return;
      const endMs = startMs + durMs;
      if (endMs < fromMs || startMs > winTo) return; // no overlap with the requested window
      out.push({
        startMs, endMs, allDay: !!d.dateOnly,
        summary: ev.summary || '', location: ev.location || '', uid: ev.uid || ''
      });
    }

    if (!r) { consider(d.ms); return out; }

    const supported = r.freq === 'DAILY' || r.freq === 'WEEKLY' || r.freq === 'MONTHLY' || r.freq === 'YEARLY';
    if (!supported) { consider(d.ms); return out; }

    const kind = d.kind, tz = d.tzid;
    const base = d.parts;
    const iv = r.interval || 1;
    const maxCount = r.count || Infinity;
    let untilMs = null;
    if (r.until) { const u = parseDT(r.until, {}); if (u) untilMs = u.ms; }
    const stop = Math.min(winTo, untilMs == null ? winTo : untilMs);
    let count = 0, steps = 0;

    if (r.freq === 'WEEKLY') {
      const baseDow = dowOf(base);
      const weekStart = addDays(base, -baseDow); // back up to Sunday
      const dows = (r.byday && r.byday.length)
        ? r.byday.map(x => WEEKDAY[x]).filter(x => x !== undefined)
        : [baseDow];
      outer:
      for (let w = 0; steps < MAX_STEPS; w++, steps++) {
        const ws = addDays(weekStart, w * 7 * iv);
        for (const dow of dows) {
          const c = addDays(ws, dow);
          const ms = toMs({ ...base, y: c.y, m: c.m, d: c.d }, kind, tz);
          if (ms < d.ms) continue;          // never emit before DTSTART
          if (ms > stop) break outer;
          count++;
          if (count > maxCount) break outer;
          consider(ms);
          if (out.length >= limit) break outer;
        }
      }
      return out;
    }

    const stepDays = r.freq === 'DAILY' ? iv : 0;
    const stepMonths = r.freq === 'MONTHLY' ? iv : r.freq === 'YEARLY' ? 12 * iv : 0;
    const mdays = (r.freq === 'MONTHLY' && r.bymonthday && r.bymonthday.length) ? r.bymonthday : null;

    for (let i = 0; steps < MAX_STEPS; i++, steps++) {
      const anchor = stepDays ? addDays(base, i * stepDays) : addMonths(base, i * stepMonths);
      const days = mdays ? mdays.map(n => (n > 0 ? n : daysInMonth(anchor.y, anchor.m) + n + 1)) : [anchor.d];
      let past = false;
      for (const day of days) {
        if (day < 1 || day > daysInMonth(anchor.y, anchor.m)) continue;
        const ms = toMs({ ...base, y: anchor.y, m: anchor.m, d: day }, kind, tz);
        if (ms > stop) { past = true; break; }
        if (ms < d.ms) continue;
        count++;
        if (count > maxCount) { past = true; break; }
        consider(ms);
        if (out.length >= limit) return out;
      }
      if (past) break;
      // A yearly/monthly rule can step far past the window; stop as soon as the anchor itself is out.
      if (!mdays && toMs({ ...base, y: anchor.y, m: anchor.m, d: anchor.d }, kind, tz) > stop) break;
    }
    return out;
  }

  function expandAll(rawEvents, fromMs, winTo, cap) {
    const out = [];
    for (const ev of rawEvents) {
      for (const occ of expandEvent(ev, fromMs, winTo, cap)) out.push(occ);
    }
    out.sort((a, b) => a.startMs - b.startMs);
    return out;
  }

  // The calendar's own display name. X-WR-CALNAME is the de-facto property Apple/Google/Outlook all
  // publish; NAME is the RFC 7986 spelling. Only the VCALENDAR header is searched, so an event whose
  // SUMMARY happens to be called "NAME" cannot be mistaken for it.
  function parseCalendarName(text) {
    for (const raw of unfold(text).split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (/^BEGIN:VEVENT$/i.test(line)) break;
      const L = parseLine(line);
      if (L && (L.name === 'X-WR-CALNAME' || L.name === 'NAME')) {
        return unescapeText(L.value).trim().slice(0, 40);
      }
    }
    return '';
  }

  /* ---------- day mapping ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // All-day events run on the UTC date they were authored with; timed events use the viewer's own
  // clock, which is what the wall calendar in front of them shows.
  function dayKey(ms, allDay) {
    const dt = new Date(ms);
    if (allDay) return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  // Every local day key an occurrence touches. DTEND is exclusive, so a same-day timed event yields
  // one key and an all-day event ending the next midnight still yields one.
  function occurrenceDays(occ) {
    const days = [];
    const endExclusive = occ.endMs > occ.startMs ? occ.endMs : occ.startMs + 1;
    let cursor = occ.startMs;
    for (let guard = 0; guard < 400; guard++) {
      const key = dayKey(cursor, occ.allDay);
      if (days.indexOf(key) < 0) days.push(key);
      // Advance in the same calendar the keys are read from, or the step and the key disagree.
      const stepMs = DAY_MS;
      cursor += stepMs;
      if (cursor >= endExclusive) break;
      if (occ.allDay) {
        // all-day: compare UTC dates
        if (dayKey(cursor, true) > dayKey(endExclusive - 1, true)) break;
      } else if (dayKey(cursor, false) > dayKey(endExclusive - 1, false)) break;
    }
    return days;
  }

  return {
    parseICS, parseCalendarName, expandEvent, expandAll, occurrenceDays, dayKey,
    parseDT, parseDuration, parseRRule, unfold, unescapeText,
    wallToUTC, partsInZone, DAY_MS
  };
})();

/**
 * LightTab - Chinese statutory public holidays (pure local, zero dependencies, zero network)
 *
 * Official 2026 schedule: 国务院办公厅《关于2026年部分节假日安排的通知》(国办发明电〔2025〕7号,
 * published 2025-11-04). Source:
 * https://zwfw.gansu.gov.cn/huixian/zczx/tzgg/art/2025/art_715c16a75e4d4c289c295e77772c7274.html
 *
 * The table covers calendar year 2026 ONLY — like the lunar data range in js/lunar.js, this is a
 * fixed dataset: refresh it every year once the State Council publishes the next arrangement.
 * Entries mark either a holiday (h: name key, resolved via the hol.<key> i18n entries) or a
 * 调休 make-up workday (work: true — a weekend day everyone works to pay for a longer break).
 *
 * Years without an official notice fall back to lookup()/approxTable(): the festival *day*
 * itself (元旦 / 春节初一 / 清明 / 五一 / 端午 / 中秋 / 十一), never invented 调休. Official
 * 2026 rows always win when both exist.
 *
 * Exposes window.LT_HOLIDAYS = { table, officialYear, lookup, approxTable },
 * table: { 'YYYY-MM-DD': { h } | { work: true } }.
 */
(function () {
  'use strict';

  var OFFICIAL_YEAR = 2026;

  // Holiday ranges [from, to, nameKey], both ends inclusive.
  var RANGES = [
    ['2026-01-01', '2026-01-03', 'newyear'],    // 元旦 New Year's Day (3 days)
    ['2026-02-15', '2026-02-23', 'spring'],     // 春节 Spring Festival (9 days)
    ['2026-04-04', '2026-04-06', 'qingming'],   // 清明节 Qingming Festival (3 days)
    ['2026-05-01', '2026-05-05', 'labour'],     // 劳动节 Labour Day (5 days)
    ['2026-06-19', '2026-06-21', 'dragonboat'], // 端午节 Dragon Boat Festival (3 days)
    ['2026-09-25', '2026-09-27', 'midautumn'],  // 中秋节 Mid-Autumn Festival (3 days)
    ['2026-10-01', '2026-10-07', 'national']    // 国庆节 National Day (7 days)
  ];
  // 调休 make-up workdays (officially working days that fall on a weekend).
  var WORKDAYS = [
    '2026-01-04', // for New Year
    '2026-02-14', '2026-02-28', // for Spring Festival
    '2026-05-09', // for Labour Day
    '2026-09-20', '2026-10-10'  // for National Day
  ];

  function isoOf(time) {
    var d = new Date(time);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  var table = {};
  RANGES.forEach(function (r) {
    // Walk UTC midnights so the expansion never wobbles across DST zones.
    var t = Date.parse(r[0] + 'T00:00:00Z');
    var end = Date.parse(r[1] + 'T00:00:00Z');
    for (; t <= end; t += 86400000) table[isoOf(t)] = { h: r[2] };
  });
  WORKDAYS.forEach(function (d) { table[d] = { work: true }; });

  function pad2(n) { return String(n).padStart(2, '0'); }
  function iso(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  // 21st-century Qingming day-of-April (solar-term approximation).
  function qingmingAprilDay(year) {
    var Y = year % 100;
    return Math.floor(Y * 0.2422 + 4.81) - Math.floor(Y / 4);
  }

  function gregorianOfLunar(ly, lm, ld) {
    var L = window.LT_LUNAR;
    if (!L || typeof L.toLunar !== 'function') return null;
    var start = Date.UTC(ly - 1, 11, 1);
    var end = Date.UTC(ly + 1, 2, 31);
    for (var t = start; t <= end; t += 86400000) {
      var dt = new Date(t);
      var y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      var lu = L.toLunar(y, m, d);
      if (lu && !lu.isLeap && lu.year === ly && lu.month === lm && lu.day === ld) return iso(y, m, d);
    }
    return null;
  }

  function approxTable(year) {
    year = +year;
    var out = {};
    if (!Number.isInteger(year) || year < 1900 || year > 2100) return out;
    out[iso(year, 1, 1)] = { h: 'newyear', approx: true };
    out[iso(year, 5, 1)] = { h: 'labour', approx: true };
    out[iso(year, 10, 1)] = { h: 'national', approx: true };
    var qd = qingmingAprilDay(year);
    if (qd >= 4 && qd <= 6) out[iso(year, 4, qd)] = { h: 'qingming', approx: true };
    var spring = gregorianOfLunar(year, 1, 1);
    if (spring) out[spring] = { h: 'spring', approx: true };
    var boat = gregorianOfLunar(year, 5, 5);
    if (boat) out[boat] = { h: 'dragonboat', approx: true };
    var moon = gregorianOfLunar(year, 8, 15);
    if (moon) out[moon] = { h: 'midautumn', approx: true };
    return out;
  }

  function lookup(key) {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
    if (table[key]) return table[key];
    var year = +key.slice(0, 4);
    if (year === OFFICIAL_YEAR) return null;
    return approxTable(year)[key] || null;
  }

  window.LT_HOLIDAYS = {
    table: table,
    officialYear: OFFICIAL_YEAR,
    lookup: lookup,
    approxTable: approxTable
  };
})();

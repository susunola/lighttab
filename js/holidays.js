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
 * Exposes window.LT_HOLIDAYS = { table }, table: { 'YYYY-MM-DD': { h } | { work: true } }.
 */
(function () {
  'use strict';

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

  window.LT_HOLIDAYS = { table: table };
})();

#!/usr/bin/env node
/* Builds assets/sea-holidays.ics — the bundled "港新马印泰假期" calendar shipped since 1.24.2.
 *
 * Public holidays of Hong Kong, Singapore, Malaysia, Indonesia and Thailand, 2026–2028,
 * with Simplified Chinese summaries. Fixed-date entries recur via RRULE:FREQ=YEARLY (the
 * parser in js/ics.js repeats a YEARLY rule on the DTSTART month/day); lunar and Islamic
 * dates are written out explicitly per year because they follow official announcements and
 * do not map onto a Gregorian rule.
 *
 * Run: node scripts/build-sea-holidays.cjs   (smoke.cjs re-parses the output) */
'use strict';
const fs = require('fs');
const path = require('path');

const YEARS = [2026, 2027, 2028];
const CAL_NAME = '港新马印泰假期';
const CAL_DESC = '香港/新加坡/马来西亚/印尼/泰国公共假期 2026–2028；农历与回历日期以各地官方公布为准';

// Fixed Gregorian dates — one VEVENT with RRULE:FREQ=YEARLY.
const FIXED = [
  { c: '香港', n: '元旦', m: 1, d: 1 },
  { c: '新加坡', n: '元旦', m: 1, d: 1 },
  { c: '马来西亚', n: '元旦', m: 1, d: 1 },
  { c: '印尼', n: '元旦', m: 1, d: 1 },
  { c: '泰国', n: '元旦', m: 1, d: 1 },
  { c: '香港', n: '劳动节', m: 5, d: 1 },
  { c: '新加坡', n: '劳动节', m: 5, d: 1 },
  { c: '马来西亚', n: '劳动节', m: 5, d: 1 },
  { c: '印尼', n: '劳动节', m: 5, d: 1 },
  { c: '泰国', n: '劳动节', m: 5, d: 1 },
  { c: '香港', n: '香港特别行政区成立纪念日', m: 7, d: 1 },
  { c: '香港', n: '圣诞节', m: 12, d: 25 },
  { c: '新加坡', n: '国庆日', m: 8, d: 9 },
  { c: '新加坡', n: '圣诞节', m: 12, d: 25 },
  { c: '马来西亚', n: '国庆日', m: 8, d: 31 },
  { c: '马来西亚', n: '马来西亚日', m: 9, d: 16 },
  { c: '马来西亚', n: '圣诞节', m: 12, d: 25 },
  { c: '印尼', n: '建国五项原则纪念日', m: 6, d: 1 },
  { c: '印尼', n: '独立日', m: 8, d: 17 },
  { c: '印尼', n: '圣诞节', m: 12, d: 25 },
  { c: '泰国', n: '却克里王朝纪念日', m: 4, d: 6 },
  { c: '泰国', n: '国王加冕纪念日', m: 5, d: 4 },
  { c: '泰国', n: '王后诞辰', m: 6, d: 3 },
  { c: '泰国', n: '国王诞辰', m: 7, d: 28 },
  { c: '泰国', n: '母亲节（诗丽吉王太后诞辰）', m: 8, d: 12 },
  { c: '泰国', n: '普密蓬国王逝世纪念日', m: 10, d: 13 },
  { c: '泰国', n: '朱拉隆功纪念日', m: 10, d: 23 },
  { c: '泰国', n: '父亲节（普密蓬国王诞辰）', m: 12, d: 5 },
  { c: '泰国', n: '宪法纪念日', m: 12, d: 10 },
  { c: '泰国', n: '新年前夕', m: 12, d: 31 },
];

// Movable lunar / Islamic dates — explicit per year: { c, n, days: [[y, m, d, spanDays?], ...] }.
// Hong Kong gazetted holidays that land on a Sunday move to the next weekday (and a displaced
// Easter Monday moves one day further) — those dates below already carry the substitution.
const CNY = [[2026, 2, 17], [2027, 2, 6], [2028, 1, 26]];          // 农历正月初一
const GOOD_FRIDAY = [[2026, 4, 3], [2027, 3, 26], [2028, 4, 14]];
const EID_FITR = [[2026, 3, 21], [2027, 3, 10], [2028, 2, 27]];     // 开斋节首日（以官方公布为准）
const EID_ADHA = [[2026, 5, 27], [2027, 5, 17], [2028, 5, 5]];      // 哈芝节/宰牲节
const VESAK = [[2026, 5, 31], [2027, 5, 20], [2028, 5, 9]];         // 卫塞节
const HIJRI_NY = [[2026, 6, 17], [2027, 6, 7], [2028, 5, 26]];      // 回历新年
const MAWLID = [[2026, 8, 26], [2027, 8, 15], [2028, 8, 4]];        // 先知诞辰
const DEEPAVALI = [[2026, 11, 8], [2027, 10, 29], [2028, 10, 18]];  // 屠妖节

const MOVABLE = [
  { c: '香港', n: '农历新年年初一', days: CNY },
  { c: '香港', n: '农历新年年初二', days: CNY.map(([y, m, d]) => [y, m, d + 1]) },
  { c: '香港', n: '农历新年年初三', days: CNY.map(([y, m, d]) => [y, m, d + 2]) },
  // 2027 年初二（2 月 7 日）恰逢周日，初四补假。
  { c: '香港', n: '农历新年年初四（补假）', days: [[2027, 2, 9]] },
  // 2026 年清明（4 月 5 日）是周日，顺延至 4 月 6 日。
  { c: '香港', n: '清明节', days: [[2026, 4, 6], [2027, 4, 5], [2028, 4, 4]] },
  { c: '香港', n: '耶稣受难节', days: GOOD_FRIDAY },
  { c: '香港', n: '耶稣受难节翌日', days: GOOD_FRIDAY.map(([y, m, d]) => [y, m, d + 1]) },
  // 2026 年复活节星期一（4 月 6 日）与清明补假撞期，再顺延一天至 4 月 7 日。
  { c: '香港', n: '复活节星期一', days: [[2026, 4, 7], [2027, 3, 29], [2028, 4, 17]] },
  // 2026 年佛诞（5 月 24 日）是周日，顺延至 5 月 25 日。
  { c: '香港', n: '佛诞', days: [[2026, 5, 25], [2027, 5, 13], [2028, 5, 2]] },
  // 2028 年端午（5 月 28 日）是周日，顺延至 5 月 29 日。
  { c: '香港', n: '端午节', days: [[2026, 6, 19], [2027, 6, 9], [2028, 5, 29]] },
  { c: '香港', n: '中秋节翌日', days: [[2026, 9, 26], [2027, 9, 16], [2028, 10, 4]] },
  // 2026 年重阳（10 月 18 日）是周日，顺延至 10 月 19 日。
  { c: '香港', n: '重阳节', days: [[2026, 10, 19], [2027, 10, 8], [2028, 9, 27]] },
  // 2028 年国庆日（10 月 1 日）是周日，顺延至 10 月 2 日。
  { c: '香港', n: '国庆日', days: [[2026, 10, 1], [2027, 10, 1], [2028, 10, 2]] },
  // “圣诞节后第一个平日”：2027 年 12 月 26 日是周日，平日落在 12 月 27 日。
  { c: '香港', n: '圣诞节后第一个平日', days: [[2026, 12, 26], [2027, 12, 27], [2028, 12, 26]] },
  // 新加坡：法定假日逢周日时下周一补假——2027 年农历新年第二天（2 月 7 日）是周日，补到 2 月 8 日。
  { c: '新加坡', n: '农历新年', days: [[2026, 2, 17, 2], [2027, 2, 6, 3], [2028, 1, 26, 2]] },
  { c: '新加坡', n: '开斋节', days: EID_FITR },
  { c: '新加坡', n: '耶稣受难节', days: GOOD_FRIDAY },
  { c: '新加坡', n: '卫塞节', days: VESAK },
  { c: '新加坡', n: '哈芝节', days: EID_ADHA },
  { c: '新加坡', n: '屠妖节', days: DEEPAVALI },
  { c: '马来西亚', n: '农历新年', days: CNY.map(([y, m, d]) => [y, m, d, 2]) },
  { c: '马来西亚', n: '开斋节', days: EID_FITR.map(([y, m, d]) => [y, m, d, 2]) },
  { c: '马来西亚', n: '卫塞节', days: VESAK },
  { c: '马来西亚', n: '国家元首诞辰', days: [[2026, 6, 1], [2027, 6, 7], [2028, 6, 5]] }, // 六月第一个周一
  { c: '马来西亚', n: '哈芝节', days: EID_ADHA },
  { c: '马来西亚', n: '回历新年', days: HIJRI_NY },
  { c: '马来西亚', n: '先知诞辰', days: MAWLID },
  { c: '马来西亚', n: '屠妖节', days: DEEPAVALI },
  { c: '印尼', n: '先知登霄日', days: [[2026, 1, 16], [2027, 1, 5], [2027, 12, 25]] }, // 2027 年含 1449 回历的第二次
  { c: '印尼', n: '农历新年', days: CNY },
  { c: '印尼', n: '静居日（巴厘岛新年）', days: [[2026, 3, 19], [2027, 3, 8], [2028, 3, 26]] },
  { c: '印尼', n: '开斋节', days: EID_FITR.map(([y, m, d]) => [y, m, d, 2]) },
  { c: '印尼', n: '耶稣受难日', days: GOOD_FRIDAY },
  { c: '印尼', n: '耶稣升天日', days: [[2026, 5, 14], [2027, 5, 6], [2028, 5, 25]] },
  { c: '印尼', n: '卫塞节', days: VESAK },
  { c: '印尼', n: '宰牲节', days: EID_ADHA },
  { c: '印尼', n: '回历新年', days: HIJRI_NY },
  { c: '印尼', n: '先知诞辰', days: MAWLID },
  { c: '泰国', n: '万佛节', days: [[2026, 3, 3], [2027, 2, 21], [2028, 3, 10]] },
  { c: '泰国', n: '宋干节', days: YEARS.map(y => [y, 4, 13, 3]) },
  { c: '泰国', n: '卫塞节', days: VESAK },
  { c: '泰国', n: '三宝佛节', days: [[2026, 7, 29], [2027, 7, 19], [2028, 7, 6]] },
];

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function ymd(y, m, d) { return y + pad(m) + pad(d); }
function addDays(y, m, d, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

const lines = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//LightTab//ZH',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'X-WR-CALNAME:' + esc(CAL_NAME),
  'X-WR-CALDESC:' + esc(CAL_DESC),
];
const STAMP = '20260101T000000Z';
let seq = 0;
function pushEvent(summary, y, m, d, span, rrule) {
  const [ey, em, ed] = addDays(y, m, d, (span || 1));
  lines.push('BEGIN:VEVENT');
  lines.push('UID:sea-' + (++seq) + '@lighttab');
  lines.push('DTSTAMP:' + STAMP);
  lines.push('DTSTART;VALUE=DATE:' + ymd(y, m, d));
  lines.push('DTEND;VALUE=DATE:' + ymd(ey, em, ed));
  if (rrule) lines.push('RRULE:' + rrule);
  lines.push('SUMMARY:' + esc(summary));
  lines.push('END:VEVENT');
}

for (const h of FIXED) pushEvent(h.c + '·' + h.n, 2026, h.m, h.d, 1, 'FREQ=YEARLY');
for (const h of MOVABLE) {
  for (const [y, m, d, span] of h.days) pushEvent(h.c + '·' + h.n, y, m, d, span || 1, null);
}
lines.push('END:VCALENDAR');

const out = path.resolve(__dirname, '..', 'assets', 'sea-holidays.ics');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join('\r\n') + '\r\n');
console.log(`${out}: ${seq} events (${FIXED.length} yearly + ${seq - FIXED.length} explicit)`);

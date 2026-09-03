/**
 * LightTab v1.10.0 · 中国农历换算（纯本地、零依赖、零网络）
 *
 * 数据源：1900–2100 农历数据表（lunarInfo），算法为通用公历→农历换算。
 * 对外暴露 window.LT_LUNAR = { toLunar, monthName, dayName, ganzhiYear, animalYear }。
 * 覆盖范围 1900-01-31 ~ 2100-12-31，超出返回 null（页面仅用于当前日期，足够）。
 */
(function () {
  'use strict';

  // 1900–2100 农历数据表：每项低 4 位=闰月月份(0=无闰月)，其余位标记大月(30天)/小月(29天)，
  // 0x10000 位标记闰月是大月(30)还是小月(29)。
  var lunarInfo = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2, // 1900-1909
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977, // 1910-1919
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, // 1920-1929
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950, // 1930-1939
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557, // 1940-1949
    0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, // 1950-1959
    0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, // 1960-1969
    0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6, // 1970-1979
    0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570, // 1980-1989
    0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0, // 1990-1999
    0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, // 2000-2009
    0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930, // 2010-2019
    0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530, // 2020-2029
    0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, // 2030-2039
    0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, // 2040-2049
    0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0, // 2050-2059
    0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4, // 2060-2069
    0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, // 2070-2079
    0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, // 2080-2089
    0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252, // 2090-2099
    0x0d520 // 2100
  ];

  var Gan = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  var Zhi = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  var Animals = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
  var AnimalsEn = ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'];
  // 月名：正月…十月、冬月(11)、腊月(12)——已含「月」字
  var MonthNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
  var nStr1 = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

  // 某农历年总天数
  function lYearDays(y) {
    var i, sum = 348;
    for (i = 0x8000; i > 0x8; i >>= 1) sum += (lunarInfo[y - 1900] & i) ? 1 : 0;
    return sum + leapDays(y);
  }
  // 闰哪个月（0 = 无闰月）
  function leapMonth(y) {
    return lunarInfo[y - 1900] & 0xf;
  }
  // 闰月天数（无闰月返回 0）
  function leapDays(y) {
    if (leapMonth(y)) return (lunarInfo[y - 1900] & 0x10000) ? 30 : 29;
    return 0;
  }
  // 某农历年第 m 月天数（m 从 1 起）
  function monthDays(y, m) {
    return (lunarInfo[y - 1900] & (0x10000 >> m)) ? 30 : 29;
  }

  /**
   * 公历 → 农历
   * @param {number} y 公历年
   * @param {number} m 公历月（1-12）
   * @param {number} d 公历日
   * @returns {{year,month,day,isLeap}|null}
   */
  function toLunar(y, m, d) {
    if (y < 1900 || y > 2100) return null;
    // 1900-01-31 = 农历 1900 正月初一
    var offset = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1900, 0, 31)) / 86400000);
    if (offset < 0) return null;

    var i, temp = 0, ly;
    // 先定位农历年：从 1900 起逐年减去天数
    for (i = 1900; i < 2100 && offset > 0; i++) {
      temp = lYearDays(i);
      offset -= temp;
    }
    if (offset < 0) { offset += temp; i--; }
    ly = i;

    var isLeap = false;
    var leap = leapMonth(ly);
    // 再定位农历月与日
    for (i = 1; i < 13 && offset > 0; i++) {
      if (leap > 0 && i === leap + 1 && !isLeap) { // 进入闰月
        --i;
        isLeap = true;
        temp = leapDays(ly);
      } else {
        temp = monthDays(ly, i);
      }
      if (isLeap && i === leap + 1) isLeap = false; // 解除闰月标记
      offset -= temp;
    }
    if (offset === 0 && leap > 0 && i === leap + 1) {
      if (isLeap) { isLeap = false; }
      else { isLeap = true; --i; }
    }
    if (offset < 0) { offset += temp; --i; }

    return { year: ly, month: i, day: offset + 1, isLeap: isLeap };
  }

  // 农历月名（含「月」字，如「八月」；闰月前加「闰」）
  function monthName(lunarMonth, isLeap) {
    return (isLeap ? '闰' : '') + (MonthNames[lunarMonth - 1] || '');
  }
  // 农历日名：初一…初十、十一…十九、二十、廿一…廿九、三十
  function dayName(lunarDay) {
    if (lunarDay < 1 || lunarDay > 30) return '';
    if (lunarDay <= 10) return '初' + nStr1[lunarDay];
    if (lunarDay < 20) return '十' + nStr1[lunarDay - 10];
    if (lunarDay === 20) return '二十';
    if (lunarDay < 30) return '廿' + nStr1[lunarDay - 20];
    return '三十';
  }
  // 干支纪年（以农历年为准，春节后切换）
  function ganzhiYear(lunarYear) {
    return Gan[(lunarYear - 4) % 10] + Zhi[(lunarYear - 4) % 12];
  }
  // 生肖（以农历年为准）
  function animalYear(lunarYear) {
    return Animals[(lunarYear - 4) % 12];
  }

  // ---------- 英文变体（供英文界面显示） ----------
  // 序数：1st / 2nd / 3rd / 4th …
  function ord(n) {
    var s = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    var suffix = (v >= 11 && v <= 13) ? 'th' : (s[n % 10] || 'th');
    return n + suffix;
  }
  // 农历月名英文：8th month / leap 8th month
  function monthNameEn(lunarMonth, isLeap) {
    if (lunarMonth < 1 || lunarMonth > 12) return '';
    return (isLeap ? 'leap ' : '') + ord(lunarMonth) + ' month';
  }
  // 农历日英文：1st … 30th
  function dayNameEn(lunarDay) {
    if (lunarDay < 1 || lunarDay > 30) return '';
    return ord(lunarDay);
  }
  // 生肖英文
  function animalYearEn(lunarYear) {
    return AnimalsEn[(lunarYear - 4) % 12];
  }

  window.LT_LUNAR = { toLunar: toLunar, monthName: monthName, dayName: dayName, ganzhiYear: ganzhiYear, animalYear: animalYear, monthNameEn: monthNameEn, dayNameEn: dayNameEn, animalYearEn: animalYearEn };
})();

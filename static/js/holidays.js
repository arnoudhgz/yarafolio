// @ts-check
// US stock market (NYSE/Nasdaq) holiday calendar, computed per year so it never goes stale.

/**
 * @param {Date} d
 * @returns {string} YYYY-MM-DD in the date's local fields
 */
function ymd(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Day-of-month for the nth given weekday of a month.
 * @param {number} year
 * @param {number} month 0-11
 * @param {number} weekday 0=Sun..6=Sat
 * @param {number} n 1-based occurrence
 * @returns {number}
 */
function nthWeekday(year, month, weekday, n) {
  const firstDow = new Date(year, month, 1).getDay();
  return 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
}

/**
 * Day-of-month for the last given weekday of a month.
 * @param {number} year
 * @param {number} month 0-11
 * @param {number} weekday 0=Sun..6=Sat
 * @returns {number}
 */
function lastWeekday(year, month, weekday) {
  const last = new Date(year, month + 1, 0);
  return last.getDate() - ((last.getDay() - weekday + 7) % 7);
}

/**
 * NYSE observes a fixed-date holiday on Friday when it lands on Saturday, Monday when on Sunday.
 * @param {number} year
 * @param {number} month 0-11
 * @param {number} day
 * @returns {Date}
 */
function observed(year, month, day) {
  const d = new Date(year, month, day);
  if (d.getDay() === 6) return new Date(year, month, day - 1);
  if (d.getDay() === 0) return new Date(year, month, day + 1);
  return d;
}

/**
 * New Year's Day is the exception: when Jan 1 is a Saturday the market does NOT close the
 * preceding Friday (Dec 31 trades), so only the Sunday->Monday shift applies.
 * @param {number} year
 * @returns {Date}
 */
function observedNewYear(year) {
  const d = new Date(year, 0, 1);
  if (d.getDay() === 0) return new Date(year, 0, 2);
  return d;
}

/**
 * Good Friday = Easter (Gregorian Computus) minus 2 days; the market is closed that day.
 * @param {number} year
 * @returns {Date}
 */
function goodFriday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  easter.setDate(easter.getDate() - 2);
  return easter;
}

/**
 * US stock market holidays for a given year.
 * @param {number} year
 * @returns {Map<string, string>} YYYY-MM-DD -> display name
 */
export function marketHolidays(year) {
  /** @type {[Date, string][]} */
  const days = [
    [observedNewYear(year), "New Year's Day"],
    [new Date(year, 0, nthWeekday(year, 0, 1, 3)), "MLK Day"],
    [new Date(year, 1, nthWeekday(year, 1, 1, 3)), "Presidents' Day"],
    [goodFriday(year), "Good Friday"],
    [new Date(year, 4, lastWeekday(year, 4, 1)), "Memorial Day"],
    [observed(year, 5, 19), "Juneteenth"],
    [observed(year, 6, 4), "Independence Day"],
    [new Date(year, 8, nthWeekday(year, 8, 1, 1)), "Labor Day"],
    [new Date(year, 10, nthWeekday(year, 10, 4, 4)), "Thanksgiving"],
    [observed(year, 11, 25), "Christmas"],
  ];
  return new Map(days.map(([d, name]) => [ymd(d), name]));
}

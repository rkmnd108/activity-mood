"use strict";

// 入力のカレンダー日付を、日本時間の日時として明示的に扱う。
globalThis.ActivityTime = (() => {
  const japan = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function now() {
    const parts = Object.fromEntries(japan.formatToParts(new Date()).map(({ type, value }) => [type, value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
  }
  function dateValue(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "1000-01-01") throw new Error("日付を正しく入力してください。");
    const value = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== date) throw new Error("存在する日付を入力してください。");
    return value;
  }
  function timestamp(date, time) {
    dateValue(date);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("時刻を正しく入力してください。");
    return Date.parse(`${date}T${time}:00+09:00`);
  }
  function nextDay(date) {
    const next = new Date(dateValue(date) + 86400000).toISOString().slice(0, 10);
    dateValue(next);
    return next;
  }
  function interval(record) {
    const start = timestamp(record.date, record.startTime);
    const end = record.status === "active" ? Infinity : timestamp(record.endDate, record.endTime);
    if (end <= start) throw new Error("終了日時は開始日時より後にしてください。同じ日・同じ時刻では保存できません。");
    return { start, end };
  }
  function overlaps(record, records) {
    const current = interval(record);
    return records.filter((other) => {
      if (other.id === record.id) return false;
      const target = interval(other);
      return current.start < target.end && target.start < current.end;
    });
  }
  function stamp() { return new Date(Date.now() + 9 * 3600000).toISOString().replace("Z", "+09:00"); }
  function addDays(date, days) {
    const result = new Date(dateValue(date) + days * 86400000).toISOString().slice(0, 10);
    dateValue(result);
    return result;
  }
  function dayKey(date, time) {
    timestamp(date, time);
    return time < "06:00" ? addDays(date, -1) : date;
  }
  function today(at = Date.now()) {
    // 日本時間に直し、日界の6時間を引いた日付を所属日とする。
    return new Date(at + (9 - 6) * 3600000).toISOString().slice(0, 10);
  }
  function monday(day) {
    const weekday = new Date(dateValue(day)).getUTCDay();
    return addDays(day, -((weekday + 6) % 7));
  }
  function weekStart(day) {
    const weekday = new Date(dateValue(day)).getUTCDay();
    // 金曜を週の先頭にする。UTCの曜日は日曜=0、金曜=5。
    return addDays(day, -((weekday + 2) % 7));
  }
  function dayRange(day) {
    const start = timestamp(day, "06:00");
    return { start, end: start + 86400000 };
  }
  function daySlice(record, day, at = Date.now()) {
    const range = dayRange(day);
    const original = interval(record);
    const end = record.status === "active" ? at : original.end;
    if (end < original.start || original.start >= range.end || end < range.start || (end === range.start && record.status !== "active")) return null;
    const start = Math.max(original.start, range.start);
    const clippedEnd = Math.min(end, range.end);
    return { record, day, start, end: clippedEnd, fromPrevious: original.start < range.start, toNext: end > range.end || (record.status === "active" && end === range.end), active: record.status === "active" && end < range.end };
  }
  function dailyAverage(records, day) {
    const completed = records.filter((record) => record.status === "completed" && dayKey(record.date, record.startTime) === day);
    return { count: completed.length, value: completed.length ? completed.reduce((total, record) => total + record.mood, 0) / completed.length : null };
  }
  return { now, timestamp, nextDay, interval, overlaps, stamp, addDays, dayKey, today, monday, weekStart, dayRange, daySlice, dailyAverage };
})();

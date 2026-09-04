"use strict";

globalThis.ActivityBackup = (() => {
  const fields = ["id", "date", "startTime", "endDate", "endTime", "activity", "customActivity", "mood", "condition", "status", "revision", "createdAt", "updatedAt"];
  function timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|\+09:00)$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("作成・更新日時が不正です。");
    ActivityTime.timestamp(value.slice(0, 10), value.slice(11, 16));
    if (Number(value.slice(17, 19)) > 59) throw new Error("秒の値が不正です。");
  }
  function records(input) {
    if (!Array.isArray(input)) throw new Error("記録一覧がありません。");
    const ids = new Set();
    const result = input.map((record, index) => {
      try {
        if (!record || typeof record !== "object" || Array.isArray(record) || fields.some(key => !Object.hasOwn(record, key)) || Object.keys(record).some(key => !fields.includes(key))) throw new Error("記録の項目が不正です。");
        for (const key of ["id", "date", "startTime", "activity", "customActivity", "condition", "status"]) if (typeof record[key] !== "string") throw new Error("文字列の項目が不正です。");
        if (!record.id.trim() || ids.has(record.id)) throw new Error("IDが空、またはファイル内で重複しています。");
        if (record.status === "completed" && (typeof record.endDate !== "string" || typeof record.endTime !== "string")) throw new Error("終了日時がありません。");
        if (!Number.isSafeInteger(record.revision) || record.revision < 1 || record.revision >= Number.MAX_SAFE_INTEGER) throw new Error("記録の版番号が不正です。");
        timestamp(record.createdAt); timestamp(record.updatedAt);
        ActivityDB.validate(record);
        ids.add(record.id);
        return Object.fromEntries(fields.map(key => [key, record[key]]));
      } catch (error) { throw new Error(`${index + 1}件目：${error.message}`); }
    });
    if (result.filter(record => record.status === "active").length > 1) throw new Error("ファイル内に進行中の記録が2件以上あります。");
    return result;
  }
  function parse(text) {
    let data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("JSONを読み取れません。アプリから保存したバックアップを選んでください。"); }
    if (!data || data.app !== "activity-mood" || data.version !== 1) throw new Error("対応していないバックアップ形式です。");
    timestamp(data.exportedAt);
    return { exportedAt: data.exportedAt, records: records(data.records) };
  }
  function stringify(all) { return JSON.stringify({ app: "activity-mood", version: 1, exportedAt: ActivityTime.stamp(), records: records(all) }, null, 2); }
  function snapshot(all) {
    return JSON.stringify(all.map(record => Object.fromEntries(fields.map(key => [key, record[key]]))).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  function plan(current, incoming, mode) {
    if (!["append", "replace", "clear"].includes(mode)) throw new Error("復元方法が不正です。");
    const checked = records(incoming);
    const ids = new Set(current.map(record => record.id));
    const added = mode === "clear" ? [] : mode === "append" ? checked.filter(record => !ids.has(record.id)) : checked;
    const result = mode === "append" ? [...current, ...added] : added;
    if (result.filter(record => record.status === "active").length > 1) throw new Error("復元後に進行中が2件以上になります。現在の進行中を終了するか、復元方法を見直してください。");
    return { added, skipped: mode === "append" ? checked.length - added.length : 0, total: result.length, active: result.filter(record => record.status === "active").length };
  }
  return { records, parse, stringify, snapshot, plan };
})();

"use strict";

globalThis.ActivityDB = (() => {
  const activities = ["睡眠", "ベッド", "食事", "パソコン", "散歩", "入浴", "その他"];
  function validate(record) {
    if (!record.id || !["active", "completed"].includes(record.status)) throw new Error("記録の形式が不正です。");
    if (!activities.includes(record.activity)) throw new Error("やったことを選んでください。");
    if (record.activity === "その他" && !record.customActivity?.trim()) throw new Error("その他の内容を入力してください。");
    if (!Number.isInteger(record.mood) || record.mood < 0 || record.mood > 100 || record.mood % 10 !== 0) throw new Error("気分は0〜100の10刻みで指定してください。");
    if (!["good", "normal", "bad"].includes(record.condition)) throw new Error("体調を選んでください。");
    if (record.status === "active" && (record.endDate !== null || record.endTime !== null)) throw new Error("進行中の記録に終了日時は設定できません。");
    ActivityTime.interval(record);
  }
  function token(record) { return `${record.id}:${record.revision}`; }
  function create(name = "activity-mood") {
    let opening;
    function open() {
      if (opening) return opening;
      opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        let blocked = false;
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains("records")) request.result.createObjectStore("records", { keyPath: "id" });
        };
        request.onblocked = () => { blocked = true; reject(new Error("別タブが保存領域を使用中です。他のアプリのタブを閉じて再読み込みしてください。")); };
        request.onerror = () => reject(new Error(`保存領域を開けませんでした（${request.error?.name}）。ブラウザの保存設定を確認してください。`));
        request.onsuccess = () => {
          const db = request.result;
          if (blocked) { db.close(); opening = null; return; }
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
      });
      opening.catch(() => { opening = null; });
      return opening;
    }
    async function list() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("records", "readonly");
        const request = tx.objectStore("records").getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(new Error(`記録を読み込めませんでした（${tx.error?.name || "AbortError"}）。再読み込みしてください。`));
      });
    }
    async function change(record, options = {}, deleting = false) {
      if (!deleting) validate(record);
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("records", "readwrite");
        const store = tx.objectStore("records");
        const request = store.getAll();
        let result;
        let reason;
        request.onsuccess = () => {
          try {
            const all = request.result;
            const previous = all.find((item) => item.id === record.id);
            if (options.expectedRevision == null ? !!previous : !previous || previous.revision !== options.expectedRevision) {
              throw new Error("この記録は別の画面で変更または削除されました。入力内容は残しています。一覧を更新し、記録を開き直してください。");
            }
            if (deleting) {
              if (!previous) throw new Error("削除する記録が見つかりません。");
              store.delete(record.id);
            } else {
              if (record.status === "active" && all.some((item) => item.id !== record.id && item.status === "active")) throw new Error("進行中の記録があります。現在の記録を終了してから開始してください。");
              const { start, end } = ActivityTime.interval(record);
              if (record.status === "completed" && end - start >= 18 * 3600000 && !options.allowLong) throw new Error("18時間以上の記録には確認が必要です。");
              const conflicts = ActivityTime.overlaps(record, all);
              if (conflicts.some((item) => !(options.overlapTokens || []).includes(token(item)))) throw new Error("時間が重なる記録があります。別タブで追加・変更された場合もあります。もう一度保存して内容を確認してください。");
              result = { ...record, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || ActivityTime.stamp(), updatedAt: ActivityTime.stamp() };
              store.put(result);
            }
          } catch (error) { reason = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(reason || new Error(`保存を完了できませんでした（${tx.error?.name || "AbortError"}）。入力を残しています。空き容量や保存設定を確認してください。`));
      });
    }
    async function bulk(incoming, mode, expectedSnapshot) {
      // 非同期処理へ進む前にコピーして全件検証する。
      const checked = ActivityBackup.records(incoming);
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("records", "readwrite");
        const store = tx.objectStore("records");
        const request = store.getAll();
        let reason, result;
        request.onsuccess = () => {
          try {
            const current = request.result;
            if (typeof expectedSnapshot !== "string" || ActivityBackup.snapshot(current) !== expectedSnapshot) throw new Error("確認中に記録が変更されました。何も変更していません。最初から内容を確認してください。");
            result = ActivityBackup.plan(current, checked, mode);
            // 復元前に開かれた編集画面からの上書きを版番号で拒否する。
            const revision = [...current, ...checked].reduce((value, record) => Math.max(value, record.revision + 1), Date.now());
            if (mode !== "append") store.clear();
            result.added.forEach(record => store.put({ ...record, revision }));
          } catch (error) { reason = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(reason || new Error(`処理を完了できませんでした（${tx.error?.name || "AbortError"}）。保存領域は処理前の状態に戻りました。空き容量や保存設定を確認してください。`));
      });
    }
    return { list, bulk, save: (record, options) => change(record, options), remove: (record) => change(record, { expectedRevision: record.revision }, true) };
  }
  return { create, token, validate };
})();

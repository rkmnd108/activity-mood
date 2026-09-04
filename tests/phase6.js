"use strict";
(async () => {
  const db = ActivityDB.create(`activity-mood-phase6-${crypto.randomUUID()}`);
  const sample = (values = {}) => ({ id: crypto.randomUUID(), date: "2026-09-01", startTime: "23:00", endDate: "2026-09-02", endTime: "08:00", activity: "睡眠", customActivity: "", mood: 50, condition: "normal", status: "completed", revision: 1, createdAt: "2026-09-01T23:00:00+09:00", updatedAt: "2026-09-02T08:00:00+09:00", ...values });
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const snapshot = async () => ActivityBackup.snapshot(await db.list());
  const bulk = async (records, mode = "append") => db.bulk(records, mode, await snapshot());
  async function rejects(action) { let failed = false; try { await action(); } catch { failed = true; } assert(failed, "拒否されませんでした"); }
  let passed = 0;
  async function check(name, action) { await action(); passed++; const li = document.createElement("li"); li.textContent = `PASS: ${name}`; document.getElementById("checks").append(li); }
  try {
    const original = sample();
    await check("終了済み・進行中・日本語・日付またぎのJSON往復", () => {
      const all = [original, sample({ status: "active", endDate: null, endTime: null, activity: "その他", customActivity: "通院 <script>表示テスト</script>" })];
      assert(ActivityBackup.snapshot(ActivityBackup.parse(ActivityBackup.stringify(all)).records) === ActivityBackup.snapshot(all), "往復不一致");
    });
    await check("空のバックアップも復元できる", () => assert(ActivityBackup.parse(ActivityBackup.stringify([])).records.length === 0, "空"));
    await check("不正なJSON・別形式・未知の版を拒否", async () => {
      for (const text of ["{", "null", "[]", '{"app":"activity-mood","version":2}']) await rejects(() => ActivityBackup.parse(text));
    });
    await check("不正日時・気分・型・欠落・重複IDを全件検証", async () => {
      for (const changes of [{ date: "2026-02-30" }, { mood: 55 }, { customActivity: {} }, { endTime: null }, { revision: 0 }, { updatedAt: "2026-02-30T00:00:00Z" }, { condition: "unknown" }, { extra: true }]) await rejects(() => ActivityBackup.records([original, sample(changes)]));
      await rejects(() => ActivityBackup.records([original, original]));
      await rejects(() => ActivityBackup.records([{ ...original, createdAt: undefined }]));
    });
    await check("追加は同じIDを上書きせずスキップ", async () => {
      await bulk([original]);
      const result = await bulk([{ ...original, mood: 100 }, sample()]);
      assert(result.added.length === 1 && result.skipped === 1 && result.total === 2, "件数");
      assert((await db.list()).find(record => record.id === original.id).mood === 50, "上書きされました");
    });
    await check("不正な1件がある場合は有効な記録も追加しない", async () => {
      const before = await snapshot(); await rejects(() => bulk([sample(), sample({ mood: 101 })])); assert(before === await snapshot(), "一部変更");
    });
    await check("進行中の競合を拒否し、保存領域を維持", async () => {
      const active = sample({ status: "active", endDate: null, endTime: null }); await bulk([active]);
      const before = await snapshot(); await rejects(() => bulk([sample({ status: "active", endDate: null, endTime: null })])); assert(before === await snapshot(), "競合後の変更");
    });
    await check("確認後の変更は古いスナップショットで置換・削除できない", async () => {
      const before = await snapshot(); await bulk([sample()]); const after = await snapshot();
      await rejects(() => db.bulk([], "replace", before)); await rejects(() => db.bulk([], "clear", before)); assert(after === await snapshot(), "古い確認で変更");
    });
    await check("置換は1回で完了し、旧編集の版番号を無効化", async () => {
      const old = (await db.list()).find(record => record.id === original.id);
      await bulk([{ ...original, mood: 80 }], "replace"); const all = await db.list();
      assert(all.length === 1 && all[0].mood === 80 && all[0].revision > old.revision, "置換");
      await rejects(() => db.save({ ...old, mood: 10 }, { expectedRevision: old.revision, allowLong: true }));
    });
    await check("書込途中の失敗はclearも含めてロールバック", async () => {
      const before = await snapshot(), put = IDBObjectStore.prototype.put;
      let calls = 0;
      IDBObjectStore.prototype.put = function(...args) { if (++calls === 2) throw new DOMException("検証用の容量不足", "QuotaExceededError"); return put.apply(this, args); };
      try { await rejects(() => bulk([sample(), sample()], "replace")); } finally { IDBObjectStore.prototype.put = put; }
      assert(before === await snapshot(), "ロールバック失敗");
    });
    await check("専用DBの全削除と空の復元", async () => { await bulk([], "clear"); assert((await db.list()).length === 0, "削除"); await bulk([], "replace"); });
    await check("バックアップのファイル本文をBlobから再読込", async () => {
      const blob = new Blob([ActivityBackup.stringify([original])], { type: "application/json" });
      assert(ActivityBackup.parse(await blob.text()).records[0].id === original.id, "ファイル本文");
    });
    // 下の操作画面も、テスト専用DBだけを使う。
    await bulk([original]);
    ActivityDB.create = () => db;
    const script = document.createElement("script"); script.src = "../scripts/backup-ui.js";
    await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; document.body.append(script); });
    const get = id => document.getElementById(id);
    async function idle() {
      for (let i = 0; i < 200 && get("backup-controls").disabled; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert(!get("backup-controls").disabled, "UI処理のタイムアウト");
    }
    async function click(id) { get(id).click(); await idle(); }
    function file(text) {
      const transfer = new DataTransfer(); transfer.items.add(new File([text], "test.json", { type: "application/json" })); get("backup-file").files = transfer.files;
    }
    await check("UI：保存リンクのJSON本文を読み戻す", async () => {
      await click("backup-export");
      assert(!get("backup-download").hidden && get("backup-download").download.endsWith(".json"), "保存リンク");
      const text = await (await fetch(get("backup-download").href)).text();
      assert(ActivityBackup.parse(text).records.length === 1, "保存ファイルの件数");
    });
    await check("UI：不正ファイルは確認画面を開かず保存を維持", async () => {
      const before = await snapshot(); file("不正なJSON"); await click("backup-review");
      assert(!get("backup-dialog").open && before === await snapshot(), "不正ファイル");
    });
    const incoming = sample({ activity: "その他", customActivity: "<b>文字として表示</b>" });
    await check("UI：追加の事前件数・安全な文字表示・重複スキップ", async () => {
      file(ActivityBackup.stringify([original, incoming])); await click("backup-review");
      assert(get("backup-summary").textContent.includes("追加 1件") && get("backup-summary").textContent.includes("スキップ 1件"), "事前件数");
      assert(!get("backup-records").querySelector("b"), "HTMLとして解釈");
      await click("backup-confirm"); assert((await db.list()).length === 2, "追加完了");
    });
    await check("UI：置換の最終確認でキャンセルすると記録を維持", async () => {
      get("backup-mode").value = "replace"; file(ActivityBackup.stringify([incoming])); const before = await snapshot();
      await click("backup-review"); await click("backup-confirm");
      assert(get("backup-dialog").open && before === await snapshot(), "1段階で変更されました");
      await click("backup-cancel"); assert(before === await snapshot(), "キャンセル後の変更");
    });
    await check("UI：置換は2回の確認後に完了", async () => {
      await click("backup-review"); await click("backup-confirm"); await click("backup-confirm");
      const all = await db.list(); assert(all.length === 1 && all[0].id === incoming.id, "置換完了");
    });
    await check("UI：全削除のキャンセルと2段階後の完了", async () => {
      const before = await snapshot(); await click("backup-clear"); await click("backup-confirm");
      assert(before === await snapshot(), "1段階で削除");
      await click("backup-cancel"); assert(before === await snapshot(), "キャンセル後の変更");
      await click("backup-clear"); await click("backup-confirm"); await click("backup-confirm");
      assert((await db.list()).length === 0 && !get("backup-dialog").open, "全削除完了");
    });
    await bulk([original]);
    get("backup-file").value = ""; get("backup-mode").value = "append"; get("backup-status").textContent = "架空データ1件を用意しました。自由に操作を確認できます。";
    document.getElementById("result").textContent = `${passed}件すべて成功。下の操作画面は架空データ1件の専用DBです。`;
  } catch (error) { document.getElementById("result").textContent = `FAIL: ${error.stack}`; }
})();

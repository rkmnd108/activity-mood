"use strict";
(async () => {
  const dbName = `activity-mood-test-${crypto.randomUUID()}`;
  const db = ActivityDB.create(dbName);
  let passed = 0;
  function assert(ok, message) { if (!ok) throw new Error(message); }
  async function check(name, action) {
    await action(); passed++;
    const row = document.createElement("li"); row.textContent = `PASS: ${name}`; document.getElementById("checks").append(row);
  }
  async function rejects(action) { let rejected = false; try { await action(); } catch { rejected = true; } assert(rejected, "拒否されるべき操作が成功しました"); }
  function sample(values = {}) { return { id: crypto.randomUUID(), date: "2026-09-01", startTime: "12:00", endDate: "2026-09-01", endTime: "13:00", activity: "その他", customActivity: "保存テスト専用", mood: 50, condition: "normal", status: "completed", ...values }; }
  try {
    await check("23:00〜翌1:00は2時間、日本時間で解釈", () => {
      const span = ActivityTime.interval(sample({ startTime: "23:00", endDate: "2026-09-02", endTime: "01:00" }));
      assert(span.end - span.start === 7200000, "日付またぎ");
      assert(new Date(span.start).toISOString() === "2026-09-01T14:00:00.000Z", "日本時間");
    });
    await check("5:00〜7:00は元データ1件・2時間", () => {
      const span = ActivityTime.interval(sample({ startTime: "05:00", endTime: "07:00" })); assert(span.end - span.start === 7200000, "日界");
    });
    await check("月末・うるう年・年末の翌日", () => {
      assert(ActivityTime.nextDay("2026-09-30") === "2026-10-01", "月末");
      assert(ActivityTime.nextDay("2028-02-28") === "2028-02-29", "うるう年");
      assert(ActivityTime.nextDay("2026-12-31") === "2027-01-01", "年末");
    });
    await check("存在しない日付・同時刻・逆順を拒否", async () => {
      await rejects(() => ActivityTime.timestamp("2026-02-30", "12:00"));
      await rejects(() => db.save(sample({ endTime: "12:00" })));
      await rejects(() => db.save(sample({ endTime: "11:00" })));
    });
    let original;
    await check("保存完了後、別接続でも記録が残る", async () => {
      original = await db.save(sample());
      const read = await ActivityDB.create(dbName).list();
      assert(read.length === 1 && read[0].id === original.id && read[0].revision === 1, "永続化");
    });
    await check("重複は未承認なら拒否、承認済みなら保存", async () => {
      const overlapping = sample({ startTime: "12:30", endTime: "13:30" });
      await rejects(() => db.save(overlapping));
      await db.save(overlapping, { overlapTokens: [ActivityDB.token(original)] });
    });
    await check("隣接する区間は重複扱いしない", () => {
      assert(ActivityTime.overlaps(sample({ startTime: "13:00", endTime: "14:00" }), [original]).length === 0, "隣接");
    });
    await check("18時間以上の保存には承認が必要", async () => {
      const long = sample({ date: "2026-08-01", endDate: "2026-08-02", startTime: "10:00", endTime: "04:00" });
      await rejects(() => db.save(long)); await db.save(long, { allowLong: true });
    });
    let active;
    await check("2接続から同時に開始しても進行中は1件", async () => {
      const values = { date: "2026-09-04", startTime: "10:00", endDate: null, endTime: null, status: "active" };
      const attempts = await Promise.allSettled([db.save(sample(values)), ActivityDB.create(dbName).save(sample(values))]);
      assert(attempts.filter((result) => result.status === "fulfilled").length === 1, "同時開始");
      active = (await db.list()).find((record) => record.status === "active");
    });
    let completed;
    await check("終了処理は同じIDの記録を更新する", async () => {
      const before = (await db.list()).length;
      completed = await db.save({ ...active, endDate: active.date, endTime: "11:00", status: "completed" }, { expectedRevision: active.revision });
      assert((await db.list()).length === before && completed.id === active.id && completed.status === "completed", "終了");
    });
    let edited;
    await check("編集は作成日時を維持し、古い編集で上書きしない", async () => {
      edited = await db.save({ ...completed, mood: 80 }, { expectedRevision: completed.revision });
      assert(edited.createdAt === completed.createdAt && edited.mood === 80, "編集");
      await rejects(() => db.save({ ...completed, mood: 10 }, { expectedRevision: completed.revision }));
      assert((await db.list()).find((record) => record.id === edited.id).mood === 80, "競合時の保護");
    });
    await check("不正な気分・体調・その他を拒否し、既存記録は維持", async () => {
      const before = (await db.list()).length;
      await rejects(() => db.save(sample({ mood: 55 })));
      await rejects(() => db.save(sample({ condition: "unknown" })));
      await rejects(() => db.save(sample({ customActivity: "  " })));
      assert((await db.list()).length === before, "既存記録の維持");
    });
    await check("古い版での削除を拒否し、指定したテスト記録だけ削除", async () => {
      await rejects(() => db.remove(completed));
      const before = await db.list(); await db.remove(edited);
      const after = await db.list();
      assert(after.length === before.length - 1 && !after.some((record) => record.id === edited.id) && after.some((record) => record.id === original.id), "単独削除");
    });
    document.getElementById("result").textContent = `${passed}件すべて成功。テストDB: ${dbName}`;
  } catch (error) { document.getElementById("result").textContent = `FAIL（${passed}件成功後）: ${error.message}`; console.error(error); }
})();

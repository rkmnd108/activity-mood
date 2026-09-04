"use strict";
(async () => {
  const result = document.getElementById("result");
  const db = ActivityDB.create(`activity-mood-phase7-${crypto.randomUUID()}`);
  const original = await db.save({ id: crypto.randomUUID(), date: "2026-09-01", startTime: "12:00", endDate: "2026-09-01", endTime: "13:00", activity: "食事", customActivity: "", mood: 50, condition: "normal", status: "completed" });
  const before = ActivityBackup.snapshot(await db.list());
  function assert(ok, message) { if (!ok) throw new Error(message); }
  function pass(text) { const li = document.createElement("li"); li.textContent = `PASS: ${text}`; document.getElementById("checks").append(li); }
  const scope = new URL("../", location.href).href;
  const prefix = `activity-mood-shell:${scope}:`;
  const registration = await navigator.serviceWorker.register("../service-worker.js", { scope: "../", updateViaCache: "none" });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
  const initial = (await caches.keys()).filter(key => key.startsWith(prefix));
  pass(`準備完了：${initial.join(", ")}`);
  result.textContent = "準備完了。専用サーバーを止めてオフライン検証を実行できます。";
  document.getElementById("offline-check").disabled = false;
  document.getElementById("update-check").disabled = false;
  document.getElementById("offline-check").addEventListener("click", async () => {
    try {
      let offline = false; try { await fetch(`../uncached-probe-${crypto.randomUUID()}`, { cache: "no-store" }); } catch { offline = true; }
      assert(offline, "まだサーバーに接続できます"); pass("キャッシュ対象外の通信は失敗＝サーバー停止中");
      for (const path of ["../", "../index.html", "../print.html?week=2026-08-31", "../scripts/backup-ui.js", "../manifest.webmanifest", "../icons/icon-512.png"]) assert((await fetch(path)).ok, `オフライン取得失敗 ${path}`);
      pass("起動画面・PDF画面・JS・manifest・アイコンをオフラインで取得");
      assert(ActivityBackup.snapshot(await db.list()) === before, "保存データが変化");
      const edited = await db.save({ ...original, mood: 60 }, { expectedRevision: original.revision });
      assert((await db.list())[0].mood === 60, "オフライン編集");
      const backup = ActivityBackup.parse(ActivityBackup.stringify(await db.list()));
      assert(backup.records[0].mood === 60, "バックアップ");
      const printed = ActivityPrint.render(backup.records, "2026-08-31", document.getElementById("print-pages"));
      assert(printed.pages === 1 && printed.records === 1, "PDF描画");
      await db.remove(edited); assert((await db.list()).length === 0, "専用記録の単独削除");
      await db.bulk([original], "append", ActivityBackup.snapshot([]));
      pass("オフラインで読込・編集・JSON・PDF描画・架空記録の単独削除・復元");
      result.textContent = "オフライン検証成功。架空データは復元済みです。";
    } catch (error) { result.textContent = `FAIL: ${error.message}`; }
  });
  document.getElementById("update-check").addEventListener("click", async () => {
    try {
      const saved = ActivityBackup.snapshot(await db.list());
      await registration.update();
      for (let i = 0; i < 200 && !registration.waiting; i++) await new Promise(resolve => setTimeout(resolve, 50));
      assert(registration.waiting, "新版が待機していません");
      assert(ActivityBackup.snapshot(await db.list()) === saved, "待機中のデータ変更");
      pass("新版は待機し、勝手に切り替わらない");
      const changed = new Promise(resolve => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
      registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" }); await changed;
      const keys = (await caches.keys()).filter(key => key.startsWith(prefix));
      assert(keys.length === 1 && !initial.includes(keys[0]), "旧キャッシュの削除");
      assert(ActivityBackup.snapshot(await db.list()) === saved, "更新時のデータ変更");
      pass("新しいキャッシュへ切替・旧画面キャッシュ削除・IndexedDBを維持");
      result.textContent = "更新検証成功。記録は維持されています。";
    } catch (error) { result.textContent = `FAIL: ${error.message}`; }
  });
})().catch(error => { document.getElementById("result").textContent = `FAIL: ${error.message}`; });

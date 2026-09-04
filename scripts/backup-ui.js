"use strict";

(() => {
  const get = id => document.getElementById(id);
  const db = ActivityDB.create();
  const controls = get("backup-controls"), status = get("backup-status");
  const dialog = get("backup-dialog"), confirm = get("backup-confirm");
  let busy = false, pending = null, downloadURL = null, beforeURL = null;
  function download(link, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
    link.href = url; link.download = `activity-mood-backup-${ActivityTime.now().date}.json`; link.hidden = false;
    return url;
  }
  function close() {
    if (busy) return;
    pending = null; dialog.close();
    if (beforeURL) URL.revokeObjectURL(beforeURL);
    beforeURL = null;
  }
  async function run(action) {
    if (busy) return;
    busy = true; controls.disabled = true; confirm.disabled = true; get("backup-cancel").disabled = true;
    try { await action(); }
    catch (error) { status.textContent = error.message || "処理を完了できませんでした。"; pending = null; if (dialog.open) dialog.close(); }
    finally { busy = false; controls.disabled = false; confirm.disabled = false; get("backup-cancel").disabled = false; }
  }
  function checkEditor() {
    if (!document.dispatchEvent(new Event("activity:beforebulk", { cancelable: true }))) throw new Error("記録を編集中、または保存処理中です。記録画面で保存・編集キャンセルをしてから、もう一度確認してください。");
  }
  get("backup-export").addEventListener("click", () => run(async () => {
    const all = await db.list();
    const text = ActivityBackup.stringify(all);
    if (downloadURL) URL.revokeObjectURL(downloadURL);
    downloadURL = download(get("backup-download"), text);
    status.textContent = `${all.length}件のバックアップを準備しました。「JSONファイルを保存」を押してください。準備後に変更した記録を含めるには、再度準備してください。`;
  }));
  async function review(mode) {
    checkEditor();
    let incoming = [], exportedAt = "";
    if (mode !== "clear") {
      const file = get("backup-file").files[0];
      if (!file) throw new Error("復元するJSONファイルを選んでください。");
      if (file.size > 50 * 1024 * 1024) throw new Error("50MBを超えるファイルは読み込めません。");
      const parsed = ActivityBackup.parse(await file.text()); incoming = parsed.records; exportedAt = parsed.exportedAt;
    }
    const current = await db.list();
    const plan = ActivityBackup.plan(current, incoming, mode);
    pending = { incoming, mode, snapshot: ActivityBackup.snapshot(current), plan, final: mode === "append" };
    get("backup-dialog-title").textContent = mode === "clear" ? "全記録削除の確認（1/2）" : mode === "replace" ? "置き換えの確認（1/2）" : "追加する内容の確認";
    get("backup-summary").textContent = `現在 ${current.length}件 → 処理後 ${plan.total}件（進行中 ${plan.active}件）\n${mode === "append" ? `追加 ${plan.added.length}件・同じIDのスキップ ${plan.skipped}件` : mode === "replace" ? `現在の${current.length}件を、ファイルの${incoming.length}件で置き換えます。` : `${current.length}件すべてを削除します。`}${exportedAt ? `\nバックアップ作成日時：${exportedAt}` : ""}`;
    get("backup-warning").textContent = mode === "append" ? "同じIDは内容が違っていても上書きしません。異なるIDの時間重複・長時間記録は保存済みの内容として復元します。" : "進行中も対象です。先に「処理前のJSONを保存」を押し、端末に保存されたことを確認してください。";
    if (beforeURL) URL.revokeObjectURL(beforeURL);
    beforeURL = null; get("backup-before-download").hidden = mode === "append";
    if (mode !== "append") beforeURL = download(get("backup-before-download"), ActivityBackup.stringify(current));
    const list = get("backup-records"); list.replaceChildren();
    const skippedIDs = new Set(current.map(record => record.id));
    incoming.slice(0, 200).forEach(record => {
      const li = document.createElement("li");
      li.textContent = `${mode === "append" && skippedIDs.has(record.id) ? "［スキップ］" : ""}${record.date} ${record.startTime} ～ ${record.status === "active" ? "進行中" : `${record.endDate} ${record.endTime}`}\n${record.activity === "その他" ? record.customActivity : record.activity}・気分 ${record.mood}・体調 ${{ good: "良い", normal: "普通", bad: "悪い" }[record.condition]}`;
      list.append(li);
    });
    if (incoming.length > 200) { const li = document.createElement("li"); li.textContent = `表示は先頭200件です。全${incoming.length}件を検証済みです。`; list.append(li); }
    get("backup-details").hidden = mode === "clear"; get("backup-details").open = false;
    get("backup-final-note").hidden = true;
    confirm.textContent = mode === "append" ? "追加する" : "最終確認へ";
    status.textContent = "確認画面を開きました。まだ記録は変更していません。";
    dialog.showModal(); get("backup-dialog-title").focus();
  }
  get("backup-review").addEventListener("click", () => run(() => review(get("backup-mode").value)));
  get("backup-clear").addEventListener("click", () => run(() => review("clear")));
  get("backup-cancel").addEventListener("click", () => { close(); status.textContent = "キャンセルしました。記録は変更していません。"; });
  dialog.addEventListener("cancel", event => { event.preventDefault(); if (!busy) { close(); status.textContent = "キャンセルしました。記録は変更していません。"; } });
  confirm.addEventListener("click", () => {
    if (!pending || busy) return;
    if (!pending.final) {
      pending.final = true;
      get("backup-dialog-title").textContent = pending.mode === "clear" ? "全記録削除の最終確認（2/2）" : "置き換えの最終確認（2/2）";
      get("backup-final-note").hidden = false;
      confirm.textContent = pending.mode === "clear" ? "全記録を削除する" : "置き換える";
      get("backup-cancel").focus(); return;
    }
    run(async () => {
      checkEditor();
      const action = pending;
      const result = await db.bulk(action.incoming, action.mode, action.snapshot);
      pending = null; dialog.close();
      if (downloadURL) URL.revokeObjectURL(downloadURL);
      downloadURL = null; get("backup-download").hidden = true;
      status.textContent = action.mode === "clear" ? "全記録を削除しました。" : `${action.mode === "replace" ? "置き換え" : "追加"}が完了しました。現在${result.total}件です。${result.skipped ? `同じIDの${result.skipped}件はスキップしました。` : ""}`;
      document.dispatchEvent(new Event("activity:bulkchanged"));
    });
  });
})();

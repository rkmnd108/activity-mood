"use strict";
(async () => {
  let count = 0;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const pass = text => { count++; const li = document.createElement("li"); li.textContent = `PASS: ${text}`; document.getElementById("checks").append(li); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 20));
  async function waitFor(condition) { await pause(); for (let i = 0; i < 250; i++) { if (await condition()) return; await pause(); } throw new Error("画面更新のタイムアウト"); }
  for (const width of [320, 390, 768]) {
    const frame = document.createElement("iframe"); frame.width = width; frame.title = `${width}pxの検証`; frame.src = "phase8-frame.html";
    await new Promise(resolve => { frame.onload = resolve; document.getElementById("frames").append(frame); });
    const win = frame.contentWindow, doc = frame.contentDocument, get = id => doc.getElementById(id);
    await waitFor(() => !get("refresh-records").disabled);
    function fits(name) { assert(doc.documentElement.scrollWidth <= width + 1, `${width}px・${name}が横にはみ出しています`); pass(`${width}px・${name}は横にはみ出さない`); }
    const click = selector => doc.querySelector(selector).click();
    function input(id, value) { get(id).value = value; get(id).dispatchEvent(new win.Event("input", { bubbles: true })); get(id).dispatchEvent(new win.Event("change", { bubbles: true })); }
    fits("記録画面");
    click('[data-record-mode="past"]');
    await waitFor(() => !get("save-record").disabled);
    fits("入力画面");
    click('[data-page="week"]'); await waitFor(() => !get("week-status").textContent.includes("読み込んでいます")); fits("週間画面");
    click('[data-page="output"]'); fits("出力画面");
    get("backup-export").click(); await waitFor(() => !get("backup-controls").disabled && !get("backup-download").hidden);
    const backup = win.ActivityBackup.parse(await (await fetch(get("backup-download").href)).text());
    assert(backup.records.length === 0, "空の専用DBのJSON"); pass(`${width}px・JSON保存リンクの内容`);
    get("backup-clear").closest("details").open = true; get("backup-clear").click(); await waitFor(() => get("backup-dialog").open);
    const bounds = get("backup-dialog").getBoundingClientRect(); assert(bounds.left >= 0 && bounds.right <= width + 1, "確認ダイアログのはみ出し");
    get("backup-confirm").click(); get("backup-cancel").click();
    assert((await win.ActivityDB.create().list()).length === 0, "キャンセル後のデータ"); pass(`${width}px・確認画面の幅と削除キャンセル`);
    click('[data-page="record"]');
  }
  document.getElementById("result").textContent = `${count}件すべて成功。320・390・768pxで検証しました。`;
})().catch(error => { document.getElementById("result").textContent = `FAIL: ${error.stack}`; });

"use strict";
(() => {
  const status = document.getElementById("pwa-status");
  const check = document.getElementById("pwa-check");
  const update = document.getElementById("pwa-update");
  let registration, reloadRequested = false;
  function showState() {
    if (registration?.waiting) {
      status.textContent = "新しい版があります。入力中の記録を保存してから更新してください。他のタブも保存後に再読み込みしてください。";
      update.hidden = false;
    } else if (registration?.active) {
      status.textContent = navigator.onLine ? "オフラインで使う準備ができています。" : "オフラインです。記録・週間表示・PDF・バックアップを使えます。";
      update.hidden = true;
    }
  }
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    status.textContent = "この環境ではオフライン起動を準備できません。HTTPSまたはこのPCのローカルURLで開いてください。";
    check.disabled = true; return;
  }
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadRequested) location.reload(); else showState();
  });
  check.addEventListener("click", async () => {
    check.disabled = true;
    try { await registration.update(); showState(); }
    catch { status.textContent = "更新を確認できませんでした。通信を確認してから再度お試しください。保存済みの記録はそのままです。"; }
    finally { check.disabled = false; }
  });
  update.addEventListener("click", () => {
    if (!registration?.waiting) return;
    if (!document.dispatchEvent(new Event("activity:beforepwaupdate", { cancelable: true }))) {
      status.textContent = "入力中・編集中、または保存中です。先に記録を保存するか、編集をキャンセルしてください。"; return;
    }
    if (document.querySelector("dialog[open]")) { status.textContent = "開いている確認画面を閉じてから更新してください。"; return; }
    reloadRequested = true; update.disabled = true;
    registration.waiting.postMessage({ type: "ACTIVATE_UPDATE" });
  });
  navigator.serviceWorker.register("./service-worker.js", { scope: "./", updateViaCache: "none" }).then(reg => {
    registration = reg; check.disabled = false;
    function watch(worker) {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" || worker.state === "activated") showState();
        if (worker.state === "redundant") status.textContent = "オフライン用の準備に失敗しました。通信を確認して「更新を確認」を押してください。";
      });
    }
    watch(reg.installing);
    reg.addEventListener("updatefound", () => watch(reg.installing));
    showState();
    navigator.serviceWorker.ready.then(showState);
  }).catch(() => { status.textContent = "オフライン用の準備に失敗しました。通信を確認して再読み込みしてください。"; });
  window.addEventListener("online", showState);
  window.addEventListener("offline", showState);
})();

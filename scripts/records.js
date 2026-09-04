"use strict";

// 入力UIと保存操作。DBの書き込み完了後にのみ成功を表示する。
(() => {
  const form = document.getElementById("record-form");
  const heading = document.getElementById("form-heading");
  const modeButtons = document.querySelectorAll("[data-record-mode]");
  const nowFields = document.getElementById("now-fields");
  const pastFields = document.getElementById("past-fields");
  const dateInput = document.getElementById("record-date");
  const startInput = document.getElementById("start-time");
  const endInput = document.getElementById("end-time");
  const customField = document.getElementById("custom-activity-field");
  const customInput = document.getElementById("custom-activity");
  const mood = document.getElementById("mood");
  const moodValue = document.getElementById("mood-value");
  const feedback = document.getElementById("input-feedback");
  let mode = null;
  let pastInitialized = false;
  let editing = null;
  let endDateManual = false;
  let busy = false;
  let savedRecords = [];
  const db = ActivityDB.create();
  const endDateInput = document.getElementById("end-date");
  const endFields = document.getElementById("end-fields");
  const finishEdit = document.getElementById("finish-edit");
  const finishOption = document.getElementById("finish-edit-option");
  const saveButton = document.getElementById("save-record");
  const cancelButton = document.getElementById("cancel-edit");
  const deleteButton = document.getElementById("delete-record");
  const message = document.getElementById("record-message");

  function currentJapanTime() {
    return ActivityTime.now();
  }

  function updateStartPreview() {
    if (mode !== "now" || editing) return;
    const current = currentJapanTime();
    document.getElementById("now-start").textContent = `${current.date.replaceAll("-", "/")}　${current.time}`;
  }

  // 固定の線画のみ。ユーザーの入力値をHTMLとして埋め込みません。
  const activityIcons = [
    ["睡眠", '<path d="M16 3a4 4 0 0 0 5 5 4 4 0 1 1-5-5ZM3 15h18v6M3 12v9M3 18h18M6 15v-3h6v3"/>'],
    ["ベッド", '<path d="M3 6v15M21 11v10M3 17h18M3 10h7v7M10 11h8a3 3 0 0 1 3 3v3"/>'],
    ["食事", '<path d="M5 3v6a2 2 0 0 0 4 0V3M7 3v18M17 3v18M17 3c-5 4-5 9 0 9"/>'],
    ["パソコン", '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>'],
    ["散歩", '<circle cx="14" cy="4" r="2"/><path d="m8 21 3-7 3 3v4M11 14l1-6 3 4h4M12 8l-4 3-3 1"/>'],
    ["入浴", '<path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3ZM5 12V5a2 2 0 0 1 4 0M6 19v2M18 19v2"/>'],
    ["その他", '<circle cx="12" cy="12" r="9"/><path d="M8 12h.1M12 12h.1M16 12h.1"/>'],
  ];
  const conditionIcons = [
    ["good", "良い", '<circle cx="12" cy="12" r="9"/><path d="M6 10q2-4 4 0M14 10q2-4 4 0M7 14q5 7 10 0"/>'],
    ["normal", "普通", '<circle cx="12" cy="12" r="9"/><path d="M8 9v1M16 9v1M8 15h8"/>'],
    ["bad", "悪い", '<circle cx="12" cy="12" r="9"/><path d="m6 9 4 1M14 10l4-1M8 17q4-5 8 0M17 11s-3 3-1 4 3-1 1-4Z"/>'],
  ];

  function addChoice(containerId, name, value, text, drawing) {
    const label = document.createElement("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.required = true;
    const content = document.createElement("span");
    content.className = "choice-content";
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = drawing;
    const caption = document.createElement("span");
    caption.textContent = text;
    content.append(icon, caption);
    label.append(input, content);
    document.getElementById(containerId).append(label);
  }

  activityIcons.forEach(([name, drawing]) => addChoice("activity-choices", "activity", name, name, drawing));
  conditionIcons.forEach(([value, name, drawing]) => addChoice("condition-choices", "condition", value, name, drawing));

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (busy) return;
      if (editing) { message.textContent = "編集中です。変更を保存するか、編集をキャンセルしてください。"; return; }
      if (button.dataset.recordMode === "now" && savedRecords.some((record) => record.status === "active")) {
        message.textContent = "進行中の記録があります。上の記録を終了してから開始してください。";
        return;
      }
      mode = button.dataset.recordMode;
      form.hidden = false;
      modeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      nowFields.hidden = nowFields.disabled = mode !== "now";
      pastFields.hidden = pastFields.disabled = mode !== "past";
      heading.textContent = mode === "now" ? "今から開始" : "あとから記録";
      saveButton.textContent = mode === "now" ? "開始する" : "保存する";
      endFields.hidden = endFields.disabled = false;
      if (mode === "past" && !pastInitialized) {
        const current = currentJapanTime();
        dateInput.value = current.date;
        startInput.value = endInput.value = current.time;
        endDateInput.value = current.date;
        pastInitialized = true;
      }
      updateStartPreview();
      feedback.textContent = "";
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "start" });
    });
  });

  form.addEventListener("change", (event) => {
    if (event.target.name !== "activity") return;
    const isOther = event.target.value === "その他";
    customField.hidden = !isOther;
    customInput.disabled = !isOther;
    customInput.required = isOther;
    customInput.setCustomValidity("");
  });
  function updateMood() {
    const value = Number(mood.value);
    moodValue.value = String(value);
    mood.closest("fieldset").dataset.moodBand = value <= 20 ? "dark-blue" : value <= 40 ? "light-blue" : value === 50 ? "green" : value <= 70 ? "light-orange" : "dark-orange";
  }
  mood.addEventListener("input", updateMood);
  form.addEventListener("input", () => { feedback.textContent = ""; });
  customInput.addEventListener("input", () => customInput.setCustomValidity(""));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!customInput.disabled && !customInput.value.trim()) {
      customInput.setCustomValidity("その他の内容を入力してください。空白だけでは入力できません。");
      customInput.reportValidity();
      return;
    }
    await run(async () => {
      const data = new FormData(form);
      const current = currentJapanTime();
      const active = editing ? editing.status === "active" && !finishEdit.checked : mode === "now";
      const record = {
        id: editing?.id || crypto.randomUUID(),
        date: mode === "now" && !editing ? current.date : dateInput.value,
        startTime: mode === "now" && !editing ? current.time : startInput.value,
        endDate: active ? null : endDateInput.value,
        endTime: active ? null : endInput.value,
        activity: data.get("activity"), customActivity: data.get("activity") === "その他" ? customInput.value.trim() : "",
        mood: Number(mood.value), condition: data.get("condition"), status: active ? "active" : "completed",
      };
      if (!await persist(record, editing?.revision)) return;
      const wasEditing = !!editing;
      resetForm();
      message.textContent = wasEditing ? "変更を保存しました。" : active ? "記録を開始しました。" : "記録を保存しました。";
      await refreshAfterWrite();
    });
  });

  function syncEndDate() {
    if (endDateManual || !dateInput.value) return;
    try { endDateInput.value = endInput.value && startInput.value && endInput.value < startInput.value ? ActivityTime.nextDay(dateInput.value) : dateInput.value; }
    catch { /* 不完全な日付入力は、保存時に検証する。 */ }
  }
  [dateInput, startInput, endInput].forEach((input) => input.addEventListener("input", syncEndDate));
  endDateInput.addEventListener("input", () => { endDateManual = true; });
  finishEdit.addEventListener("change", () => {
    endFields.hidden = endFields.disabled = !finishEdit.checked;
    if (finishEdit.checked && !endDateInput.value) {
      const current = currentJapanTime(); endDateInput.value = current.date; endInput.value = current.time;
    }
  });

  // 画面操作を直列化し、保存中の入力変更や二重押しを防ぐ。
  async function run(action) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll("#record input, #record button")];
    const disabled = controls.map((control) => control.disabled);
    // FormDataの取得を妨げないよう、無効化は次のマイクロタスクで行う。
    const operation = Promise.resolve().then(action);
    try {
      queueMicrotask(() => controls.forEach((control) => { control.disabled = true; }));
      await operation;
    } catch (error) {
      console.error(error);
      message.textContent = error.message || "処理を完了できませんでした。入力内容を確認してください。";
      feedback.textContent = message.textContent;
      document.getElementById("week-status").textContent = `${message.textContent} 表示済みの一覧は最新でない可能性があります。`;
    } finally {
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
      customInput.disabled = form.elements.activity.value !== "その他";
      busy = false;
    }
  }

  async function persist(record, expectedRevision) {
    ActivityDB.validate(record);
    const all = await db.list();
    if (record.status === "active" && all.some((item) => item.id !== record.id && item.status === "active")) throw new Error("進行中の記録があります。現在の記録を終了してから開始してください。");
    const { start, end } = ActivityTime.interval(record);
    const long = record.status === "completed" && end - start >= 18 * 3600000;
    if (long && !window.confirm(`この記録は${((end - start) / 3600000).toFixed(1)}時間続く設定です。時間は正しいですか？`)) return false;
    const overlaps = ActivityTime.overlaps(record, all);
    if (overlaps.length && !window.confirm(`${overlaps.length}件の記録と時間が重なります。重複したまま保存しますか？`)) return false;
    await db.save(record, { expectedRevision, allowLong: long, overlapTokens: overlaps.map(ActivityDB.token) });
    return true;
  }

  function resetForm() {
    form.reset(); form.hidden = true; editing = null; mode = null; pastInitialized = false; endDateManual = false;
    cancelButton.hidden = deleteButton.hidden = finishOption.hidden = true;
    customField.hidden = true; customInput.disabled = true; customInput.required = false; customInput.setCustomValidity("");
    feedback.textContent = "";
    modeButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    updateMood();
  }

  function edit(record) {
    if (busy) return;
    if (!form.hidden && !window.confirm("現在の入力内容を破棄して、この記録を編集しますか？")) return;
    resetForm(); editing = { ...record }; mode = "past"; endDateManual = true;
    form.hidden = false; nowFields.hidden = nowFields.disabled = true; pastFields.hidden = pastFields.disabled = false;
    heading.textContent = "記録を編集"; saveButton.textContent = "変更を保存";
    cancelButton.hidden = deleteButton.hidden = false;
    dateInput.value = record.date; startInput.value = record.startTime;
    endDateInput.value = record.endDate || ""; endInput.value = record.endTime || "";
    finishOption.hidden = record.status !== "active";
    endFields.hidden = endFields.disabled = record.status === "active";
    form.elements.activity.value = record.activity; form.elements.condition.value = record.condition;
    customInput.value = record.customActivity; customField.hidden = customInput.disabled = record.activity !== "その他";
    customInput.required = record.activity === "その他";
    mood.value = record.mood; updateMood();
    if (document.getElementById("record").hidden) document.querySelector('[data-page="record"]').click();
    heading.focus({ preventScroll: true }); heading.scrollIntoView({ block: "start" });
  }

  function recordLabel(record) {
    const activity = record.activity === "その他" ? record.customActivity : record.activity;
    const condition = conditionIcons.find(([value]) => value === record.condition)?.[1] || record.condition;
    const end = record.status === "active" ? "進行中" : `${record.endDate === record.date ? "" : record.endDate + " "}${record.endTime}`;
    return `${record.date}　${record.startTime}〜${end}\n${activity}　気分 ${record.mood}　体調 ${condition}`;
  }

  function makeRecordButton(record, timeLabel = null) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "record-row";
    const time = document.createElement("span");
    time.className = "record-row-time"; time.textContent = timeLabel || recordLabel(record).split("\n")[0];
    const details = document.createElement("span"); details.className = "record-row-details";
    function detail(text, drawing) {
      const group = document.createElement("span"); group.className = "record-detail";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24"); icon.setAttribute("aria-hidden", "true"); icon.innerHTML = drawing || "";
      const caption = document.createElement("span"); caption.textContent = text; group.append(icon, caption); return group;
    }
    const condition = conditionIcons.find(([value]) => value === record.condition);
    const moodText = document.createElement("span"); moodText.className = "record-mood"; moodText.textContent = `気分 ${record.mood}`;
    details.append(detail(record.activity === "その他" ? record.customActivity : record.activity, activityIcons.find(([name]) => name === record.activity)?.[1]), moodText, detail(condition?.[1] || record.condition, condition?.[2]));
    button.append(time, details);
    button.setAttribute("aria-label", `${timeLabel ? timeLabel + "。元の記録：" : ""}${recordLabel(record)} を編集`);
    button.addEventListener("click", () => edit(record));
    return button;
  }

  async function refresh() {
    const all = await db.list();
    savedRecords = all.sort((a, b) => ActivityTime.timestamp(b.date, b.startTime) - ActivityTime.timestamp(a.date, a.startTime));
    const list = document.getElementById("all-record-list");
    const activeContainer = document.getElementById("active-record");
    list.replaceChildren(); activeContainer.replaceChildren();
    const active = savedRecords.filter((record) => record.status === "active");
    document.getElementById("active-section").hidden = active.length === 0;
    active.forEach((record) => {
      activeContainer.append(makeRecordButton(record));
      const finish = document.createElement("button");
      finish.type = "button"; finish.className = "primary-button"; finish.textContent = "終了する";
      finish.addEventListener("click", () => run(async () => {
        if (editing?.id === record.id) throw new Error("この記録を編集中です。変更を保存するか、編集をキャンセルしてから終了してください。");
        const current = currentJapanTime();
        const completed = { ...record, endDate: current.date, endTime: current.time, status: "completed" };
        if (!await persist(completed, record.revision)) return;
        if (editing?.id === record.id) resetForm();
        message.textContent = "記録を終了しました。";
        await refreshAfterWrite();
      }));
      activeContainer.append(finish);
    });
    savedRecords.filter((record) => record.status === "completed").forEach((record) => list.append(makeRecordButton(record)));
    if (!list.childElementCount) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "終了した記録はまだありません。"; list.append(empty);
    }
    renderToday();
    weeklyView.render(savedRecords);
    document.dispatchEvent(new CustomEvent("activity:recordsrendered", { detail: savedRecords }));
  }
  let displayedDay = null;
  function renderToday() {
    const at = Date.now();
    displayedDay = ActivityTime.today(at);
    const list = document.getElementById("record-list");
    document.getElementById("today-period").textContent = `${displayedDay.replaceAll("-", "/")} 6:00 〜 ${ActivityTime.nextDay(displayedDay).replaceAll("-", "/")} 5:59`;
    document.getElementById("today-average").textContent = ActivityWeek.averageText(ActivityTime.dailyAverage(savedRecords, displayedDay));
    const fragment = document.createDocumentFragment();
    savedRecords.forEach((record) => {
      const slice = ActivityTime.daySlice(record, displayedDay, at);
      if (slice) fragment.append(makeRecordButton(record, ActivityWeek.sliceLabel(slice)));
    });
    if (!fragment.childElementCount) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "この日の記録はまだありません。"; fragment.append(empty);
    }
    list.replaceChildren(fragment);
  }
  async function refreshAfterWrite() {
    try { await refresh(); }
    catch (error) { console.error(error); message.textContent += " 保存は完了しましたが、一覧を読み込めませんでした。「一覧を更新」を押してください。"; }
  }
  cancelButton.addEventListener("click", () => {
    if (!busy && window.confirm("編集内容を破棄しますか？保存済みの記録は変更されません。")) resetForm();
  });
  deleteButton.addEventListener("click", () => run(async () => {
    if (!editing || !window.confirm(`この記録を削除しますか？削除すると元に戻せません。\n\n${recordLabel(editing)}`)) return;
    await db.remove(editing); resetForm(); message.textContent = "記録を削除しました。"; await refreshAfterWrite();
  }));
  document.getElementById("refresh-records").addEventListener("click", () => run(refresh));
  document.addEventListener("activity:beforebulk", event => { if (busy || editing) event.preventDefault(); });
  document.addEventListener("activity:beforepwaupdate", event => { if (busy || !form.hidden) event.preventDefault(); });
  document.addEventListener("activity:bulkchanged", () => run(refresh));
  window.addEventListener("focus", () => { if (!busy) run(refresh); });
  document.addEventListener("activity:pagechange", (event) => {
    if (event.detail === "record" || event.detail === "week") run(refresh);
  });
  const weeklyView = ActivityWeek.create(makeRecordButton);
  run(refresh);
  updateMood();
  setInterval(updateStartPreview, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateStartPreview(); });
  setInterval(() => {
    if (!document.hidden && !busy && displayedDay !== null && displayedDay !== ActivityTime.today()) run(refresh);
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !busy) run(refresh); });
})();

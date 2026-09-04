"use strict";

globalThis.ActivityWeek = (() => {
  function days(start) { return Array.from({ length: 7 }, (_, index) => ActivityTime.addDays(start, index)); }
  function averageText(average) {
    return `記録した気分の平均：${average.value === null ? "—" : average.value.toFixed(1)}（対象 ${average.count}件）`;
  }
  function sliceLabel(slice) {
    function clock(at) {
      const japan = new Date(at + 9 * 3600000).toISOString();
      return `${japan.slice(0, 10) === slice.day ? "" : "翌"}${japan.slice(11, 16)}`;
    }
    return `${slice.fromPrevious ? "前日から継続 · " : ""}${clock(slice.start)}〜${clock(slice.end)}${slice.active ? "（進行中・表示時点まで）" : ""}${slice.toNext ? " · 翌日へ継続" : ""}`;
  }
  function create(makeRecordButton) {
    let start = ActivityTime.weekStart(ActivityTime.today());
    let followCurrentWeek = true;
    let records = null;
    const container = document.getElementById("week-days");
    const rangeLabel = document.getElementById("week-range");
    const status = document.getElementById("week-status");
    const previous = document.getElementById("previous-week");
    const next = document.getElementById("next-week");
    const headingFormat = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "long" });
    function render(all = records) {
      records = all;
      const today = ActivityTime.today();
      if (followCurrentWeek) start = ActivityTime.weekStart(today);
      const weekDays = days(start);
      rangeLabel.textContent = `${start.replaceAll("-", "/")} 〜 ${weekDays[6].replaceAll("-", "/")}`;
      rangeLabel.dataset.start = start;
      previous.disabled = start <= "1000-01-06";
      next.disabled = start >= "9999-12-20";
      if (records === null) return;
      const fragment = document.createDocumentFragment();
      const at = Date.now();
      weekDays.forEach((day) => {
        const section = document.createElement("section"); section.className = "week-day";
        const title = document.createElement("h3"); title.id = `week-day-${day}`;
        title.textContent = headingFormat.format(ActivityTime.timestamp(day, "06:00")) + (day === today ? " · 今日" : "");
        section.setAttribute("aria-labelledby", title.id);
        const average = document.createElement("p"); average.className = "day-average"; average.textContent = averageText(ActivityTime.dailyAverage(records, day));
        section.append(title, average);
        const slices = records.map((record) => ActivityTime.daySlice(record, day, at)).filter(Boolean).sort((a, b) => b.start - a.start);
        slices.forEach((slice) => section.append(makeRecordButton(slice.record, sliceLabel(slice))));
        if (!slices.length) {
          const empty = document.createElement("p"); empty.className = "field-help"; empty.textContent = "記録はありません。"; section.append(empty);
        }
        fragment.append(section);
      });
      container.replaceChildren(fragment);
      status.textContent = "";
    }
    function move(offset) {
      try { start = ActivityTime.addDays(start, offset); followCurrentWeek = false; render(); }
      catch (error) { status.textContent = error.message; }
    }
    previous.addEventListener("click", () => move(-7));
    next.addEventListener("click", () => move(7));
    render();
    return { render };
  }
  return { days, averageText, sliceLabel, create };
})();

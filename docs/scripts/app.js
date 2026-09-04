"use strict";

const dateDisplay = document.querySelector("#current-date");
const timeDisplay = document.querySelector("#current-time");
const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short",
});
const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function updateClock() {
  const now = new Date();
  dateDisplay.textContent = dateFormat.format(now);
  timeDisplay.textContent = timeFormat.format(now);
  timeDisplay.dateTime = now.toISOString();
  const greeting = document.getElementById("greeting");
  if (greeting) {
    const hour = Number(timeFormat.format(now).split(":")[0]);
    greeting.textContent = hour >= 5 && hour < 11 ? "おはよう" : hour >= 11 && hour < 18 ? "こんにちは" : "こんばんは";
  }
}

const navigation = document.querySelectorAll("[data-page]");
const pages = ["record", "week", "output"].map((id) => document.getElementById(id));
navigation.forEach((button) => {
  button.addEventListener("click", () => {
    document.body.dataset.currentPage = button.dataset.page;
    pages.forEach((page) => { page.hidden = page.id !== button.dataset.page; });
    navigation.forEach((item) => {
      if (item === button) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("activity:pagechange", { detail: button.dataset.page }));
  });
});

updateClock();
setInterval(updateClock, 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateClock();
});

// アプリ専用の可視化。日付・平均の計算には既存関数を使い、PDFとは独立させる。
(() => {
  const chart = document.getElementById("weekly-chart");
  if (!chart) return;
  let records = [];
  function element(tag, attributes, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function render() {
    const start = document.getElementById("week-range").dataset.start;
    if (!start) return;
    const days = ActivityWeek.days(start);
    const averages = days.map(day => ActivityTime.dailyAverage(records, day));
    const weekday = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", weekday: "short" });
    const labels = days.map(day => weekday.format(ActivityTime.timestamp(day, "12:00")));
    const root = element("svg", { viewBox: "0 0 360 150", role: "img", "aria-label": averages.map((average, i) => `${labels[i]}曜日 ${average.value === null ? "記録なし" : average.value.toFixed(1)}`).join("、") });
    for (const value of [0, 50, 100]) {
      const y = 118 - value * .9;
      root.append(element("line", { x1: 34, y1: y, x2: 342, y2: y, stroke: "#e7edf3" }));
      root.append(element("text", { x: 26, y: y + 4, fill: "#607086", "font-size": 12, "text-anchor": "end" }, String(value)));
    }
    let previous = null;
    averages.forEach((average, i) => {
      const x = 44 + i * 48;
      root.append(element("text", { x, y: 144, fill: "#607086", "font-size": 13, "text-anchor": "middle" }, labels[i]));
      if (average.value === null) {
        previous = null;
        root.append(element("text", { x, y: 79, fill: "#607086", "font-size": 13, "text-anchor": "middle" }, "—"));
        return;
      }
      const value = average.value, y = 118 - value * .9;
      const fill = value < 25 ? "#82b5ee" : value < 45 ? "#b7daf4" : value < 55 ? "#86cda9" : value < 75 ? "#f4c27b" : "#f5a875";
      if (previous) root.append(element("line", { x1: previous.x, y1: previous.y, x2: x, y2: y, stroke: "#8cbbd9", "stroke-width": 2 }));
      root.append(element("circle", { cx: x, cy: y, r: 5.5, fill, stroke: "#fff", "stroke-width": 1 }));
      root.append(element("text", { x, y: y - 12, fill: "#0f2742", "font-size": 12, "font-weight": 600, "text-anchor": "middle" }, value.toFixed(1)));
      previous = { x, y };
    });
    chart.replaceChildren(root);
    document.querySelectorAll("#week-days .week-day").forEach((section, i) => {
      section.dataset.weekday = String(new Date(`${days[i]}T00:00:00Z`).getUTCDay());
    });
  }
  document.addEventListener("activity:recordsrendered", event => { records = event.detail; render(); });
  // 前週・翌週と6:00の再表示にも追従する。共用のweek.jsは変更しない。
  new MutationObserver(render).observe(document.getElementById("week-days"), { childList: true });
})();

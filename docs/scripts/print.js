"use strict";

globalThis.ActivityPrint = (() => {
  const W = 1148, H = 800, X = 64, Y = 94, DAY = 154, HEIGHT = 576, LABEL = 20;
  const colors = ["#afd2fa", "#d4ecfc", "#d3efdf", "#ffe2b9", "#ffb987"];
  function band(value) { return value < 25 ? 0 : value < 45 ? 1 : value < 55 ? 2 : value < 75 ? 3 : 4; }
  function color(value) { return colors[band(value)]; }
  function minuteY(minutes) { return Y + minutes / 1440 * HEIGHT; }
  function textWidth(text, size = 11) { return [...text].reduce((sum, char) => sum + (/^[\x20-\x7e]$/.test(char) ? .6 : 1) * size, 0); }
  function activity(record) { return record.activity === "その他" ? record.customActivity : record.activity; }
  function layout(records, start) {
    const days = ActivityWeek.days(start);
    const completed = records.filter(record => record.status === "completed");
    const included = completed.filter(record => days.some(day => ActivityTime.daySlice(record, day)));
    const numbers = new Map(included.map((record, i) => [record.id, i + 1]));
    const overflow = new Set();
    const columns = days.map((day, dayIndex) => {
      const range = ActivityTime.dayRange(day);
      const slices = included.map(record => ActivityTime.daySlice(record, day)).filter(Boolean).sort((a, b) => a.start - b.start || a.end - b.end);
      // 重複が連続する区間だけでレーン数を決める。
      let cluster = [], clusterEnd = -Infinity;
      function assignLanes() {
        const lanes = [];
        cluster.forEach(slice => {
          let lane = lanes.findIndex(end => end <= slice.start);
          if (lane < 0) lane = lanes.length;
          lanes[lane] = slice.end; slice.lane = lane;
        });
        cluster.forEach(slice => { slice.laneCount = Math.max(1, lanes.length); });
      }
      slices.forEach(slice => {
        if (slice.start >= clusterEnd) { assignLanes(); cluster = []; clusterEnd = -Infinity; }
        cluster.push(slice); clusterEnd = Math.max(clusterEnd, slice.end);
      });
      assignLanes();
      const occupied = [];
      const items = slices.map(slice => {
        const span = ActivityTime.interval(slice.record);
        const width = (DAY - 8) / slice.laneCount;
        const x = X + dayIndex * DAY + 4 + slice.lane * width;
        const y = minuteY((slice.start - range.start) / 60000);
        const endY = minuteY((slice.end - range.start) / 60000);
        const short = (span.end - span.start) < 30 * 60000;
        const number = numbers.get(slice.record.id);
        const fontSize = short || endY - y < LABEL ? 13 : 14;
        const needed = textWidth(activity(slice.record), fontSize) + 76;
        let labelY = null;
        const inside = endY - y >= LABEL;
        if (needed <= width - 3) {
          const preferred = inside ? y + (endY - y - LABEL) / 2 : Math.max(Y, Math.min(y, Y + HEIGHT - LABEL));
          const positions = [preferred];
          for (let distance = 2; distance <= (inside ? endY - y : 6); distance += 2) positions.push(preferred + distance, preferred - distance);
          for (const top of positions) {
            if (top < Y || top + LABEL > Y + HEIGHT || (inside && (top < y || top + LABEL > endY))) continue;
            const collision = occupied.some(box => x < box.right && x + width > box.left && top < box.bottom + 2 && top + LABEL + 2 > box.top);
            const coversOther = !inside && slices.some(other => other !== slice &&
              x < X + dayIndex * DAY + 4 + (other.lane + 1) * (DAY - 8) / other.laneCount &&
              x + width > X + dayIndex * DAY + 4 + other.lane * (DAY - 8) / other.laneCount &&
              top < minuteY((other.end - range.start) / 60000) &&
              top + LABEL > minuteY((other.start - range.start) / 60000));
            if (!collision && !coversOther) {
              labelY = top; occupied.push({ left: x, right: x + width, top, bottom: top + LABEL }); break;
            }
          }
        }
        if (labelY === null) overflow.add(slice.record.id);
        return { ...slice, x, y, height: endY - y, width: width - Math.min(3, width / 5), short, number, fontSize, inside, labelY };
      });
      return { day, items, average: ActivityTime.dailyAverage(completed, day) };
    });
    const details = included.filter(record => overflow.has(record.id));
    return { start, days, columns, details, numbers, included, activeCount: records.filter(record => record.status === "active").length };
  }

  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function label(parent, x, y, text, size = 11, attrs = {}) {
    parent.append(svg("text", { x, y, "font-size": size, fill: "#183451", ...attrs }, text));
  }
  const icons = {
    "睡眠": '<path d="M16 3a4 4 0 0 0 5 5 4 4 0 1 1-5-5ZM3 15h18v6M3 12v9M3 18h18M6 15v-3h6v3"/>',
    "ベッド": '<path d="M3 6v15M21 11v10M3 17h18M3 10h7v7M10 11h8a3 3 0 0 1 3 3v3"/>',
    "食事": '<path d="M5 3v6a2 2 0 0 0 4 0V3M7 3v18M17 3v18M17 3c-5 4-5 9 0 9"/>',
    "パソコン": '<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
    "散歩": '<circle cx="14" cy="4" r="2"/><path d="m8 21 3-7 3 3v4M11 14l1-6 3 4h4M12 8l-4 3-3 1"/>',
    "入浴": '<path d="M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3ZM5 12V5a2 2 0 0 1 4 0M6 19v2M18 19v2"/>',
    "その他": '<circle cx="12" cy="12" r="9"/><path d="M8 12h.1M12 12h.1M16 12h.1"/>',
    good: '<circle cx="12" cy="12" r="9"/><path d="M6 10q2-4 4 0M14 10q2-4 4 0M7 14q5 7 10 0"/>',
    normal: '<circle cx="12" cy="12" r="9"/><path d="M8 9v1M16 9v1M8 15h8"/>',
    bad: '<circle cx="12" cy="12" r="9"/><path d="m6 9 4 1M14 10l4-1M8 17q4-5 8 0M17 11s-3 3-1 4 3-1 1-4Z"/>',
  };
  function icon(parent, key, x, y, size = 13) {
    const group = svg("g", { transform: `translate(${x} ${y}) scale(${size / 24})`, fill: "none", stroke: "#183451", "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round" });
    group.innerHTML = icons[key] || icons["その他"];
    parent.append(group);
  }
  function sheet(container, title) {
    const section = document.createElement("section"); section.className = "print-sheet";
    const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": title });
    root.append(svg("title", {}, title)); section.append(root); container.append(section); return root;
  }
  function dateLabel(day) { const [, month, date] = day.split("-"); return `${Number(month)}/${Number(date)}`; }
  function weekdayLabel(day) { return ["日", "月", "火", "水", "木", "金", "土"][new Date(`${day}T00:00:00Z`).getUTCDay()]; }
  function head(root, plan, subtitle = "") {
    const [year, month, date] = plan.days[0].split("-");
    const [endYear, endMonth, endDate] = plan.days[6].split("-");
    label(root, 6, 35, "行動・気分記録", 27, { "font-weight": 700 });
    const period = `${year}年${Number(month)}月${Number(date)}日（${weekdayLabel(plan.days[0])}）～ ${endYear !== year ? endYear + "年" : ""}${Number(endMonth)}月${Number(endDate)}日（${weekdayLabel(plan.days[6])}）`;
    label(root, 217, 33, period, 15, { "font-weight": 500 });
    if (subtitle) label(root, 6, 73, subtitle.trim(), 18, { "font-weight": 600 });
  }
  function overview(container, plan) {
    const root = sheet(container, "行動・気分記録 週間タイムラインと1日の平均気分");
    head(root, plan);
    [580, 948].forEach(x => root.append(svg("line", { x1: x, y1: 8, x2: x, y2: 48, stroke: "#e0e6ed" })));
    label(root, 596, 18, "気分の色", 13, { "font-weight": 700 });
    ["0〜20", "30〜40", "50", "60〜70", "80〜100"].forEach((text, i) => {
      const x = 603 + i * 69;
      root.append(svg("circle", { cx: x, cy: 38, r: 7.5, fill: colors[i] }));
      label(root, x + 12, 42, text, 11);
    });
    label(root, 964, 18, "体調", 13, { "font-weight": 700 });
    [["good", "良い"], ["normal", "普通"], ["bad", "悪い"]].forEach(([key, name], i) => {
      icon(root, key, 962 + i * 61, 27, 22); label(root, 987 + i * 61, 42, name, 11);
    });
    const weekdays = ["金", "土", "日", "月", "火", "水", "木"];
    plan.columns.forEach((column, i) => {
      const x = X + i * DAY;
      root.append(svg("rect", { x, y: 59, width: DAY, height: 29, rx: 5, fill: i === 1 ? "#eaf5fc" : i === 2 ? "#fdf0f4" : "#f3f5f7" }));
      label(root, x + DAY / 2, 79, `${dateLabel(column.day)}（${weekdays[i]}）`, 17, { "text-anchor": "middle", "font-weight": 700 });
      root.append(svg("line", { x1: x, y1: 59, x2: x, y2: Y + HEIGHT, stroke: "#e2e7ed", "stroke-width": .8 }));
    });
    for (let hour = 0; hour <= 24; hour++) {
      const y = minuteY(hour * 60);
      if (hour < 24) {
        root.append(svg("rect", { x: 6, y: y - 9, width: 49, height: 18, rx: 6, fill: "#f1f3f6" }));
        label(root, 30.5, y + 5, `${(hour + 6) % 24}:00`, 13, { "text-anchor": "middle" });
      }
      root.append(svg("line", { x1: X, y1: y, x2: X + DAY * 7, y2: y, stroke: hour === 18 ? "#bbc8d6" : "#e3e9ef", "stroke-width": hour === 18 ? 1 : .6, "stroke-dasharray": hour === 18 ? "none" : "2 3" }));
    }
    plan.columns.forEach(column => column.items.forEach(item => {
      root.append(svg("rect", { x: item.x, y: item.y, width: item.width, height: item.height, rx: Math.min(6, item.height / 2), fill: color(item.record.mood), stroke: "white", "stroke-width": Math.min(2, item.height / 3), "data-record-block": item.record.id }));
    }));
    plan.columns.forEach(column => column.items.forEach(item => {
      if (item.labelY === null) {
        if (item.width >= 22 && item.height >= 12) label(root, item.x + 3, item.y + 10, `#${item.number}`, 10);
        return;
      }
      const group = svg("g", { "data-record-label": item.record.id }); root.append(group);
      const top = item.labelY;
      if (!item.inside) {
        group.append(svg("rect", { x: item.x, y: top, width: item.width, height: LABEL, rx: 5, fill: color(item.record.mood), "fill-opacity": .96, stroke: "white", "stroke-width": 2 }));
        group.append(svg("line", { x1: item.x - 2, y1: item.y, x2: item.x + 4, y2: item.y, stroke: "#597b98", "stroke-width": 1 }));
      }
      let x = item.x + 7;
      icon(group, item.record.activity, x, top, 20); x += 26;
      // 同じテキスト内で続けて描き、フォントの実際の文字幅に追従する。
      const text = svg("text", { x, y: top + 15, "font-size": item.fontSize, fill: "#183451", "font-weight": 600 }, activity(item.record));
      text.append(svg("tspan", { dx: 4, "font-weight": 500 }, String(item.record.mood)));
      group.append(text);
      icon(group, item.record.condition, item.x + item.width - 26, top, 20);
    }));
    label(root, 6, 693, "1日の平均気分", 16, { "font-weight": 700 });
    const graphTop = 713, graphHeight = 56;
    [0, 20, 40, 60, 80, 100].forEach(value => {
      const y = graphTop + (100 - value) / 100 * graphHeight;
      label(root, X - 12, y + 3, String(value), 10, { "text-anchor": "end" });
      root.append(svg("line", { x1: X, y1: y, x2: X + DAY * 7, y2: y, stroke: "#dce5ee", "stroke-width": .6, "stroke-dasharray": "2 3" }));
    });
    let previous = null;
    plan.columns.forEach((column, i) => {
      const x = X + i * DAY + DAY / 2, value = column.average.value;
      label(root, x, 788, `${dateLabel(column.day)}（${weekdays[i]}）`, 12, { "text-anchor": "middle" });
      if (value === null) { previous = null; return; }
      const y = graphTop + (100 - value) / 100 * graphHeight;
      if (previous) root.append(svg("line", { x1: previous.x, y1: previous.y, x2: x, y2: y, stroke: "#8daec6", "stroke-width": 1.5 }));
      root.append(svg("circle", { cx: x, cy: y, r: 5, fill: color(value), stroke: "#7b99ae", "stroke-width": .6 }));
      label(root, x, y - 9, value.toFixed(1), 13, { "text-anchor": "middle", "font-weight": 600, stroke: "white", "stroke-width": 3, "paint-order": "stroke" });
      previous = { x, y };
    });
    return root;
  }
  function wrap(text, width, size) {
    const lines = []; let line = "";
    for (const char of String(text)) {
      if (char === "\n" || textWidth(line + char, size) > width) { lines.push(line); line = char === "\n" ? "" : char; }
      else line += char;
    }
    lines.push(line); return lines;
  }
  function render(records, start, container) {
    const plan = layout(records, start);
    const fragment = document.createDocumentFragment();
    const pages = [overview(fragment, plan)];
    let root, y;
    function nextPage() {
      root = sheet(fragment, "行動・気分記録 詳細"); pages.push(root); head(root, plan, "　詳細");
      y = 108;
    }
    plan.details.forEach(record => {
      const lines = wrap(activity(record), 660, 12);
      const condition = { good: "良い", normal: "普通", bad: "悪い" }[record.condition];
      let offset = 0;
      while (offset < lines.length) {
        if (!root || y > 650) nextPage();
        const take = Math.max(1, Math.min(lines.length - offset, Math.floor((690 - y - 42) / 18)));
        label(root, 12, y, `#${plan.numbers.get(record.id)}${offset ? " 続き" : ""}　${record.date} ${record.startTime} - ${record.endDate} ${record.endTime}`, 12);
        const contentY = y + 24;
        icon(root, record.activity, 16, contentY - 13, 16);
        for (let n = 0; n < take; n++) label(root, 42, contentY + n * 18, lines[offset + n], 12);
        label(root, 780, contentY, `気分 ${record.mood}`, 12); icon(root, record.condition, 886, contentY - 13, 16); label(root, 910, contentY, `体調 ${condition}`, 12);
        y = contentY + take * 18 + 16;
        root.append(svg("line", { x1: 12, y1: y - 5, x2: 1096, y2: y - 5, stroke: "#dce2e6" })); offset += take;
      }
    });
    if (pages.length > 1) pages.forEach((page, i) => label(page, 1138, 799, `${i + 1} / ${pages.length}`, 10, { "text-anchor": "end" }));
    container.replaceChildren(fragment);
    return { pages: pages.length, records: plan.included.length, activeCount: plan.activeCount };
  }
  return { band, color, minuteY, layout, render, wrap };
})();

if (typeof document !== "undefined" && document.body.hasAttribute("data-print-app")) {
  (async () => {
    const status = document.getElementById("print-status");
    const button = document.getElementById("print-action");
    try {
      const date = new URLSearchParams(location.search).get("week") || ActivityTime.today();
      const start = ActivityTime.weekStart(date);
      const records = await ActivityDB.create().list();
      const result = ActivityPrint.render(records, start, document.getElementById("print-pages"));
      document.title = `行動気分記録_${start}_${ActivityTime.addDays(start, 6)}`;
      status.textContent = `終了済み ${result.records}件・${result.pages}ページ。表示を確認してからPDFに保存してください。${result.activeCount ? "進行中は出力対象外です。" : ""}`;
      button.disabled = false;
      button.addEventListener("click", () => window.print());
    } catch (error) { console.error(error); status.textContent = `印刷用画面を作成できませんでした。${error.message}`; }
  })();
}

if (typeof document !== "undefined" && document.getElementById("print-week-date")) {
  const input = document.getElementById("print-week-date");
  const link = document.getElementById("print-link");
  const range = document.getElementById("print-week-range");
  function updatePrintLink() {
    try {
      const start = ActivityTime.weekStart(input.value);
      const end = ActivityTime.addDays(start, 6);
      range.textContent = `${start} - ${end}（金曜〜木曜）`;
      link.href = `./print.html?week=${encodeURIComponent(start)}`;
      link.removeAttribute("aria-disabled");
    } catch {
      range.textContent = "出力する週の日付を選んでください。"; link.removeAttribute("href"); link.setAttribute("aria-disabled", "true");
    }
  }
  input.value = ActivityTime.today(); updatePrintLink();
  input.addEventListener("input", updatePrintLink);
  link.addEventListener("click", event => { if (!input.reportValidity() || !link.hasAttribute("href")) event.preventDefault(); });
  document.addEventListener("activity:pagechange", event => {
    if (event.detail === "output") { input.value = document.getElementById("week-range").dataset.start || ActivityTime.today(); updatePrintLink(); }
  });
}

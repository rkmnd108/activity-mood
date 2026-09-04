"use strict";
const samples = [];
let number = 0;
const sampleWeek = ActivityTime.weekStart("2026-09-04");
function add(date, startTime, endTime, activity, mood, condition = "normal", endDate = date, customActivity = "") {
  samples.push({ id: `sample-${++number}`, date, startTime, endDate, endTime, activity, customActivity, mood, condition, status: "completed" });
}
add(ActivityTime.addDays(sampleWeek, -1), "23:00", "08:00", "睡眠", 30, "normal", sampleWeek);
ActivityWeek.days(sampleWeek).forEach((day, i) => {
  if (i === 2) return; // 欠測日を挟んで線が途切れることを確認。
  add(day, "08:00", "08:10", "食事", 40 + i * 10);
  add(day, "09:00", "11:30", "パソコン", 50);
  add(day, "12:00", "12:20", "食事", 60);
  add(day, "14:00", "14:45", "散歩", 80, "good");
  add(day, "18:00", "18:40", "入浴", 70, "good");
  add(day, "23:00", "08:00", "睡眠", 20, "bad", ActivityTime.nextDay(day));
});
if (new URLSearchParams(location.search).has("dense")) {
  const denseDay = ActivityTime.addDays(sampleWeek, 3);
  for (let i = 0; i < 22; i++) add(denseDay, "12:00", "12:10", "その他", 40, "normal", denseDay, `密集した記録${i + 1}`);
  add(denseDay, "15:00", "17:00", "その他", 30, "bad", denseDay, "長い名称の折り返し確認。".repeat(50));
}
if (new URLSearchParams(location.search).has("boundaries")) {
  samples.length = 0;
  const [friday, saturday, sunday, monday, tuesday, wednesday, thursday] = ActivityWeek.days(sampleWeek);
  add(friday, "13:10", "15:40", "パソコン", 50, "good");
  add(friday, "23:30", "08:00", "睡眠", 30, "bad", saturday);
  add(saturday, "12:10", "12:20", "食事", 60);
  add(sunday, "23:10", "01:10", "ベッド", 40, "normal", monday);
  add(monday, "05:40", "06:20", "睡眠", 20, "bad");
  add(tuesday, "10:00", "11:00", "食事", 0);
  add(thursday, "10:00", "11:00", "散歩", 100, "good");
}
const result = ActivityPrint.render(samples, sampleWeek, document.getElementById("print-pages"));
document.getElementById("sample-status").textContent = `${result.records}件 / ${result.pages}ページ。DBへの読み書きはありません。`;

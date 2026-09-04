const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/date-time.js');
require('../scripts/week.js');
const time = ActivityTime;
function record(changes = {}) {
  return { id: 'example', date: '2026-09-04', startTime: '12:00', endDate: '2026-09-04', endTime: '13:00', status: 'completed', mood: 50, ...changes };
}
test('0:00と5:59は前日、6:00は当日', () => {
  assert.equal(time.dayKey('2026-09-04', '00:00'), '2026-09-03');
  assert.equal(time.dayKey('2026-09-04', '05:59'), '2026-09-03');
  assert.equal(time.dayKey('2026-09-04', '06:00'), '2026-09-04');
});
test('現在の所属日も日本時間の6:00で切り替わる', () => {
  assert.equal(time.today(Date.parse('2026-09-03T20:59:59Z')), '2026-09-03');
  assert.equal(time.today(Date.parse('2026-09-03T21:00:00Z')), '2026-09-04');
});
test('月末・年末・うるう年の深夜は前のカレンダー日へ', () => {
  assert.equal(time.dayKey('2026-10-01', '01:00'), '2026-09-30');
  assert.equal(time.dayKey('2027-01-01', '05:59'), '2026-12-31');
  assert.equal(time.dayKey('2028-03-01', '05:00'), '2028-02-29');
});
test('週は金曜始まり、金曜未明は前週', () => {
  assert.equal(time.weekStart('2026-09-04'), '2026-09-04');
  assert.equal(time.weekStart(time.dayKey('2026-09-04', '05:59')), '2026-08-28');
  assert.equal(time.weekStart(time.dayKey('2026-09-04', '06:00')), '2026-09-04');
  assert.deepEqual(ActivityWeek.days('2026-12-25'), ['2026-12-25','2026-12-26','2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31']);
});
test('23:00〜翌1:00は同じ所属日で2時間、0:00で分けない', () => {
  const item = record({ startTime: '23:00', endDate: '2026-09-05', endTime: '01:00' });
  const slice = time.daySlice(item, '2026-09-04');
  assert.equal(slice.end - slice.start, 2 * 3600000);
  assert.equal(time.daySlice(item, '2026-09-05'), null);
  assert.equal(ActivityWeek.sliceLabel(slice), '23:00〜翌01:00');
});
test('5:00〜7:00は前日と当日に1時間ずつ、元データを変更しない', () => {
  const item = Object.freeze(record({ startTime: '05:00', endTime: '07:00' }));
  const before = time.daySlice(item, '2026-09-03');
  const after = time.daySlice(item, '2026-09-04');
  assert.equal(before.end - before.start, 3600000);
  assert.equal(after.end - after.start, 3600000);
  assert.equal(before.end, after.start);
  assert.equal(before.toNext, true); assert.equal(after.fromPrevious, true);
  assert.equal(before.record, item); assert.equal(after.record, item);
  assert.equal(ActivityWeek.sliceLabel(before), '翌05:00〜翌06:00 · 翌日へ継続');
});
test('終了が6:00ちょうどなら次の日に空の記録を作らない', () => {
  const item = record({ startTime: '05:00', endTime: '06:00' });
  assert.equal(time.daySlice(item, '2026-09-04'), null);
  assert.equal(time.daySlice(item, '2026-09-03').toNext, false);
});
test('24時間以上の記録も欠落なく分割し、合計時間を保存', () => {
  const item = record({ date: '2026-09-03', startTime: '23:00', endDate: '2026-09-06', endTime: '08:00' });
  const slices = ActivityWeek.days('2026-08-31').map(day => time.daySlice(item, day)).filter(Boolean);
  assert.equal(slices.length, 4);
  assert.equal(slices.reduce((total, slice) => total + slice.end - slice.start, 0), 57 * 3600000);
});
test('平均は算術平均で時間の長さに影響されない', () => {
  const items = [record({ id: 'long', startTime: '06:00', endTime: '18:00', mood: 20 }), record({ id: 'short', startTime: '19:00', endTime: '19:10', mood: 80 })];
  assert.deepEqual(time.dailyAverage(items, '2026-09-04'), { count: 2, value: 50 });
});
test('日界をまたぐ記録の平均は開始所属日に1回だけ', () => {
  const items = [record({ startTime: '05:00', endTime: '07:00', mood: 30 })];
  assert.deepEqual(time.dailyAverage(items, '2026-09-03'), { count: 1, value: 30 });
  assert.deepEqual(time.dailyAverage(items, '2026-09-04'), { count: 0, value: null });
});
test('進行中は平均から除外、終了すると開始所属日の平均に追加', () => {
  const active = record({ startTime: '05:00', status: 'active', endDate: null, endTime: null });
  assert.equal(time.dailyAverage([active], '2026-09-03').value, null);
  assert.equal(time.dailyAverage([{ ...active, status: 'completed', endDate: '2026-09-04', endTime: '07:00' }], '2026-09-03').value, 50);
});
test('平均0は欠測扱いせず、小数第1位まで表示する', () => {
  assert.equal(ActivityWeek.averageText(time.dailyAverage([record({ mood: 0 })], '2026-09-04')), '記録した気分の平均：0.0（対象 1件）');
  assert.equal(ActivityWeek.averageText(time.dailyAverage([record({ mood: 20 }), record({ mood: 20 }), record({ mood: 30 })], '2026-09-04')), '記録した気分の平均：23.3（対象 3件）');
  assert.equal(ActivityWeek.averageText(time.dailyAverage([], '2026-09-04')), '記録した気分の平均：—（対象 0件）');
});
test('編集で所属日・平均が更新され、削除後は欠測に戻る', () => {
  const old = record({ startTime: '05:00', mood: 20 });
  const edited = { ...old, startTime: '06:00', mood: 80 };
  assert.equal(time.dailyAverage([edited], '2026-09-03').value, null);
  assert.equal(time.dailyAverage([edited], '2026-09-04').value, 80);
  assert.equal(time.dailyAverage([], '2026-09-04').value, null);
});
test('進行中の表示は現在までで、未来の日には現れない', () => {
  const item = record({ startTime: '05:00', endDate: null, endTime: null, status: 'active' });
  const at = time.timestamp('2026-09-04', '07:00');
  assert.equal(time.daySlice(item, '2026-09-04', at).end, at);
  assert.equal(time.daySlice(item, '2026-09-05', at), null);
});
test('進行中は6:00ちょうどにも新しい日の一覧に現れる', () => {
  const item = record({ startTime: '05:00', endDate: null, endTime: null, status: 'active' });
  const at = time.timestamp('2026-09-04', '06:00');
  assert.ok(time.daySlice(item, '2026-09-04', at));
  assert.equal(time.daySlice(item, '2026-09-03', at).toNext, true);
});

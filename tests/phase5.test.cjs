const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../scripts/date-time.js'); require('../scripts/week.js'); require('../scripts/print.js');
function item(changes = {}) { return { id: 'one', date: '2026-09-04', startTime: '12:00', endDate: '2026-09-04', endTime: '13:00', activity: '散歩', mood: 50, condition: 'normal', status: 'completed', ...changes }; }
test('座標は実時間に比例し、24時間は576単位', () => {
  assert.equal(ActivityPrint.minuteY(1440) - ActivityPrint.minuteY(0), 576);
  assert.ok(Math.abs(ActivityPrint.minuteY(120) - ActivityPrint.minuteY(0) - 576 / 12) < 1e-9);
});
test('PDFの週は金曜から木曜までを同じ週として出力する', () => {
  const start = ActivityTime.weekStart('2026-09-10');
  const plan = ActivityPrint.layout([item()], start);
  assert.equal(start, '2026-09-04');
  assert.deepEqual(plan.days, ['2026-09-04','2026-09-05','2026-09-06','2026-09-07','2026-09-08','2026-09-09','2026-09-10']);
  assert.equal(plan.columns[0].items.length, 1);
});
test('30分未満だけを短時間として扱う', () => {
  const a = ActivityPrint.layout([item({ endTime: '12:29' })], '2026-08-31').columns[4].items[0];
  const b = ActivityPrint.layout([item({ endTime: '12:30' })], '2026-08-31').columns[4].items[0];
  assert.equal(a.short, true); assert.equal(b.short, false); assert.ok(Math.abs(b.height - 576 / 48) < 1e-9);
});
test('日界またぎは2区間に分けても元の記録は1件', () => {
  const record = Object.freeze(item({ startTime: '05:00', endTime: '07:00' }));
  const plan = ActivityPrint.layout([record], '2026-08-31');
  assert.equal(plan.included.length, 1);
  assert.ok(Math.abs(plan.columns[3].items[0].height + plan.columns[4].items[0].height - 576 / 12) < 1e-9);
  assert.equal(plan.columns[3].average.value, 50); assert.equal(plan.columns[4].average.value, null);
});
test('重複は横の列を分け、縦の位置と高さを変えない', () => {
  const plan = ActivityPrint.layout([item(), item({ id: 'two' })], '2026-08-31');
  const [a, b] = plan.columns[4].items; assert.equal(a.y, b.y); assert.equal(a.height, b.height); assert.notEqual(a.x, b.x);
});
test('密集して読めない記録は詳細へ、ラベル同士を重ねない', () => {
  const records = Array.from({ length: 30 }, (_, i) => item({ id: String(i), endTime: '12:01' }));
  const plan = ActivityPrint.layout(records, '2026-08-31');
  assert.equal(plan.details.length, 30); assert.equal(plan.columns[4].items.every(value => value.labelY === null), true);
});
test('進行中をPDFと平均から除外し、欠測を0にしない', () => {
  const plan = ActivityPrint.layout([item({ status: 'active', endDate: null, endTime: null })], '2026-08-31');
  assert.equal(plan.included.length, 0); assert.equal(plan.activeCount, 1); assert.equal(plan.columns[4].average.value, null);
});
test('平均の色境界は25、45、55、75', () => {
  assert.deepEqual([0,24.9,25,44.9,45,54.9,55,74.9,75,100].map(ActivityPrint.band), [0,0,1,1,2,2,3,3,4,4]);
});
test('長い日本語は省略せず折り返す', () => {
  const text = '日本語の長い行動名'.repeat(30); const lines = ActivityPrint.wrap(text, 660, 12);
  assert.equal(lines.join(''), text); assert.ok(lines.length > 1);
});
test('100件の重複でも幅は正数で詳細へ退避する', () => {
  const plan = ActivityPrint.layout(Array.from({ length: 100 }, (_, i) => item({ id: String(i) })), '2026-08-31');
  assert.ok(plan.columns[4].items.every(value => value.width > 0)); assert.equal(plan.details.length, 100);
});

test('一部の時間帯の重複は、その日の別時間帯を細くしない', () => {
  const plan = ActivityPrint.layout([item(), item({ id: 'two' }), item({ id: 'later', startTime: '15:00', endTime: '16:00' })], '2026-08-31');
  const [a, b, later] = plan.columns[4].items;
  assert.equal(a.laneCount, 2); assert.equal(b.laneCount, 2);
  assert.equal(later.laneCount, 1); assert.ok(later.width > a.width);
});
test('13:10から15:40は430分位置から150分の正確な高さ', () => {
  const record = Object.freeze(item({ startTime: '13:10', endTime: '15:40' }));
  const before = JSON.stringify(record);
  const block = ActivityPrint.layout([record], '2026-08-31').columns[4].items[0];
  assert.equal(block.y, ActivityPrint.minuteY(430));
  assert.ok(Math.abs(block.height - 576 * 150 / 1440) < 1e-9);
  assert.equal(JSON.stringify(record), before);
});
test('短時間ラベルは近傍に留まり、隣接ブロックを覆わない', () => {
  const plan = ActivityPrint.layout([item({ endTime: '12:10' }), item({ id: 'next', startTime: '12:10', endTime: '13:00' })], '2026-08-31');
  const [a, b] = plan.columns[4].items;
  assert.equal(a.labelY, null);
  assert.ok(b.labelY === null || Math.abs(b.labelY - b.y) <= 6);
});
test('PDFの行動ラベルに時刻を出さず、通常週の説明と単ページ番号を除く', () => {
  class Element {
    constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.textContent = ''; }
    setAttribute(key, value) { this.attrs[key] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
  }
  global.document = { createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag), createDocumentFragment: () => new Element('fragment') };
  try {
    const container = new Element('container');
    const result = ActivityPrint.render([item(), item({ id: 'short', startTime: '14:10', endTime: '14:20' }), item({ id: 'sleep', startTime: '23:00', endDate: '2026-09-05', endTime: '08:00' })], '2026-09-04', container);
    const all = [];
    function walk(node) { all.push(node); node.children.forEach(walk); }
    walk(container);
    assert.equal(result.pages, 1);
    const groups = all.filter(node => node.attrs['data-record-label']);
    assert.equal(groups.length, 4);
    groups.forEach(group => assert.equal(JSON.stringify(group).includes(':00'), false));
    const texts = all.map(node => node.textContent).join(' ');
    assert.equal((texts.match(/\d+:\d{2}/g) || []).length, 24);
    assert.ok(texts.includes('2026年9月4日（金）～ 9月10日（木）'));
    assert.ok(texts.includes('1日の平均気分'));
    assert.equal(/算術平均|日界|1 \/ 1|色境界/.test(texts), false);
  } finally { delete global.document; }
});

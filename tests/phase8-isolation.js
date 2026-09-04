"use strict";
// 検証用HTMLだけで読み込む。通常の記録には接続しない。
const phase8DB = ActivityDB.create(`activity-mood-phase8-${crypto.randomUUID()}`);
ActivityDB.create = () => phase8DB;

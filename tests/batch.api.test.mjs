import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

const STAFF = { "x-dev-roles": "WINDOW,REVIEW", "content-type": "application/json" };

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;
async function call(method, path, body) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method, headers: STAFF,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("バッチ管理 (標準仕様書 9): 定義一覧・実行・履歴", async (t) => {
  port = await listen();
  t.after(() => server.close());

  // 定義一覧
  const defs = await call("GET", "/batch-jobs");
  assert.equal(defs.status, 200);
  assert.ok(defs.body.types.length >= 5);
  assert.ok(defs.body.types.some((d) => d.type === "RECONCILE"));

  // 整合性確認バッチ実行
  const rc = await call("POST", "/batch-jobs/RECONCILE/run");
  assert.equal(rc.status, 202);
  assert.equal(rc.body.status, "DONE");
  assert.ok(rc.body.processed >= 0);
  assert.ok(rc.body.jobId);

  // 年報集計バッチ → population を含む
  const ar = await call("POST", "/batch-jobs/ANNUAL_AGGREGATE/run");
  assert.equal(ar.status, 202);
  assert.ok(Number.isInteger(ar.body.details.population));

  // 未知の種別は 404
  const nf = await call("POST", "/batch-jobs/UNKNOWN/run");
  assert.equal(nf.status, 404);

  // 履歴に 2 件以上
  const hist = await call("GET", "/batch-jobs");
  assert.ok(hist.body.history.length >= 2);
});

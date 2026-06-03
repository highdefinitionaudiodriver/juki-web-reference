import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

const WINDOW = { "x-dev-roles": "WINDOW", "content-type": "application/json" };
const ADMIN = { "x-dev-roles": "ADMIN", "content-type": "application/json" };

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;
async function call(method, path, body, headers = WINDOW) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("コンビニ交付 (SCR-507): 連携状態・交付・抑止対象は利用停止", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const search = await call("POST", "/residents/search", { name: "" });
  const ids = (search.body.items ?? []).map((r) => r.residentId);
  const residentId = ids[0];
  assert.ok(residentId, "seed 住民が存在すること");

  // 連携状態の取得
  const status = await call("GET", "/certificates/conveni/status");
  assert.equal(status.status, 200);
  assert.equal(status.body.linkState, "CONNECTED");

  // 通常住民: コンビニ交付成功 (ISSUED)
  const ok = await call("POST", "/certificates/conveni", { residentId, formId: "0010001", storeCode: "STORE-1" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.status, "ISSUED");
  assert.ok(ok.body.issueId, "証明書が発行される");

  // 存在しない住民: NOT_FOUND
  const nf = await call("POST", "/certificates/conveni", { residentId: "NOPE-999" });
  assert.equal(nf.status, 404);
  assert.equal(nf.body.status, "NOT_FOUND");

  // 抑止対象者を作成 → コンビニ交付は REFUSED（利用停止）
  const reg = await call("POST", "/restrictions", { residentId, category: "DV", startDate: "2026-04-01", scope: "SELF" }, ADMIN);
  assert.equal(reg.status, 201);
  const refused = await call("POST", "/certificates/conveni", { residentId });
  assert.equal(refused.status, 200);
  assert.equal(refused.body.status, "REFUSED");
  assert.match(refused.body.reason, /支援措置|抑止/);

  // 履歴に 3 件記録（ISSUED / NOT_FOUND / REFUSED）
  const history = await call("GET", "/certificates/conveni");
  assert.ok(history.body.length >= 3);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

const STAFF = { "x-dev-roles": "WINDOW", "content-type": "application/json" };

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

test("ダッシュボード (SCR-002): 主要指標の集約", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const ov = await call("GET", "/overview");
  assert.equal(ov.status, 200);
  assert.ok(Number.isInteger(ov.body.residents.total));
  assert.ok(ov.body.residents.total >= ov.body.residents.active);
  assert.ok(Number.isInteger(ov.body.transactions.pendingApproval));
  assert.ok("notifyRegistrations" in ov.body);
  assert.ok("alerts" in ov.body);

  // 本人通知登録を1件作って指標が増えることを確認
  const resident = (await call("POST", "/residents/search", { name: "" })).body.items[0];
  await call("POST", "/notify/registrations", { residentId: resident.residentId });
  const ov2 = await call("GET", "/overview");
  assert.ok(ov2.body.notifyRegistrations >= 1);
});

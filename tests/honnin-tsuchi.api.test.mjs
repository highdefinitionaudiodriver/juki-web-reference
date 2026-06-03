import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

const WINDOW = { "x-dev-roles": "WINDOW", "content-type": "application/json" };

function listen() {
  return new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
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

test("本人通知制度 (SCR-801 / 8.1): 登録→第三者交付で通知→廃止で停止", async (t) => {
  port = await listen();
  t.after(() => server.close());

  // 対象住民を取得
  const search = await call("POST", "/residents/search", { name: "" });
  assert.equal(search.status, 200);
  const residentId = (search.body.items ?? [])[0]?.residentId;
  assert.ok(residentId, "seed 住民が存在すること");

  // 1. 本人通知登録
  const reg = await call("POST", "/notify/registrations", { residentId });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.status, "ACTIVE");
  assert.match(reg.body.registrationId, /^HT-/);

  // 2. 重複登録は 409
  const dup = await call("POST", "/notify/registrations", { residentId });
  assert.equal(dup.status, 409);

  // 3. 第三者請求で証明書交付 → 本人通知が発出される
  const third = await call("POST", "/certificates/jumin", { residentId, requesterType: "THIRD_PARTY" });
  assert.equal(third.status, 201);
  assert.ok(third.body.honninTsuchi, "第三者請求では本人通知が生成される");
  assert.equal(third.body.honninTsuchi.status, "NOTIFIED");

  // 4. 本人請求（requesterType なし）では通知されない
  const self = await call("POST", "/certificates/jumin", { residentId });
  assert.equal(self.status, 201);
  assert.equal(self.body.honninTsuchi, null);

  // 5. 通知記録一覧に 1 件
  const notifications = await call("GET", "/notify");
  assert.equal(notifications.status, 200);
  assert.equal(notifications.body.filter((n) => n.residentId === residentId).length, 1);

  // 6. 登録廃止後は第三者請求でも通知されない
  const del = await call("DELETE", `/notify/registrations/${reg.body.registrationId}`);
  assert.equal(del.status, 204);
  const afterDelete = await call("POST", "/certificates/jumin", { residentId, requesterType: "PROXY" });
  assert.equal(afterDelete.body.honninTsuchi, null);
});

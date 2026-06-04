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

test("証明書交付履歴照会 (機能 0040084)", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const resident = (await call("POST", "/residents/search", { name: "" })).body.items[0];
  assert.ok(resident.residentId);

  // 発行前は 0 件
  const before = await call("GET", `/residents/${resident.residentId}/certificates`);
  assert.equal(before.status, 200);
  const before0 = before.body.total;

  // 証明書を発行
  await call("POST", "/certificates/jumin", { residentId: resident.residentId, formId: "0010001" });

  const after = await call("GET", `/residents/${resident.residentId}/certificates`);
  assert.equal(after.body.total, before0 + 1);
  assert.equal(after.body.history[0].formId, "0010001");
  assert.ok(after.body.history[0].issueId);

  // 存在しない住民は 404
  const nf = await call("GET", "/residents/NOPE/certificates");
  assert.equal(nf.status, 404);
});

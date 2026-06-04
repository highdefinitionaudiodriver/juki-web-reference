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

test("証明書の連件交付 (一括発行)", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const items = (await call("POST", "/residents/search", { name: "" })).body.items;
  const ids = items.slice(0, 2).map((r) => r.residentId);
  assert.ok(ids.length >= 1);

  // residentIds 必須
  const bad = await call("POST", "/certificates/bulk", { residentIds: [] });
  assert.equal(bad.status, 400);

  // 一括発行（存在しないIDはskip）
  const res = await call("POST", "/certificates/bulk", { residentIds: [...ids, "NOPE-999"], formId: "0010001" });
  assert.equal(res.status, 201);
  assert.equal(res.body.issuedCount, ids.length);
  assert.equal(res.body.issued.length, ids.length);
  assert.ok(res.body.skipped.some((s) => s.residentId === "NOPE-999"));
  assert.equal(res.body.totalFee, ids.length * 300);
  assert.ok(res.body.issued[0].verifyToken);
});

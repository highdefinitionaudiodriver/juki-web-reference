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

test("世帯員照会 (SCR-414): 同一世帯の住民一覧", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const resident = (await call("POST", "/residents/search", { name: "" })).body.items[0];
  assert.ok(resident.residentId);

  const hh = await call("GET", `/residents/${resident.residentId}/household`);
  assert.equal(hh.status, 200);
  assert.equal(hh.body.householdId, resident.householdId);
  assert.ok(hh.body.total >= 1);
  // 本人が世帯員に含まれる
  assert.ok(hh.body.members.some((m) => m.residentId === resident.residentId));

  // 存在しない住民は 404
  const nf = await call("GET", "/residents/NOPE/household");
  assert.equal(nf.status, 404);
});

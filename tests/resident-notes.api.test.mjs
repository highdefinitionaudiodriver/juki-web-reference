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

test("住民への事務メモ（申し送り）", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const resident = (await call("POST", "/residents/search", { name: "" })).body.items[0];
  assert.ok(resident.residentId);

  // text 必須
  const bad = await call("POST", `/residents/${resident.residentId}/notes`, {});
  assert.equal(bad.status, 400);
  // 存在しない住民は 404
  const nf = await call("POST", "/residents/NOPE/notes", { text: "x" });
  assert.equal(nf.status, 404);

  // メモ追加
  const c1 = await call("POST", `/residents/${resident.residentId}/notes`, { text: "本人確認は厳格に" });
  assert.equal(c1.status, 201);
  await call("POST", `/residents/${resident.residentId}/notes`, { text: "代理人来庁予定" });

  // 一覧（2件・新しい順）
  const list = await call("GET", `/residents/${resident.residentId}/notes`);
  assert.equal(list.status, 200);
  assert.equal(list.body.length, 2);
  assert.equal(list.body[0].text, "代理人来庁予定");
});

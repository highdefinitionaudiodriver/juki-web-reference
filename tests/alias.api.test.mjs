import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

const STAFF = { "x-dev-roles": "WINDOW,REVIEW", "content-type": "application/json" };

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;
async function call(method, path, body, headers = STAFF) {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("通称・旧氏管理 (SCR-103): 登録→一覧→廃止", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const search = await call("POST", "/residents/search", { name: "" });
  const residentId = (search.body.items ?? [])[0]?.residentId;
  assert.ok(residentId, "seed 住民が存在すること");

  // 通称(ALIAS)を登録
  const alias = await call("POST", `/residents/${residentId}/alias`, {
    kind: "ALIAS", valueKanji: "山田はなこ", valueKana: "ヤマダハナコ",
  });
  assert.equal(alias.status, 201);
  assert.equal(alias.body.kind, "ALIAS");
  assert.ok(alias.body.aliasId);

  // 旧氏(FORMER_FAMILY)を登録
  const former = await call("POST", `/residents/${residentId}/alias`, {
    kind: "FORMER_FAMILY", valueKanji: "佐藤",
  });
  assert.equal(former.status, 201);
  assert.equal(former.body.kind, "FORMER_FAMILY");

  // valueKanji 必須
  const bad = await call("POST", `/residents/${residentId}/alias`, { kind: "ALIAS" });
  assert.equal(bad.status, 400);

  // 一覧（2件以上、validTo=null）
  const list = await call("GET", `/residents/${residentId}/alias`);
  assert.equal(list.status, 200);
  assert.ok(list.body.length >= 2);
  assert.equal(list.body[0].validTo, null);

  // 廃止（validTo が設定される）
  const del = await call("DELETE", `/residents/${residentId}/alias/${alias.body.aliasId}`);
  assert.equal(del.status, 200);
  assert.ok(del.body.validTo, "廃止で validTo が設定される");

  // 存在しない alias の廃止は 404
  const notFound = await call("DELETE", `/residents/${residentId}/alias/NOPE`);
  assert.equal(notFound.status, 404);
});

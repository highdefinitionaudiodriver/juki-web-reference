import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;
async function call(method, path, body, roles = "ADMIN") {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
    method,
    headers: { "x-dev-roles": roles, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("お知らせ（システム周知）", async (t) => {
  port = await listen();
  t.after(() => server.close());

  // 一般ロールは作成不可
  const forbidden = await call("POST", "/announcements", { title: "x" }, "WINDOW");
  assert.equal(forbidden.status, 403);
  // title 必須
  const bad = await call("POST", "/announcements", {});
  assert.equal(bad.status, 400);

  // 作成
  const c1 = await call("POST", "/announcements", { title: "システムメンテ", body: "日曜夜間", level: "warning" });
  assert.equal(c1.status, 201);
  assert.equal(c1.body.level, "warning");

  // 一覧（VIEW権限で可）
  const list = await call("GET", "/announcements", undefined, "WINDOW");
  assert.equal(list.status, 200);
  assert.ok(list.body.some((a) => a.id === c1.body.id));

  // 削除 → 一覧から消える
  const del = await call("DELETE", `/announcements/${c1.body.id}`);
  assert.equal(del.status, 204);
  const list2 = await call("GET", "/announcements");
  assert.ok(!list2.body.some((a) => a.id === c1.body.id));
});

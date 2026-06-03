import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;

test("監査ログCSV出力 (操作ログ提出用)", async (t) => {
  port = await listen();
  t.after(() => server.close());

  // 監査対象の操作を生成
  await fetch(`http://127.0.0.1:${port}/api/v1/residents/search`, {
    method: "POST", headers: { "x-dev-roles": "WINDOW", "content-type": "application/json" }, body: "{}",
  });

  const res = await fetch(`http://127.0.0.1:${port}/api/v1/audit/export`, { headers: { "x-dev-roles": "ADMIN" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/csv/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = buf.toString("utf8");
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.ok(lines[0].includes("操作者"));
  assert.ok(lines.length >= 2);

  // 権限のないロールは 403
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/v1/audit/export`, { headers: { "x-dev-roles": "NOBODY" } });
  assert.equal(forbidden.status, 403);
});

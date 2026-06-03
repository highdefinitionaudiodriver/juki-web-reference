import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;

test("住民検索結果のCSV出力 (機能 0040079)", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${port}/api/v1/residents/search/export`, {
    method: "POST",
    headers: { "x-dev-roles": "WINDOW", "content-type": "application/json" },
    body: JSON.stringify({ name: "" }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/csv/);
  assert.match(res.headers.get("content-disposition") || "", /residents\.csv/);

  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], "Excel互換のBOM付き");
  const csv = buf.toString("utf8");
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.ok(lines[0].includes("宛名番号"), "ヘッダ行に列名");
  assert.ok(lines[0].includes("住所"));
  assert.ok(lines.length >= 2, "1件以上のデータ行");

  // 検索権限のないロールは 403
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/v1/residents/search/export`, {
    method: "POST",
    headers: { "x-dev-roles": "NOBODY", "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(forbidden.status, 403);
});

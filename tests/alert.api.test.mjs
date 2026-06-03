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

test("エラー・アラート設定 / アクセスログ分析 (SCR-A04)", async (t) => {
  port = await listen();
  t.after(() => server.close());

  // 既定ルール
  const rules = await call("GET", "/alert-rules");
  assert.equal(rules.status, 200);
  assert.equal(rules.body.nightStartHour, 22);

  // 検索を複数回実施（SEARCH 監査ログを生成）
  for (let i = 0; i < 4; i++) await call("POST", "/residents/search", { name: "" });

  // 閾値を下げて大量検索アラートを発生させる（深夜は無効化）
  const upd = await call("PUT", "/alert-rules", { nightAccessEnabled: false, bulkSearchThreshold: 2 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.bulkSearchThreshold, 2);

  const alerts = await call("GET", "/alerts");
  assert.equal(alerts.status, 200);
  assert.ok(alerts.body.alerts.some((a) => a.type === "BULK_SEARCH"), "大量検索アラートが発生する");

  // 大量検索チェックを無効化すると消える
  await call("PUT", "/alert-rules", { bulkSearchEnabled: false });
  const alerts2 = await call("GET", "/alerts");
  assert.ok(!alerts2.body.alerts.some((a) => a.type === "BULK_SEARCH"));

  // VIEW のみ(WINDOW)では設定変更不可
  const forbidden = await call("PUT", "/alert-rules", { bulkSearchThreshold: 1 }, "WINDOW");
  assert.equal(forbidden.status, 403);
});

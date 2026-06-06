import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;

test("システム情報（運用・監視用）", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${port}/api/v1/system-info`, { headers: { "x-dev-roles": "WINDOW" } });
  assert.equal(res.status, 200);
  const info = await res.json();
  assert.match(info.node, /^v\d+/);
  assert.ok(typeof info.uptimeSeconds === "number");
  assert.ok(info.dataCounts && typeof info.dataCounts.residents === "number");
  assert.ok(info.dataCounts.residents >= 1);
  assert.ok(info.serverTime);

  // 権限なしロールは 403
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/v1/system-info`, { headers: { "x-dev-roles": "NOBODY" } });
  assert.equal(forbidden.status, 403);
});

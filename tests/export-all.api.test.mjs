import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;

test("契約終了時データ提供（全データエクスポート）", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const res = await fetch(`http://127.0.0.1:${port}/api/v1/export-all`, { headers: { "x-dev-roles": "ADMIN" } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /application\/json/);
  assert.match(res.headers.get("content-disposition") || "", /export-all\.json/);
  const bundle = await res.json();
  assert.ok(Array.isArray(bundle.residents));
  assert.ok(bundle.residents.length >= 1);
  assert.ok(bundle.counts && typeof bundle.counts.residents === "number");
  assert.ok(bundle.exportedAt);

  // 非ADMINは 403
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/v1/export-all`, { headers: { "x-dev-roles": "WINDOW" } });
  assert.equal(forbidden.status, 403);
});

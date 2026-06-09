import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";
function listen() { return new Promise((r) => server.listen(0, () => r(server.address().port))); }
test("住民票等の証明手数料の算定", async (t) => {
  const port = await listen();
  t.after(() => server.close());
  const post = (b) => fetch(`http://127.0.0.1:${port}/api/v1/certificates/fee`, { method: "POST", headers: { "content-type": "application/json", "x-dev-roles": "WINDOW" }, body: JSON.stringify(b) });
  const r1 = await post({ certType: "住民票の写し", copies: 2 }); assert.equal(r1.status, 200);
  const j1 = await r1.json(); assert.equal(j1.unitFee, 300); assert.equal(j1.total, 600);
  const r2 = await post({ certType: "住民票の写し", postal: true }); assert.equal((await r2.json()).total, 440);
  const r3 = await post({ certType: "不明" }); assert.equal(r3.status, 400);
});

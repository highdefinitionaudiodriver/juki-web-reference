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

test("特別永住者管理 (SCR-802): 交付・有効期間算出・満了一覧", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const search = await call("POST", "/residents/search", { name: "" });
  const adultId = (search.body.items ?? [])[0]?.residentId;
  assert.ok(adultId, "seed 住民が存在すること");

  // certNumber 必須
  const bad = await call("PUT", `/residents/${adultId}/special-permanent`, { issuedDate: "2026-06-01" });
  assert.equal(bad.status, 400);

  // 成人: 交付日 + 7 年
  const adult = await call("PUT", `/residents/${adultId}/special-permanent`, {
    certNumber: "SP-0001", issuedDate: "2026-06-01",
  });
  assert.equal(adult.status, 200);
  assert.equal(adult.body.expiryDate, "2033-06-01");

  // 未成年(転入で作成, 2018生まれ): 16 歳の誕生日が満了日
  const tx = await call("POST", "/transactions/in", {
    eventDate: "2026-06-01", addressText: "サンプル市新町1-1",
    members: [{ familyNameKanji: "金", givenNameKanji: "太郎", birthDate: "2018-03-15", sex: "M" }],
  });
  assert.equal(tx.status, 201);
  const minorId = tx.body.residentId;
  assert.ok(minorId);
  const minor = await call("PUT", `/residents/${minorId}/special-permanent`, {
    certNumber: "SP-0002", issuedDate: "2026-06-01",
  });
  assert.equal(minor.body.expiryDate, "2034-03-15");

  // GET で取得
  const got = await call("GET", `/residents/${adultId}/special-permanent`);
  assert.equal(got.status, 200);
  assert.equal(got.body.certNumber, "SP-0001");

  // 満了一覧（十分長い期間で 2 件以上）
  const expiring = await call("GET", "/special-permanent/expiring?days=100000");
  assert.equal(expiring.status, 200);
  assert.ok(expiring.body.total >= 2);
});

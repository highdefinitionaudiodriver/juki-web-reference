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

test("EUC設計 (SCR-A01): テンプレート作成・機微情報は二人承認・削除", async (t) => {
  port = await listen();
  t.after(() => server.close());

  // バリデーション: name/outputFields 必須
  const bad = await call("POST", "/euc-templates", { name: "x" });
  assert.equal(bad.status, 400);

  // 通常テンプレート（機微情報なし）→ 二人承認不要
  const t1 = await call("POST", "/euc-templates", { name: "住所一覧", domain: "RESIDENT", outputFields: ["residentId", "addressText"] });
  assert.equal(t1.status, 201);
  assert.equal(t1.body.requiresSecondApproval, false);
  assert.match(t1.body.id, /^EUCT-/);

  // 個人番号を含む → 二人承認が必要
  const t2 = await call("POST", "/euc-templates", { name: "番号付き抽出", outputFields: ["residentId", "myNumber"] });
  assert.equal(t2.body.includeMyNumber, true);
  assert.equal(t2.body.requiresSecondApproval, true);

  // 一覧（2件以上）
  const list = await call("GET", "/euc-templates");
  assert.equal(list.status, 200);
  assert.ok(list.body.length >= 2);

  // 削除
  const del = await call("DELETE", `/euc-templates/${t1.body.id}`);
  assert.equal(del.status, 204);

  // 存在しない削除は 404
  const nf = await call("DELETE", "/euc-templates/NOPE");
  assert.equal(nf.status, 404);
});

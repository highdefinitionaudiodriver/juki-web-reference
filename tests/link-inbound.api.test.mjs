import { test } from "node:test";
import assert from "node:assert/strict";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}
let port;
const base = () => `http://127.0.0.1:${port}/api/v1`;

test("オンライン申請 受付簿（ポータル等からのインバウンド申請の取り込みと処理）", async (t) => {
  port = await listen();
  t.after(() => server.close());

  const appBody = {
    source: "citizen-portal",
    externalId: "RX-juki-1",
    receiptNumber: "R20260607-9001",
    procedureType: "moveout",
    applicant: { residentId: "1000000001", name: "山田 花子" },
    payload: { newAddress: "◯◯県△△市1-2-3" },
  };
  const inbound = (body) => fetch(`${base()}/link/application/inbound`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });

  // 既存の申請管理 受領（202 ACCEPTED）。受付簿にも取り込まれる。
  const ok = await inbound(appBody);
  assert.equal(ok.status, 202);
  assert.equal((await ok.json()).status, "ACCEPTED");

  // 冪等: 同一 externalId の再送では受付簿は増えない
  await inbound(appBody);

  // 受付簿の一覧（VIEW権限）に1件だけ現れる
  const list = await fetch(`${base()}/link/applications`, { headers: { "x-dev-roles": "WINDOW" } });
  assert.equal(list.status, 200);
  const items = await list.json();
  const mine = items.filter((a) => a.externalId === "RX-juki-1");
  assert.equal(mine.length, 1, "冪等取り込みで1件");
  assert.equal(mine[0].applicant.name, "山田 花子");
  assert.equal(mine[0].status, "RECEIVED");

  // ステータス更新
  const adv = await fetch(`${base()}/link/applications/${mine[0].id}/status`, {
    method: "POST", headers: { "content-type": "application/json", "x-dev-roles": "WINDOW" }, body: JSON.stringify({ status: "PROCESSING" }),
  });
  assert.equal(adv.status, 200);
  assert.equal((await adv.json()).status, "PROCESSING");

  // 不正ステータスは400
  const badStatus = await fetch(`${base()}/link/applications/${mine[0].id}/status`, {
    method: "POST", headers: { "content-type": "application/json", "x-dev-roles": "WINDOW" }, body: JSON.stringify({ status: "NOPE" }),
  });
  assert.equal(badStatus.status, 400);

  // procedureType/applicant の無いペイロードは受付簿に取り込まれない（連携イベントのみ）
  await inbound({ foo: "bar" });
  const list2 = await fetch(`${base()}/link/applications`, { headers: { "x-dev-roles": "WINDOW" } }).then((r) => r.json());
  assert.ok(!list2.some((a) => a.payload && a.payload.foo === "bar"));
});

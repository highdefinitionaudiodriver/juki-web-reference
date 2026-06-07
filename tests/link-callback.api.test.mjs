import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { server } from "../apps/api/src/server.js";

function listen() {
  return new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
}

// 状況コールバック発火: juki が状態更新時に市民ポータル(/api/link/callback)へ通知する
test("link status update emits callback to citizen portal", async (t) => {
  const received = [];
  const stub = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/api/link/callback") {
        received.push({ token: req.headers["x-link-token"], body: JSON.parse(raw || "{}") });
        res.writeHead(200); return res.end(JSON.stringify({ ok: true }));
      }
      res.writeHead(404); res.end();
    });
  });
  await new Promise((r) => stub.listen(0, r));
  const stubPort = stub.address().port;
  process.env.PORTAL_CALLBACK_BASE = `http://127.0.0.1:${stubPort}`;
  process.env.LINK_TOKEN = "portal-link-dev-token";

  const port = await listen();
  const base = `http://127.0.0.1:${port}/api/v1`;
  t.after(() => { server.close(); stub.close(); delete process.env.PORTAL_CALLBACK_BASE; });

  // 申請を受信（externalId付き）
  const inb = await fetch(`${base}/link/application/inbound`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "citizen-portal", externalId: "RX-cb-juki", procedureType: "moveout", applicant: { residentId: "1000000001", name: "山田 花子" } }),
  });
  await inb.json();
  const list = await fetch(`${base}/link/applications`, { headers: { "x-dev-roles": "WINDOW" } }).then((r) => r.json());
  const item = list.find((a) => a.externalId === "RX-cb-juki");
  assert.ok(item);

  // 状態を PROCESSING に更新 → ポータルへ通知
  const upd = await fetch(`${base}/link/applications/${item.id}/status`, {
    method: "POST", headers: { "content-type": "application/json", "x-dev-roles": "WINDOW" }, body: JSON.stringify({ status: "PROCESSING" }),
  });
  assert.equal(upd.status, 200);

  assert.equal(received.length, 1, "ポータルへ1件通知された");
  assert.equal(received[0].token, "portal-link-dev-token");
  assert.equal(received[0].body.externalId, "RX-cb-juki");
  assert.equal(received[0].body.status, "PROCESSING");
});

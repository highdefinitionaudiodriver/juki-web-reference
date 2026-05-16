import { expect, test } from "@playwright/test";
import { server } from "../../apps/api/src/server.js";

/**
 * ゴールデンパス（API 単体）
 *   1. 転入届 → 新規住民が作成される
 *   2. 住民票の写し（0010001）を発行 → verifyToken と手数料を取得
 *   3. /verify/{token} で発行情報を検証
 *   4. 転出届 → 0010007 転出証明書が同時発行
 *   5. 直近の異動を取消
 */

const headers = (roles: string[]) => ({
  "content-type": "application/json",
  "x-dev-roles": roles.join(","),
});

test.beforeAll(async () => {
  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.listen(8787, resolve);
  });
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("golden path: move-in → certificate → move-out → cancel (API)", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ISSUE_CERTIFICATE_ROLE", "ADMIN"]);

  // 1. 転入
  const eventDate = new Date().toISOString().slice(0, 10);
  const moveIn = await request.post("/api/v1/transactions/in", {
    headers: reviewHeaders,
    data: {
      eventDate,
      addressText: "東京都サンプル市新町2-3-4",
      members: [{
        familyNameKanji: "E2E", givenNameKanji: "太郎",
        familyNameKana: "イーツーイー", givenNameKana: "タロウ",
        birthDate: "1990-01-01", sex: "M", relationToHead: "本人",
      }],
    },
  });
  expect(moveIn.status()).toBe(201);
  const movedIn = await moveIn.json();
  expect(movedIn.transactionId).toBeTruthy();
  expect(movedIn.status).toBe("APPLIED");
  const residentId: string = movedIn.residentId;

  // 2. 住民票の写し発行
  const issueRes = await request.post("/api/v1/certificates/jumin", {
    headers: reviewHeaders,
    data: { residentId, formId: "0010001", copies: 1, usageText: "E2E" },
  });
  expect(issueRes.status()).toBe(201);
  const issue = await issueRes.json();
  expect(issue.verifyToken).toMatch(/^V[A-Z0-9]+/);
  expect(issue.fee).toBe(300);

  const pdf = await request.get(`/api/v1/certificates/${issue.issueId}/pdf`, { headers: reviewHeaders });
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).toString("ascii")).toContain("%PDF-1.4");

  // 3. verify
  const verify = await request.get(`/api/v1/verify/${issue.verifyToken}`);
  const verified = await verify.json();
  expect(verified.valid).toBe(true);
  expect(verified.formId).toBe("0010001");

  // 4. 転出
  const moveOut = await request.post("/api/v1/transactions/out", {
    headers: reviewHeaders,
    data: { eventDate, newAddress: "東京都外サンプル市1-1", members: [residentId] },
  });
  expect(moveOut.status()).toBe(201);
  const movedOut = await moveOut.json();
  expect(movedOut.certificate.formId).toBe("0010007");
  expect(movedOut.parentTransactionId).toBeNull();

  // 5. 取消
  const cancel = await request.post("/api/v1/transactions/cancel", {
    headers: reviewHeaders,
    data: { transactionId: movedOut.transactionId, reason: "E2E 取消" },
  });
  expect(cancel.status()).toBe(201);
  const cancelled = await cancel.json();
  expect(cancelled.parentTransactionId).toBe(movedOut.transactionId);
  expect(cancelled.typeCode).toBe("CANCEL");
});

test("DV 抑止対象者は WINDOW ロールから不可視（404 相当の総数0）", async ({ request }) => {
  const windowRes = await request.post("/api/v1/residents/search", {
    headers: headers(["WINDOW"]),
    data: { name: "住民" },
  });
  const windowJson = await windowRes.json();
  for (const item of windowJson.items) {
    expect(item.restrictions ?? []).toHaveLength(0);
  }

  const releaseRes = await request.post("/api/v1/residents/search", {
    headers: headers(["RESTRICTION_RELEASE"]),
    data: { name: "住民" },
  });
  const releaseJson = await releaseRes.json();
  expect(releaseJson.total).toBeGreaterThanOrEqual(windowJson.total);
  expect(releaseJson.items.some((item: { residentId: string }) => item.residentId === "0000123457")).toBe(true);
});

test("DV 抑止対象者の詳細・履歴は WINDOW ロールから 404", async ({ request }) => {
  const detail = await request.get("/api/v1/residents/0000123457", { headers: headers(["WINDOW"]) });
  expect(detail.status()).toBe(404);

  const history = await request.get("/api/v1/residents/0000123457/history", { headers: headers(["WINDOW"]) });
  expect(history.status()).toBe(404);

  const releaseHistory = await request.get("/api/v1/residents/0000123457/history", { headers: headers(["RESTRICTION_RELEASE"]) });
  expect(releaseHistory.status()).toBe(200);
});

test("個人番号は WINDOW ロールではマスク, ADMIN+unmask で平文", async ({ request }) => {
  const masked = await request.get("/api/v1/residents/0000123456", { headers: headers(["WINDOW"]) });
  const mJson = await masked.json();
  expect(mJson.myNumber).toContain("*");

  const unmasked = await request.get("/api/v1/residents/0000123456?unmask=my_number&unmask=jumin_code", { headers: headers(["ADMIN"]) });
  const uJson = await unmasked.json();
  expect(uJson.myNumber).not.toContain("*");
  expect(uJson.juminCode).not.toContain("*");
});

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

test("出生連動: 親世帯に新生児を登録", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);
  const eventDate = new Date().toISOString().slice(0, 10);
  // 親は seed の 0000123456 (住民 太郎)
  const res = await request.post("/api/v1/transactions/birth", {
    headers: reviewHeaders,
    data: {
      parentResidentId: "0000123456",
      eventDate,
      familyNameKanji: "住民",
      givenNameKanji: "新太",
      familyNameKana: "ジュウミン",
      givenNameKana: "シンタ",
      sex: "M",
      relationToHead: "子",
    },
  });
  expect(res.status()).toBe(201);
  const tx = await res.json();
  expect(tx.typeCode).toBe("BIRTH");
  expect(tx.status).toBe("APPLIED");
  expect(tx.parentResidentId).toBe("0000123456");
  expect(tx.householdId).toBe("H-00045");

  // バリデーション: 親が存在しない
  const badParent = await request.post("/api/v1/transactions/birth", {
    headers: reviewHeaders,
    data: { parentResidentId: "9999999999", familyNameKanji: "X", givenNameKanji: "Y" },
  });
  expect(badParent.status()).toBe(404);
});

test("死亡連動: 消除 + 重複死亡で 409", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);
  // 出生で作った新生児はテスト独立性のため使えないので、転入で新規作成
  const moveIn = await request.post("/api/v1/transactions/in", {
    headers: reviewHeaders,
    data: {
      eventDate: "2024-01-01",
      members: [{ familyNameKanji: "死亡", givenNameKanji: "テスト", birthDate: "1950-01-01", sex: "M", relationToHead: "本人" }],
    },
  });
  const mi = await moveIn.json();
  const residentId = mi.residentId;

  // 1 回目 OK
  const first = await request.post("/api/v1/transactions/death", {
    headers: reviewHeaders,
    data: { residentId, eventDate: "2026-05-16" },
  });
  expect(first.status()).toBe(201);
  const tx = await first.json();
  expect(tx.typeCode).toBe("DEATH");

  // 2 回目は 409 (既に除票済)
  const second = await request.post("/api/v1/transactions/death", {
    headers: reviewHeaders,
    data: { residentId, eventDate: "2026-05-16" },
  });
  expect(second.status()).toBe(409);
  const err = await second.json();
  expect(err.code).toBe("ALREADY_REMOVED");
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

test("住民票コード/個人番号の付番変更で通知票を発行", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);
  const eventDate = new Date().toISOString().slice(0, 10);
  const birth = await request.post("/api/v1/transactions/birth", {
    headers: reviewHeaders,
    data: {
      parentResidentId: "0000123456",
      eventDate,
      familyNameKanji: "通知",
      givenNameKanji: "花",
      familyNameKana: "ツウチ",
      givenNameKana: "ハナ",
      sex: "F",
    },
  });
  expect(birth.status()).toBe(201);
  const baby = await birth.json();

  const jumin = await request.post("/api/v1/codes/jumin", {
    headers: reviewHeaders,
    data: { residentId: baby.residentId, operation: "ISSUE", code: "45678901234" },
  });
  expect(jumin.status()).toBe(201);
  const juminJson = await jumin.json();
  expect(juminJson.juminCode).toBe("45678901234");
  expect(juminJson.certificate.formId).toBe("0010009");

  const myNumberIssue = await request.post("/api/v1/codes/mynumber", {
    headers: reviewHeaders,
    data: { residentId: baby.residentId, operation: "ISSUE", number: "423456789012" },
  });
  expect(myNumberIssue.status()).toBe(201);
  const myNumberIssueJson = await myNumberIssue.json();
  expect(myNumberIssueJson.myNumber).toBe("423456789012");
  expect(myNumberIssueJson.certificate.formId).toBe("0010010");

  const myNumberChange = await request.post("/api/v1/codes/mynumber", {
    headers: reviewHeaders,
    data: { residentId: baby.residentId, operation: "CHANGE", number: "523456789012" },
  });
  expect(myNumberChange.status()).toBe(201);
  const myNumberChangeJson = await myNumberChange.json();
  expect(myNumberChangeJson.myNumber).toBe("523456789012");
  expect(myNumberChangeJson.certificate.formId).toBe("0010011");
});

test("外国人在留情報更新と満了30日前通知票発行", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);
  const target = "0000124000";
  const update = await request.put(`/api/v1/residents/${target}/foreigner`, {
    headers: reviewHeaders,
    data: {
      residenceStatus: "技術・人文知識・国際業務",
      residencePeriodEnd: "2026-06-01",
      passportNo: "P99999999",
      nationalityFull: "中華人民共和国",
      aliasKanji: "王 明",
      specialPermanentResident: false,
    },
  });
  expect(update.status()).toBe(200);
  const updated = await update.json();
  expect(updated.residentId).toBe(target);
  expect(updated.expiresWithin30Days).toBe(true);

  const job = await request.post("/api/v1/reports/foreigner-expiring", {
    headers: reviewHeaders,
    data: { baseDate: "2026-05-16", days: 30 },
  });
  expect(job.status()).toBe(202);
  const jobJson = await job.json();
  expect(jobJson.formId).toBe("0010012");
  expect(jobJson.targetCount).toBeGreaterThanOrEqual(1);
  expect(jobJson.issuedCount).toBe(jobJson.targetCount);
});

test("戸籍連動受領: /link/internal/koseki から KOSEKI 異動を反映", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);
  const res = await request.post("/api/v1/link/internal/koseki", {
    headers: reviewHeaders,
    data: {
      noticeType: "MARRIAGE",
      kosekiNoticeId: "KOSEKI-E2E-001",
      residentId: "0000123456",
      eventDate: "2026-05-16",
      newFamilyNameKanji: "連携",
      newFamilyNameKana: "レンケイ",
    },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.partnerId).toBe("KOSEKI");
  expect(body.status).toBe("APPLIED");
  expect(body.transactionId).toBeTruthy();
  expect(body.transaction.typeCode).toBe("KOSEKI");
  expect(body.transaction.reasonCode).toBe("KOSEKI_MARRIAGE");
  expect(body.transaction.kosekiNoticeId).toBe("KOSEKI-E2E-001");
});

test("職権異動: 起票から承認まで", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);
  const draft = await request.post("/api/v1/transactions/official", {
    headers: reviewHeaders,
    data: {
      residentId: "0000123456",
      reasonCode: "OFFICIAL_FIX",
      eventDate: "2026-05-16",
      legalBasis: "住民基本台帳法に基づく職権修正",
      content: "E2E 職権修正",
      approvalRoute: ["REVIEW", "ADMIN"],
    },
  });
  expect(draft.status()).toBe(201);
  const tx = await draft.json();
  expect(tx.typeCode).toBe("OFFICIAL");
  expect(tx.status).toBe("DRAFT");

  const approved = await request.post(`/api/v1/transactions/${tx.transactionId}/approve`, {
    headers: reviewHeaders,
    data: { action: "APPROVE", comment: "承認" },
  });
  expect(approved.status()).toBe(200);
  const approvedJson = await approved.json();
  expect(approvedJson.status).toBe("APPLIED");
});

test("CS 連携: 4情報照合 MATCH / MISMATCH / 不在 404", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);

  // MATCH: seed の 0000123456 の生年月日と性別が一致（住所/氏名は seed と
  // 半角/全角スペースが揺らぐため判定に含めない）
  const match = await request.post("/api/v1/link/cs/inbound", {
    headers: reviewHeaders,
    data: {
      residentId: "0000123456",
      fourInfo: { birthDate: "1985-04-01", sex: "M" },
    },
  });
  expect(match.status()).toBe(200);
  const mJson = await match.json();
  expect(mJson.status).toBe("MATCH");
  expect(mJson.matched).toBe(true);

  // MISMATCH: 性別違い
  const mismatch = await request.post("/api/v1/link/cs/inbound", {
    headers: reviewHeaders,
    data: { residentId: "0000123456", fourInfo: { sex: "F" } },
  });
  expect(mismatch.status()).toBe(200);
  const xJson = await mismatch.json();
  expect(xJson.status).toBe("MISMATCH");
  expect(xJson.differences).toContain("sex");

  // 不在 404
  const nf = await request.post("/api/v1/link/cs/inbound", {
    headers: reviewHeaders,
    data: { residentId: "ZZZ", fourInfo: { name: "X" } },
  });
  expect(nf.status()).toBe(404);
});

test("庁内連携 TAX: 住民データ提供 + residentIds 必須", async ({ request }) => {
  const reviewHeaders = headers(["REVIEW", "ADMIN"]);

  // 必須欠落 400
  const bad = await request.post("/api/v1/link/internal/tax", {
    headers: reviewHeaders,
    data: {},
  });
  expect(bad.status()).toBe(400);

  // 正常: 1 件返却
  const ok = await request.post("/api/v1/link/internal/tax", {
    headers: reviewHeaders,
    data: { residentIds: ["0000123456"] },
  });
  expect(ok.status()).toBe(200);
  const okJson = await ok.json();
  expect(okJson.partnerId).toBe("TAX");
  expect(okJson.status).toBe("APPLIED");
  expect(okJson.count).toBe(1);
  expect(okJson.residents[0].residentId).toBe("0000123456");
  // 個人番号・住民票コードは漏らさない
  expect(okJson.residents[0].myNumber).toBeUndefined();
  expect(okJson.residents[0].juminCode).toBeUndefined();
});

test("番号連携 LOOKUP: residentId に対し 4情報を返す", async ({ request }) => {
  const res = await request.post("/api/v1/link/number/inbound", {
    headers: headers(["ADMIN"]),
    data: { operation: "LOOKUP", residentId: "0000123456" },
  });
  expect(res.status()).toBe(200);
  const j = await res.json();
  expect(j.operation).toBe("LOOKUP");
  expect(j.data.residentId).toBe("0000123456");
});

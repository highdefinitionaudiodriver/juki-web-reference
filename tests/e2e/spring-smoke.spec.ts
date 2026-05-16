import { expect, test } from "@playwright/test";

/**
 * Spring 版 API のスモーク E2E。
 * 起動済前提（playwright.spring.config.ts の note 参照）。
 *
 * このテストは:
 *  1. /actuator/health で 200 を確認
 *  2. /v3/api-docs で OpenAPI スキーマが取得できる
 *  3. /api/v1/verify/{random} は 200 (改ざん防止検証は valid:false で返す想定)
 *
 * JWT 認証の有る API 群（住民検索など）の Spring 側 E2E は、
 * dev-IdP の払い出し or テスト用 JWT を SecurityConfig で受け付ける設定後に追加する。
 */

test("Spring API: health endpoint 200", async ({ request }) => {
  const res = await request.get("/actuator/health");
  expect(res.status()).toBe(200);
});

test("Spring API: /v3/api-docs で OpenAPI が返る", async ({ request }) => {
  const res = await request.get("/v3/api-docs");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.openapi).toMatch(/^3\./);
  expect(body.paths).toBeTruthy();
  // Resident API が存在することを確認
  expect(body.paths["/api/v1/residents/search"]).toBeTruthy();
});

test("Spring API: 改ざん防止検証 (公開) で 200 valid:false", async ({ request }) => {
  const res = await request.get("/api/v1/verify/NOSUCHTOKEN");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.valid).toBe(false);
});

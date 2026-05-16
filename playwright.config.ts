import { defineConfig, devices } from "@playwright/test";

/**
 * デフォルト Playwright 設定:
 *  - `npm run e2e` で動く
 *  - API ベースの E2E + UI ベースのスモークを含む
 *  - Spring 専用テスト (spring-*.spec.ts) は除外 — `playwright.spring.config.ts` を使う
 *  - API のみを高速に回すには `npm run e2e:api` (playwright.api.config.ts)
 */
export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: ["spring-*.spec.ts"],
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8787",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "ja-JP",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node apps/api/src/server.js",
    url: "http://localhost:8787/api/v1/me",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

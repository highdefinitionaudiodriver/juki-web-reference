import { defineConfig } from "@playwright/test";

/**
 * Spring 版 API に対する E2E 設定。
 *
 * 前提:
 *  - PostgreSQL を docker-compose で起動済 (apps/api-spring/docker-compose.yaml)
 *  - もしくは ${DB_URL} などで外部 DB を指す
 *  - Maven で起動: `mvn -B spring-boot:run`（別ターミナル）
 *    あるいは jar: `java -jar apps/api-spring/target/*.jar`
 *
 * 使い方:
 *   npm run e2e:spring
 *
 * 注意:
 *  - Spring 版は :8788 (Node 版は :8787)
 *  - 認証は Bearer JWT を要求するため、テストは X-Dev-Roles ヘッダではなく
 *    JWT を発行して Authorization に乗せる必要がある。
 *  - 現状は smoke 的にヘルスエンドポイントの疎通だけ確認するテストにとどめる。
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["spring-*.spec.ts"],
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.SPRING_BASE_URL ?? "http://localhost:8788",
    locale: "ja-JP",
  },
});

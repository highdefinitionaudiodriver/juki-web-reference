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
 *  - OIDC E2E は SPRING_OIDC_E2E=true のときだけ実行する。
 *    Keycloak dev realm + Spring API を起動し、OIDC_ISSUER を
 *    http://localhost:8080/realms/juki に向けること。
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

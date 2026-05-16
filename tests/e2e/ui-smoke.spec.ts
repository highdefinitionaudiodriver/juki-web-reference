import { expect, test } from "@playwright/test";

/**
 * UI ブラウザスモーク
 *   ChromeOS Flex 互換性確認のため Chromium で実行
 */
test("UI: 住民検索画面が表示される", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("住民検索");
  await expect(page.getByText("ChromeOS Flex")).toBeVisible();
});

test("UI: 検索 → 住民票表示", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "検索" }).click();
  await page.waitForSelector("tbody tr");
  await page.locator("tbody tr").first().click();
  await expect(page.locator("h1")).toContainText("住民票");
  await expect(page.locator("table.info")).toBeVisible();
});

test("UI: 証明発行プレビューに帳票が描画される", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "検索" }).click();
  await page.waitForSelector("tbody tr");
  await page.locator("tbody tr").first().click();
  await page.getByRole("button", { name: "証明発行" }).click();
  await expect(page.locator(".cert-paper")).toBeVisible();
  await expect(page.locator(".cert-paper .title")).toContainText("住");
});

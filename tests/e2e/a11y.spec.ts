import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * アクセシビリティスモーク（WCAG 2.1 AA / JIS X 8341-3 AA 相当）
 *
 * 主要画面に対して axe-core で違反 0 件を要求する。
 *
 * 注意:
 *  - 色コントラストやフォーカス順序のチェックを含む
 *  - 違反があった場合は Playwright report に詳細が出る
 *  - critical/serious 級のみ failing にしたい場合は include/exclude や
 *    withTags(['wcag2a','wcag2aa']) を絞る
 */

const SCOPE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

test("a11y: 住民検索画面", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".shell");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

test("a11y: 住民票画面", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.waitForSelector("tbody tr");
  await page.locator("tbody tr").first().click();
  await page.waitForSelector("h1");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

test("a11y: 証明発行画面", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.waitForSelector("tbody tr");
  await page.locator("tbody tr").first().click();
  await page.getByRole("button", { name: "証明発行" }).click();
  await page.waitForSelector(".cert-paper");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

test("a11y: 抑止設定画面 (SCR-301)", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.waitForSelector("tbody tr");
  await page.locator("tbody tr").first().click();
  await page.getByRole("button", { name: "抑止設定" }).click();
  await page.waitForSelector("h2");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

test("a11y: 異動画面", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.waitForSelector("tbody tr");
  await page.locator("tbody tr").first().click();
  await page.getByRole("button", { name: "異動" }).click();
  await page.waitForSelector("h2");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

test("a11y: 統計/EUC 画面", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".shell");
  await page.getByRole("button", { name: "統計/EUC" }).click();
  await page.waitForSelector("h2");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

test("a11y: 権限/監査 画面", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".shell");
  await page.getByRole("button", { name: "権限/監査" }).click();
  await page.waitForSelector("h2");
  const results = await new AxeBuilder({ page }).withTags(SCOPE_TAGS).analyze();
  expect(results.violations, prettyViolations(results.violations)).toEqual([]);
});

function prettyViolations(violations: unknown[]): string {
  return JSON.stringify(violations, null, 2);
}

#!/usr/bin/env node
/**
 * OpenAPI 差分検出
 *
 * 使い方:
 *   node tools/openapi-diff.mjs --spring http://localhost:8788/v3/api-docs --spec c_openapi.yaml
 *
 * 動作:
 *   1. SSOT である `c_openapi.yaml` のパス・スキーマ集合を作る
 *   2. Spring の `/v3/api-docs` を取得し、同様の集合を作る
 *   3. 不一致（追加・削除・operation 変更）を一覧表示する
 *   4. 不一致があれば exit code 1
 */
import { readFile } from "node:fs/promises";
import { argv, exit } from "node:process";
import yaml from "js-yaml";

const args = Object.fromEntries(
  argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const springUrl = args.spring || "http://localhost:8788/v3/api-docs";
const specPath = args.spec || "c_openapi.yaml";

const spec = yaml.load(await readFile(specPath, "utf8"));

let runtime;
try {
  const res = await fetch(springUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  runtime = await res.json();
} catch (e) {
  console.error(`[openapi-diff] Failed to fetch ${springUrl}: ${e.message}`);
  console.error(`[openapi-diff] Hint: run \`mvn spring-boot:run\` (or jar) first.`);
  exit(2);
}

// servers.url のパス部分を共通プレフィクスとして抽出
//   c_openapi.yaml: servers.url = "https://{tenant}.juki.example.go.jp/api/v1" → "/api/v1"
//   Spring runtime: paths は @RequestMapping("/api/v1/...") を含んだ絶対パス
// 比較前に両者を同じ基準（/api/v1 含み）に揃える。
const specBase = serverBasePath(spec);
const runtimeBase = serverBasePath(runtime);

const specOps = collectOperations(spec, specBase);
const runtimeOps = collectOperations(runtime, runtimeBase);

const onlyInSpec = [...specOps].filter((o) => !runtimeOps.has(o)).sort();
const onlyInRuntime = [...runtimeOps].filter((o) => !specOps.has(o)).sort();

console.log(`spec(${specPath}) operations:`, specOps.size);
console.log(`runtime(${springUrl}) operations:`, runtimeOps.size);

if (onlyInSpec.length) {
  console.log("\n--- 仕様にあり実装にない (Spring 未実装) ---");
  onlyInSpec.forEach((op) => console.log("  -", op));
}
if (onlyInRuntime.length) {
  console.log("\n--- 実装にあり仕様にない (yaml 更新もれ) ---");
  onlyInRuntime.forEach((op) => console.log("  +", op));
}

const drift = onlyInSpec.length + onlyInRuntime.length;
if (drift === 0) {
  console.log("\n✓ no drift");
  exit(0);
}
console.log(`\n✗ drift: ${drift} operations`);
exit(1);

function collectOperations(doc, basePath = "") {
  const set = new Set();
  if (!doc?.paths) return set;
  for (const [rawPath, methods] of Object.entries(doc.paths)) {
    const normalized = normalizePath(rawPath, basePath);
    for (const method of ["get", "put", "post", "delete", "patch", "head", "options"]) {
      if (methods?.[method]) set.add(`${method.toUpperCase()} ${normalized}`);
    }
  }
  return set;
}

/**
 * doc.servers[0].url からパス部分（例: "/api/v1"）を返す。
 * テンプレ変数 ({tenant} 等) は無視。サーバ未指定は空文字。
 */
function serverBasePath(doc) {
  const url = doc?.servers?.[0]?.url;
  if (!url) return "";
  try {
    // テンプレ展開は不要、パス部分だけ取れれば良いので、URL コンストラクタが
    // 失敗する URL も自前で抽出する。
    const m = url.match(/^[a-z]+:\/\/[^/]+(\/.*)?$/i);
    return m && m[1] ? m[1].replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

/**
 * パス文字列を比較用に正規化する。
 *
 *   - basePath が空ならそのまま、含むなら付与（/residents → /api/v1/residents）
 *   - パス変数名は構造比較のため `{_}` に統一
 *     (spec: `/residents/{residentId}` と runtime: `/residents/{id}` を同一視)
 */
function normalizePath(path, basePath) {
  let p = path;
  if (basePath && !(p.startsWith(basePath + "/") || p === basePath)) {
    p = basePath + p;
  }
  // パス変数名を {_} に統一
  p = p.replace(/\{[^}]+\}/g, "{_}");
  return p;
}

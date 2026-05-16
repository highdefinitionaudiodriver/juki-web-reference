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

const specOps = collectOperations(spec);
const runtimeOps = collectOperations(runtime);

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

function collectOperations(doc) {
  const set = new Set();
  if (!doc?.paths) return set;
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const method of ["get", "put", "post", "delete", "patch", "head", "options"]) {
      if (methods?.[method]) set.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return set;
}

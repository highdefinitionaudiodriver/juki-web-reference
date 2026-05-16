import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve("c_openapi.yaml"), "utf8");
const schemaNames = [...source.matchAll(/^    ([A-Za-z][A-Za-z0-9]*):\r?$/gm)].map((match) => match[1]);
const body = schemaNames.map((name) => `export interface ${name} { [key: string]: unknown }\n`).join("");
writeFileSync(resolve("packages/openapi/generated-types.ts"), `// Generated placeholder from c_openapi.yaml\n${body}`, "utf8");
console.log(`Generated ${schemaNames.length} schema stubs.`);

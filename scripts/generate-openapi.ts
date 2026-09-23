import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOpenApiDocument } from "../src/shared/openapi/openapi.document";

const target = resolve(process.cwd(), "openapi.json");
const document = buildOpenApiDocument(process.argv[2]);

writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, "utf-8");

const operations = Object.values(document.paths).reduce(
  (total, item) => total + Object.keys(item).length,
  0,
);

process.stdout.write(`openapi.json gerado com ${operations} operações\n`);

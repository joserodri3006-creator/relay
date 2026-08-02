import fs from "node:fs/promises";
import { openapiDocument } from "../dist/server/openapi.js";

const target = process.env.OPENAPI_TARGET ?? "outputs/arbeitszyklus-11/openapi.json";
await fs.mkdir(new URL(".", `file://${process.cwd()}/${target}`).pathname, { recursive: true });
await fs.writeFile(target, `${JSON.stringify(openapiDocument, null, 2)}\n`, "utf8");
console.log(`OpenAPI exportiert: ${target}`);

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { swaggerSpec } from "../src/config/swagger.js";

const root = dirname(fileURLToPath(import.meta.url));
const spec = `${JSON.stringify(swaggerSpec, null, 2)}\n`;
const backendOut = join(root, "..", "openapi.json");
const sharedOut = join(root, "..", "..", "shared", "openapi", "openapi.json");
writeFileSync(backendOut, spec);
writeFileSync(sharedOut, spec);
process.stdout.write(`Wrote ${backendOut}\nWrote ${sharedOut}\n`);

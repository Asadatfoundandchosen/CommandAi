import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { swaggerSpec } from "../src/config/swagger.js";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "..", "openapi.json");
writeFileSync(out, `${JSON.stringify(swaggerSpec, null, 2)}\n`);

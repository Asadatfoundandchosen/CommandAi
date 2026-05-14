import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import swaggerJsdoc from "swagger-jsdoc";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcOrDistRoot = join(__dirname, "..");
const isCompiledBundle = srcOrDistRoot.replace(/\\/g, "/").endsWith("/dist");
const ext = isCompiledBundle ? "js" : "ts";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "1CommandAI API",
      version: "1.0.0",
      description: "Enterprise Control Layer for the Agent Economy",
    },
    servers: [
      { url: "/api", description: "REST API (mounted under /api)" },
      { url: "/", description: "Host root (health)" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        /** Bearer value must equal env `PLATFORM_ADMIN_TOKEN`. */
        platformAdminBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "PLATFORM_ADMIN_TOKEN",
          description:
            "Platform admin token for Organization CRUD only (same value as PLATFORM_ADMIN_TOKEN)",
        },
        /** MVP caller role; production should use JWT claims instead. */
        hierarchyRole: {
          type: "apiKey",
          in: "header",
          name: "X-User-Role",
          description:
            "One of: org_admin, account_admin, dept_manager, dept_user. Minimum role varies by route group.",
        },
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
      },
    },
  },
  apis: [
    join(srcOrDistRoot, "modules", "**", `*.routes.${ext}`),
    join(srcOrDistRoot, "modules", "**", `*.controller.${ext}`),
    join(srcOrDistRoot, "common", "**", `*.routes.${ext}`),
    join(srcOrDistRoot, "common", "**", `*.controller.${ext}`),
  ],
});

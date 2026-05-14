import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "backend/dist/**",
      "dist/**",
      "node_modules/**",
      "src/components/**",
      "infrastructure/**",
      ".cursor/**",
      "coverage/**",
      "**/*.cjs",
      "jest.config.js",
      "tests/e2e/**/*.spec.ts",
    ],
  },
  {
    files: ["backend/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./backend/tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "src/telemetry.ts",
      "src/lib/datadog-metrics.ts",
      "src/lib/datadog-metrics-dd.unit.test.ts",
    ],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);

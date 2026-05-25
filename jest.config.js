/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: [
    "<rootDir>/src/**/*.unit.test.ts",
    "<rootDir>/tests/**/*.integration.test.ts",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.node.json",
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/*.unit.test.{ts,tsx}",
    "!src/**/*.integration.test.{ts,tsx}",
    "!src/**/*.spec.{ts,tsx}",
    "!src/lib/datadog-metrics.ts",
  ],
  coveragePathIgnorePatterns: [
    "<rootDir>/src/components/",
    "<rootDir>/node_modules/",
    "<rootDir>/src/main.ts",
    "<rootDir>/src/telemetry.ts",
    "<rootDir>/src/datadog.ts",
    "<rootDir>/src/instrumentation.ts",
    "<rootDir>/src/lib/logger.ts",
    "<rootDir>/src/lib/trace-middleware.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "json-summary"],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
    },
  },
};

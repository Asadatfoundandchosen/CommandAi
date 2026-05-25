import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      'backend/dist/**',
      'dist/**',
      'dist-web/**',
      'node_modules/**',
      'infrastructure/**',
      '.cursor/**',
      'coverage/**',
      '**/*.cjs',
      'jest.config.js',
      'tests/e2e/**/*.spec.ts',
    ],
  },
  {
    files: ['backend/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './backend/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: [
      'src/datadog.ts',
      'src/instrumentation.ts',
      'src/main.ts',
      'src/telemetry.ts',
      'src/lib/**/*.ts',
      'src/__ci__/**/*.ts',
      'tests/**/*.ts',
      'playwright.config.ts',
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{tsx,ts}'],
    ignores: [
      'src/datadog.ts',
      'src/instrumentation.ts',
      'src/main.ts',
      'src/telemetry.ts',
      'src/lib/**',
      'src/__ci__/**',
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/components/ui/**/*.{tsx,ts}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: [
      'src/telemetry.ts',
      'src/lib/datadog-metrics.ts',
      'src/lib/datadog-metrics-dd.unit.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);

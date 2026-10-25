import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

const browserGlobals = {
  document: 'readonly',
  fetch: 'readonly',
  globalThis: 'readonly',
  HTMLElement: 'readonly',
  structuredClone: 'readonly',
  window: 'readonly',
};

const nodeGlobals = {
  AbortSignal: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  module: 'readonly',
  process: 'readonly',
  Response: 'readonly',
  structuredClone: 'readonly',
  URL: 'readonly',
};

export default tseslint.config(
  {
    ignores: [
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/web/tests/**/*.ts'],
    languageOptions: {
      globals: browserGlobals,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['apps/api/src/**/*.ts', 'packages/shared/src/**/*.ts', '**/*.{cjs,js,mjs}'],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        __dirname: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/apps/api/**',
                '**/apps/web/**',
                '@paralleax/api',
                '@paralleax/api/**',
                '@paralleax/web',
                '@paralleax/web/**',
                'apps/api/**',
                'apps/web/**',
                '@nestjs/**',
                '@xyflow/**',
                'axios',
                'http',
                'https',
                'node-fetch',
                'node:http',
                'node:https',
                'pg',
                'react',
                'react/**',
                'react-dom',
                'react-dom/**',
                'reactflow',
                'undici',
              ],
              message:
                'packages/shared must remain independent of UI, API, database, and HTTP layers.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          globals: [
            'cancelAnimationFrame',
            'document',
            'fetch',
            'HTMLElement',
            'IntersectionObserver',
            'localStorage',
            'location',
            'MutationObserver',
            'navigator',
            'requestAnimationFrame',
            'ResizeObserver',
            'sessionStorage',
            'window',
          ].map((name) => ({
            name,
            message: 'packages/shared must remain independent of browser and network APIs.',
          })),
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@paralleax/api', '@paralleax/api/**'],
              message: 'apps/web must consume the API over HTTP.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@paralleax/web', '@paralleax/web/**'],
              message: 'apps/api must not import frontend implementations.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/api/src/**/*.ts', 'packages/shared/src/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/test/**'],
    rules: {
      complexity: ['error', 20],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'apps/web/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);

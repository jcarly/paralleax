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

const typeAwareIgnores = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/test/**',
  '**/__architecture_guard_fixture__.ts',
  '**/__architecture_baseline_fixture__.ts',
];

const typeAwareRules = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-unnecessary-type-assertion': 'error',
  '@typescript-eslint/no-unsafe-argument': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'error',
  '@typescript-eslint/no-unsafe-call': 'error',
  '@typescript-eslint/no-unsafe-declaration-merging': 'error',
  '@typescript-eslint/no-unsafe-enum-comparison': 'error',
  '@typescript-eslint/no-unsafe-function-type': 'error',
  '@typescript-eslint/no-unsafe-member-access': 'error',
  '@typescript-eslint/no-unsafe-return': 'error',
  '@typescript-eslint/no-unsafe-unary-minus': 'error',
};

function typeAwareWorkspaceConfig(files, project) {
  return {
    files,
    ignores: [...typeAwareIgnores],
    languageOptions: {
      parserOptions: {
        project: [project],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { ...typeAwareRules },
  };
}

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
  typeAwareWorkspaceConfig(['packages/shared/src/**/*.ts'], './packages/shared/tsconfig.json'),
  typeAwareWorkspaceConfig(['apps/api/src/**/*.ts'], './apps/api/tsconfig.json'),
  typeAwareWorkspaceConfig(['apps/web/src/**/*.{ts,tsx}'], './apps/web/tsconfig.json'),
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

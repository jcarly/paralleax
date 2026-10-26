import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';
import requireSharedFormControl from './scripts/eslint-rules/require-shared-form-control.mjs';

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
  '**/__architecture_guard_fixture__.ts',
  '**/__architecture_baseline_fixture__.ts',
  '**/__design_system_rule_fixture__.tsx',
  '**/__architecture_guard_fixture__.test.ts',
  '**/__eslint_fixture__.test.ts',
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
  '@typescript-eslint/no-unsafe-type-assertion': 'error',
  '@typescript-eslint/prefer-promise-reject-errors': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/only-throw-error': 'error',
  '@typescript-eslint/return-await': ['error', 'in-try-catch'],
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: false },
  ],
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
      'quality-reports/**',
      'test-data/local/**',
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
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
    files: ['apps/web/src/**/*.tsx'],
    ignores: [
      'apps/web/src/**/*.test.tsx',
      'apps/web/src/**/*.spec.tsx',
      'apps/web/src/pages/ParalleaxPrototype.tsx',
      'apps/web/src/pages/ParalleaxPrototypePages.tsx',
    ],
    plugins: {
      'design-system': {
        rules: {
          'require-shared-form-control': requireSharedFormControl,
        },
      },
    },
    rules: {
      'design-system/require-shared-form-control': 'error',
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
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    plugins: { sonarjs },
    rules: {
      complexity: ['error', 10],
      'sonarjs/cognitive-complexity': ['error', 10],
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  typeAwareWorkspaceConfig(
    ['packages/shared/src/**/*.ts'],
    './packages/shared/tsconfig.eslint.json',
  ),
  typeAwareWorkspaceConfig(['apps/api/src/**/*.ts'], './apps/api/tsconfig.eslint.json'),
  typeAwareWorkspaceConfig(['apps/web/**/*.{ts,tsx}'], './apps/web/tsconfig.eslint.json'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);

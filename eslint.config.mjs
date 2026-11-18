import js from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
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
  '**/__quality_react_a11y_fixture__.tsx',
  '**/__architecture_guard_fixture__.test.ts',
  '**/__eslint_fixture__.test.ts',
];

const typeAwareRules = {
  '@typescript-eslint/no-unnecessary-condition': 'error',
  '@typescript-eslint/strict-boolean-expressions': 'error',
  '@typescript-eslint/prefer-nullish-coalescing': 'error',
  '@typescript-eslint/prefer-optional-chain': 'error',
  '@typescript-eslint/no-confusing-void-expression': 'error',
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

function enforceErrorRules(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([rule, setting]) => {
      if (setting === 'warn' || setting === 1) {
        return [rule, 'error'];
      }
      if (Array.isArray(setting) && (setting[0] === 'warn' || setting[0] === 1)) {
        return [rule, ['error', ...setting.slice(1)]];
      }
      return [rule, setting];
    }),
  );
}

const reactRules = enforceErrorRules({
  ...eslintReact.configs['recommended-typescript'].rules,
  // Keep the existing React Hooks plugin as the single source for these checks.
  '@eslint-react/error-boundaries': 'off',
  '@eslint-react/exhaustive-deps': 'off',
  '@eslint-react/purity': 'off',
  '@eslint-react/rules-of-hooks': 'off',
  '@eslint-react/set-state-in-effect': 'off',
  '@eslint-react/set-state-in-render': 'off',
  '@eslint-react/static-components': 'off',
  '@eslint-react/unsupported-syntax': 'off',
  '@eslint-react/use-memo': 'off',
  // Naming conventions and server-component rules are outside the project's concerns.
  '@eslint-react/naming-convention-context-name': 'off',
  '@eslint-react/naming-convention-id-name': 'off',
  '@eslint-react/naming-convention-ref-name': 'off',
  '@eslint-react/no-unnecessary-use-prefix': 'off',
  '@eslint-react/rsc-function-definition': 'off',
  '@eslint-react/no-leaked-conditional-rendering': 'error',
  '@eslint-react/no-unstable-context-value': 'error',
});

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
    files: ['**/*.{js,cjs,mjs,jsx,ts,tsx}'],
    rules: {
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'no-duplicate-imports': 'error',
    },
  },
  {
    files: [
      '**/*.{test,spec}.{js,cjs,mjs,jsx,ts,tsx}',
      '**/{test,tests,__tests__}/**/*.{js,cjs,mjs,jsx,ts,tsx}',
    ],
    rules: {
      'max-lines': ['error', { max: 600, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    ...eslintReact.configs['recommended-typescript'],
    files: ['apps/web/**/*.{jsx,tsx}'],
    rules: reactRules,
  },
  {
    ...jsxA11y.configs.recommended,
    files: ['apps/web/**/*.{jsx,tsx}'],
    rules: enforceErrorRules(jsxA11y.configs.recommended.rules),
  },
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

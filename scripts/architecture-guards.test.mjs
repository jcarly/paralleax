import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dependencyCruiserCli = path.join(
  repositoryRoot,
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruiser.mjs',
);

function writeFixture(root, relativePath, contents) {
  const destination = path.join(root, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function complexFunction(name) {
  const branches = Array.from(
    { length: 21 },
    (_, index) => `if (value === ${index}) return ${index};`,
  ).join('\n');
  return `export function ${name}(value) {\n${branches}\nreturn -1;\n}`;
}

function dependencyCruiser(root) {
  return spawnSync(
    process.execPath,
    [
      dependencyCruiserCli,
      'apps',
      'packages',
      '--config',
      path.join(repositoryRoot, '.dependency-cruiser.cjs'),
      '--no-ignore-known',
      '--output-type',
      'err',
    ],
    { cwd: root, encoding: 'utf8' },
  );
}

function createDependencyFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'paralleax-architecture-'));

  writeFixture(
    root,
    'apps/web/tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: root,
        paths: {
          '@paralleax/shared': ['packages/shared/src/index.ts'],
          '@paralleax/shared/*': ['packages/shared/src/*'],
        },
      },
      files: [path.join(root, 'apps/web/src/feature.ts')],
    }),
  );
  writeFixture(root, 'packages/shared/src/index.ts', 'export const shared = true;\n');
  writeFixture(root, 'packages/shared/src/model/internal.ts', 'export const internal = true;\n');
  writeFixture(root, 'apps/web/src/storyGraph.ts', "import '@xyflow/react';\n");
  writeFixture(
    root,
    'apps/web/src/feature.ts',
    "import { shared } from '@paralleax/shared';\nexport { shared };\n",
  );
  writeFixture(
    root,
    'apps/api/src/stories/stories.service.ts',
    "import { shared } from '@paralleax/shared';\nexport { shared };\n",
  );
  writeFixture(root, 'node_modules/@xyflow/react/package.json', '{"main":"index.js"}\n');
  writeFixture(root, 'node_modules/@xyflow/react/index.js', 'module.exports = {};\n');

  return root;
}

test('architecture dependency rules allow current workspace and graph dependencies', (t) => {
  const root = createDependencyFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const result = dependencyCruiser(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('architecture dependency rules reject boundary violations and new cycles', (t) => {
  const root = createDependencyFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  writeFixture(
    root,
    'apps/web/src/uses-api.ts',
    "import '../../api/src/stories/stories.service';\n",
  );
  writeFixture(root, 'apps/api/src/uses-web.ts', "import '../../web/src/feature';\n");
  writeFixture(
    root,
    'apps/web/src/shared-bypass.ts',
    "import '../../../packages/shared/src/model/internal';\n",
  );
  writeFixture(
    root,
    'apps/api/src/stories/stories.controller.ts',
    "import './stories.repository';\n",
  );
  writeFixture(root, 'apps/api/src/stories/stories.repository.ts', 'export {};\n');
  writeFixture(root, 'apps/web/src/uses-react-flow.ts', "import '@xyflow/react';\n");
  writeFixture(
    root,
    'apps/web/src/cycle-a.ts',
    "import type { CycleB } from './cycle-b';\nexport type CycleA = { next?: CycleB };\n",
  );
  writeFixture(
    root,
    'apps/web/src/cycle-b.ts',
    "import type { CycleA } from './cycle-a';\nexport type CycleB = { next?: CycleA };\n",
  );

  const result = dependencyCruiser(root);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  for (const rule of [
    'web-not-api',
    'api-not-web',
    'shared-public-facade',
    'controllers-not-persistence',
    'react-flow-only-in-graph',
    'no-circular',
  ]) {
    assert.match(output, new RegExp(rule), `Expected ${rule} in:\n${output}`);
  }
});

test('ESLint blocks production complexity above ten and shared browser globals', async () => {
  const eslint = new ESLint({ cwd: repositoryRoot });
  const branches = Array.from(
    { length: 11 },
    (_, index) => `if (value === ${index}) return ${index};`,
  ).join('\n');
  const tooComplex = await eslint.lintText(
    `export function target(value) {\n${branches}\nreturn -1;\n}`,
    { filePath: path.join(repositoryRoot, 'apps/web/src/__architecture_guard_fixture__.ts') },
  );
  const browserGlobal = await eslint.lintText('export const title = window.document.title;', {
    filePath: path.join(
      repositoryRoot,
      'packages/shared/src/__architecture_guard_fixture__.test.ts',
    ),
  });

  assert.ok(tooComplex[0].messages.some((message) => message.ruleId === 'complexity'));
  assert.ok(
    browserGlobal[0].messages.some((message) => message.ruleId === 'no-restricted-globals'),
  );
});

test('Dependency Cruiser rejects stale native baseline entries', (t) => {
  const root = createDependencyFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [
      dependencyCruiserCli,
      'apps',
      'packages',
      '--config',
      path.join(repositoryRoot, '.dependency-cruiser.cjs'),
      '--ignore-known',
      path.join(repositoryRoot, '.dependency-cruiser-known-violations.json'),
      '--output-type',
      'err',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /stale/i);
});

test('ESLint blocks direct web-to-API package imports', async () => {
  const eslint = new ESLint({ cwd: repositoryRoot });
  const result = await eslint.lintText("import '@paralleax/api/internal';\n", {
    filePath: path.join(repositoryRoot, 'apps/web/src/__architecture_guard_fixture__.ts'),
  });

  assert.ok(result[0].messages.some((message) => message.ruleId === 'no-restricted-imports'));
});

test('native complexity suppression baseline is keyed by file and rule count', async (t) => {
  const temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'paralleax-eslint-baseline-'));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  const filePath = path.join(repositoryRoot, 'apps/web/src/__architecture_baseline_fixture__.ts');
  const suppressionPath = path.join(temporaryDirectory, 'eslint-suppressions.json');
  const relativeFile = path.relative(repositoryRoot, filePath).split(path.sep).join('/');
  writeFileSync(suppressionPath, JSON.stringify({ [relativeFile]: { complexity: { count: 1 } } }));
  const eslint = new ESLint({
    cwd: repositoryRoot,
    applySuppressions: true,
    suppressionsLocation: suppressionPath,
  });
  const oneViolation = await eslint.lintText(complexFunction('first'), { filePath });
  const twoViolations = await eslint.lintText(
    `${complexFunction('first')}\n${complexFunction('second')}`,
    { filePath },
  );
  const replacement = await eslint.lintText(complexFunction('replacement'), { filePath });
  assert.equal(
    replacement[0].messages.filter((message) => message.ruleId === 'complexity').length,
    0,
    'native counts cannot distinguish an equal-count replacement; this accepted limitation must stay visible',
  );

  assert.equal(
    oneViolation[0].messages.filter((message) => message.ruleId === 'complexity').length,
    0,
  );
  assert.equal(
    oneViolation[0].suppressedMessages.filter((message) => message.ruleId === 'complexity').length,
    1,
  );
  assert.equal(
    twoViolations[0].messages.filter((message) => message.ruleId === 'complexity').length,
    2,
  );
});

test('native ESLint baseline never suppresses a new file automatically', async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'paralleax-new-file-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const suppressions = path.join(root, 'eslint-suppressions.json');
  writeFileSync(
    suppressions,
    JSON.stringify({
      'apps/web/src/__architecture_baseline_fixture__.ts': { complexity: { count: 1 } },
    }),
  );
  const eslint = new ESLint({ applySuppressions: true, suppressionsLocation: suppressions });
  const [result] = await eslint.lintText(complexFunction('newFile'), {
    filePath: path.join(repositoryRoot, 'apps/api/src/__architecture_baseline_fixture__.ts'),
  });
  assert.equal(result.messages.filter((message) => message.ruleId === 'complexity').length, 1);
});

test('typed ESLint rules and the suppression baseline cover all production workspaces', async () => {
  const eslint = new ESLint({
    cwd: repositoryRoot,
    applySuppressions: true,
    suppressionsLocation: path.join(repositoryRoot, 'eslint-suppressions.json'),
  });
  const ruleIds = [
    '@typescript-eslint/no-floating-promises',
    '@typescript-eslint/no-misused-promises',
    '@typescript-eslint/no-unnecessary-type-assertion',
    '@typescript-eslint/no-unsafe-argument',
    '@typescript-eslint/no-unsafe-assignment',
    '@typescript-eslint/no-unsafe-call',
    '@typescript-eslint/no-unsafe-declaration-merging',
    '@typescript-eslint/no-unsafe-enum-comparison',
    '@typescript-eslint/no-unsafe-function-type',
    '@typescript-eslint/no-unsafe-member-access',
    '@typescript-eslint/no-unsafe-return',
    '@typescript-eslint/no-unsafe-unary-minus',
  ];
  const sourceFiles = [
    'packages/shared/src/import-export/qsp/converter.ts',
    'apps/api/src/main.ts',
    'apps/web/src/main.tsx',
  ];
  const sourceConfigs = await Promise.all(
    sourceFiles.map((file) => eslint.calculateConfigForFile(path.join(repositoryRoot, file))),
  );
  const [converterResult] = await eslint.lintFiles([
    'packages/shared/src/import-export/qsp/converter.ts',
  ]);

  for (const [index, sourceConfig] of sourceConfigs.entries()) {
    for (const ruleId of ruleIds) {
      assert.equal(
        sourceConfig.rules[ruleId][0],
        2,
        `${ruleId} must be an error for ${sourceFiles[index]}`,
      );
    }
  }
  assert.ok(
    converterResult.suppressedMessages.some(
      ({ ruleId }) => ruleId === '@typescript-eslint/no-unsafe-assignment',
    ),
  );
});

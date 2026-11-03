import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { baselineFiles } from './quality/baseline-policy.mjs';
import { digest, writeJson } from './quality/counts.mjs';
import { cloneCounts, scanDuplicates } from './quality/duplicates.mjs';

function project(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'paralleax-quality-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, file, value) {
  const destination = path.join(root, file);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, value);
}

function run(root, module, args = [], environment = {}) {
  const script = fileURLToPath(new URL(`./quality/${module}.mjs`, import.meta.url));
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, BASELINE_BASE_REF: 'HEAD', ...environment },
  });
}

test('CSS baseline CLI rejects stale entries and pruning never accepts a new violation', (t) => {
  const root = project(t);
  const file = 'apps/web/src/fixture.css';
  const baseline = path.join(root, 'stylelint-suppressions.json');
  write(root, 'stylelint.config.mjs', "export default {rules: {'color-no-hex': true}};");
  writeJson(baseline, { [file]: { 'color-no-hex': { count: 1 } } });
  write(root, file, '.fixture { color: #123456; }');
  assert.equal(run(root, 'css-baseline').status, 0);
  write(root, file, '.fixture { color: var(--safe); }');
  assert.notEqual(run(root, 'css-baseline').status, 0);
  assert.equal(run(root, 'css-baseline', ['--prune']).status, 0);
  const before = readFileSync(baseline, 'utf8');
  write(root, file, '.fixture { color: #abcdef; }');
  assert.notEqual(run(root, 'css-baseline', ['--prune']).status, 0);
  assert.equal(readFileSync(baseline, 'utf8'), before);
});

test('native ESLint CLI fails stale suppressions and prunes without accepting new violations', (t) => {
  const root = project(t);
  const cli = fileURLToPath(new URL('../node_modules/eslint/bin/eslint.js', import.meta.url));
  const baseline = path.join(root, 'eslint-suppressions.json');
  write(root, 'eslint.config.mjs', "export default [{rules:{complexity:['error',10]}}];");
  write(root, 'fixture.js', 'export function sample() { return 1; }');
  writeJson(baseline, { 'fixture.js': { complexity: { count: 1 } } });
  const invoke = (extra = []) =>
    spawnSync(
      process.execPath,
      [cli, 'fixture.js', '--suppressions-location', baseline, ...extra],
      { cwd: root, encoding: 'utf8' },
    );
  assert.notEqual(invoke().status, 0);
  assert.equal(invoke(['--prune-suppressions']).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(baseline, 'utf8')), {});
  const branches = Array.from(
    { length: 11 },
    (_, index) => `if(n===${index}){return ${index};}`,
  ).join('\n');
  write(root, 'fixture.js', `export function sample(n) {${branches} return -1;}`);
  assert.notEqual(invoke(['--prune-suppressions']).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(baseline, 'utf8')), {});
});

function scanIn(root) {
  const previous = process.cwd();
  try {
    process.chdir(root);
    return cloneCounts(scanDuplicates());
  } finally {
    process.chdir(previous);
  }
}

test('real clone gate tolerates line moves but rejects a third copy and edited clones', (t) => {
  const root = project(t);
  writeJson(path.join(root, '.jscpd.json'), {
    path: ['apps/api/src'],
    minTokens: 40,
    minLines: 5,
    format: ['typescript'],
    reporters: ['json'],
    silent: true,
  });
  const source = `export function sample(input: number) {\nlet total = input;\n${Array.from(
    { length: 12 },
    (_, index) => `total += input * ${index};`,
  ).join('\n')}\nreturn total;\n}\n`;
  write(root, 'apps/api/src/a.ts', source);
  write(root, 'apps/api/src/b.ts', source);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['add', 'apps/api/src'], { cwd: root });
  const accepted = scanIn(root);
  assert.ok(Object.keys(accepted).length);
  const baseline = path.join(root, '.duplication-baseline.json');
  writeJson(baseline, accepted);
  assert.equal(run(root, 'duplicates').status, 0);
  write(root, 'apps/api/src/a.ts', `\n\n${source}`);
  assert.equal(run(root, 'duplicates').status, 0);
  write(root, 'apps/api/src/c.ts', source);
  assert.notEqual(run(root, 'duplicates').status, 0);
  rmSync(path.join(root, 'apps/api/src/c.ts'));
  const before = readFileSync(baseline, 'utf8');
  write(root, 'apps/api/src/a.ts', source.replace('return total;', 'return total + 1;'));
  write(root, 'apps/api/src/b.ts', source.replace('return total;', 'return total + 1;'));
  assert.notEqual(run(root, 'duplicates', ['--prune']).status, 0);
  assert.equal(readFileSync(baseline, 'utf8'), before);
});

test('clone gate ignores tracked files deleted from the current worktree', (t) => {
  const root = project(t);
  writeJson(path.join(root, '.jscpd.json'), {
    path: ['apps/api/src'],
    minTokens: 40,
    minLines: 5,
    format: ['typescript'],
    reporters: ['json'],
    silent: true,
  });
  const source = `export function sample(input: number) {\nlet total = input;\n${Array.from(
    { length: 12 },
    (_, index) => `total += input * ${index};`,
  ).join('\n')}\nreturn total;\n}\n`;
  write(root, 'apps/api/src/a.ts', source);
  write(root, 'apps/api/src/b.ts', source);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['add', 'apps/api/src'], { cwd: root });
  writeJson(path.join(root, '.duplication-baseline.json'), scanIn(root));

  rmSync(path.join(root, 'apps/api/src/a.ts'));
  assert.equal(run(root, 'duplicates', ['--prune']).status, 0);
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(root, '.duplication-baseline.json'), 'utf8')),
    {},
  );
});

function policyProject(t) {
  const root = project(t);
  const previous = { 'file.ts': { complexity: { count: 1 } } };
  write(root, 'file.ts', 'export const value = 1;');
  for (const file of baselineFiles) {
    writeJson(path.join(root, file), file.includes('dependency-cruiser') ? [] : previous);
  }
  writeJson(path.join(root, 'quality-baseline-transitions.json'), []);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  execFileSync('git', ['add', '--', ...baselineFiles, 'quality-baseline-transitions.json'], {
    cwd: root,
  });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '--quiet',
      '-m',
      'fixture',
    ],
    { cwd: root },
  );
  return root;
}

test('Git comparison rejects a changed baseline unless its exact transition is recorded', (t) => {
  const root = policyProject(t);
  const previous = { 'file.ts': { complexity: { count: 1 } } };
  const current = { 'file.ts': { complexity: { count: 2 } } };
  assert.equal(run(root, 'baseline-policy').status, 0);
  writeJson(path.join(root, 'eslint-suppressions.json'), current);
  assert.notEqual(run(root, 'baseline-policy').status, 0);
  writeJson(path.join(root, 'quality-baseline-transitions.json'), [
    {
      file: 'eslint-suppressions.json',
      before: digest(previous),
      after: digest(current),
      reason: 'An explicitly reviewed initial rule migration accepts these existing violations.',
    },
  ]);
  assert.equal(run(root, 'baseline-policy').status, 0);
  assert.notEqual(run(root, 'baseline-policy', ['missing-ref']).status, 0);
  rmSync(path.join(root, 'file.ts'));
  assert.notEqual(run(root, 'baseline-policy').status, 0);
});

test('new-branch push compares all branch changes with the default-branch merge base', (t) => {
  const root = policyProject(t);
  execFileSync('git', ['branch', 'comparison-base'], { cwd: root });
  writeJson(path.join(root, 'eslint-suppressions.json'), {
    'file.ts': { complexity: { count: 2 } },
  });
  execFileSync('git', ['add', 'eslint-suppressions.json'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      'commit',
      '--quiet',
      '-m',
      'growth',
    ],
    { cwd: root },
  );
  const result = run(root, 'baseline-policy', [], {
    BASELINE_BASE_REF: '0'.repeat(40),
    BASELINE_DEFAULT_REF: 'comparison-base',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unapproved baseline growth/);
});

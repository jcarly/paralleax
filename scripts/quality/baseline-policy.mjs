import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { compareCounts, digest, flattenCounts, readJson } from './counts.mjs';

export const baselineFiles = [
  'eslint-suppressions.json',
  'stylelint-suppressions.json',
  '.dependency-cruiser-known-violations.json',
  '.duplication-baseline.json',
];

export function baselineCounts(file, value) {
  if (file === '.dependency-cruiser-known-violations.json') {
    if (!Array.isArray(value)) {
      throw new Error('Dependency baseline must be an array.');
    }
    return new Map(value.map((entry) => [digest(entry), 1]));
  }
  return flattenCounts(value);
}

export function checkTransition({ file, previous, current, transitions }) {
  const before = previous ?? (file.includes('dependency-cruiser') ? [] : {});
  const comparison = compareCounts(baselineCounts(file, current), baselineCounts(file, before));
  if (!comparison.growth.length) {
    return;
  }
  const approved = transitions.some(
    (entry) =>
      entry.file === file &&
      entry.before === digest(previous) &&
      entry.after === digest(current) &&
      typeof entry.reason === 'string' &&
      entry.reason.trim().length >= 40,
  );
  if (!approved) {
    throw new Error(
      `Unapproved baseline growth in ${file}:\n${comparison.growth.join('\n')}\nFix the code or record a reviewed digest-bound exception with its rationale.`,
    );
  }
}

function readFromGit(ref, file) {
  const result = spawnSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  if (result.status !== 0) {
    return null;
  }
  return JSON.parse(result.stdout);
}

function validateTransition(entry) {
  const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (
    !baselineFiles.includes(entry.file) ||
    !validHash(entry.before) ||
    !validHash(entry.after) ||
    typeof entry.reason !== 'string' ||
    entry.reason.trim().length < 40
  ) {
    throw new Error(
      'Invalid baseline transition: expected known file, SHA-256 digests and explicit rationale.',
    );
  }
}

function assertExistingSources(baseline) {
  for (const source of Object.keys(baseline)) {
    if (!existsSync(source)) {
      throw new Error(
        `Deleted file in ESLint baseline: ${source}; run npm run lint:baseline:prune.`,
      );
    }
  }
}

function resolveComparisonBase(ref) {
  if (!/^0{40}$/.test(ref)) {
    return ref;
  }
  const defaultRef = process.env.BASELINE_DEFAULT_REF;
  if (!defaultRef) {
    throw new Error('New-branch pushes require BASELINE_DEFAULT_REF for merge-base comparison.');
  }
  return execFileSync('git', ['merge-base', 'HEAD', defaultRef], { encoding: 'utf8' }).trim();
}

export function checkBaselinePolicy(ref = process.env.BASELINE_BASE_REF || 'HEAD') {
  const base = resolveComparisonBase(ref);
  execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { stdio: 'pipe' });
  const transitions = readJson('quality-baseline-transitions.json');
  if (!Array.isArray(transitions)) {
    throw new Error('Baseline transitions must be an array of reviewed exceptions.');
  }
  transitions.forEach(validateTransition);
  for (const file of baselineFiles) {
    const current = readJson(file);
    if (file === 'eslint-suppressions.json') {
      assertExistingSources(current);
    }
    checkTransition({
      file,
      previous: readFromGit(base, file),
      current,
      transitions,
    });
  }
  console.log(`Baseline growth checked against ${base}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  checkBaselinePolicy(process.argv[2]);
}

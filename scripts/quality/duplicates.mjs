import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  addCount,
  assertNoGrowth,
  compareCounts,
  digest,
  flattenCounts,
  readJson,
  pruneCounts,
  writeJson,
} from './counts.mjs';

function relativeFile(file) {
  return path
    .relative(process.cwd(), path.resolve(file.replaceAll('\\', '/')))
    .split(path.sep)
    .join('/');
}

export function cloneCounts(report) {
  const counts = {};
  for (const clone of report.duplicates) {
    const files = [relativeFile(clone.firstFile.name), relativeFile(clone.secondFile.name)].sort();
    addCount(counts, files.join(' -> '), digest(clone.fragment.replaceAll('\r\n', '\n')));
  }
  return counts;
}

function assertCoverage(report, config) {
  const tracked = execFileSync('git', ['ls-files', '--', ...config.path], { encoding: 'utf8' });
  const eligible = tracked
    .trim()
    .split('\n')
    .filter(
      (file) =>
        /\.(ts|tsx|js|jsx)$/.test(file) &&
        readFileSync(file, 'utf8').split('\n').length >= config.minLines &&
        !(config.ignore ?? []).some((pattern) => path.matchesGlob(file, pattern)),
    );
  const sources = Object.values(report.statistics.formats).flatMap((format) =>
    Object.keys(format.sources),
  );
  const scanned = new Set(sources.map(relativeFile));
  const missing = eligible.filter((file) => !scanned.has(file));
  if (missing.length || scanned.size === 0) {
    throw new Error(
      `jscpd coverage incomplete; check formats, ignore patterns and file limits:\n${missing.join('\n')}`,
    );
  }
}

export function scanDuplicates() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'paralleax-clones-'));
  try {
    const config = readJson('.jscpd.json');
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL('../../node_modules/jscpd/bin/jscpd', import.meta.url)),
        ...config.path,
        '--config',
        '.jscpd.json',
        '--output',
        directory,
      ],
      { stdio: 'pipe' },
    );
    const report = readJson(path.join(directory, 'jscpd-report.json'));
    assertCoverage(report, config);
    return report;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function checkDuplicates(prune = false) {
  const report = scanDuplicates();
  const current = cloneCounts(report);
  const file = '.duplication-baseline.json';
  const accepted = readJson(file);
  const comparison = compareCounts(flattenCounts(current), flattenCounts(accepted));
  if (comparison.growth.length) {
    for (const clone of report.duplicates) {
      console.error(
        `Clone: ${clone.firstFile.name}:${clone.firstFile.start} -> ${clone.secondFile.name}:${clone.secondFile.start} (${clone.tokens} tokens)`,
      );
    }
  }
  assertNoGrowth(comparison);
  if (prune) {
    writeJson(file, pruneCounts(accepted, current));
  } else if (comparison.stale.length) {
    throw new Error('Stale clone entries; run npm run lint:baseline:prune.');
  }
  console.log(`Duplication gate: ${report.duplicates.length} historical clones, no new clones.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  checkDuplicates(process.argv.includes('--prune'));
}

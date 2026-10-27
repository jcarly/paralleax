import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function ordered(value) {
  if (Array.isArray(value)) {
    return value.map(ordered);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])]),
    );
  }
  return value;
}

export function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(ordered(value)))
    .digest('hex');
}

export function flattenCounts(baseline) {
  if (baseline === null || typeof baseline !== 'object' || Array.isArray(baseline)) {
    throw new Error('Baseline must be a file/rule/count object.');
  }
  const counts = new Map();
  for (const [file, rules] of Object.entries(baseline)) {
    for (const [rule, entry] of Object.entries(rules)) {
      if (
        !entry ||
        !Number.isSafeInteger(entry.count) ||
        entry.count < 1 ||
        Object.keys(entry).length !== 1
      ) {
        throw new Error(`Invalid baseline count: ${file} / ${rule}`);
      }
      counts.set(`${file} / ${rule}`, entry.count);
    }
  }
  return counts;
}

export function compareCounts(actual, accepted) {
  const growth = [];
  const stale = [];
  for (const [key, count] of actual) {
    if (count > (accepted.get(key) ?? 0)) {
      growth.push(`${key}: ${accepted.get(key) ?? 0} → ${count}`);
    }
  }
  for (const [key, count] of accepted) {
    if (count > (actual.get(key) ?? 0)) {
      stale.push(`${key}: ${count} → ${actual.get(key) ?? 0}`);
    }
  }
  return { growth, stale };
}

export function addCount(counts, file, rule) {
  counts[file] ??= {};
  counts[file][rule] ??= { count: 0 };
  counts[file][rule].count += 1;
}

export function assertNoGrowth(comparison) {
  if (comparison.growth.length) {
    throw new Error(`New violations; fix them before pruning:\n${comparison.growth.join('\n')}`);
  }
}

export function pruneCounts(accepted, actual) {
  const pruned = {};
  for (const [file, rules] of Object.entries(accepted)) {
    for (const rule of Object.keys(rules)) {
      const count = actual[file]?.[rule]?.count ?? 0;
      if (count > 0) {
        pruned[file] ??= {};
        pruned[file][rule] = { count };
      }
    }
  }
  return pruned;
}

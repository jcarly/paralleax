import type { StatEffect, StatValue } from '../../model/stats.js';
import type { StatComparisonOperator } from '../../triggers/conditions.js';
import { escapeRegExp, normalizeIdentifier } from './helpers.js';
import type { SourceCondition, SourceLine } from './models.js';

export function readVariableDeclaration(argument: string) {
  const match = argument.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
  if (!match) {
    return undefined;
  }
  const value = readLiteral(match[2]);
  return value === undefined ? undefined : { name: normalizeIdentifier(match[1]), value };
}

export function readVariableAssignment(
  argument: string,
): { name: string; operation: StatEffect['operation']; value: StatValue } | undefined {
  const match = argument.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
  if (!match) {
    return undefined;
  }
  const name = normalizeIdentifier(match[1]);
  const expression = match[2].trim();
  const relative = expression.match(/^([+-])\s*(\d+(?:\.\d+)?)$/);
  if (relative) {
    return {
      name,
      operation: 'add',
      value: Number(relative[2]) * (relative[1] === '-' ? -1 : 1),
    };
  }
  const selfRelative = expression.match(
    new RegExp(`^${escapeRegExp(name)}\\s*([+-])\\s*(\\d+(?:\\.\\d+)?)$`, 'i'),
  );
  if (selfRelative) {
    return {
      name,
      operation: 'add',
      value: Number(selfRelative[2]) * (selfRelative[1] === '-' ? -1 : 1),
    };
  }
  const value = readLiteral(expression);
  return value === undefined ? undefined : { name, operation: 'set', value };
}

export function readSourceCondition(
  expression: string,
  source: SourceLine,
): SourceCondition | undefined {
  const normalized = expression
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  const negated = normalized.match(/^not\s*\(\s*([a-z_][a-z0-9_]*)\s*\)$/i);
  if (negated) {
    return {
      name: normalizeIdentifier(negated[1]),
      operator: 'eq',
      value: false,
      source,
    };
  }
  const truthy = normalized.match(/^([a-z_][a-z0-9_]*)$/i);
  if (truthy) {
    return { name: normalizeIdentifier(truthy[1]), operator: 'eq', value: true, source };
  }
  const comparison = normalized.match(/^([a-z_][a-z0-9_]*)\s*(<=|>=|!=|<>|=|<|>)\s*(.+)$/i);
  if (!comparison) {
    return undefined;
  }
  const value = readLiteral(comparison[3]);
  if (value === undefined) {
    return undefined;
  }
  const operators: Record<string, StatComparisonOperator> = {
    '=': 'eq',
    '!=': 'neq',
    '<>': 'neq',
    '<': 'lt',
    '<=': 'lte',
    '>': 'gt',
    '>=': 'gte',
  };
  return {
    name: normalizeIdentifier(comparison[1]),
    operator: operators[comparison[2]],
    value,
    source,
  };
}

function readLiteral(expression: string): StatValue | undefined {
  const text = expression
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  if (/^(true|false)$/i.test(text)) {
    return text.toLowerCase() === 'true';
  }
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
  }
  const quoted = text.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/);
  if (!quoted) {
    return undefined;
  }
  return text[0] === '"' ? quoted[1] : quoted[2];
}

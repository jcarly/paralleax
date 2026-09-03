import type { StatComparisonOperator } from '../../triggers/conditions.js';
import type { StatEffect, StatValueType } from '../../model/stats.js';
import type { QspSourceCondition, QspSourcePosition, QspVariableEffect } from './models.js';

type Token =
  | { kind: 'identifier'; value: string }
  | { kind: 'literal'; value: number | string }
  | { kind: 'operator'; value: string }
  | { kind: 'leftParen' }
  | { kind: 'rightParen' };

type ExpressionNode =
  | { kind: 'condition'; condition: Omit<QspSourceCondition, 'source'> }
  | { kind: 'and' | 'or'; left: ExpressionNode; right: ExpressionNode }
  | { kind: 'not'; operand: ExpressionNode };

const MAX_CONDITION_GROUPS = 100;
const MAX_TRIGGER_CONDITIONS = 500;

export type QspAssignmentParseResult =
  | { kind: 'not_assignment' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'parsed'; effect: QspVariableEffect };

export function parseQspAssignment(
  command: string,
  source: QspSourcePosition,
): QspAssignmentParseResult {
  const statement = command.replace(/^\s*(?:set|let)\b\s*/i, '').trim();
  const variable = readQspVariableReference(statement);
  if (variable.kind === 'not_variable') return { kind: 'not_assignment' };
  const operationMatch = /^\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/.exec(statement.slice(variable.length));
  if (!operationMatch) return { kind: 'not_assignment' };
  if (variable.kind === 'unsupported') return variable;
  const name = variable.variableName;
  const [, sourceOperation, valueExpression] = operationMatch;
  if (isUnsupportedSystemVariable(name)) {
    return {
      kind: 'unsupported',
      message: `The QSP system variable "${name}" is not imported as authored Story state.`,
    };
  }
  if (sourceOperation === '*=' || sourceOperation === '/=') {
    return {
      kind: 'unsupported',
      message: `The QSP ${sourceOperation} assignment cannot be represented by a Paralleax stat effect.`,
    };
  }
  const value = parseCompleteLiteral(valueExpression.trim());
  if (value === undefined) {
    return {
      kind: 'unsupported',
      message: 'Only literal QSP variable assignments are currently imported.',
    };
  }
  const valueType = qspVariableValueType(name);
  if (typeof value !== valueType) {
    return {
      kind: 'unsupported',
      message: `The literal assigned to "${name}" does not match its QSP ${valueType} type.`,
    };
  }
  if (sourceOperation !== '=' && valueType !== 'number') {
    return {
      kind: 'unsupported',
      message: 'Relative string assignments are not yet imported.',
    };
  }
  const operation: StatEffect['operation'] = sourceOperation === '=' ? 'set' : 'add';
  return {
    kind: 'parsed',
    effect: {
      variableName: name,
      operation,
      value: sourceOperation === '-=' ? -(value as number) : value,
      source,
    },
  };
}

export function parseQspConditionExpression(
  expression: string,
  source: QspSourcePosition,
): QspSourceCondition[][] | undefined {
  const tokens = tokenize(expression);
  if (!tokens) return undefined;
  const parser = new ConditionParser(tokens);
  const tree = parser.parse();
  if (!tree) return undefined;
  const groups = toDisjunctiveNormalForm(tree);
  if (!groups || groups.length === 0 || !hasSupportedConditionSize(groups)) return undefined;
  return groups.map((group) => group.map((condition) => ({ ...condition, source })));
}

export function andQspConditionGroups(
  ...groupSets: QspSourceCondition[][][]
): QspSourceCondition[][] | undefined {
  let result: QspSourceCondition[][] = [[]];
  for (const groups of groupSets) {
    if (groups.length === 0) return [];
    const combined: QspSourceCondition[][] = [];
    for (const current of result) {
      for (const group of groups) {
        combined.push([...current, ...group]);
        if (combined.length > MAX_CONDITION_GROUPS) return undefined;
      }
    }
    if (!hasSupportedConditionSize(combined)) return undefined;
    result = combined;
  }
  return result;
}

export function negateQspConditionGroups(
  groups: QspSourceCondition[][],
): QspSourceCondition[][] | undefined {
  if (groups.length === 0) return [[]];
  let result: QspSourceCondition[][] = [[]];
  for (const group of groups) {
    if (group.length === 0) return [];
    const negatedGroup = group.map((condition) => [negateCondition(condition)]);
    const combined = andQspConditionGroups(result, negatedGroup);
    if (!combined) return undefined;
    result = combined;
  }
  return result;
}

export function qspVariableKey(name: string) {
  const trimmed = name.trim();
  const indexStart = trimmed.indexOf('[');
  return indexStart < 0
    ? trimmed.toLocaleLowerCase()
    : `${trimmed.slice(0, indexStart).toLocaleLowerCase()}${trimmed.slice(indexStart)}`;
}

export function qspVariableValueType(name: string): Extract<StatValueType, 'number' | 'string'> {
  return name.trim().startsWith('$') ? 'string' : 'number';
}

export function qspVariableInitialValue(name: string): number | string {
  return qspVariableValueType(name) === 'string' ? '' : 0;
}

function parseCompleteLiteral(value: string): number | string | undefined {
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  const quote = value[0];
  if (quote !== "'" && quote !== '"') return undefined;
  let result = '';
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) {
      result += value[index];
      continue;
    }
    if (value[index + 1] === quote) {
      result += quote;
      index += 1;
      continue;
    }
    return index === value.length - 1 ? result : undefined;
  }
  return undefined;
}

type QspVariableReferenceResult =
  | { kind: 'not_variable' }
  | { kind: 'unsupported'; message: string; length: number }
  | { kind: 'parsed'; variableName: string; length: number };

function readQspVariableReference(value: string): QspVariableReferenceResult {
  const name = /^[$%]?[a-z_][a-z0-9_.]*/i.exec(value)?.[0];
  if (!name) return { kind: 'not_variable' };
  const tupleVariable = name.startsWith('%');
  let cursor = name.length;
  while (/\s/.test(value[cursor] ?? '')) cursor += 1;
  if (value[cursor] !== '[') {
    return tupleVariable
      ? {
          kind: 'unsupported',
          message: 'QSP tuple variables are not yet imported.',
          length: name.length,
        }
      : { kind: 'parsed', variableName: name, length: name.length };
  }
  const closingBracket = findClosingBracket(value, cursor);
  if (closingBracket === undefined) {
    return {
      kind: 'unsupported',
      message: 'The QSP array cell has no closing bracket.',
      length: value.length,
    };
  }
  const indexExpression = value.slice(cursor + 1, closingBracket).trim();
  if (tupleVariable) {
    return {
      kind: 'unsupported',
      message: 'QSP tuple variables are not yet imported.',
      length: closingBracket + 1,
    };
  }
  if (!indexExpression) {
    return {
      kind: 'unsupported',
      message: 'QSP last-cell array access with [] cannot be imported as a stable Story stat.',
      length: closingBracket + 1,
    };
  }
  if (/^-?\d+$/.test(indexExpression)) {
    const index = Number(indexExpression);
    if (!Number.isSafeInteger(index)) {
      return {
        kind: 'unsupported',
        message: 'The literal QSP array index is outside the safely representable range.',
        length: closingBracket + 1,
      };
    }
    return {
      kind: 'parsed',
      variableName: index === 0 ? name : `${name}[${index}]`,
      length: closingBracket + 1,
    };
  }
  const stringIndex = readStringToken(indexExpression);
  if (stringIndex?.length === indexExpression.length) {
    return {
      kind: 'parsed',
      variableName: `${name}[${JSON.stringify(stringIndex.value)}]`,
      length: closingBracket + 1,
    };
  }
  return {
    kind: 'unsupported',
    message: 'Only literal numeric or string QSP array indices are currently imported.',
    length: closingBracket + 1,
  };
}

function findClosingBracket(value: string, openingBracket: number) {
  let quote = '';
  for (let index = openingBracket + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character !== quote) continue;
      if (value[index + 1] === quote) index += 1;
      else quote = '';
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === ']') return index;
  }
  return undefined;
}

function hasSupportedConditionSize(groups: ReadonlyArray<ReadonlyArray<unknown>>) {
  return (
    groups.length <= MAX_CONDITION_GROUPS &&
    groups.reduce((total, group) => total + group.length, 0) <= MAX_TRIGGER_CONDITIONS
  );
}

function tokenize(expression: string): Token[] | undefined {
  const tokens: Token[] = [];
  for (let index = 0; index < expression.length;) {
    const remainder = expression.slice(index);
    const whitespace = /^\s+/.exec(remainder);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    if (remainder[0] === '(') {
      tokens.push({ kind: 'leftParen' });
      index += 1;
      continue;
    }
    if (remainder[0] === ')') {
      tokens.push({ kind: 'rightParen' });
      index += 1;
      continue;
    }
    const string = readStringToken(remainder);
    if (string) {
      tokens.push({ kind: 'literal', value: string.value });
      index += string.length;
      continue;
    }
    const number = /^-?\d+(?:\.\d+)?/.exec(remainder);
    if (number) {
      tokens.push({ kind: 'literal', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const comparison = /^(<>|<=|>=|=<|=>|=|<|>)/.exec(remainder);
    if (comparison) {
      tokens.push({ kind: 'operator', value: comparison[0] });
      index += comparison[0].length;
      continue;
    }
    const identifier = /^[$%]?[a-z_][a-z0-9_.]*/i.exec(remainder);
    if (!identifier) return undefined;
    const keyword = identifier[0].toLocaleLowerCase();
    if (
      (keyword === 'and' || keyword === 'or' || keyword === 'no') &&
      remainder.slice(identifier[0].length).trimStart()[0] !== '['
    ) {
      tokens.push({ kind: 'operator', value: keyword });
      index += identifier[0].length;
    } else {
      const variable = readQspVariableReference(remainder);
      if (variable.kind !== 'parsed') return undefined;
      tokens.push({ kind: 'identifier', value: variable.variableName });
      index += variable.length;
    }
  }
  return tokens;
}

function readStringToken(value: string): { value: string; length: number } | undefined {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') return undefined;
  let result = '';
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) {
      result += value[index];
      continue;
    }
    if (value[index + 1] === quote) {
      result += quote;
      index += 1;
      continue;
    }
    return { value: result, length: index + 1 };
  }
  return undefined;
}

class ConditionParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse() {
    const node = this.parseOr();
    return node && this.index === this.tokens.length ? node : undefined;
  }

  private parseOr(): ExpressionNode | undefined {
    let node = this.parseAnd();
    while (node && this.matchOperator('or')) {
      const right = this.parseAnd();
      if (!right) return undefined;
      node = { kind: 'or', left: node, right };
    }
    return node;
  }

  private parseAnd(): ExpressionNode | undefined {
    let node = this.parseUnary();
    while (node && this.matchOperator('and')) {
      const right = this.parseUnary();
      if (!right) return undefined;
      node = { kind: 'and', left: node, right };
    }
    return node;
  }

  private parseUnary(): ExpressionNode | undefined {
    if (this.matchOperator('no')) {
      const operand = this.parseUnary();
      return operand ? { kind: 'not', operand } : undefined;
    }
    if (this.tokens[this.index]?.kind === 'leftParen') {
      this.index += 1;
      const node = this.parseOr();
      if (!node || this.tokens[this.index]?.kind !== 'rightParen') return undefined;
      this.index += 1;
      return node;
    }
    return this.parseCondition();
  }

  private parseCondition(): ExpressionNode | undefined {
    const variable = this.tokens[this.index];
    if (variable?.kind !== 'identifier' || isUnsupportedSystemVariable(variable.value)) {
      return undefined;
    }
    this.index += 1;
    const operator = this.tokens[this.index];
    if (operator?.kind !== 'operator' || !isComparison(operator.value)) {
      return {
        kind: 'condition',
        condition: {
          variableName: variable.value,
          operator: 'neq',
          value: qspVariableValueType(variable.value) === 'string' ? '' : 0,
        },
      };
    }
    this.index += 1;
    const literal = this.tokens[this.index];
    if (literal?.kind !== 'literal') return undefined;
    if (typeof literal.value !== qspVariableValueType(variable.value)) return undefined;
    this.index += 1;
    const mappedOperator = mapComparisonOperator(operator.value);
    if (
      qspVariableValueType(variable.value) === 'string' &&
      mappedOperator !== 'eq' &&
      mappedOperator !== 'neq'
    ) {
      return undefined;
    }
    return {
      kind: 'condition',
      condition: {
        variableName: variable.value,
        operator: mappedOperator,
        value: literal.value,
      },
    };
  }

  private matchOperator(value: string) {
    const token = this.tokens[this.index];
    if (token?.kind !== 'operator' || token.value !== value) return false;
    this.index += 1;
    return true;
  }
}

function toDisjunctiveNormalForm(
  node: ExpressionNode,
  negated = false,
): Array<Array<Omit<QspSourceCondition, 'source'>>> | undefined {
  if (node.kind === 'condition') {
    const condition = negated ? negateCondition(node.condition) : node.condition;
    return condition ? [[condition]] : undefined;
  }
  if (node.kind === 'not') return toDisjunctiveNormalForm(node.operand, !negated);
  const effectiveKind = negated ? (node.kind === 'and' ? 'or' : 'and') : node.kind;
  const left = toDisjunctiveNormalForm(node.left, negated);
  const right = toDisjunctiveNormalForm(node.right, negated);
  if (!left || !right) return undefined;
  if (effectiveKind === 'or') return [...left, ...right];
  const result: Array<Array<Omit<QspSourceCondition, 'source'>>> = [];
  for (const leftGroup of left) {
    for (const rightGroup of right) {
      result.push([...leftGroup, ...rightGroup]);
      if (result.length > MAX_CONDITION_GROUPS) return undefined;
    }
  }
  return result;
}

function negateCondition<T extends Omit<QspSourceCondition, 'source'>>(condition: T): T {
  const operators: Record<StatComparisonOperator, StatComparisonOperator> = {
    eq: 'neq',
    neq: 'eq',
    lt: 'gte',
    lte: 'gt',
    gt: 'lte',
    gte: 'lt',
  };
  return { ...condition, operator: operators[condition.operator] };
}

function isComparison(value: string) {
  return ['=', '<>', '<', '<=', '=<', '>', '>=', '=>'].includes(value);
}

function mapComparisonOperator(value: string): StatComparisonOperator {
  if (value === '=') return 'eq';
  if (value === '<>') return 'neq';
  if (value === '<') return 'lt';
  if (value === '<=' || value === '=<') return 'lte';
  if (value === '>') return 'gt';
  return 'gte';
}

const QSP_SYSTEM_VARIABLES = new Set([
  '$args',
  '$counter',
  '$curacts',
  '$curloc',
  '$fname',
  '$input',
  '$maintxt',
  '$onactsel',
  '$ongload',
  '$ongsave',
  '$onnewloc',
  '$onobjadd',
  '$onobjdel',
  '$onobjsel',
  '$qspver',
  '$result',
  '$selact',
  '$selobj',
  '$stattxt',
  '$user_text',
  'args',
  'bcolor',
  'debug',
  'disablescroll',
  'disablesubex',
  'fcolor',
  'fsize',
  'lcolor',
  'nosave',
  'result',
  'usehtml',
]);

function isUnsupportedSystemVariable(name: string) {
  const indexStart = name.indexOf('[');
  return QSP_SYSTEM_VARIABLES.has(
    qspVariableKey(indexStart < 0 ? name : name.slice(0, indexStart)),
  );
}

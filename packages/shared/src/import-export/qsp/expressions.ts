import type { StatComparisonOperator } from '../../triggers/conditions.js';
import type { StatValueType } from '../../model/stats.js';
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
const MAX_EXPRESSION_DEPTH = 100;
const MAX_EXPRESSION_TOKENS = 1_000;

export type QspAssignmentParseResult =
  | { kind: 'not_assignment' }
  | { kind: 'unsupported'; message: string }
  | { kind: 'parsed'; effect: QspVariableEffect };

export function parseQspAssignment(
  command: string,
  source: QspSourcePosition,
): QspAssignmentParseResult {
  const statement = command.replace(/^\s*(?:set|let)\b\s*/i, '').trim();
  const assignment = readAssignmentParts(statement);
  if (!assignment) {
    return { kind: 'not_assignment' };
  }
  if (assignment.kind === 'unsupported') {
    return assignment;
  }

  return buildAssignmentEffect(assignment, source);
}

type AssignmentParts =
  | { kind: 'unsupported'; message: string }
  | {
      kind: 'parsed';
      variableName: string;
      operation: string;
      valueExpression: string;
    };

function readAssignmentParts(statement: string): AssignmentParts | undefined {
  const variable = readQspVariableReference(statement);
  if (variable.kind === 'not_variable') {
    return undefined;
  }
  const operationMatch = /^\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/.exec(statement.slice(variable.length));
  if (!operationMatch) {
    return undefined;
  }
  if (variable.kind === 'unsupported') {
    return { kind: 'unsupported', message: variable.message };
  }

  const [, operation, valueExpression] = operationMatch;
  return {
    kind: 'parsed',
    variableName: variable.variableName,
    operation: operation ?? '=',
    valueExpression: valueExpression ?? '',
  };
}

function buildAssignmentEffect(
  assignment: Extract<AssignmentParts, { kind: 'parsed' }>,
  source: QspSourcePosition,
): QspAssignmentParseResult {
  const { variableName, operation, valueExpression } = assignment;
  const unsupportedMessage = getUnsupportedAssignmentMessage(variableName, operation);
  if (unsupportedMessage) {
    return { kind: 'unsupported', message: unsupportedMessage };
  }

  const valueType = qspVariableValueType(variableName);
  const value = parseAssignmentValue(valueExpression, valueType);
  if (value === undefined) {
    return {
      kind: 'unsupported',
      message:
        'Only literal strings or constant numeric QSP expressions are currently imported as stat effects.',
    };
  }
  if (typeof value !== valueType) {
    return {
      kind: 'unsupported',
      message: `The literal assigned to "${variableName}" does not match its QSP ${valueType} type.`,
    };
  }
  if (operation !== '=' && valueType !== 'number') {
    return { kind: 'unsupported', message: 'Relative string assignments are not yet imported.' };
  }

  return createAssignmentEffect(variableName, operation, value, source);
}

function getUnsupportedAssignmentMessage(variableName: string, operation: string) {
  if (isUnsupportedSystemVariable(variableName)) {
    return `The QSP system variable "${variableName}" is not imported as authored Story state.`;
  }
  if (operation === '*=' || operation === '/=') {
    return `The QSP ${operation} assignment cannot be represented by a Paralleax stat effect.`;
  }
  return undefined;
}

function parseAssignmentValue(
  expression: string,
  valueType: Extract<StatValueType, 'number' | 'string'>,
) {
  const trimmed = expression.trim();
  return valueType === 'number'
    ? parseQspConstantNumberExpression(trimmed)
    : parseCompleteLiteral(trimmed);
}

function createAssignmentEffect(
  variableName: string,
  operation: string,
  value: number | string,
  source: QspSourcePosition,
): QspAssignmentParseResult {
  if (operation === '=') {
    return {
      kind: 'parsed',
      effect: { variableName, operation: 'set', value, source },
    };
  }
  if (typeof value !== 'number') {
    return { kind: 'unsupported', message: 'Relative string assignments are not yet imported.' };
  }
  return {
    kind: 'parsed',
    effect: {
      variableName,
      operation: 'add',
      value: operation === '-=' ? -value : value,
      source,
    },
  };
}

export function parseQspConditionExpression(
  expression: string,
  source: QspSourcePosition,
): QspSourceCondition[][] | undefined {
  const tokens = tokenize(expression);
  if (!tokens) {
    return undefined;
  }
  const parser = new ConditionParser(tokens);
  const tree = parser.parse();
  if (!tree) {
    return undefined;
  }
  const groups = toDisjunctiveNormalForm(tree);
  if (!groups || groups.length === 0 || !hasSupportedConditionSize(groups)) {
    return undefined;
  }
  return groups.map((group) => group.map((condition) => ({ ...condition, source })));
}

export function andQspConditionGroups(
  ...groupSets: QspSourceCondition[][][]
): QspSourceCondition[][] | undefined {
  let result: QspSourceCondition[][] = [[]];
  for (const groups of groupSets) {
    if (groups.length === 0) {
      return [];
    }
    const combined = combineConditionGroups(result, groups);
    if (!combined) {
      return undefined;
    }
    if (!hasSupportedConditionSize(combined)) {
      return undefined;
    }
    result = combined;
  }
  return result;
}

function combineConditionGroups(
  left: QspSourceCondition[][],
  right: QspSourceCondition[][],
): QspSourceCondition[][] | undefined {
  if (left.length * right.length > MAX_CONDITION_GROUPS) {
    return undefined;
  }
  return left.flatMap((current) => right.map((group) => [...current, ...group]));
}

export function negateQspConditionGroups(
  groups: QspSourceCondition[][],
): QspSourceCondition[][] | undefined {
  if (groups.length === 0) {
    return [[]];
  }
  let result: QspSourceCondition[][] = [[]];
  for (const group of groups) {
    if (group.length === 0) {
      return [];
    }
    const negatedGroup = group.map((condition) => [negateCondition(condition)]);
    const combined = andQspConditionGroups(result, negatedGroup);
    if (!combined) {
      return undefined;
    }
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
  return parseCompleteNumber(value) ?? parseCompleteQuotedString(value);
}

function parseCompleteNumber(value: string): number | undefined {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function parseCompleteQuotedString(value: string): string | undefined {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') {
    return undefined;
  }
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
  if (!name) {
    return { kind: 'not_variable' };
  }
  const tupleVariable = name.startsWith('%');
  const cursor = skipWhitespace(value, name.length);
  if (value[cursor] !== '[') {
    return readUnindexedVariable(name, tupleVariable);
  }

  return readIndexedVariable(value, name, cursor, tupleVariable);
}

function skipWhitespace(value: string, start: number): number {
  let cursor = start;
  while (/\s/.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  return cursor;
}

function readUnindexedVariable(name: string, tupleVariable: boolean): QspVariableReferenceResult {
  if (tupleVariable) {
    return unsupportedVariable('QSP tuple variables are not yet imported.', name.length);
  }
  return { kind: 'parsed', variableName: name, length: name.length };
}

function readIndexedVariable(
  value: string,
  name: string,
  openingBracket: number,
  tupleVariable: boolean,
): QspVariableReferenceResult {
  const closingBracket = findClosingBracket(value, openingBracket);
  if (closingBracket === undefined) {
    return unsupportedVariable('The QSP array cell has no closing bracket.', value.length);
  }
  const indexExpression = value.slice(openingBracket + 1, closingBracket).trim();
  return readArrayIndex(name, indexExpression, closingBracket + 1, tupleVariable);
}

function readArrayIndex(
  name: string,
  indexExpression: string,
  length: number,
  tupleVariable: boolean,
): QspVariableReferenceResult {
  if (tupleVariable) {
    return unsupportedVariable('QSP tuple variables are not yet imported.', length);
  }
  if (!indexExpression) {
    return unsupportedVariable(
      'QSP last-cell array access with [] cannot be imported as a stable Story stat.',
      length,
    );
  }
  if (/^-?\d+$/.test(indexExpression)) {
    const index = Number(indexExpression);
    if (!Number.isSafeInteger(index)) {
      return unsupportedVariable(
        'The literal QSP array index is outside the safely representable range.',
        length,
      );
    }
    return {
      kind: 'parsed',
      variableName: index === 0 ? name : `${name}[${index}]`,
      length,
    };
  }
  const stringIndex = readStringToken(indexExpression);
  if (stringIndex?.length === indexExpression.length) {
    return {
      kind: 'parsed',
      variableName: `${name}[${JSON.stringify(stringIndex.value)}]`,
      length,
    };
  }
  return unsupportedVariable(
    'Only literal numeric or string QSP array indices are currently imported.',
    length,
  );
}

function unsupportedVariable(message: string, length: number): QspVariableReferenceResult {
  return { kind: 'unsupported', message, length };
}

function findClosingBracket(value: string, openingBracket: number) {
  let quote = '';
  for (let index = openingBracket + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      const quotedCharacter = consumeQuotedCharacter(value, index, quote);
      quote = quotedCharacter.quote;
      index = quotedCharacter.index;
      continue;
    }
    quote = getQuoteCharacter(character);
    if (!quote && character === ']') {
      return index;
    }
  }
  return undefined;
}

function consumeQuotedCharacter(
  value: string,
  index: number,
  quote: string,
): { quote: string; index: number } {
  if (value[index] !== quote) {
    return { quote, index };
  }
  if (value[index + 1] === quote) {
    return { quote, index: index + 1 };
  }
  return { quote: '', index };
}

function getQuoteCharacter(character: string | undefined): string {
  return character === "'" || character === '"' ? character : '';
}

function hasSupportedConditionSize(groups: ReadonlyArray<ReadonlyArray<unknown>>) {
  return (
    groups.length <= MAX_CONDITION_GROUPS &&
    groups.reduce((total, group) => total + group.length, 0) <= MAX_TRIGGER_CONDITIONS
  );
}

function tokenize(expression: string): Token[] | undefined {
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    if (tokens.length >= MAX_EXPRESSION_TOKENS) {
      return undefined;
    }
    const remainder = expression.slice(index);
    const whitespace = /^\s+/.exec(remainder);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const next = readToken(remainder);
    if (!next) {
      return undefined;
    }
    tokens.push(next.token);
    index += next.length;
  }
  return tokens;
}

type TokenRead = { token: Token; length: number };

function readToken(value: string): TokenRead | undefined {
  const parenthesis = readParenthesis(value);
  if (parenthesis) {
    return parenthesis;
  }
  const literal = readLiteralToken(value);
  if (literal) {
    return literal;
  }
  const operator = readOperatorToken(value);
  if (operator) {
    return operator;
  }
  return readIdentifierToken(value);
}

function readParenthesis(value: string): TokenRead | undefined {
  if (value[0] === '(') {
    return { token: { kind: 'leftParen' }, length: 1 };
  }
  if (value[0] === ')') {
    return { token: { kind: 'rightParen' }, length: 1 };
  }
  return undefined;
}

function readLiteralToken(value: string): TokenRead | undefined {
  const string = readStringToken(value);
  if (string) {
    return { token: { kind: 'literal', value: string.value }, length: string.length };
  }
  const number = /^\d+(?:\.\d+)?/.exec(value);
  if (!number) {
    return undefined;
  }
  const parsed = Number(number[0]);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return { token: { kind: 'literal', value: parsed }, length: number[0].length };
}

function readOperatorToken(value: string): TokenRead | undefined {
  const comparison = /^(<>|<=|>=|=<|=>|=|<|>|!)/.exec(value);
  if (comparison) {
    return { token: { kind: 'operator', value: comparison[0] }, length: comparison[0].length };
  }
  const arithmetic = /^[+\-*/]/.exec(value);
  if (!arithmetic) {
    return undefined;
  }
  return { token: { kind: 'operator', value: arithmetic[0] }, length: arithmetic[0].length };
}

function readIdentifierToken(value: string): TokenRead | undefined {
  const identifier = /^[$%]?[a-z_][a-z0-9_.]*/i.exec(value);
  if (!identifier) {
    return undefined;
  }
  const keyword = identifier[0].toLocaleLowerCase();
  if (isLogicalOperator(keyword) && !hasArraySuffix(value, identifier[0].length)) {
    return { token: { kind: 'operator', value: keyword }, length: identifier[0].length };
  }
  const variable = readQspVariableReference(value);
  if (variable.kind !== 'parsed') {
    return undefined;
  }
  return {
    token: { kind: 'identifier', value: variable.variableName },
    length: variable.length,
  };
}

function isLogicalOperator(value: string): value is 'and' | 'or' | 'no' {
  return value === 'and' || value === 'or' || value === 'no';
}

function hasArraySuffix(value: string, identifierLength: number): boolean {
  return value.slice(identifierLength).trimStart()[0] === '[';
}

function readStringToken(value: string): { value: string; length: number } | undefined {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') {
    return undefined;
  }
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

function parseQspConstantNumberExpression(expression: string): number | undefined {
  const tokens = tokenize(expression);
  if (!tokens) {
    return undefined;
  }
  return new ConstantNumberParser(tokens).parseComplete();
}

class ConstantNumberParser {
  private index: number;
  private depth = 0;

  constructor(
    private readonly tokens: Token[],
    startIndex = 0,
  ) {
    this.index = startIndex;
  }

  get position() {
    return this.index;
  }

  parseComplete(): number | undefined {
    const value = this.parseAdditive();
    return value !== undefined && this.index === this.tokens.length ? value : undefined;
  }

  parsePrefix(): number | undefined {
    return this.parseAdditive();
  }

  private parseAdditive(): number | undefined {
    let value = this.parseMultiplicative();
    while (value !== undefined) {
      const operation = this.matchAdditiveOperator();
      if (!operation) {
        return Number.isFinite(value) ? value : undefined;
      }
      value = this.applyAdditiveOperation(value, operation);
    }
    return undefined;
  }

  private parseMultiplicative(): number | undefined {
    let value = this.parseUnary();
    while (value !== undefined) {
      const operation = this.matchMultiplicativeOperator();
      if (!operation) {
        return Number.isFinite(value) ? value : undefined;
      }
      value = this.applyMultiplicativeOperation(value, operation);
    }
    return undefined;
  }

  private parseUnary(): number | undefined {
    if (this.matchOperator('+')) {
      return this.withDepth(() => this.parseUnary());
    }
    if (this.matchOperator('-')) {
      return this.parseNegatedUnary();
    }
    return this.parsePrimary();
  }

  private parseNegatedUnary(): number | undefined {
    const value = this.withDepth(() => this.parseUnary());
    return value === undefined ? undefined : -value;
  }

  private parsePrimary(): number | undefined {
    const token = this.tokens[this.index];
    if (token?.kind === 'literal' && typeof token.value === 'number') {
      this.index += 1;
      return token.value;
    }
    if (token?.kind !== 'leftParen') {
      return undefined;
    }
    return this.parseParenthesizedExpression();
  }

  private parseParenthesizedExpression(): number | undefined {
    this.index += 1;
    const value = this.withDepth(() => this.parseAdditive());
    if (value === undefined || this.tokens[this.index]?.kind !== 'rightParen') {
      return undefined;
    }
    this.index += 1;
    return value;
  }

  private matchAdditiveOperator(): '+' | '-' | undefined {
    if (this.matchOperator('+')) {
      return '+';
    }
    return this.matchOperator('-') ? '-' : undefined;
  }

  private matchMultiplicativeOperator(): '*' | '/' | undefined {
    if (this.matchOperator('*')) {
      return '*';
    }
    return this.matchOperator('/') ? '/' : undefined;
  }

  private applyAdditiveOperation(value: number, operation: '+' | '-'): number | undefined {
    const right = this.parseMultiplicative();
    if (right === undefined) {
      return undefined;
    }
    const result = operation === '+' ? value + right : value - right;
    return Number.isFinite(result) ? result : undefined;
  }

  private applyMultiplicativeOperation(value: number, operation: '*' | '/'): number | undefined {
    const right = this.parseUnary();
    if (right === undefined || (operation === '/' && right === 0)) {
      return undefined;
    }
    const result = operation === '*' ? value * right : Math.trunc(value / right);
    return Number.isFinite(result) ? result : undefined;
  }

  private matchOperator(value: string) {
    const token = this.tokens[this.index];
    if (token?.kind !== 'operator' || token.value !== value) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private withDepth<T>(parse: () => T): T | undefined {
    if (this.depth >= MAX_EXPRESSION_DEPTH) {
      return undefined;
    }
    this.depth += 1;
    try {
      return parse();
    } finally {
      this.depth -= 1;
    }
  }
}

class ConditionParser {
  private index = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse() {
    const node = this.parseOr();
    return node && this.index === this.tokens.length ? node : undefined;
  }

  private parseOr(): ExpressionNode | undefined {
    let node = this.parseAnd();
    while (node && this.matchOperator('or')) {
      const right = this.parseAnd();
      if (!right) {
        return undefined;
      }
      node = { kind: 'or', left: node, right };
    }
    return node;
  }

  private parseAnd(): ExpressionNode | undefined {
    let node = this.parseUnary();
    while (node && this.matchOperator('and')) {
      const right = this.parseUnary();
      if (!right) {
        return undefined;
      }
      node = { kind: 'and', left: node, right };
    }
    return node;
  }

  private parseUnary(): ExpressionNode | undefined {
    if (this.matchOperator('no')) {
      const operand = this.withDepth(() => this.parseUnary());
      return operand ? { kind: 'not', operand } : undefined;
    }
    if (this.tokens[this.index]?.kind === 'leftParen') {
      this.index += 1;
      const node = this.withDepth(() => this.parseOr());
      if (!node || this.tokens[this.index]?.kind !== 'rightParen') {
        return undefined;
      }
      this.index += 1;
      return node;
    }
    return this.parseCondition();
  }

  private parseCondition(): ExpressionNode | undefined {
    const variableName = this.readConditionVariable();
    if (!variableName) {
      return undefined;
    }
    const sourceOperator = this.readComparisonOperator();
    if (!sourceOperator) {
      return {
        kind: 'condition',
        condition: {
          variableName,
          operator: 'neq',
          value: qspVariableInitialValue(variableName),
        },
      };
    }
    const value = this.readConditionValue(variableName, sourceOperator);
    if (value === undefined) {
      return undefined;
    }
    return {
      kind: 'condition',
      condition: {
        variableName,
        operator: mapComparisonOperator(sourceOperator),
        value,
      },
    };
  }

  private readConditionVariable(): string | undefined {
    const token = this.tokens[this.index];
    if (token?.kind !== 'identifier' || isUnsupportedSystemVariable(token.value)) {
      return undefined;
    }
    this.index += 1;
    return token.value;
  }

  private readComparisonOperator(): string | undefined {
    const token = this.tokens[this.index];
    if (token?.kind !== 'operator' || !isComparison(token.value)) {
      return undefined;
    }
    this.index += 1;
    return token.value;
  }

  private readConditionValue(
    variableName: string,
    sourceOperator: string,
  ): number | string | undefined {
    const valueType = qspVariableValueType(variableName);
    let value: number | string | undefined;
    if (valueType === 'string') {
      value = this.parseStringLiteral();
    } else {
      const numberParser = new ConstantNumberParser(this.tokens, this.index);
      value = numberParser.parsePrefix();
      this.index = numberParser.position;
    }
    if (typeof value !== valueType) {
      return undefined;
    }
    const mappedOperator = mapComparisonOperator(sourceOperator);
    if (valueType === 'string' && mappedOperator !== 'eq' && mappedOperator !== 'neq') {
      return undefined;
    }
    return value;
  }

  private matchOperator(value: string) {
    const token = this.tokens[this.index];
    if (token?.kind !== 'operator' || token.value !== value) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private parseStringLiteral(): string | undefined {
    const token = this.tokens[this.index];
    if (token?.kind !== 'literal' || typeof token.value !== 'string') {
      return undefined;
    }
    this.index += 1;
    return token.value;
  }

  private withDepth<T>(parse: () => T): T | undefined {
    if (this.depth >= MAX_EXPRESSION_DEPTH) {
      return undefined;
    }
    this.depth += 1;
    try {
      return parse();
    } finally {
      this.depth -= 1;
    }
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
  if (node.kind === 'not') {
    return toDisjunctiveNormalForm(node.operand, !negated);
  }
  return combineLogicalExpression(node, negated);
}

function combineLogicalExpression(
  node: Extract<ExpressionNode, { kind: 'and' | 'or' }>,
  negated: boolean,
): Array<Array<Omit<QspSourceCondition, 'source'>>> | undefined {
  const effectiveKind = reverseLogicalOperator(node.kind, negated);
  const left = toDisjunctiveNormalForm(node.left, negated);
  const right = toDisjunctiveNormalForm(node.right, negated);
  if (!left || !right) {
    return undefined;
  }
  if (effectiveKind === 'or') {
    return [...left, ...right];
  }
  return crossConditionGroups(left, right);
}

function reverseLogicalOperator(operator: 'and' | 'or', negated: boolean): 'and' | 'or' {
  if (!negated) {
    return operator;
  }
  return operator === 'and' ? 'or' : 'and';
}

function crossConditionGroups(
  left: Array<Array<Omit<QspSourceCondition, 'source'>>>,
  right: Array<Array<Omit<QspSourceCondition, 'source'>>>,
): Array<Array<Omit<QspSourceCondition, 'source'>>> | undefined {
  if (left.length * right.length > MAX_CONDITION_GROUPS) {
    return undefined;
  }
  return left.flatMap((leftGroup) => right.map((rightGroup) => [...leftGroup, ...rightGroup]));
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
  return ['=', '!', '<>', '<', '<=', '=<', '>', '>=', '=>'].includes(value);
}

function mapComparisonOperator(value: string): StatComparisonOperator {
  if (value === '=') {
    return 'eq';
  }
  if (value === '<>' || value === '!') {
    return 'neq';
  }
  if (value === '<') {
    return 'lt';
  }
  if (value === '<=' || value === '=<') {
    return 'lte';
  }
  if (value === '>') {
    return 'gt';
  }
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

export type ExpressionLiteral = number | boolean | string;

export type ExpressionValue = ExpressionLiteral | undefined;

export type ExpressionOperator = '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '<=' | '>' | '>=';
type NumericComparisonOperator = '<' | '<=' | '>' | '>=';
type NumericArithmeticOperator = '-' | '*' | '/';
type EqualityOperator = '==' | '!=';

export interface VariableReferenceNode {
  kind: 'variable';
  id: string;
  itemId?: string;
}

export interface LiteralNode {
  kind: 'literal';
  value: ExpressionLiteral;
}

export interface UnaryExpressionNode {
  kind: 'unary';
  operator: '+' | '-';
  operand: ExpressionNode;
}

export interface BinaryExpressionNode {
  kind: 'binary';
  operator: ExpressionOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface GroupExpressionNode {
  kind: 'group';
  expression: ExpressionNode;
}

export type ExpressionNode =
  | VariableReferenceNode
  | LiteralNode
  | UnaryExpressionNode
  | BinaryExpressionNode
  | GroupExpressionNode;

export type ExpressionEvaluationResult = ExpressionLiteral | { ok: false; error: string };
export type ExpressionValueType = 'number' | 'boolean' | 'string';

export interface ExpressionReference {
  id: string;
  itemId?: string;
}

const NUMBER_PATTERN = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function variableReference(id: string, itemId?: string): string {
  return itemId ? `@{${id}|${itemId}}` : `@{${id}}`;
}

export function parseExpression(expression: string): ExpressionNode | undefined {
  if (typeof expression !== 'string' || expression.length > 4000) {
    return undefined;
  }
  const parser = new ExpressionParser(expression.trim());
  const node = parser.parseComparison();
  if (!node || !parser.isAtEnd()) {
    return undefined;
  }
  return isExpressionDepthAllowed(node) ? node : undefined;
}

function isExpressionDepthAllowed(node: ExpressionNode): boolean {
  const pending = [{ node, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop();
    if (!entry) {
      continue;
    }
    if (entry.depth > 64) {
      return false;
    }
    const children = getExpressionChildren(entry.node);
    pending.push(...children.map((child) => ({ node: child, depth: entry.depth + 1 })));
  }
  return true;
}

function getExpressionChildren(node: ExpressionNode): ExpressionNode[] {
  switch (node.kind) {
    case 'binary':
      return [node.left, node.right];
    case 'unary':
      return [node.operand];
    case 'group':
      return [node.expression];
    case 'literal':
    case 'variable':
      return [];
  }
}

export function getExpressionReferences(expression: string): ExpressionReference[] | undefined {
  const parsed = parseExpression(expression);
  if (!parsed) {
    return undefined;
  }
  const references = new Map<string, ExpressionReference>();
  visitExpression(parsed, (node) => {
    if (node.kind !== 'variable') {
      return;
    }
    references.set(variableReference(node.id, node.itemId), {
      id: node.id,
      ...(node.itemId ? { itemId: node.itemId } : {}),
    });
  });
  return [...references.values()];
}

export function inferExpressionType(
  expression: string,
  resolveReferenceType: (reference: ExpressionReference) => ExpressionValueType | undefined,
): ExpressionValueType | undefined {
  const parsed = parseExpression(expression);
  return parsed ? inferNodeType(parsed, resolveReferenceType) : undefined;
}

export function expressionReferencesAny(
  expression: string | undefined,
  assignmentIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string> = new Set(),
): boolean {
  if (!expression) {
    return false;
  }
  return (
    getExpressionReferences(expression)?.some(
      ({ id, itemId }) => assignmentIds.has(id) || (itemId !== undefined && itemIds.has(itemId)),
    ) ?? false
  );
}

export function serializeExpression(node: ExpressionNode): string {
  switch (node.kind) {
    case 'literal':
      return serializeLiteral(node.value);
    case 'variable': {
      return variableReference(node.id, node.itemId);
    }
    case 'unary':
      return `${node.operator}${serializeExpression(node.operand)}`;
    case 'group':
      return `(${serializeExpression(node.expression)})`;
    case 'binary': {
      const left = serializeExpression(node.left);
      const right = serializeExpression(node.right);
      return `${left} ${node.operator} ${right}`;
    }
    default: {
      return '';
    }
  }
}

export function evaluateExpression(
  expression: string,
  values: Readonly<Record<string, ExpressionValue>> = {},
): ExpressionEvaluationResult {
  const parsed = parseExpression(expression);
  if (!parsed) {
    return { ok: false, error: 'Unable to parse expression' };
  }
  const result = evaluateNode(parsed, values);
  return typeof result === 'number' && !Number.isFinite(result)
    ? { ok: false, error: 'Expression result must be finite' }
    : result;
}

function evaluateNode(
  node: ExpressionNode,
  values: Readonly<Record<string, ExpressionValue>>,
): ExpressionEvaluationResult {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'variable':
      return evaluateVariableNode(node, values);
    case 'unary':
      return evaluateUnaryNode(node, values);
    case 'group':
      return evaluateNode(node.expression, values);
    case 'binary':
      return evaluateBinaryNode(node, values);
    default:
      return { ok: false, error: 'Invalid expression node' };
  }
}

function evaluateVariableNode(
  node: VariableReferenceNode,
  values: Readonly<Record<string, ExpressionValue>>,
): ExpressionEvaluationResult {
  const key = node.itemId ? `${node.id}|${node.itemId}` : node.id;
  const value = Object.hasOwn(values, key) ? values[key] : undefined;
  if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
    return { ok: false, error: `Unknown variable reference: ${getReferenceName(node)}` };
  }
  return value;
}

function evaluateUnaryNode(
  node: UnaryExpressionNode,
  values: Readonly<Record<string, ExpressionValue>>,
): ExpressionEvaluationResult {
  const operand = evaluateNode(node.operand, values);
  if (isExpressionFailure(operand)) {
    return operand;
  }
  if (typeof operand !== 'number') {
    return { ok: false, error: `Unary ${node.operator} requires a numeric operand` };
  }
  return node.operator === '-' ? -operand : operand;
}

function evaluateBinaryNode(
  node: BinaryExpressionNode,
  values: Readonly<Record<string, ExpressionValue>>,
): ExpressionEvaluationResult {
  const left = evaluateNode(node.left, values);
  if (isExpressionFailure(left)) {
    return left;
  }
  const right = evaluateNode(node.right, values);
  if (isExpressionFailure(right)) {
    return right;
  }
  const result = applyBinaryOperator(node.operator, left, right);
  return typeof result === 'number' && !Number.isFinite(result)
    ? { ok: false, error: 'Expression result must be finite' }
    : result;
}

function isExpressionFailure(
  value: ExpressionEvaluationResult,
): value is { ok: false; error: string } {
  return typeof value === 'object' && value !== null && 'ok' in value && !value.ok;
}

function visitExpression(node: ExpressionNode, visitor: (node: ExpressionNode) => void): void {
  visitor(node);
  if (node.kind === 'unary') {
    visitExpression(node.operand, visitor);
  }
  if (node.kind === 'group') {
    visitExpression(node.expression, visitor);
  }
  if (node.kind === 'binary') {
    visitExpression(node.left, visitor);
    visitExpression(node.right, visitor);
  }
}

function inferNodeType(
  node: ExpressionNode,
  resolveReferenceType: (reference: ExpressionReference) => ExpressionValueType | undefined,
): ExpressionValueType | undefined {
  switch (node.kind) {
    case 'literal':
      return inferLiteralType(node.value);
    case 'variable':
      return resolveReferenceType(node);
    case 'unary':
      return inferNodeType(node.operand, resolveReferenceType) === 'number' ? 'number' : undefined;
    case 'group':
      return inferNodeType(node.expression, resolveReferenceType);
    case 'binary':
      return inferBinaryNodeType(node, resolveReferenceType);
  }
}

function inferLiteralType(value: ExpressionLiteral): ExpressionValueType {
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return 'string';
}

function inferBinaryNodeType(
  node: BinaryExpressionNode,
  resolveReferenceType: (reference: ExpressionReference) => ExpressionValueType | undefined,
): ExpressionValueType | undefined {
  const left = inferNodeType(node.left, resolveReferenceType);
  const right = inferNodeType(node.right, resolveReferenceType);
  if (!left || !right) {
    return undefined;
  }
  return inferBinaryOperatorType(node.operator, left, right);
}

function inferBinaryOperatorType(
  operator: ExpressionOperator,
  left: ExpressionValueType,
  right: ExpressionValueType,
): ExpressionValueType | undefined {
  const numericOperands = left === 'number' && right === 'number';
  if (isEqualityOperator(operator)) {
    return left === right ? 'boolean' : undefined;
  }
  if (isNumericComparisonOperator(operator)) {
    return numericOperands ? 'boolean' : undefined;
  }
  if (operator === '+') {
    return inferAdditionType(left, right, numericOperands);
  }
  return numericOperands ? 'number' : undefined;
}

function inferAdditionType(
  left: ExpressionValueType,
  right: ExpressionValueType,
  numericOperands: boolean,
): ExpressionValueType | undefined {
  if (left === 'string' && right === 'string') {
    return 'string';
  }
  return numericOperands ? 'number' : undefined;
}

function isEqualityOperator(operator: ExpressionOperator): operator is EqualityOperator {
  return operator === '==' || operator === '!=';
}

function isNumericComparisonOperator(
  operator: ExpressionOperator,
): operator is NumericComparisonOperator {
  return operator === '<' || operator === '<=' || operator === '>' || operator === '>=';
}

function applyBinaryOperator(
  operator: ExpressionOperator,
  left: ExpressionLiteral,
  right: ExpressionLiteral,
): ExpressionEvaluationResult {
  if (operator === '+') {
    return applyAddition(left, right);
  }
  if (isEqualityOperator(operator)) {
    return applyEquality(operator, left, right);
  }
  return applyNumericOperator(operator, left, right);
}

function applyAddition(
  left: ExpressionLiteral,
  right: ExpressionLiteral,
): ExpressionEvaluationResult {
  if (typeof left === 'string' && typeof right === 'string') {
    return `${left}${right}`;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left + right;
  }
  return { ok: false, error: 'Operator + requires numeric operands' };
}

function applyEquality(
  operator: EqualityOperator,
  left: ExpressionLiteral,
  right: ExpressionLiteral,
): ExpressionEvaluationResult {
  if (typeof left !== typeof right) {
    return { ok: false, error: 'Equality requires matching operand types' };
  }
  return operator === '==' ? left === right : left !== right;
}

function applyNumericOperator(
  operator: NumericComparisonOperator | NumericArithmeticOperator,
  left: ExpressionLiteral,
  right: ExpressionLiteral,
): ExpressionEvaluationResult {
  if (typeof left !== 'number' || typeof right !== 'number') {
    return { ok: false, error: `Operator ${operator} requires numeric operands` };
  }

  if (isNumericComparisonOperator(operator)) {
    return applyNumericComparison(operator, left, right);
  }
  return applyNumericArithmetic(operator, left, right);
}

function applyNumericComparison(
  operator: NumericComparisonOperator,
  left: number,
  right: number,
): boolean {
  switch (operator) {
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '>':
      return left > right;
    case '>=':
      return left >= right;
  }
}

function applyNumericArithmetic(
  operator: NumericArithmeticOperator,
  left: number,
  right: number,
): ExpressionEvaluationResult {
  switch (operator) {
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) {
        return { ok: false, error: 'Division by zero' };
      }
      return left / right;
  }
}

function getReferenceName(node: VariableReferenceNode): string {
  return node.itemId ? `${node.id}|${node.itemId}` : node.id;
}

function serializeLiteral(value: ExpressionLiteral): string {
  if (typeof value === 'string') {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

class ExpressionParser {
  private readonly source: string;
  private index = 0;
  private depth = 0;

  constructor(source: string) {
    this.source = source;
  }

  isAtEnd(): boolean {
    return this.index >= this.source.length;
  }

  parseComparison(): ExpressionNode | undefined {
    let left = this.parseAdditive();
    if (!left) {
      return undefined;
    }

    while (true) {
      this.skipWhitespace();
      if (!this.isComparisonOperator()) {
        return left;
      }
      const operator = this.consumeComparisonOperator();
      const right = this.parseAdditive();
      if (!right) {
        return undefined;
      }
      left = {
        kind: 'binary',
        operator,
        left,
        right,
      };
    }
  }

  private parseAdditive(): ExpressionNode | undefined {
    let left = this.parseMultiplicative();
    if (!left) {
      return undefined;
    }

    while (true) {
      this.skipWhitespace();
      const current = this.peek();
      if (current !== '+' && current !== '-') {
        return left;
      }
      this.index += 1;
      const right = this.parseMultiplicative();
      if (!right) {
        return undefined;
      }
      left = {
        kind: 'binary',
        operator: current,
        left,
        right,
      };
    }
  }

  private parseMultiplicative(): ExpressionNode | undefined {
    let left = this.parseUnary();
    if (!left) {
      return undefined;
    }

    while (true) {
      this.skipWhitespace();
      const current = this.peek();
      if (current !== '*' && current !== '/') {
        return left;
      }
      this.index += 1;
      const right = this.parseUnary();
      if (!right) {
        return undefined;
      }
      left = {
        kind: 'binary',
        operator: current,
        left,
        right,
      };
    }
  }

  private parseUnary(): ExpressionNode | undefined {
    if (this.depth >= 64) {
      return undefined;
    }
    this.depth += 1;
    try {
      return this.parseUnaryOperand();
    } finally {
      this.depth -= 1;
    }
  }

  private parseUnaryOperand(): ExpressionNode | undefined {
    this.skipWhitespace();
    const current = this.peek();
    if (current === '+' || current === '-') {
      this.index += 1;
      const operand = this.parseUnary();
      if (!operand) {
        return undefined;
      }
      return { kind: 'unary', operator: current, operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode | undefined {
    this.skipWhitespace();
    const current = this.peek();
    if (current === undefined) {
      return undefined;
    }
    if (current === '(') {
      return this.parseGroupedExpression();
    }
    if (current === '@') {
      return this.parseVariableReference();
    }
    if (current === '"' || current === "'") {
      return this.parseStringLiteral(current);
    }
    if (this.matchesKeyword('true')) {
      return { kind: 'literal', value: true };
    }
    if (this.matchesKeyword('false')) {
      return { kind: 'literal', value: false };
    }
    if (this.isDigit() || current === '.') {
      return this.parseNumberLiteral();
    }
    return this.parseIdentifier();
  }

  private parseGroupedExpression(): ExpressionNode | undefined {
    this.index += 1;
    const expression = this.parseComparison();
    this.skipWhitespace();
    if (!expression || this.peek() !== ')') {
      return undefined;
    }
    this.index += 1;
    return { kind: 'group', expression };
  }

  private parseVariableReference(): ExpressionNode | undefined {
    this.index += 1;
    if (this.peek() !== '{') {
      return undefined;
    }
    this.index += 1;
    const rawReference = this.readUntil('}');
    if (!rawReference) {
      return undefined;
    }
    const parts = rawReference.split('|');
    const [id, itemId] = parts;
    if (parts.length > 2 || !id || (parts.length === 2 && !itemId)) {
      return undefined;
    }
    if (parts.some((part) => /[\s{}]/.test(part))) {
      return undefined;
    }
    this.index += 1;
    return { kind: 'variable', id, ...(itemId ? { itemId } : {}) };
  }

  private parseStringLiteral(quote: string): ExpressionNode | undefined {
    this.index += 1;
    let value = '';
    while (!this.isAtEnd()) {
      const char = this.source[this.index];
      if (char === quote) {
        this.index += 1;
        return { kind: 'literal', value };
      }
      this.index += 1;
      if (char === '\\') {
        const next = this.peek();
        if (next === undefined) {
          return undefined;
        }
        value += next;
        this.index += 1;
        continue;
      }
      value += char;
    }
    return undefined;
  }

  private parseNumberLiteral(): ExpressionNode | undefined {
    const start = this.index;
    if (this.peek() === '.') {
      this.index += 1;
    }
    while (this.isDigit()) {
      this.index += 1;
    }
    if (this.peek() === '.') {
      this.index += 1;
      while (this.isDigit()) {
        this.index += 1;
      }
    }
    const raw = this.source.slice(start, this.index);
    if (!NUMBER_PATTERN.test(raw) || !Number.isFinite(Number(raw))) {
      return undefined;
    }
    return { kind: 'literal', value: Number(raw) };
  }

  private parseIdentifier(): ExpressionNode | undefined {
    const start = this.index;
    while (!this.isAtEnd() && /[A-Za-z0-9_-]/.test(this.source[this.index])) {
      this.index += 1;
    }
    const id = this.source.slice(start, this.index);
    if (id) {
      return { kind: 'variable', id };
    }
    return undefined;
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.source[this.index])) {
      this.index += 1;
    }
  }

  private peek(): string | undefined {
    if (this.isAtEnd()) {
      return undefined;
    }
    return this.source[this.index];
  }

  private readUntil(endCharacter: string): string {
    const start = this.index;
    while (!this.isAtEnd()) {
      const char = this.source[this.index];
      if (char === endCharacter) {
        return this.source.slice(start, this.index);
      }
      this.index += 1;
    }
    return '';
  }

  private isDigit(): boolean {
    return /\d/.test(this.peek() ?? '');
  }

  private isComparisonOperator(): boolean {
    const start = this.index;
    if (this.source.startsWith('==', start)) {
      return true;
    }
    if (this.source.startsWith('!=', start)) {
      return true;
    }
    if (this.source.startsWith('<=', start)) {
      return true;
    }
    if (this.source.startsWith('>=', start)) {
      return true;
    }
    return this.source[start] === '<' || this.source[start] === '>';
  }

  private consumeComparisonOperator(): ExpressionOperator {
    const start = this.index;
    if (this.source.startsWith('==', start)) {
      this.index += 2;
      return '==';
    }
    if (this.source.startsWith('!=', start)) {
      this.index += 2;
      return '!=';
    }
    if (this.source.startsWith('<=', start)) {
      this.index += 2;
      return '<=';
    }
    if (this.source.startsWith('>=', start)) {
      this.index += 2;
      return '>=';
    }
    if (this.source[start] === '<') {
      this.index += 1;
      return '<';
    }
    this.index += 1;
    return '>';
  }

  private matchesKeyword(keyword: string): boolean {
    const start = this.index;
    if (!this.source.startsWith(keyword, start)) {
      return false;
    }
    const next = this.source[start + keyword.length];
    if (next !== undefined && /[A-Za-z0-9_-]/.test(next)) {
      return false;
    }
    this.index += keyword.length;
    return true;
  }
}

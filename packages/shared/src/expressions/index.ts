export type ExpressionLiteral = number | boolean | string;

export type ExpressionValue = ExpressionLiteral | undefined;

export type ExpressionOperator = '+' | '-' | '*' | '/' | '==' | '!=' | '<' | '<=' | '>' | '>=';

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
  if (typeof expression !== 'string' || expression.length > 4000) return undefined;
  const parser = new ExpressionParser(expression.trim());
  const node = parser.parseComparison();
  if (!node || !parser.isAtEnd()) return undefined;
  const pending = [{ node, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.depth > 64) return undefined;
    const children =
      entry.node.kind === 'binary'
        ? [entry.node.left, entry.node.right]
        : entry.node.kind === 'unary'
          ? [entry.node.operand]
          : entry.node.kind === 'group'
            ? [entry.node.expression]
            : [];
    pending.push(...children.map((child) => ({ node: child, depth: entry.depth + 1 })));
  }
  return node;
}

export function getExpressionReferences(expression: string): ExpressionReference[] | undefined {
  const parsed = parseExpression(expression);
  if (!parsed) return undefined;
  const references = new Map<string, ExpressionReference>();
  visitExpression(parsed, (node) => {
    if (node.kind !== 'variable') return;
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
  if (!expression) return false;
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
    case 'variable': {
      const key = node.itemId ? `${node.id}|${node.itemId}` : node.id;
      const value = Object.hasOwn(values, key) ? values[key] : undefined;
      if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
        return { ok: false, error: `Unknown variable reference: ${getReferenceName(node)}` };
      }
      return value;
    }
    case 'unary': {
      const operand = evaluateNode(node.operand, values);
      if (typeof operand === 'object' && operand && 'ok' in operand && !operand.ok) return operand;
      const value = operand as ExpressionLiteral;
      if (typeof value !== 'number') {
        return { ok: false, error: `Unary ${node.operator} requires a numeric operand` };
      }
      return node.operator === '-' ? -value : value;
    }
    case 'group':
      return evaluateNode(node.expression, values);
    case 'binary': {
      const left = evaluateNode(node.left, values);
      if (typeof left === 'object' && left && 'ok' in left && !left.ok) return left;
      const right = evaluateNode(node.right, values);
      if (typeof right === 'object' && right && 'ok' in right && !right.ok) return right;
      const result = applyBinaryOperator(
        node.operator,
        left as ExpressionLiteral,
        right as ExpressionLiteral,
      );
      return typeof result === 'number' && !Number.isFinite(result)
        ? { ok: false, error: 'Expression result must be finite' }
        : result;
    }
    default:
      return { ok: false, error: 'Invalid expression node' };
  }
}

function visitExpression(node: ExpressionNode, visitor: (node: ExpressionNode) => void): void {
  visitor(node);
  if (node.kind === 'unary') visitExpression(node.operand, visitor);
  if (node.kind === 'group') visitExpression(node.expression, visitor);
  if (node.kind === 'binary') {
    visitExpression(node.left, visitor);
    visitExpression(node.right, visitor);
  }
}

function inferNodeType(
  node: ExpressionNode,
  resolveReferenceType: (reference: ExpressionReference) => ExpressionValueType | undefined,
): ExpressionValueType | undefined {
  if (node.kind === 'literal') {
    if (typeof node.value === 'number') return 'number';
    if (typeof node.value === 'boolean') return 'boolean';
    return 'string';
  }
  if (node.kind === 'variable') return resolveReferenceType(node);
  if (node.kind === 'unary') {
    return inferNodeType(node.operand, resolveReferenceType) === 'number' ? 'number' : undefined;
  }
  if (node.kind === 'group') return inferNodeType(node.expression, resolveReferenceType);
  const left = inferNodeType(node.left, resolveReferenceType);
  const right = inferNodeType(node.right, resolveReferenceType);
  if (!left || !right) return undefined;
  if (['==', '!='].includes(node.operator)) return left === right ? 'boolean' : undefined;
  if (['<', '<=', '>', '>='].includes(node.operator)) {
    return left === 'number' && right === 'number' ? 'boolean' : undefined;
  }
  if (node.operator === '+' && left === 'string' && right === 'string') return 'string';
  return left === 'number' && right === 'number' ? 'number' : undefined;
}

function applyBinaryOperator(
  operator: ExpressionOperator,
  left: ExpressionLiteral,
  right: ExpressionLiteral,
): ExpressionEvaluationResult {
  const leftIsNumber = typeof left === 'number';
  const rightIsNumber = typeof right === 'number';

  if (
    operator === '+' ||
    operator === '-' ||
    operator === '*' ||
    operator === '/' ||
    operator === '<' ||
    operator === '<=' ||
    operator === '>' ||
    operator === '>='
  ) {
    if (!leftIsNumber || !rightIsNumber) {
      if (operator === '+' && typeof left === 'string' && typeof right === 'string') {
        return `${left}${right}`;
      }
      return { ok: false, error: `Operator ${operator} requires numeric operands` };
    }
  }

  const leftNumber = left as number;
  const rightNumber = right as number;
  if ((operator === '==' || operator === '!=') && typeof left !== typeof right) {
    return { ok: false, error: 'Equality requires matching operand types' };
  }

  switch (operator) {
    case '+':
      return leftNumber + rightNumber;
    case '-':
      return leftNumber - rightNumber;
    case '*':
      return leftNumber * rightNumber;
    case '/':
      if (rightNumber === 0) return { ok: false, error: 'Division by zero' };
      return leftNumber / rightNumber;
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '<':
      return leftNumber < rightNumber;
    case '<=':
      return leftNumber <= rightNumber;
    case '>':
      return leftNumber > rightNumber;
    case '>=':
      return leftNumber >= rightNumber;
    default:
      return { ok: false, error: 'Unsupported operator' };
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
  if (typeof value === 'boolean') return value ? 'true' : 'false';
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
    if (!left) return undefined;

    while (true) {
      this.skipWhitespace();
      if (!this.isComparisonOperator()) return left;
      const operator = this.consumeComparisonOperator();
      const right = this.parseAdditive();
      if (!right) return undefined;
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
    if (!left) return undefined;

    while (true) {
      this.skipWhitespace();
      const current = this.peek();
      if (current !== '+' && current !== '-') {
        return left;
      }
      this.index += 1;
      const right = this.parseMultiplicative();
      if (!right) return undefined;
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
    if (!left) return undefined;

    while (true) {
      this.skipWhitespace();
      const current = this.peek();
      if (current !== '*' && current !== '/') {
        return left;
      }
      this.index += 1;
      const right = this.parseUnary();
      if (!right) return undefined;
      left = {
        kind: 'binary',
        operator: current,
        left,
        right,
      };
    }
  }

  private parseUnary(): ExpressionNode | undefined {
    if (this.depth >= 64) return undefined;
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
      if (!operand) return undefined;
      return { kind: 'unary', operator: current, operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode | undefined {
    this.skipWhitespace();
    if (this.isAtEnd()) return undefined;

    const current = this.peek();
    if (current === '(') {
      this.index += 1;
      const expression = this.parseComparison();
      this.skipWhitespace();
      if (!expression || this.peek() !== ')') return undefined;
      this.index += 1;
      return { kind: 'group', expression };
    }
    if (current === '@') {
      this.index += 1;
      const maybeBrace = this.peek();
      if (maybeBrace !== '{') return undefined;
      this.index += 1;
      const rawReference = this.readUntil('}');
      if (!rawReference) return undefined;
      const parts = rawReference.split('|');
      const [id, itemId] = parts;
      if (parts.length > 2 || !id || (parts.length === 2 && !itemId)) return undefined;
      if (parts.some((part) => /[\s{}]/.test(part))) return undefined;
      const node: VariableReferenceNode = { kind: 'variable', id, ...(itemId ? { itemId } : {}) };
      this.index += 1;
      return node;
    }

    if (current === '"' || current === "'") {
      const quote = current;
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
          if (next === undefined) return undefined;
          value += next;
          this.index += 1;
          continue;
        }
        value += char;
      }
      return undefined;
    }

    if (this.matchesKeyword('true')) {
      return { kind: 'literal', value: true };
    }
    if (this.matchesKeyword('false')) {
      return { kind: 'literal', value: false };
    }

    if (this.isDigit() || current === '.') {
      const start = this.index;
      if (current === '.') {
        this.index += 1;
      }
      while (this.isDigit()) this.index += 1;
      if (this.peek() === '.') {
        this.index += 1;
        while (this.isDigit()) this.index += 1;
      }
      const raw = this.source.slice(start, this.index);
      if (!NUMBER_PATTERN.test(raw) || !Number.isFinite(Number(raw))) return undefined;
      return { kind: 'literal', value: Number(raw) };
    }

    const identStart = this.index;
    while (!this.isAtEnd() && /[A-Za-z0-9_-]/.test(this.source[this.index])) {
      this.index += 1;
    }
    const ident = this.source.slice(identStart, this.index);
    if (!ident) return undefined;
    return { kind: 'variable', id: ident };
  }

  private skipWhitespace(): void {
    while (!this.isAtEnd() && /\s/.test(this.source[this.index])) {
      this.index += 1;
    }
  }

  private peek(): string | undefined {
    if (this.isAtEnd()) return undefined;
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
    if (this.source.startsWith('==', start)) return true;
    if (this.source.startsWith('!=', start)) return true;
    if (this.source.startsWith('<=', start)) return true;
    if (this.source.startsWith('>=', start)) return true;
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
    if (!this.source.startsWith(keyword, start)) return false;
    const next = this.source[start + keyword.length];
    if (next !== undefined && /[A-Za-z0-9_-]/.test(next)) {
      return false;
    }
    this.index += keyword.length;
    return true;
  }
}

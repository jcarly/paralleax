import {
  parseExpression,
  serializeExpression,
  type ExpressionNode,
  type VariableReferenceNode,
} from './index.js';

export interface ExpressionReferenceMapping {
  assignments: ReadonlyMap<string, string>;
  items: ReadonlyMap<string, string>;
}

/** Rewrites parsed references only; an unchanged expression keeps its original spelling. */
export function remapExpressionReferences(
  expression: string,
  mapping: ExpressionReferenceMapping,
): string | undefined {
  const parsed = parseExpression(expression);
  if (!parsed) {
    return undefined;
  }
  const result = remapNode(parsed, mapping);
  return result.changed ? serializeExpression(result.node) : expression;
}

type RemappedNode = { node: ExpressionNode; changed: boolean };

function remapNode(node: ExpressionNode, mapping: ExpressionReferenceMapping): RemappedNode {
  switch (node.kind) {
    case 'literal':
      return { node, changed: false };
    case 'variable':
      return remapVariable(node, mapping);
    case 'unary': {
      const operand = remapNode(node.operand, mapping);
      return { node: { ...node, operand: operand.node }, changed: operand.changed };
    }
    case 'group': {
      const expression = remapNode(node.expression, mapping);
      return { node: { ...node, expression: expression.node }, changed: expression.changed };
    }
    case 'binary': {
      const left = remapNode(node.left, mapping);
      const right = remapNode(node.right, mapping);
      return {
        node: { ...node, left: left.node, right: right.node },
        changed: left.changed || right.changed,
      };
    }
  }
}

function remapVariable(
  node: VariableReferenceNode,
  mapping: ExpressionReferenceMapping,
): RemappedNode {
  const id = mapping.assignments.get(node.id) ?? node.id;
  const itemId =
    node.itemId === undefined ? undefined : (mapping.items.get(node.itemId) ?? node.itemId);
  return {
    node: { kind: 'variable', id, ...(itemId === undefined ? {} : { itemId }) },
    changed: id !== node.id || itemId !== node.itemId,
  };
}

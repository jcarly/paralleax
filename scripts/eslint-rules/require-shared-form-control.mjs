const SPECIAL_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'search',
  'submit',
]);

const ATTRIBUTE_NAMES = new Set(['className']);

function getVariableInitializer(identifier, scope) {
  for (let current = scope; current; current = current.upper) {
    const variable = current.set?.get(identifier.name);
    if (!variable) continue;

    const definition = variable.defs.find((candidate) => candidate.type === 'Variable');
    return definition?.node.init;
  }

  return undefined;
}

function collectStaticClasses(node, scope, seen = new Set()) {
  if (!node) return { possible: new Set(), definite: new Set(), dynamicDensity: false };

  if (node.type === 'Literal' && typeof node.value === 'string') {
    const classes = new Set(node.value.split(/\s+/).filter(Boolean));
    return { possible: classes, definite: classes, dynamicDensity: false };
  }

  if (node.type === 'TemplateLiteral') {
    const staticText = node.quasis.map(({ value }) => value.cooked ?? value.raw).join(' ');
    const classes = new Set(staticText.split(/\s+/).filter(Boolean));
    const dynamicDensity = node.quasis.some(({ value }) =>
      /(?:^|\s)form-control--\s*$/.test(value.cooked ?? value.raw),
    );

    for (const expression of node.expressions) {
      const nested = collectStaticClasses(expression, scope, seen);
      for (const className of nested.possible) classes.add(className);
    }

    return { possible: classes, definite: classes, dynamicDensity };
  }

  if (node.type === 'Identifier') {
    if (seen.has(node.name))
      return { possible: new Set(), definite: new Set(), dynamicDensity: false };
    const initializer = getVariableInitializer(node, scope);
    if (!initializer) return { possible: new Set(), definite: new Set(), dynamicDensity: false };
    const nextSeen = new Set(seen);
    nextSeen.add(node.name);
    return collectStaticClasses(initializer, scope, nextSeen);
  }

  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'ParenthesizedExpression' ||
    node.type === 'ChainExpression'
  ) {
    return collectStaticClasses(node.expression, scope, seen);
  }

  if (node.type === 'ConditionalExpression') {
    const consequent = collectStaticClasses(node.consequent, scope, seen);
    const alternate = collectStaticClasses(node.alternate, scope, seen);
    return {
      possible: union(consequent.possible, alternate.possible),
      definite: intersection(consequent.definite, alternate.definite),
      dynamicDensity: consequent.dynamicDensity || alternate.dynamicDensity,
    };
  }

  if (node.type === 'LogicalExpression') {
    const left = collectStaticClasses(node.left, scope, seen);
    const right = collectStaticClasses(node.right, scope, seen);
    return {
      possible: union(left.possible, right.possible),
      definite: left.definite,
      dynamicDensity: left.dynamicDensity || right.dynamicDensity,
    };
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = collectStaticClasses(node.left, scope, seen);
    const right = collectStaticClasses(node.right, scope, seen);
    return {
      possible: union(left.possible, right.possible),
      definite: union(left.definite, right.definite),
      dynamicDensity: left.dynamicDensity || right.dynamicDensity,
    };
  }

  if (node.type === 'ObjectExpression') {
    const possible = new Set();
    const definite = new Set();
    let dynamicDensity = false;

    for (const property of node.properties) {
      if (property.type !== 'Property') continue;
      const key = property.key;
      const className =
        key.type === 'Identifier' && !property.computed
          ? key.name
          : key.type === 'Literal' && typeof key.value === 'string'
            ? key.value
            : undefined;
      if (className) {
        possible.add(className);
        if (property.value.type === 'Literal' && property.value.value === true) {
          definite.add(className);
        }
      }

      const nested = collectStaticClasses(property.value, scope, seen);
      for (const nestedClass of nested.possible) possible.add(nestedClass);
      for (const nestedClass of nested.definite) definite.add(nestedClass);
      dynamicDensity ||= nested.dynamicDensity;
    }

    return { possible, definite, dynamicDensity };
  }

  if (node.type === 'CallExpression' || node.type === 'ArrayExpression') {
    const argumentsList =
      node.type === 'CallExpression'
        ? [
            ...(node.callee.type === 'MemberExpression' ? [node.callee.object] : []),
            ...node.arguments,
          ]
        : node.elements;
    let possible = new Set();
    let definite = new Set();
    let dynamicDensity = false;

    for (const argument of argumentsList) {
      if (!argument || argument.type === 'SpreadElement') continue;
      const nested = collectStaticClasses(argument, scope, seen);
      possible = union(possible, nested.possible);
      definite = union(definite, nested.definite);
      dynamicDensity ||= nested.dynamicDensity;
    }

    return { possible, definite, dynamicDensity };
  }

  if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
    const initializer = getVariableInitializer(node.object, scope);
    const propertyName = node.computed
      ? node.property.type === 'Literal' && typeof node.property.value === 'string'
        ? node.property.value
        : undefined
      : node.property.type === 'Identifier'
        ? node.property.name
        : undefined;
    if (initializer?.type === 'ObjectExpression' && propertyName) {
      const property = initializer.properties.find(
        (candidate) =>
          candidate.type === 'Property' &&
          ((candidate.key.type === 'Identifier' && candidate.key.name === propertyName) ||
            (candidate.key.type === 'Literal' && candidate.key.value === propertyName)),
      );
      if (property) return collectStaticClasses(property.value, scope, seen);
    }
  }

  if (node.type === 'JSXExpressionContainer') {
    return collectStaticClasses(node.expression, scope, seen);
  }

  return { possible: new Set(), definite: new Set(), dynamicDensity: false };
}

function union(first, second) {
  return new Set([...first, ...second]);
}

function intersection(first, second) {
  return new Set([...first].filter((value) => second.has(value)));
}

function hasDensity(classes, dynamicDensity) {
  return (
    classes.has('form-control--standard') || classes.has('form-control--compact') || dynamicDensity
  );
}

function isCompliant(classNameAttribute, scope) {
  if (!classNameAttribute?.value) return false;

  const result = collectStaticClasses(classNameAttribute.value, scope);
  const hasBase = result.definite.has('form-control');
  const hasFixedDensity = hasDensity(result.definite, false);
  const hasConditionalDensities =
    result.possible.has('form-control--standard') && result.possible.has('form-control--compact');

  return hasBase && (hasFixedDensity || hasConditionalDensities || result.dynamicDensity);
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'require shared classes on ordinary native form controls',
    },
    schema: [],
    messages: {
      requireSharedClasses:
        'Use .form-control with an explicit .form-control--standard or .form-control--compact density.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        const tagName = node.name.type === 'JSXIdentifier' ? node.name.name : undefined;
        if (!['input', 'select', 'textarea'].includes(tagName)) return;

        const typeAttribute = node.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.type === 'JSXIdentifier' &&
            attribute.name.name === 'type',
        );
        const inputType =
          typeAttribute?.value?.type === 'Literal' ? typeAttribute.value.value : undefined;
        if (tagName === 'input' && SPECIAL_INPUT_TYPES.has(inputType)) return;

        const classNameAttribute = node.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.type === 'JSXIdentifier' &&
            ATTRIBUTE_NAMES.has(attribute.name.name),
        );

        if (isCompliant(classNameAttribute, context.sourceCode.getScope(node))) return;
        context.report({ node, messageId: 'requireSharedClasses' });
      },
    };
  },
};

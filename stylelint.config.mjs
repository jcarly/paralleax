/** @type {import('stylelint').Config} */
export default {
  referenceFiles: ['apps/web/src/styles.css'],
  rules: {
    'at-rule-no-unknown': true,
    'block-no-empty': true,
    'color-named': ['never', { ignoreFunctions: ['var'] }],
    'color-no-hex': [true, { ignoreFunctions: ['var'] }],
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-values'] },
    ],
    'declaration-no-important': true,
    'declaration-block-no-shorthand-property-overrides': true,
    'declaration-property-value-no-unknown': true,
    'function-disallowed-list': [
      'rgb',
      'rgba',
      'hsl',
      'hsla',
      'hwb',
      'lab',
      'lch',
      'oklab',
      'oklch',
      'color',
      'color-mix',
    ],
    'media-feature-name-no-unknown': true,
    'media-feature-name-value-no-unknown': true,
    'media-query-no-invalid': true,
    'no-descending-specificity': true,
    'no-duplicate-selectors': true,
    'no-empty-source': true,
    'no-unknown-custom-properties': true,
    'property-no-unknown': true,
    'selector-no-invalid': true,
    'selector-pseudo-class-no-unknown': true,
  },
  overrides: [
    {
      files: [
        'apps/web/src/pages/ParalleaxPrototype.css',
        'apps/web/src/pages/ParalleaxPrototypePages.css',
      ],
      rules: {
        'color-named': null,
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
  ],
};

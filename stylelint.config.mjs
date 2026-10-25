/** @type {import('stylelint').Config} */
export default {
  referenceFiles: ['apps/web/src/styles.css'],
  rules: {
    'at-rule-no-unknown': true,
    'block-no-empty': true,
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-values'] },
    ],
    'declaration-block-no-shorthand-property-overrides': true,
    'declaration-property-value-no-unknown': true,
    'media-feature-name-no-unknown': true,
    'media-feature-name-value-no-unknown': true,
    'media-query-no-invalid': true,
    'no-empty-source': true,
    'no-unknown-custom-properties': true,
    'property-no-unknown': true,
    'selector-no-invalid': true,
    'selector-pseudo-class-no-unknown': true,
  },
};

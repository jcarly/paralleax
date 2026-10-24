/** @type {import('stylelint').Config} */
export default {
  rules: {
    'at-rule-no-unknown': true,
    'block-no-empty': true,
    'declaration-block-no-duplicate-custom-properties': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-values'] },
    ],
    'no-empty-source': true,
    'property-no-unknown': true,
    'selector-pseudo-class-no-unknown': true,
  },
};

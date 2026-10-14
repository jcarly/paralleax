import { describe, expect, it } from 'vitest';
import { lexQspLines } from './lexer.js';

describe('QSP lexical analysis', () => {
  it('keeps executable code and its quoted separators while removing comments', () => {
    expect(
      lexQspLines([
        '',
        "*pl 'Text & with ''quotes''' & gt 'End' ! trailing comment & gt 'Ignored'",
        "! comment & gt 'Ignored'",
        '!{',
        "gt 'Ignored'",
        '!}',
      ]),
    ).toEqual(['', "*pl 'Text & with ''quotes''' & gt 'End' ", '', '', '', '']);
  });

  it('does not expose commands inside a multiline string at end of input', () => {
    expect(lexQspLines(['dynamic "', "  gs 'helper'", "  gt '<<$target>>'", '"'])).toEqual([
      'dynamic "',
      '',
      '',
      '',
    ]);
  });
});

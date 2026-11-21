import { describe, expect, it } from 'vitest';
import { validateNativeStoryStructure } from './native-story-validation.js';

const interaction = { id: 'i', title: '', body: '', position: { x: 0, y: 0 }, triggers: [] };
const file = {
  format: 'paralleax.story',
  version: 1,
  story: { title: 'Story', interactions: [interaction] },
};

describe('native Story structural validation', () => {
  it('accepts an envelope with structurally valid content', () => {
    expect(validateNativeStoryStructure(file)).toEqual({
      status: 'structurally_valid',
      story: file.story,
    });
  });

  it('reports a version mismatch and rejects unknown envelope properties', () => {
    expect(validateNativeStoryStructure({ ...file, version: 2 })).toEqual({
      status: 'unsupported_version',
      version: 2,
    });
    expect(validateNativeStoryStructure({ ...file, owner: 'user' })).toEqual({
      status: 'invalid',
      code: 'INVALID_STRUCTURE',
      path: '$',
    });
  });

  it('reports structural errors and duplicate identifier paths', () => {
    expect(
      validateNativeStoryStructure({ ...file, story: { title: 'Story', interactions: [42] } }),
    ).toEqual({
      status: 'invalid',
      code: 'INVALID_STRUCTURE',
      path: '$.story.interactions[0]',
    });
    expect(
      validateNativeStoryStructure({
        ...file,
        story: { title: 'Story', interactions: [interaction, interaction] },
      }),
    ).toEqual({
      status: 'invalid',
      code: 'DUPLICATE_IDENTIFIER',
      path: '$.story.interactions[1].id',
    });
  });

  it('rejects NUL characters before PostgreSQL persistence', () => {
    expect(
      validateNativeStoryStructure({
        ...file,
        story: { ...file.story, interactions: [{ ...interaction, body: 'text\0text' }] },
      }),
    ).toEqual({
      status: 'invalid',
      code: 'INVALID_STRUCTURE',
      path: '$.story.interactions[0].body',
    });
  });
});

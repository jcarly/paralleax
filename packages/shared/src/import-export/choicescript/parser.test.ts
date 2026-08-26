import { describe, expect, it } from 'vitest';
import { parseChoiceScriptScenes } from './parser.js';
import { createChoiceScriptImportReport } from './report.js';

describe('ChoiceScript parser', () => {
  it('tokenizes scene metadata, typed commands, and nested choice statements', () => {
    const report = createChoiceScriptImportReport(1);
    const scenes = parseChoiceScriptScenes(
      [
        {
          name: 'startup-scene.txt',
          content:
            '\uFEFF*title Parsed Story\r\n*scene_list\r\n  startup-scene\r\n  ending\r\n\r\n*create courage 40\r\nOpening.\r\n*choice\r\n  *if courage >= 40 #Continue\r\n    *set courage + 2\r\n    Done.',
        },
      ],
      report,
    );

    expect(scenes).toHaveLength(1);
    expect(scenes[0]).toMatchObject({
      name: 'startup-scene',
      title: 'Parsed Story',
      sceneList: ['startup-scene', 'ending'],
    });
    expect(scenes[0].statements).toEqual([
      expect.objectContaining({ kind: 'declare', name: 'courage', value: 40 }),
      expect.objectContaining({ kind: 'text', lines: ['Opening.'] }),
      expect.objectContaining({
        kind: 'choice',
        options: [
          expect.objectContaining({
            title: 'Continue',
            condition: expect.objectContaining({ name: 'courage', operator: 'gte', value: 40 }),
            statements: [
              expect.objectContaining({ kind: 'set', operation: 'add', value: 2 }),
              expect.objectContaining({ kind: 'text', lines: ['Done.'] }),
            ],
          }),
        ],
      }),
    ]);
    expect(report).toMatchObject({
      convertedCommandCount: 4,
      approximatedCommandCount: 0,
      ignoredCommandCount: 2,
      issues: [],
    });
  });

  it('reports duplicate scenes and choices without readable options at the source boundary', () => {
    const report = createChoiceScriptImportReport(2);
    const scenes = parseChoiceScriptScenes(
      [
        { name: 'chapter!.txt', content: '*choice\nNo option.' },
        { name: 'chapter_.txt', content: 'Duplicate.' },
      ],
      report,
    );

    expect(scenes).toHaveLength(1);
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'choice_without_options',
        fileName: 'chapter!.txt',
        line: 1,
      }),
      expect.objectContaining({
        severity: 'error',
        code: 'duplicate_scene',
        fileName: 'chapter_.txt',
      }),
    ]);
  });
});

import { writeQsp } from './converter.js';
import { describe, expect, it } from 'vitest';
import { getTriggerConditionGroups } from '../../triggers/index.js';
import { importQsp } from './importer.js';
import { parseQspLocationBundle, serializeQspLocationBundle } from './source-bundle.js';

function importSource(source: Parameters<typeof importQsp>[0]) {
  let id = 0;
  return importQsp(source, {
    storyId: 'story-qsp',
    timestamp: '2026-09-02T10:00:00.000Z',
    createId: () => `generated-${++id}`,
  });
}

describe('QSP importer', () => {
  it('combines qsrc location files and connects literal ARGS[0] variants', () => {
    const result = importSource({
      name: 'Girl Life.qsrc',
      format: 'locations',
      content: [
        {
          name: 'locations/room.qsrc',
          content: `# room
if $ARGS[0] = 'inside':
  'You are inside.'
end
--- room ---`,
        },
        {
          name: 'locations/start.qsrc',
          content: `# start
if $ARGS[0] = '':
  gt 'start', 'menu'
end
if $ARGS[0] = 'menu':
  'Main menu'
  act 'Enter': gt 'room', 'inside'
end
--- start ---`,
        },
      ],
    });

    expect(result.report).toMatchObject({
      sourceFileCount: 2,
      locationCount: 2,
      actionCount: 1,
      interactionCount: 5,
    });
    expect(result.story?.title).toBe('Girl Life');
    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'start',
      'start · menu',
      'Enter',
      'room',
      'room · inside',
    ]);
    const [start, menu, enter, , inside] = result.story!.interactions;
    expect(menu.body).toBe('<p>Main menu</p>');
    expect(menu.triggers[0].inputInteractionIds).toEqual([start.id]);
    expect(enter.triggers[0].inputInteractionIds).toEqual([menu.id]);
    expect(inside.body).toBe('<p>You are inside.</p>');
    expect(inside.triggers[0].inputInteractionIds).toEqual([enter.id]);
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'navigation_arguments_ignored' }),
        expect.objectContaining({ code: 'unsupported_condition' }),
      ]),
    );
  });

  it('merges repeated independent ARGS[0] blocks into one ordered variant', () => {
    const result = importSource({
      name: 'Girl Life.qsrc',
      format: 'locations',
      content: [
        {
          name: 'locations/start.qsrc',
          content: "# start\ngt 'sex_ev_pillow_talk2', 'morning_sore_pussy'\n--- start ---",
        },
        {
          name: 'locations/sex_ev_pillow_talk2.qsrc',
          content: `# sex_ev_pillow_talk2
if $ARGS[0] = 'morning_sore_pussy':
  'First part.'
end
! other top-level code may separate repeated selectors
if $ARGS[0] = 'morning_sore_pussy':
  *pl 'Second part.'
  unknown_command
end
--- sex_ev_pillow_talk2 ---`,
        },
      ],
    });

    expect(result.story).toBeDefined();
    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'start',
      'sex_ev_pillow_talk2',
      'sex_ev_pillow_talk2 · morning_sore_pussy',
    ]);
    const [start, , variant] = result.story!.interactions;
    expect(variant.body).toBe('<p>First part.</p><p>Second part.</p>');
    expect(variant.triggers[0].inputInteractionIds).toEqual([start.id]);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'unsupported_statement',
        fileName: 'locations/sex_ev_pillow_talk2.qsrc',
        locationName: 'sex_ev_pillow_talk2',
        line: 8,
      }),
    );
    expect(result.report.issues).not.toContainEqual(
      expect.objectContaining({ code: 'duplicate_location_argument_variant' }),
    );
  });

  it('serializes qsrc collections for the HTTP import boundary', () => {
    const files = [{ name: 'locations/start.qsrc', content: '# start\n--- start ---' }];
    expect(parseQspLocationBundle(serializeQspLocationBundle(files))).toEqual(files);
  });

  it('bounds detailed warnings without losing large-import occurrence counts', () => {
    const statements = Array.from({ length: 2_050 }, (_, index) => `unknown_${index}`).join('\n');
    const result = importSource({
      name: 'large-report.qsps',
      format: 'text',
      content: `# Start\n${statements}\n--- Start ---`,
    });

    expect(result.story).toBeDefined();
    expect(result.report.unsupportedStatementCount).toBe(2_050);
    expect(result.report.issues).toHaveLength(2_000);
    expect(result.report.omittedWarningCount).toBe(50);
  });

  it('maps text locations, static actions, text output, and navigation', () => {
    const result = importSource({
      name: 'lighthouse.qsps',
      format: 'text',
      content: `# Start
*pl 'You reach the lighthouse.'
act 'Open the door':
  *pl 'The lock gives way.'
  goto 'Ending'
end
--- Start ---

# Ending
'The hall is dark.'
--- Ending ---`,
    });

    expect(result.report.issues).toEqual([
      expect.objectContaining({ code: 'automatic_navigation_requires_choice' }),
    ]);
    expect(result.report).toMatchObject({
      format: 'qsp',
      locationCount: 2,
      actionCount: 1,
      interactionCount: 3,
    });
    expect(result.story).toMatchObject({
      id: 'story-qsp',
      title: 'lighthouse',
      revision: 1,
      access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    });
    const [start, action, ending] = result.story!.interactions;
    expect(start).toMatchObject({ title: 'Start', body: '<p>You reach the lighthouse.</p>' });
    expect(action).toMatchObject({ title: 'Open the door', body: '<p>The lock gives way.</p>' });
    expect(action.triggers[0].inputInteractionIds).toEqual([start.id]);
    expect(ending.triggers[0].inputInteractionIds).toEqual([action.id]);
    expect(result.report.coverage).toContainEqual({
      feature: 'navigation',
      support: 'partial',
      occurrences: 1,
    });
  });

  it('reads compiled QSP games through the official converter', () => {
    const content = writeQsp([
      {
        name: 'Start',
        description: ['Compiled description'],
        code: [],
        actions: [{ name: 'Continue', code: ["goto 'End'"] }],
      },
      { name: 'End', description: ['Finished'], code: [], actions: [] },
    ]);
    const result = importSource({ name: 'compiled.qsp', format: 'binary', content });

    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'Start',
      'Continue',
      'End',
    ]);
    expect(result.report.issues).toEqual([
      expect.objectContaining({ code: 'automatic_navigation_requires_choice' }),
    ]);
  });

  it('reports interpolated navigation targets without rejecting the import', () => {
    const content = writeQsp([
      {
        name: 'sex_ev_sex',
        description: [],
        code: ["gt 'sex_ev_<<$sex_ev[''position'']>>', $sex_ev['pos_speed']"],
        actions: [],
      },
      { name: 'sex_ev_missionary', description: [], code: [], actions: [] },
    ]);
    const result = importSource({ name: 'dynamic-navigation.qsp', format: 'binary', content });

    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'sex_ev_sex',
      'sex_ev_missionary',
    ]);
    expect(result.story?.interactions[1].triggers[0].inputInteractionIds).toEqual([]);
    expect(result.report.unsupportedStatementCount).toBe(1);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'dynamic_navigation_target',
          locationName: 'sex_ev_sex',
          line: 1,
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'unreachable_location_imported_as_root',
          locationName: 'sex_ev_missionary',
        }),
      ]),
    );
    expect(result.report.issues).not.toContainEqual(
      expect.objectContaining({ code: 'missing_location_target' }),
    );
  });

  it('keeps a static navigation target when only its arguments are dynamic', () => {
    const result = importSource({
      name: 'dynamic-argument.qsps',
      format: 'text',
      content: `# Start
gt 'End', $variant
--- Start ---
# End
--- End ---`,
    });

    expect(result.story?.interactions[1].triggers[0].inputInteractionIds).toEqual([
      result.story?.interactions[0].id,
    ]);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'navigation_arguments_ignored' })]),
    );
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'dynamic_navigation_target' })]),
    );
  });

  it('reports unsupported runtime features and keeps the surrounding graph inspectable', () => {
    const result = importSource({
      name: 'runtime.qsps',
      format: 'text',
      content: `# Start
score = 10
if score > 5:
  gosub 'Service'
end
act 'Continue': goto 'End'
--- Start ---
# Service
dynamic code
--- Service ---
# End
*pl '<unsafe>'
--- End ---`,
    });

    expect(result.story).toBeDefined();
    expect(result.story?.interactions.at(-1)?.body).toBe('<p>&lt;unsafe&gt;</p>');
    expect(result.report.unsupportedStatementCount).toBeGreaterThanOrEqual(3);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_condition', locationName: 'Start' }),
        expect.objectContaining({ code: 'unsupported_subroutine', locationName: 'Start' }),
        expect.objectContaining({ code: 'unsupported_dynamic_code', locationName: 'Service' }),
        expect.objectContaining({ code: 'unreachable_location_imported_as_root' }),
      ]),
    );
  });

  it('maps literal assignments and simple AND/OR action conditions to Story stats', () => {
    const result = importSource({
      name: 'state.qsps',
      format: 'text',
      content: `# Start
score = 10
set $rank = 'captain'
act 'Train':
  score += 2
  goto 'End'
end
if score >= 5 and $rank = 'captain' or no blocked:
  act 'Enter': goto 'End'
end
--- Start ---
# End
--- End ---`,
    });

    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'Start',
      'Train',
      'Enter',
      'End',
    ]);
    expect(result.story?.statDefinitions).toEqual([
      expect.objectContaining({ name: 'Score', valueType: 'number', category: 'QSP' }),
      expect.objectContaining({ name: 'Rank', valueType: 'string', category: 'QSP' }),
      expect.objectContaining({ name: 'Blocked', valueType: 'number', category: 'QSP' }),
    ]);
    const [score, rank, blocked] = result.story!.stats!;
    expect(result.story?.interactions[0].statEffects).toEqual([
      { statId: score.id, operation: 'set', value: 10 },
      { statId: rank.id, operation: 'set', value: 'captain' },
    ]);
    expect(result.story?.interactions[1].statEffects).toEqual([
      { statId: score.id, operation: 'add', value: 2 },
    ]);
    expect(getTriggerConditionGroups(result.story!.interactions[2].triggers[0])).toEqual([
      {
        id: expect.any(String),
        conditions: [
          { statId: score.id, operator: 'gte', value: 5 },
          { statId: rank.id, operator: 'eq', value: 'captain' },
        ],
      },
      {
        id: expect.any(String),
        conditions: [{ statId: blocked.id, operator: 'eq', value: 0 }],
      },
    ]);
    expect(result.report.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_variable_statement' }),
        expect.objectContaining({ code: 'unsupported_condition' }),
      ]),
    );
    expect(result.report.coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ feature: 'variables', support: 'partial' }),
        expect.objectContaining({ feature: 'conditions', support: 'partial' }),
      ]),
    );
  });

  it('flattens literal array cells and keeps ELSEIF and ELSE actions exclusive', () => {
    const result = importSource({
      name: 'branches.qsps',
      format: 'text',
      content: `# Start
$inventory = 'empty'
$inventory[0] = 'pack'
$inventory['weapon'] = 'sword'
points[2] = 10
if points[2] >= 8:
  act 'Excellent': goto 'End'
elseif points[2] >= 5:
  act 'Correct': goto 'End'
else:
  act 'Failure': goto 'End'
end
--- Start ---
# End
--- End ---`,
    });

    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'Start',
      'Excellent',
      'Correct',
      'Failure',
      'End',
    ]);
    expect(result.story?.statDefinitions).toEqual([
      expect.objectContaining({ name: 'Inventory', valueType: 'string', category: 'QSP' }),
      expect.objectContaining({
        name: 'Inventory [weapon]',
        valueType: 'string',
        category: 'QSP',
      }),
      expect.objectContaining({ name: 'Points [2]', valueType: 'number', category: 'QSP' }),
    ]);
    const [inventory, weapon, points] = result.story!.stats!;
    expect(result.story?.interactions[0].statEffects).toEqual([
      { statId: inventory.id, operation: 'set', value: 'pack' },
      { statId: weapon.id, operation: 'set', value: 'sword' },
      { statId: points.id, operation: 'set', value: 10 },
    ]);
    expect(getTriggerConditionGroups(result.story!.interactions[1].triggers[0])).toEqual([
      {
        id: expect.any(String),
        conditions: [{ statId: points.id, operator: 'gte', value: 8 }],
      },
    ]);
    expect(getTriggerConditionGroups(result.story!.interactions[2].triggers[0])).toEqual([
      {
        id: expect.any(String),
        conditions: [
          { statId: points.id, operator: 'lt', value: 8 },
          { statId: points.id, operator: 'gte', value: 5 },
        ],
      },
    ]);
    expect(getTriggerConditionGroups(result.story!.interactions[3].triggers[0])).toEqual([
      {
        id: expect.any(String),
        conditions: [
          { statId: points.id, operator: 'lt', value: 8 },
          { statId: points.id, operator: 'lt', value: 5 },
        ],
      },
    ]);
    expect(result.report.coverage).toContainEqual({
      feature: 'conditions',
      support: 'partial',
      occurrences: 2,
    });
  });

  it('keeps calculated assignments and conditional side effects in the gap report', () => {
    const result = importSource({
      name: 'calculated.qsps',
      format: 'text',
      content: `# Start
score = other + 1
$label = 'prefix' & 'suffix'
$inventory[index] = 'pack'
$inventory[] = 'last'
if score > 5:
  score += 2
end
--- Start ---`,
    });

    expect(result.story?.statDefinitions).toEqual([]);
    expect(result.report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_variable_statement', line: 2 }),
        expect.objectContaining({ code: 'unsupported_variable_statement', line: 3 }),
        expect.objectContaining({ code: 'unsupported_variable_statement', line: 4 }),
        expect.objectContaining({ code: 'unsupported_variable_statement', line: 5 }),
        expect.objectContaining({ code: 'unsupported_condition', line: 6 }),
        expect.objectContaining({ code: 'unsupported_variable_statement', line: 7 }),
      ]),
    );
  });

  it('rejects duplicate locations and unresolved static navigation', () => {
    const duplicate = importSource({
      name: 'duplicate.qsps',
      format: 'text',
      content: '# Start\n---\n# start\n---',
    });
    expect(duplicate.story).toBeUndefined();
    expect(duplicate.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'duplicate_location' }),
    );

    const unresolved = importSource({
      name: 'unresolved.qsps',
      format: 'text',
      content: "# Start\ngoto 'Missing'\n---",
    });
    expect(unresolved.story).toBeUndefined();
    expect(unresolved.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'missing_location_target' }),
    );
  });

  it('contains deterministically fuzzed malformed source without throwing or dangling graph ids', () => {
    const fragments = [
      "'Readable text'",
      "*pl '<script>alert(1)</script>'",
      "act 'Loop': gt 'fuzz'",
      "act 'Broken'",
      'if score > 1:',
      'elseif score = 2:',
      'else:',
      'end',
      "gt 'fuzz', <<$dynamic>>",
      "$items[0] = 'key'",
      'score += other',
      'loop while score < 3:',
      '! ignored comment',
      '\u0000 malformed byte',
    ];

    for (let seed = 1; seed <= 64; seed += 1) {
      let state = seed;
      const lines = Array.from({ length: 64 }, () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return fragments[state % fragments.length];
      });
      const result = importSource({
        name: `fuzz-${seed}.qsps`,
        format: 'text',
        content: `# fuzz\n${lines.join('\n')}\n--- fuzz ---`,
      });
      if (!result.story) continue;

      const interactionIds = new Set(result.story.interactions.map(({ id }) => id));
      expect(interactionIds.size).toBe(result.story.interactions.length);
      for (const interaction of result.story.interactions) {
        for (const trigger of interaction.triggers) {
          expect(trigger.inputInteractionIds.every((id) => interactionIds.has(id))).toBe(true);
          for (const group of getTriggerConditionGroups(trigger)) {
            for (const condition of group.conditions) {
              if ('interactionId' in condition) {
                expect(interactionIds.has(condition.interactionId)).toBe(true);
              }
            }
          }
        }
      }
    }
  });

  it('handles deeply nested incomplete control blocks as a compatibility error', () => {
    const depth = 2_000;
    const source = `# deep\n${'if score = 1:\n'.repeat(depth)}'text'\n${'end\n'.repeat(
      depth - 1,
    )}--- deep ---`;

    expect(() =>
      importSource({ name: 'deep.qsps', format: 'text', content: source }),
    ).not.toThrow();
  });
});

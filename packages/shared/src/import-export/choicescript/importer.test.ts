import { describe, expect, it } from 'vitest';
import { getTriggerConditions } from '../../triggers/index.js';
import { importChoiceScript } from './importer.js';

function importFiles(files: Array<{ name: string; content: string }>) {
  let id = 0;
  return importChoiceScript(files, {
    storyId: 'story-imported',
    timestamp: '2026-08-22T10:00:00.000Z',
    createId: () => `generated-${++id}`,
  });
}

describe('ChoiceScript importer', () => {
  it('maps prose, choices, labels and jumps to interactions and triggers', () => {
    const result = importFiles([
      {
        name: 'startup.txt',
        content: `*title The Lighthouse
You reach the lighthouse before the storm.

*choice
  #Open the door
    The lock gives way.
    *goto inside
  #Wait outside
    The rain gets heavier.
    *goto inside

*label inside
The hall is dark.
*ending`,
      },
    ]);

    expect(result.report.issues).toEqual([]);
    expect(result.story).toMatchObject({
      id: 'story-imported',
      title: 'The Lighthouse',
      revision: 1,
      access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    });
    expect(result.story?.interactions).toHaveLength(4);
    const [opening, openDoor, waitOutside, inside] = result.story!.interactions;
    expect(opening.body).toContain('You reach the lighthouse');
    expect(openDoor).toMatchObject({ title: 'Open the door' });
    expect(waitOutside).toMatchObject({ title: 'Wait outside' });
    expect(openDoor.triggers[0].inputInteractionIds).toEqual([opening.id]);
    expect(waitOutside.triggers[0].inputInteractionIds).toEqual([opening.id]);
    expect(inside.triggers[0].inputInteractionIds).toEqual([openDoor.id, waitOutside.id]);
  });

  it('uses scene_list order for finish and converts cross-scene jumps', () => {
    const result = importFiles([
      {
        name: 'ending.txt',
        content: `The end.
*finish`,
      },
      {
        name: 'choicescript_stats.txt',
        content: `*stat_chart
  percent courage`,
      },
      {
        name: 'startup.txt',
        content: `*title Ordered story
*scene_list
  startup
  chapter
  ending

Welcome.
*finish`,
      },
      {
        name: 'chapter.txt',
        content: `Chapter one.
*goto_scene ending`,
      },
    ]);

    expect(result.story?.interactions.map(({ title }) => title)).toEqual([
      'Startup',
      'Chapter',
      'Ending',
    ]);
    const [startup, chapter, ending] = result.story!.interactions;
    expect(chapter.triggers[0].inputInteractionIds).toEqual([startup.id]);
    expect(ending.triggers[0].inputInteractionIds).toEqual([chapter.id]);
  });

  it('maps typed variables, assignments, interpolation, and simple conditional options', () => {
    const result = importFiles([
      {
        name: 'startup.txt',
        content: `*title Approximate story
*create courage 50
Choose with ${'${courage}'} courage.
*choice
  *if (courage > 40) #Be brave
    *set courage +10
    Continue.
    *ending`,
      },
    ]);

    expect(result.story).toBeDefined();
    expect(result.report.approximatedCommandCount).toBe(0);
    expect(result.report.issues).toEqual([]);
    expect(result.story?.statDefinitions).toEqual([
      expect.objectContaining({ name: 'Courage', valueType: 'number' }),
    ]);
    expect(result.story?.statDefinitions?.[0]).not.toHaveProperty('key');
    const assignment = result.story!.stats![0];
    const [opening, choice] = result.story!.interactions;
    expect(opening.body).toContain(`data-stat-value="${assignment.id}"`);
    expect(getTriggerConditions(choice.triggers[0])).toEqual([
      { statId: assignment.id, operator: 'gt', value: 40 },
    ]);
    expect(choice.statEffects).toEqual([{ statId: assignment.id, operation: 'add', value: 10 }]);
  });

  it('imports temp variables as scene-namespaced assignments reset by an interaction effect', () => {
    const result = importFiles([
      {
        name: 'startup.txt',
        content: `*temp clue false
The clue is ${'${clue}'}.
*set clue true
*ending`,
      },
    ]);

    const definition = result.story?.statDefinitions?.[0];
    const assignment = result.story?.stats?.[0];
    expect(definition).toMatchObject({
      name: 'Clue (Startup)',
      valueType: 'boolean',
    });
    expect(definition).not.toHaveProperty('key');
    expect(result.story?.interactions[0].statEffects).toEqual([
      { statId: assignment?.id, operation: 'set', value: false },
      { statId: assignment?.id, operation: 'set', value: true },
    ]);
  });

  it('rejects an incomplete scene list and a missing label target', () => {
    const missingScene = importFiles([
      {
        name: 'startup.txt',
        content: `*scene_list
  absent

Start.
*finish`,
      },
    ]);
    expect(missingScene.story).toBeUndefined();
    expect(missingScene.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'missing_scene_file' }),
    );

    const missingLabel = importFiles([
      {
        name: 'startup.txt',
        content: `Start.
*goto nowhere`,
      },
    ]);
    expect(missingLabel.story).toBeUndefined();
    expect(missingLabel.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'missing_jump_target' }),
    );
  });

  it('rejects duplicate variable declarations before constructing interactions', () => {
    const result = importFiles([
      {
        name: 'startup.txt',
        content: `*create courage 10
*create courage 20
Start.
*ending`,
      },
    ]);

    expect(result.story).toBeUndefined();
    expect(result.report.interactionCount).toBe(0);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'duplicate_variable_declaration' }),
    );
  });

  it('escapes imported prose before storing it as rich text', () => {
    const result = importFiles([
      {
        name: 'startup.txt',
        content: `A <script>alert("x")</script> & a safe ending.
*ending`,
      },
    ]);

    expect(result.story?.interactions[0].body).toBe(
      '<p>A &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; a safe ending.</p>',
    );
  });
});

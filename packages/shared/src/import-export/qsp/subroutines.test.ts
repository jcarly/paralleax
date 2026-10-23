import { describe, expect, it } from 'vitest';
import type { Story } from '../../model/stories.js';
import { getJourneyStatValues } from '../../reader/index.js';
import { getAvailableInteractions, getTriggerConditionGroups } from '../../triggers/index.js';
import { importQsp } from './importer.js';

function fixture(locations: Record<string, string>) {
  let id = 0;
  return importQsp(
    {
      name: 'subroutines',
      format: 'locations',
      content: Object.entries(locations).map(([name, code]) => ({
        name: `${name}.qsrc`,
        content: `# ${name}\n${code}\n--- ${name} ---`,
      })),
    },
    { storyId: 'qsp', timestamp: '2026-10-20T10:00:00.000Z', createId: () => `id-${++id}` },
  );
}

function reader(story: Story) {
  const journey: string[] = [];
  const values = () => getJourneyStatValues(story, journey);
  const available = () =>
    getAvailableInteractions(story, journey.at(-1) ?? null, journey, null, [], values());
  const select = (title: string) => {
    const node = available().find((node) => node.title === title);
    expect(
      node,
      `Expected ${title}; available: ${available()
        .map((node) => node.title)
        .join(', ')}`,
    ).toBeDefined();
    journey.push(node!.id);
    return node!;
  };
  const value = (name: string) => {
    const definition = story.statDefinitions!.find((stat) => stat.name === name)!;
    return values()[story.stats!.find((stat) => stat.statDefinitionId === definition.id)!.id];
  };
  return { journey, available, select, value, values };
}

function assertCanonical(story: Story) {
  const ids = new Set(story.interactions.map((node) => node.id));
  const assignments = new Set(story.stats?.map((stat) => stat.id));
  for (const node of story.interactions) {
    expect(node.triggers.length).toBeGreaterThan(0);
    expect(node.position).toBeDefined();
    expect(new Set(node.statEffects?.map((effect) => effect.statId)).size).toBe(
      node.statEffects?.length ?? 0,
    );
    for (const effect of node.statEffects ?? []) expect(assignments.has(effect.statId)).toBe(true);
    for (const trigger of node.triggers) {
      for (const input of trigger.inputInteractionIds) expect(ids.has(input)).toBe(true);
      for (const group of getTriggerConditionGroups(trigger)) {
        for (const condition of group.conditions) {
          if ('statId' in condition) expect(assignments.has(condition.statId)).toBe(true);
        }
      }
    }
  }
}

describe('QSP shared subroutine paths', () => {
  it('splits one caller around the shared content and preserves effect ordering', () => {
    const result = fixture({
      start: "score = 1\n'Before'\ngs 'utils'\n'After'\nscore += 10",
      utils: "'Utility'\nscore += 2",
    });
    expect(result.report.errorCount).toBe(0);
    const story = result.story!;
    assertCanonical(story);
    expect(story.interactions.map((node) => node.title)).toEqual([
      'start',
      'start — Continue',
      'utils',
    ]);
    expect(story.interactions[0].body).toBe('<p>Before</p>');
    expect(story.interactions[1].body).toBe('<p>After</p>');
    expect(story.statDefinitions).toContainEqual(
      expect.objectContaining({ name: '__qsp_return_utils', valueType: 'string' }),
    );
    const run = reader(story);
    run.select('start');
    expect(run.value('Score')).toBe(1);
    expect(run.available().map((node) => node.title)).toEqual(['utils']);
    run.select('utils');
    expect(run.value('Score')).toBe(3);
    expect(run.available().map((node) => node.title)).toEqual(['start — Continue']);
    run.select('start — Continue');
    expect(run.value('Score')).toBe(13);
    expect(run.value('__qsp_return_utils')).toBe('');
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'subroutine_requires_traversal',
        fileName: 'start.qsrc',
        locationName: 'start',
        line: 4,
        lineKind: 'text',
      }),
    );
    expect(result.report.coverage).toContainEqual({
      feature: 'subroutines',
      support: 'partial',
      occurrences: 1,
    });
  });

  it('shares one subroutine between action callers without affecting another option', () => {
    const story = fixture({
      start:
        "act 'Call A':\n gs 'utils'\n score += 10\nend\nact 'Call B':\n gosub 'UTILS'\n score += 20\nend\nact 'Leave': gt 'elsewhere'",
      utils: 'score += 1',
      elsewhere: '',
    }).story!;
    expect(story.interactions.filter((node) => node.title === 'utils')).toHaveLength(1);
    const start = story.interactions[0];
    expect(start.statEffects).toBeUndefined();
    for (const [caller, expected] of [
      ['Call A', 11],
      ['Call B', 21],
    ] as const) {
      const run = reader(story);
      run.select('start');
      expect(run.value('__qsp_return_utils')).toBe('');
      run.select(caller);
      run.select('utils');
      expect(run.available().map((node) => node.title)).toEqual([`${caller} — Continue`]);
      run.select(`${caller} — Continue`);
      expect(run.value('Score')).toBe(expected);
    }
    const run = reader(story);
    run.select('start');
    run.select('Leave');
    expect(run.value('__qsp_return_utils')).toBe('');
    expect(run.available().map((node) => node.title)).toEqual(['elsewhere']);
    assertCanonical(story);
  });

  it('overwrites return values on sequential calls and repeated visits', () => {
    const story = fixture({
      start: "gs 'utils'\nscore += 10\ngosub 'utils'\nscore += 100\nact 'Repeat': gt 'start'",
      utils: 'score += 1',
    }).story!;
    const run = reader(story);
    for (let visit = 0; visit < 2; visit += 1) {
      run.select('start');
      const firstReturn = run.value('__qsp_return_utils');
      run.select('utils');
      expect(run.available().map((node) => node.title)).toEqual(['start — Continue']);
      run.select('start — Continue');
      expect(run.value('__qsp_return_utils')).not.toBe(firstReturn);
      run.select('utils');
      expect(run.available().map((node) => node.title)).toEqual(['start — Continue 2']);
      run.select('start — Continue 2');
      expect(run.value('Score')).toBe(112 * (visit + 1));
      expect(run.value('__qsp_return_utils')).toBe('');
      run.select('Repeat');
    }
    expect(story.interactions.filter((node) => node.title === 'utils')).toHaveLength(1);
    expect(fixture({ start: "gs 'utils'\ngs 'utils'", utils: '' }).story?.interactions).toEqual(
      fixture({ start: "gs 'utils'\ngs 'utils'", utils: '' }).story?.interactions,
    );
    assertCanonical(story);
  });

  it('preserves independent returns through nested non-recursive subroutines', () => {
    const story = fixture({
      start: "score = 1\ngs 'outer'\nscore += 1000",
      outer: "score += 10\ngs 'inner'\nscore += 100",
      inner: 'score += 2',
    }).story!;
    const run = reader(story);
    run.select('start');
    run.select('outer');
    const outerReturn = run.value('__qsp_return_outer');
    run.select('inner');
    expect(run.available().map((node) => node.title)).toEqual(['outer — Continue']);
    run.select('outer — Continue');
    expect(run.value('__qsp_return_outer')).toBe(outerReturn);
    expect(run.value('__qsp_return_inner')).toBe('');
    expect(run.available().map((node) => node.title)).toEqual(['start — Continue']);
    run.select('start — Continue');
    expect(run.value('Score')).toBe(1113);
  });

  it.each([
    { start: "gs 'loop'", loop: "gs 'loop'" },
    { start: "gs 'a'", a: "gs 'b'", b: "gosub 'a'" },
    { start: "gs 'a'", a: "act 'Again': gs 'a'" },
  ])('reports recursive call cycles without expanding or exposing returns: %o', (locations) => {
    const result = fixture(locations);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'recursive_subroutine_call' }),
    );
    expect(result.story!.interactions.length).toBeLessThanOrEqual(4);
    const run = reader(result.story!);
    run.select('start');
    expect(run.available()).toEqual([]);
    expect(
      result.story!.statDefinitions?.some((stat) => stat.name.startsWith('__qsp_return_')),
    ).toBe(false);
    assertCanonical(result.story!);
  });

  it.each([
    ['gs $destination', 'dynamic_subroutine_target'],
    ["gs 'room_<<$state>>'", 'dynamic_subroutine_target'],
    ["gs 'missing'", 'missing_subroutine_target'],
    ["gs 'utils', score", 'unsupported_subroutine_arguments'],
    ["gs 'utils', 'value', 2", 'unsupported_subroutine_arguments'],
  ])('stops unresolved calls instead of inventing a destination: %s', (call, code) => {
    const result = fixture({ start: `${call}\nscore = 999\n'After'`, utils: '' });
    expect(result.report.errorCount).toBe(0);
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code, line: 2, locationName: 'start' }),
    );
    const run = reader(result.story!);
    const node = run.select('start');
    expect(run.available()).toEqual([]);
    expect(run.value('Score')).toBe(0);
    expect(node.body).not.toContain('After');
  });

  it.each(["if flag:\n gs 'utils'\nend", "if flag: gs 'utils' & gt 'elsewhere'"])(
    'does not promote unsupported conditional calls to unconditional choices: %s',
    (code) => {
      const result = fixture({ start: code, utils: '', elsewhere: '' });
      expect(result.report.issues).toContainEqual(
        expect.objectContaining({ code: 'unsupported_subroutine' }),
      );
      const run = reader(result.story!);
      run.select('start');
      expect(run.available()).toEqual([]);
    },
  );

  it('retains multiple action exits, early EXIT, and non-returning navigation', () => {
    const story = fixture({
      start: "gs 'utils'\nscore += 100",
      utils:
        "score += 1\nact 'Finish':\n score += 10\n exit\n score = 999\nend\nact 'Escape': gt 'elsewhere'",
      elsewhere: "act 'Visit normally': gt 'utils'",
    }).story!;
    const run = reader(story);
    run.select('start');
    run.select('utils');
    expect(run.available().map((node) => node.title)).toEqual([
      'start — Continue',
      'Finish',
      'Escape',
    ]);
    run.select('Finish');
    expect(run.value('Score')).toBe(11);
    expect(run.available().map((node) => node.title)).toEqual(['start — Continue']);
    run.select('start — Continue');
    expect(run.value('Score')).toBe(111);
    const escape = reader(story);
    escape.select('start');
    escape.select('utils');
    escape.select('Escape');
    expect(escape.available().map((node) => node.title)).toEqual(['elsewhere']);
    expect(escape.value('__qsp_return_utils')).toBe('');
    escape.select('elsewhere');
    escape.select('Visit normally');
    escape.select('utils');
    expect(escape.available().map((node) => node.title)).not.toContain('start — Continue');
    assertCanonical(story);
  });

  it('abandons all pending nested returns when a subroutine navigates away', () => {
    const story = fixture({
      start: "gs 'outer'",
      outer: "gs 'inner'",
      inner: "gt 'away'",
      away: '',
    }).story!;
    const run = reader(story);
    run.select('start');
    run.select('outer');
    run.select('inner');
    expect(run.value('__qsp_return_outer')).toBe('');
    expect(run.value('__qsp_return_inner')).toBe('');
    expect(run.available().map((node) => node.title)).toEqual(['away']);
    expect(
      reader(story)
        .available()
        .map((node) => node.title),
    ).not.toContain('start — Continue');
  });

  it('returns at a top-level EXIT and omits unreachable text and effects', () => {
    const story = fixture({
      start: "gs 'utils'",
      utils: "score = 5\nexit\nscore = 999\n'Unreachable'",
    }).story!;
    const run = reader(story);
    run.select('start');
    const node = run.select('utils');
    expect(run.value('Score')).toBe(5);
    expect(node.body).not.toContain('Unreachable');
    expect(run.available().map((node) => node.title)).toEqual(['start — Continue']);
  });

  it('uses safe literal ARGS[0] variants without falling back to the base', () => {
    const result = fixture({
      start: "gs 'utils', 'buy'\nscore += 100",
      utils: "if $ARGS[0] = 'buy':\n score += 2\nend",
    });
    const run = reader(result.story!);
    run.select('start');
    run.select('utils · buy');
    expect(run.value('Score')).toBe(2);
    run.select('start — Continue');
    expect(run.value('Score')).toBe(102);
    const unsafe = fixture({
      start: "gs 'utils', 'buy'",
      utils: "score += 1\nif $ARGS[0] = 'buy':\n score += 2\nend",
    });
    expect(unsafe.report.issues).toContainEqual(
      expect.objectContaining({ code: 'unsupported_subroutine_argument_scope' }),
    );
    const missing = fixture({ start: "gs 'utils', 'missing'", utils: '' });
    const blocked = reader(missing.story!);
    blocked.select('start');
    expect(blocked.available()).toEqual([]);
  });

  it('avoids source-variable and normalized location-name collisions', () => {
    const result = fixture({
      start: "$__qsp_return_utils = 'source'\ngs 'utils'\ngs 'a-b'\ngs 'a_b'",
      utils: '',
      'a-b': '',
      a_b: '',
    });
    const story = result.story!;
    const generated = story.statDefinitions!.filter((stat) =>
      stat.name.startsWith('__qsp_return_'),
    );
    expect(generated.map((stat) => stat.name)).toEqual([
      '__qsp_return_utils_1',
      '__qsp_return_a_b',
      '__qsp_return_a_b_1',
    ]);
    expect(new Set(generated.map((stat) => stat.id)).size).toBe(3);
    assertCanonical(story);
  });

  it('retains precise physical lines after extracted actions and within ACT bodies', () => {
    const result = fixture({
      start: "act 'One':\n 'text'\nend\nact 'Call':\n gs 'missing'\nend\ngs 'missing'",
    });
    expect(
      result.report.issues
        .filter((issue) => issue.code === 'missing_subroutine_target')
        .map((issue) => issue.line)
        .sort((a, b) => a! - b!),
    ).toEqual([6, 8]);
  });

  it('keeps no-call imports on their existing mapping', () => {
    const result = fixture({ start: "score = 1\n'Hello'\nact 'Go': gt 'end'", end: "'Done'" });
    expect(result.story!.interactions.map((node) => node.title)).toEqual(['start', 'Go', 'end']);
    const run = reader(result.story!);
    run.select('start');
    run.select('Go');
    run.select('end');
    expect(run.value('Score')).toBe(1);
    expect(result.story!.statDefinitions).toHaveLength(1);
  });

  it('splits command-separated assignments, calls, and their continuation in order', () => {
    const story = fixture({
      start: "score = 1 & gs 'utils' & score += 10",
      utils: 'score += 2',
    }).story!;
    const run = reader(story);
    run.select('start');
    expect(run.value('Score')).toBe(1);
    run.select('utils');
    expect(run.value('Score')).toBe(3);
    run.select('start — Continue');
    expect(run.value('Score')).toBe(13);
  });

  it('keeps concatenation after a call unsupported instead of assigning a literal prefix', () => {
    const result = fixture({ start: "gs 'utils' & $name = 'a' & 'b'", utils: '' });
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({ code: 'unsupported_variable_statement' }),
    );
    const run = reader(result.story!);
    run.select('start');
    run.select('utils');
    const continuation = run.select('start — Continue');
    expect(continuation.statEffects).toHaveLength(1); // Only clears the return stat.
    expect(continuation.body).toBe('');
    expect(result.story!.statDefinitions?.some((stat) => stat.name === 'Name')).toBe(false);
  });

  it('keeps conditional action eligibility on the call site', () => {
    const story = fixture({
      start:
        "score = 1\nif score = 1:\n act 'Call': gs 'utils'\nelse\n act 'Other': gs 'utils'\nend",
      utils: 'score += 1',
    }).story!;
    const run = reader(story);
    run.select('start');
    expect(run.available().map((node) => node.title)).toEqual(['Call']);
    run.select('Call');
    run.select('utils');
    expect(run.available().map((node) => node.title)).toEqual(['Call — Continue']);
    run.select('Call — Continue');
    expect(run.value('Score')).toBe(2);
  });

  it('stops at unsupported control flow inside a called routine without guessing its return', () => {
    const result = fixture({
      start: "gs 'utils'\nscore = 999",
      utils: "'Before'\nif score:\n exit\nend\n'After'",
    });
    const run = reader(result.story!);
    run.select('start');
    const node = run.select('utils');
    expect(run.available()).toEqual([]);
    expect(node.body).toBe('<p>Before</p>');
    expect(result.report.issues).toContainEqual(
      expect.objectContaining({
        code: 'subroutine_control_flow_stopped',
        line: 3,
        locationName: 'utils',
      }),
    );
  });

  it('does not expose actions declared after an early subroutine EXIT', () => {
    const story = fixture({
      start: "gs 'utils'",
      utils: "act 'Before': score += 1\nexit\nact 'After': score = 999",
    }).story!;
    const run = reader(story);
    run.select('start');
    run.select('utils');
    expect(run.available().map((node) => node.title)).toEqual(['start — Continue', 'Before']);
    expect(
      reader(story)
        .available()
        .map((node) => node.title),
    ).not.toContain('After');
  });

  it('finishes expanded mapping progress at its adjusted total and streams call diagnostics', () => {
    const progress: Array<{ completed: number; total?: number }> = [];
    const issues: string[] = [];
    let id = 0;
    const result = importQsp(
      {
        name: 'calls.qsps',
        format: 'text',
        content: "# start\ngs 'utils'\ngs 'utils'\n--- start ---\n# utils\n--- utils ---",
      },
      {
        storyId: 'qsp',
        timestamp: '2026-10-20T10:00:00.000Z',
        createId: () => `id-${++id}`,
        maxPreviewIssues: 0,
        onIssue: (issue) => issues.push(issue.code),
        onProgress: (event) => {
          if (event.phase === 'mapping') progress.push(event);
        },
      },
    );
    expect(result.report.issues).toEqual([]);
    expect(issues.filter((code) => code === 'subroutine_requires_traversal')).toHaveLength(2);
    expect(progress.at(-1)?.completed).toBe(progress.at(-1)?.total);
    expect(progress.every((event) => event.completed <= event.total!)).toBe(true);
  });

  it('shares a normal return interaction when many callers and exits would multiply links', () => {
    const story = fixture({
      start: "act 'A': gs 'utils'\nact 'B': gs 'utils'\nact 'C': gs 'utils'",
      utils: "act 'Exit 1': score += 1\nact 'Exit 2': score += 2\nact 'Exit 3': score += 3",
    }).story!;
    for (const caller of ['A', 'B', 'C']) {
      const run = reader(story);
      run.select('start');
      run.select(caller);
      run.select('utils');
      run.select('Exit 2');
      run.select('utils — Return');
      expect(run.available().map((node) => node.title)).toEqual([`${caller} — Continue`]);
      run.select(`${caller} — Continue`);
      expect(run.value('Score')).toBe(2);
    }
    expect(story.interactions.filter((node) => node.title === 'utils — Return')).toHaveLength(1);
    const links = story.interactions.flatMap((node) =>
      node.triggers.flatMap((trigger) => trigger.inputInteractionIds),
    );
    expect(links).toHaveLength(16);
    assertCanonical(story);
  });
});

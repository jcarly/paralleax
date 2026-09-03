import { describe, expect, it } from 'vitest';
import {
  andQspConditionGroups,
  negateQspConditionGroups,
  parseQspAssignment,
  parseQspConditionExpression,
} from './expressions.js';

const source = { fileName: 'state.qsps', locationName: 'Start', line: 4 };

describe('QSP simple expressions', () => {
  it('normalizes parenthesized NO, AND, and OR expressions to condition groups', () => {
    expect(
      parseQspConditionExpression("no (score < 5 or $rank <> 'captain') and ready", source),
    ).toEqual([
      [
        { variableName: 'score', operator: 'gte', value: 5, source },
        { variableName: '$rank', operator: 'eq', value: 'captain', source },
        { variableName: 'ready', operator: 'neq', value: 0, source },
      ],
    ]);
    expect(
      parseQspConditionExpression('(a = 1 or b = 2) and (c = 3 or d = 4)', source),
    ).toHaveLength(4);
  });

  it('combines prior branch failures with later alternatives', () => {
    const first = parseQspConditionExpression('a = 1 and b = 2', source)!;
    const second = parseQspConditionExpression('c = 3 or d = 4', source)!;
    const laterBranch = andQspConditionGroups(negateQspConditionGroups(first)!, second);
    const elseBranch = andQspConditionGroups(
      negateQspConditionGroups(first)!,
      negateQspConditionGroups(second)!,
    );

    expect(laterBranch).toHaveLength(4);
    expect(laterBranch).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({ variableName: 'a', operator: 'neq', value: 1 }),
          expect.objectContaining({ variableName: 'c', operator: 'eq', value: 3 }),
        ],
        [
          expect.objectContaining({ variableName: 'b', operator: 'neq', value: 2 }),
          expect.objectContaining({ variableName: 'd', operator: 'eq', value: 4 }),
        ],
      ]),
    );
    expect(elseBranch).toEqual([
      [
        expect.objectContaining({ variableName: 'a', operator: 'neq', value: 1 }),
        expect.objectContaining({ variableName: 'c', operator: 'neq', value: 3 }),
        expect.objectContaining({ variableName: 'd', operator: 'neq', value: 4 }),
      ],
      [
        expect.objectContaining({ variableName: 'b', operator: 'neq', value: 2 }),
        expect.objectContaining({ variableName: 'c', operator: 'neq', value: 3 }),
        expect.objectContaining({ variableName: 'd', operator: 'neq', value: 4 }),
      ],
    ]);
  });

  it('parses literal assignments and rejects calculated or ill-typed values', () => {
    expect(parseQspAssignment('SET score = 10', source)).toEqual({
      kind: 'parsed',
      effect: { variableName: 'score', operation: 'set', value: 10, source },
    });
    expect(parseQspAssignment('$name = "Alice"', source)).toEqual({
      kind: 'parsed',
      effect: { variableName: '$name', operation: 'set', value: 'Alice', source },
    });
    expect(parseQspAssignment('score -= 3', source)).toEqual({
      kind: 'parsed',
      effect: { variableName: 'score', operation: 'add', value: -3, source },
    });
    expect(parseQspAssignment("$inventory['weapon'] = 'sword'", source)).toEqual({
      kind: 'parsed',
      effect: {
        variableName: '$inventory["weapon"]',
        operation: 'set',
        value: 'sword',
        source,
      },
    });
    expect(parseQspAssignment('$inventory[0] = "pack"', source)).toEqual({
      kind: 'parsed',
      effect: { variableName: '$inventory', operation: 'set', value: 'pack', source },
    });
    expect(parseQspConditionExpression("$inventory['weapon'] = 'sword'", source)).toEqual([
      [
        {
          variableName: '$inventory["weapon"]',
          operator: 'eq',
          value: 'sword',
          source,
        },
      ],
    ]);
    expect(parseQspAssignment('score = other + 1', source)).toEqual(
      expect.objectContaining({ kind: 'unsupported' }),
    );
    expect(parseQspAssignment('$name = 2', source)).toEqual(
      expect.objectContaining({ kind: 'unsupported' }),
    );
    expect(parseQspAssignment('$inventory[index] = "pack"', source)).toEqual(
      expect.objectContaining({ kind: 'unsupported' }),
    );
    expect(parseQspAssignment('$inventory[] = "pack"', source)).toEqual(
      expect.objectContaining({ kind: 'unsupported' }),
    );
    expect(parseQspAssignment('%tuple[1] = [2, 3]', source)).toEqual(
      expect.objectContaining({ kind: 'unsupported' }),
    );
  });
});

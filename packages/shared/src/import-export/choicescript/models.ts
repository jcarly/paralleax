import type { StatEffect, StatValue, StatValueType } from '../../model/stats.js';
import type { StatComparisonOperator } from '../../triggers/conditions.js';

export interface SourceLine {
  fileName: string;
  sceneName: string;
  number: number;
  indent: number;
  text: string;
}

export type Statement =
  | { kind: 'text'; lines: string[]; source: SourceLine }
  | { kind: 'label'; name: string; source: SourceLine }
  | { kind: 'goto'; label: string; source: SourceLine }
  | { kind: 'gotoScene'; scene: string; label?: string; source: SourceLine }
  | { kind: 'finish'; source: SourceLine }
  | { kind: 'ending'; source: SourceLine }
  | {
      kind: 'declare';
      name: string;
      value: StatValue;
      temporary: boolean;
      source: SourceLine;
    }
  | {
      kind: 'set';
      name: string;
      operation: StatEffect['operation'];
      value: StatValue;
      source: SourceLine;
    }
  | { kind: 'choice'; fake: boolean; options: ChoiceOption[]; source: SourceLine };

export interface ChoiceOption {
  title: string;
  statements: Statement[];
  condition?: SourceCondition;
  source: SourceLine;
}

export interface SourceCondition {
  name: string;
  operator: StatComparisonOperator;
  value: StatValue;
  source: SourceLine;
}

export interface VariableDeclaration {
  sourceKey: string;
  name: string;
  sceneName?: string;
  value: StatValue;
  valueType: StatValueType;
  temporary: boolean;
  source: SourceLine;
}

export interface SourceEffect {
  name: string;
  sceneName: string;
  operation: StatEffect['operation'];
  value: StatValue;
  source: SourceLine;
}

export interface ParsedScene {
  name: string;
  fileName: string;
  statements: Statement[];
  title?: string;
  sceneList: string[];
}

export interface DraftNode {
  key: string;
  title: string;
  body: string;
  sceneName: string;
  sourceLine: number;
  effects: SourceEffect[];
}

export interface DirectEdge {
  from: string;
  to: string;
  condition?: SourceCondition;
}

export interface DeferredEdge {
  from: string;
  anchor: string;
  source: SourceLine;
}

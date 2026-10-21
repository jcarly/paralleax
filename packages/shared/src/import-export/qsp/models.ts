export interface QspSourceAction {
  name: string;
  image?: string;
  code: string[];
}

export interface QspSourceLocation {
  name: string;
  description: string[];
  code: string[];
  actions: QspSourceAction[];
}

export interface QspSourcePosition {
  fileName: string;
  locationName: string;
  line: number;
  lineKind?: 'text' | 'location-code';
}

export interface ParsedQspAction {
  name: string;
  image?: string;
  code: string[];
  source: QspSourcePosition;
  conditionGroups?: QspSourceCondition[][];
}

export interface ParsedQspLocation extends Omit<QspSourceLocation, 'actions'> {
  source: QspSourcePosition;
  actions: ParsedQspAction[];
  entryArgument?: string;
}

export interface QspCodeAnalysis {
  text: string[];
  navigationTargets: QspNavigationTarget[];
  effects: QspVariableEffect[];
  statements: QspAnalyzedStatement[];
}

/** Import-only ordering; never stored as a script in the canonical Story. */
export type QspAnalyzedStatement =
  | { kind: 'text'; text: string }
  | { kind: 'effect'; effect: QspVariableEffect }
  | { kind: 'call'; target?: QspNavigationTarget; source: QspSourcePosition }
  | { kind: 'navigation'; target?: QspNavigationTarget }
  | { kind: 'exit'; source: QspSourcePosition }
  | { kind: 'barrier'; source: QspSourcePosition };

export interface AnalyzedQspLocation {
  location: ParsedQspLocation;
  analysis: QspCodeAnalysis;
  actions: Array<{ action: ParsedQspAction; analysis: QspCodeAnalysis }>;
}

export interface QspNavigationTarget {
  locationName: string;
  argument?: string;
  source: QspSourcePosition;
}

export interface QspVariableEffect {
  variableName: string;
  operation: 'add' | 'set';
  value: number | string;
  source: QspSourcePosition;
}

export interface QspSourceCondition {
  variableName: string;
  operator: import('../../triggers/conditions.js').StatComparisonOperator;
  value: number | string;
  source: QspSourcePosition;
}

export interface QspDraftNode {
  key: string;
  title: string;
  body: string;
  effects: QspVariableEffect[];
  conditionGroups?: QspSourceCondition[][];
}

export interface QspDraftEdge {
  from: string;
  to: string;
  conditionGroups?: QspSourceCondition[][];
}

export interface ParsedActBlock {
  action: QspSourceAction;
  sourceLine: number;
  endLine: number;
  conditionGroups?: QspSourceCondition[][];
}

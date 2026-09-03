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
}

export interface QspCodeAnalysis {
  text: string[];
  targetLocationNames: string[];
  effects: QspVariableEffect[];
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
}

export interface ParsedActBlock {
  action: QspSourceAction;
  sourceLine: number;
  endLine: number;
  conditionGroups?: QspSourceCondition[][];
}

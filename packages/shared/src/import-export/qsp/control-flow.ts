import { MAX_INTERACTION_BODY_LENGTH } from '../../model/interactions.js';
import { escapeImportedHtml, truncateImportedText } from '../source-utils.js';
import { qspVariableKey } from './expressions.js';
import type {
  AnalyzedQspLocation,
  QspAnalyzedStatement,
  QspCodeAnalysis,
  QspDraftEdge,
  QspDraftNode,
  QspNavigationTarget,
  QspSourceCondition,
  QspSourcePosition,
} from './models.js';
import { normalizeQspName } from './parser.js';
import { addQspSourceIssue } from './report.js';
import type { QspImportReport } from './types.js';

type Call = Extract<QspAnalyzedStatement, { kind: 'call' }>;
type Exit = Extract<QspAnalyzedStatement, { kind: 'exit' }>;
type AnalyzedAction = AnalyzedQspLocation['actions'][number]['action'];

type PendingReturn = {
  target: number;
  continuation: string;
  variable: string;
  value: string;
  source: QspSourcePosition;
};

type PendingNavigation = { from: string; target: QspNavigationTarget };

type BuildPathInput = {
  owner: number;
  key: string;
  title: string;
  analysis: QspCodeAnalysis;
  description: readonly string[];
  source: QspSourcePosition;
  conditionGroups?: QspSourceCondition[][];
};

type OrderedPathState = {
  owner: number;
  key: string;
  title: string;
  source: QspSourcePosition;
  node: QspDraftNode;
  text: string[];
  segment: number;
};

type OrderedStepResult =
  { kind: 'continue' } | { kind: 'stop' } | { kind: 'complete'; key: string };

type LocationMapping = {
  entry: AnalyzedQspLocation;
  owner: number;
  end: string | undefined;
  ordered: boolean;
  exit: Exit | undefined;
  normalExits: string[];
};

type ActionMapping = LocationMapping & {
  action: AnalyzedAction;
  actionAnalysis: QspCodeAnalysis;
  actionIndex: number;
};

/** Lowers ordered source into the existing draft graph, not a runtime call model. */
export function buildQspDraftGraph(
  locations: AnalyzedQspLocation[],
  report: QspImportReport,
  onMapped: (fileName: string) => void,
) {
  return new QspDraftGraphBuilder(locations, report, onMapped).build();
}

class QspDraftGraphBuilder {
  private readonly nodes: QspDraftNode[] = [];
  private readonly edges: QspDraftEdge[] = [];
  private readonly nodeFiles = new Map<string, string>();
  private readonly targets = new Map<string, number>();
  private readonly calls = new Map<Call, { owner: number; target: number }>();
  private readonly returnVariables = new Map<number, string>();
  private readonly ancestors: Set<number>[];
  private readonly activeVariableCache = new Map<number, string[]>();
  private readonly exits = new Map<number, string[]>();
  private readonly returns: PendingReturn[] = [];
  private readonly translatedCalls = new Set<Call>();
  private readonly pendingNavigation: PendingNavigation[] = [];
  private readonly reservedVariables = new Set<string>();

  constructor(
    private readonly locations: AnalyzedQspLocation[],
    private readonly report: QspImportReport,
    private readonly onMapped: (fileName: string) => void,
  ) {
    for (const [index, entry] of locations.entries()) {
      this.targets.set(targetKey(entry.location.name, entry.location.entryArgument), index);
    }
    this.ancestors = locations.map(() => new Set<number>());
  }

  build() {
    this.resolveCalls();
    this.removeRecursiveCalls();
    this.reserveSourceVariables();
    this.createReturnVariables();
    this.buildAncestorIndex();
    this.mapLocations();
    this.reportUntranslatedCalls();
    this.connectReturns();
    this.connectNavigations();

    return {
      nodes: this.nodes,
      edges: this.edges,
      nodeFiles: this.nodeFiles,
      returnVariables: new Set(this.returnVariables.values()),
    };
  }

  private resolveCalls() {
    for (const [owner, entry] of this.locations.entries()) {
      this.resolveEntryCalls(owner, entry);
    }
  }

  private resolveEntryCalls(owner: number, entry: AnalyzedQspLocation) {
    for (const analysis of analyses(entry)) {
      this.resolveAnalysisCalls(owner, analysis);
    }
  }

  private resolveAnalysisCalls(owner: number, analysis: QspCodeAnalysis) {
    for (const statement of analysis.statements) {
      if (statement.kind === 'call' && statement.target) {
        this.resolveCall(owner, statement);
      }
    }
  }

  private resolveCall(owner: number, statement: Call) {
    const navigationTarget = statement.target;
    if (!navigationTarget) {
      return;
    }
    const target = this.targets.get(
      targetKey(navigationTarget.locationName, navigationTarget.argument),
    );
    if (target === undefined) {
      this.unsupported(
        statement.source,
        'missing_subroutine_target',
        'No importable QSP subroutine or ARGS[0] variant matches "' +
          navigationTarget.locationName +
          '". The call path stops here.',
      );
      return;
    }

    const baseIndex = this.targets.get(targetKey(navigationTarget.locationName));
    if (navigationTarget.argument !== undefined && hasSharedBaseState(this.locations, baseIndex)) {
      this.unsupported(
        statement.source,
        'unsupported_subroutine_argument_scope',
        'This ARGS[0] call also requires shared base code or actions; it was not connected because argument scope cannot be preserved.',
      );
      return;
    }

    this.calls.set(statement, { owner, target });
  }

  private removeRecursiveCalls() {
    const adjacency = this.locations.map(() => new Set<number>());
    for (const { owner, target } of this.calls.values()) {
      adjacency[owner]?.add(target);
    }

    const cyclic = cyclicVertices(adjacency);
    for (const [call, { target }] of this.calls) {
      if (!cyclic.has(target)) {
        continue;
      }
      this.unsupported(
        call.source,
        'recursive_subroutine_call',
        'This call can enter a recursive or re-entrant QSP call cycle. A single return stat cannot preserve its pending returns; the call was not connected.',
      );
      this.calls.delete(call);
    }
  }

  private reserveSourceVariables() {
    for (const { location } of this.locations) {
      const lines = [...location.code, ...location.actions.flatMap((action) => action.code)];
      for (const line of lines) {
        for (const match of line.matchAll(/[$%]?__qsp_return_[a-z0-9_.]*/gi)) {
          this.reservedVariables.add(qspVariableKey(match[0]));
        }
      }
    }
  }

  private createReturnVariables() {
    for (const { target } of this.calls.values()) {
      if (this.returnVariables.has(target)) {
        continue;
      }
      const entry = requireValue(this.locations[target], 'QSP call target');
      const slug = normalizeQspName(entry.location.name).replace(/[^a-z0-9_]/g, '_') || 'location';
      const base = '$__qsp_return_' + slug;
      let name = base;
      let suffix = 1;
      while (
        this.reservedVariables.has(qspVariableKey(name)) ||
        this.reservedVariables.has(qspVariableKey(name.slice(1)))
      ) {
        name = base + '_' + suffix;
        suffix += 1;
      }
      this.reservedVariables.add(qspVariableKey(name));
      this.returnVariables.set(target, name);
    }
  }

  private buildAncestorIndex() {
    for (const { owner, target } of this.calls.values()) {
      this.ancestors[target]?.add(owner);
    }
  }

  private activeVariables(owner: number) {
    const cached = this.activeVariableCache.get(owner);
    if (cached) {
      return cached;
    }

    const found = new Set<number>([owner]);
    const queue = [owner];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (current === undefined) {
        continue;
      }
      for (const parent of this.ancestors[current] ?? []) {
        if (!found.has(parent)) {
          found.add(parent);
          queue.push(parent);
        }
      }
    }

    const variables = [...found].flatMap((index) => {
      const variable = this.returnVariables.get(index);
      return variable ? [variable] : [];
    });
    this.activeVariableCache.set(owner, variables);
    return variables;
  }

  private mapLocations() {
    for (const [owner, entry] of this.locations.entries()) {
      this.mapLocation(entry, owner);
    }
  }

  private mapLocation(entry: AnalyzedQspLocation, owner: number) {
    const title =
      entry.location.entryArgument === undefined
        ? entry.location.name
        : entry.location.name + ' · ' + entry.location.entryArgument;
    const end = this.buildPath({
      owner,
      key: 'location:' + owner,
      title,
      analysis: entry.analysis,
      description: entry.location.description,
      source: entry.location.source,
    });
    this.onMapped(entry.location.source.fileName);

    const mapping: LocationMapping = {
      entry,
      owner,
      end,
      ordered: isOrdered(owner, entry.analysis, this.returnVariables),
      exit: entry.analysis.statements.find(
        (statement): statement is Exit => statement.kind === 'exit',
      ),
      normalExits: end ? [end] : [],
    };
    this.mapActions(mapping);
    this.exits.set(owner, mapping.normalExits);
    this.reportActionLifetime(mapping);
  }

  private mapActions(mapping: LocationMapping) {
    for (const [actionIndex, item] of mapping.entry.actions.entries()) {
      this.mapAction({
        ...mapping,
        action: item.action,
        actionAnalysis: item.analysis,
        actionIndex,
      });
    }
  }

  private mapAction(mapping: ActionMapping) {
    const key = 'action:' + mapping.owner + ':' + mapping.actionIndex;
    const actionEnd = this.buildPath({
      owner: mapping.owner,
      key,
      title: mapping.action.name,
      analysis: mapping.actionAnalysis,
      description: [],
      source: mapping.action.source,
      conditionGroups: mapping.action.conditionGroups,
    });
    const actionInput = actionSource(mapping);
    if (actionInput) {
      this.addEdge(actionInput, key);
    }
    if (actionEnd && actionInput) {
      mapping.normalExits.push(actionEnd);
    }
    if (mapping.action.image) {
      this.reportActionImage(mapping.action);
    }
    this.onMapped(mapping.action.source.fileName);
  }

  private reportActionImage(action: AnalyzedAction) {
    addQspSourceIssue(
      this.report,
      action.source,
      'action_image_ignored',
      'The image attached to the action "' + action.name + '" was not imported.',
    );
    this.report.approximatedStatementCount += 1;
  }

  private reportActionLifetime(mapping: LocationMapping) {
    if (!this.returnVariables.has(mapping.owner) || !mapping.entry.actions.length) {
      return;
    }
    addQspSourceIssue(
      this.report,
      mapping.entry.location.source,
      'subroutine_action_lifetime_approximation',
      'Subroutine actions are retained as choices before returning. QSP would keep composing these actions on the caller screen; that action lifetime is not reproduced.',
    );
    this.report.approximatedStatementCount += 1;
  }

  private buildPath(input: BuildPathInput): string | undefined {
    const node = this.addNode(input.key, input.title, input.source);
    node.conditionGroups = input.conditionGroups;
    if (!isOrdered(input.owner, input.analysis, this.returnVariables)) {
      return this.buildUnorderedPath(input, node);
    }
    return this.buildOrderedPath(input, node);
  }

  private buildUnorderedPath(input: BuildPathInput, node: QspDraftNode) {
    node.body = renderQspBody([...input.description, ...input.analysis.text]);
    node.effects = [...input.analysis.effects];
    for (const target of input.analysis.navigationTargets) {
      this.pendingNavigation.push({ from: input.key, target });
    }
    return input.analysis.navigationTargets.length ? undefined : input.key;
  }

  private buildOrderedPath(input: BuildPathInput, node: QspDraftNode) {
    const path: OrderedPathState = {
      owner: input.owner,
      key: input.key,
      title: input.title,
      source: input.source,
      node,
      text: [...input.description],
      segment: 0,
    };
    for (const statement of input.analysis.statements) {
      const result = this.processOrderedStatement(statement, path);
      if (result.kind === 'stop') {
        return undefined;
      }
      if (result.kind === 'complete') {
        return result.key;
      }
    }
    path.node.body = renderQspBody(path.text);
    return path.node.key;
  }

  private processOrderedStatement(
    statement: QspAnalyzedStatement,
    path: OrderedPathState,
  ): OrderedStepResult {
    if (statement.kind === 'text') {
      path.text.push(statement.text);
      return { kind: 'continue' };
    }
    if (statement.kind === 'effect') {
      path.node.effects.push(statement.effect);
      return { kind: 'continue' };
    }

    path.node.body = renderQspBody(path.text);
    if (statement.kind === 'barrier') {
      this.reportStoppedPath(statement.source);
      return { kind: 'stop' };
    }
    if (statement.kind === 'navigation') {
      this.clearActiveReturns(path, statement.target);
      return { kind: 'stop' };
    }
    if (statement.kind === 'exit') {
      return { kind: 'complete', key: path.node.key };
    }
    if (statement.kind !== 'call') {
      return { kind: 'continue' };
    }

    const call = this.calls.get(statement);
    if (!call) {
      return { kind: 'stop' };
    }
    this.connectCall(statement, call, path);
    return { kind: 'continue' };
  }

  private reportStoppedPath(source: QspSourcePosition) {
    addQspSourceIssue(
      this.report,
      source,
      'subroutine_control_flow_stopped',
      'An ordered call path stops at unsupported control flow; no speculative return or later statements were connected.',
    );
  }

  private clearActiveReturns(path: OrderedPathState, target: QspNavigationTarget | undefined) {
    for (const variable of this.activeVariables(path.owner)) {
      this.setEffect(path.node, variable, '', path.source);
    }
    if (target) {
      this.pendingNavigation.push({ from: path.node.key, target });
    }
  }

  private connectCall(
    statement: Call,
    call: { owner: number; target: number },
    path: OrderedPathState,
  ) {
    this.translatedCalls.add(statement);
    const variable = requireValue(this.returnVariables.get(call.target), 'QSP return variable');
    path.segment += 1;
    const continuation = path.key + ':continue:' + path.segment;
    this.setEffect(path.node, variable, continuation, statement.source);
    this.addEdge(path.node.key, 'location:' + call.target);
    this.returns.push({
      target: call.target,
      continuation,
      variable,
      value: continuation,
      source: statement.source,
    });
    this.reportTranslatedCall(statement);
    path.node = this.addNode(
      continuation,
      path.title + ' — Continue' + (path.segment > 1 ? ' ' + path.segment : ''),
      path.source,
    );
    this.setEffect(path.node, variable, '', statement.source);
    path.text = [];
  }

  private reportTranslatedCall(statement: Call) {
    this.report.convertedStatementCount += 1;
    this.report.approximatedStatementCount += 1;
    addQspSourceIssue(
      this.report,
      statement.source,
      'subroutine_requires_traversal',
      'QSP GS/GOSUB adds content and actions to the current screen and resumes immediately. This import uses interactive traversal of shared content and a conditional return choice; screen composition and argument/local scope are not reproduced.',
    );
  }

  private reportUntranslatedCalls() {
    for (const call of this.calls.keys()) {
      if (!this.translatedCalls.has(call)) {
        this.unsupported(
          call.source,
          'subroutine_after_control_flow',
          'This static call follows an earlier termination, unresolved call, or unsupported control-flow boundary; it was not connected.',
        );
      }
    }
  }

  private connectReturns() {
    const returnsByTarget = new Map<number, PendingReturn[]>();
    for (const pending of this.returns) {
      const group = returnsByTarget.get(pending.target) ?? [];
      group.push(pending);
      returnsByTarget.set(pending.target, group);
    }
    for (const [target, continuations] of returnsByTarget) {
      this.connectReturnGroup(target, continuations);
    }
  }

  private connectReturnGroup(target: number, continuations: PendingReturn[]) {
    let sources = this.exits.get(target) ?? [];
    if (requiresSharedExit(sources.length, continuations.length)) {
      sources = this.createSharedExit(target, sources);
    }
    for (const pending of continuations) {
      for (const from of sources) {
        this.addEdge(from, pending.continuation, [
          [
            {
              variableName: pending.variable,
              operator: 'eq',
              value: pending.value,
              source: pending.source,
            },
          ],
        ]);
      }
    }
  }

  private createSharedExit(target: number, sources: string[]) {
    const entry = requireValue(this.locations[target], 'QSP return target');
    const exit = this.addNode(
      'location:' + target + ':return',
      entry.location.name + ' — Return',
      entry.location.source,
    );
    for (const source of sources) {
      this.addEdge(source, exit.key);
    }
    return [exit.key];
  }

  private connectNavigations() {
    for (const pending of this.pendingNavigation) {
      this.connectNavigation(pending);
    }
  }

  private connectNavigation(pending: PendingNavigation) {
    const base = this.targets.get(targetKey(pending.target.locationName));
    if (base === undefined) {
      addQspSourceIssue(
        this.report,
        pending.target.source,
        'missing_location_target',
        'The target QSP location "' + pending.target.locationName + '" was not found.',
        'error',
      );
      return;
    }

    const variant =
      pending.target.argument === undefined
        ? undefined
        : this.targets.get(targetKey(pending.target.locationName, pending.target.argument));
    if (pending.target.argument !== undefined && variant === undefined) {
      addQspSourceIssue(
        this.report,
        pending.target.source,
        'navigation_argument_variant_not_found',
        'The location "' +
          pending.target.locationName +
          '" has no importable ARGS[0] variant for "' +
          pending.target.argument +
          '"; navigation was connected to its base interaction.',
      );
      this.report.approximatedStatementCount += 1;
    }

    this.addEdge(pending.from, 'location:' + (variant ?? base));
    addQspSourceIssue(
      this.report,
      pending.target.source,
      'automatic_navigation_requires_choice',
      'QSP executes GOTO immediately; the imported graph exposes the destination as an additional reader choice.',
    );
    this.report.approximatedStatementCount += 1;
  }

  private addNode(key: string, title: string, source: QspSourcePosition) {
    const node: QspDraftNode = {
      key,
      title: truncateImportedText(title, 200),
      body: '',
      effects: [],
    };
    this.nodes.push(node);
    this.nodeFiles.set(key, source.fileName);
    return node;
  }

  private addEdge(from: string, to: string, conditionGroups?: QspSourceCondition[][]) {
    this.edges.push({ from, to, ...(conditionGroups ? { conditionGroups } : {}) });
  }

  private setEffect(
    node: QspDraftNode,
    variableName: string,
    value: string,
    source: QspSourcePosition,
  ) {
    node.effects.push({ variableName, operation: 'set', value, source });
  }

  private unsupported(source: QspSourcePosition, code: string, message: string) {
    addQspSourceIssue(this.report, source, code, message);
    this.report.unsupportedStatementCount += 1;
  }
}

function analyses(entry: AnalyzedQspLocation) {
  return [entry.analysis, ...entry.actions.map((action) => action.analysis)];
}

function isOrdered(owner: number, analysis: QspCodeAnalysis, returnVariables: Map<number, string>) {
  return (
    returnVariables.has(owner) || analysis.statements.some((statement) => statement.kind === 'call')
  );
}

function actionSource(mapping: ActionMapping) {
  const { end, ordered, exit, owner, action } = mapping;
  if (end && (!ordered || !exit || exit.source.line >= action.source.line)) {
    return end;
  }
  return ordered ? undefined : 'location:' + owner;
}

function requiresSharedExit(sourceCount: number, continuationCount: number) {
  return sourceCount * continuationCount > sourceCount + continuationCount + 1;
}

function hasSharedBaseState(locations: AnalyzedQspLocation[], baseIndex: number | undefined) {
  const base = requireValue(
    baseIndex === undefined ? undefined : locations[baseIndex],
    'QSP base location',
  );
  return (
    base.location.code.some((line) => line.trim()) ||
    base.location.description.length > 0 ||
    base.actions.length > 0
  );
}

function requireValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error('Expected ' + description + ' to exist');
  }
  return value;
}

function targetKey(name: string, argument?: string) {
  return normalizeQspName(name) + '\u0000' + (argument ?? '');
}

/** Iterative Kosaraju: large source graphs must not consume the JS call stack. */
function cyclicVertices(graph: Set<number>[]) {
  const reverse = reverseGraph(graph);
  const seen = new Set<number>();
  const cyclic = new Set<number>();
  for (const start of finishOrder(graph).reverse()) {
    if (seen.has(start)) {
      continue;
    }
    const component = collectComponent(start, reverse, seen);
    if (component.length > 1 || graph[start]?.has(start)) {
      for (const node of component) {
        cyclic.add(node);
      }
    }
  }
  return cyclic;
}

function reverseGraph(graph: Set<number>[]) {
  const reverse = graph.map(() => new Set<number>());
  graph.forEach((targets, owner) => {
    for (const target of targets) {
      reverse[target]?.add(owner);
    }
  });
  return reverse;
}

function finishOrder(graph: Set<number>[]) {
  const seen = new Set<number>();
  const order: number[] = [];
  for (let start = 0; start < graph.length; start += 1) {
    if (!seen.has(start)) {
      appendFinishOrder(graph, start, seen, order);
    }
  }
  return order;
}

type FinishOrderFrame = [node: number, expanded: boolean];

type FinishOrderContext = {
  graph: Set<number>[];
  seen: Set<number>;
  order: number[];
  stack: FinishOrderFrame[];
};

function appendFinishOrder(
  graph: Set<number>[],
  start: number,
  seen: Set<number>,
  order: number[],
) {
  const stack: FinishOrderFrame[] = [[start, false]];
  const context = { graph, seen, order, stack };
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) {
      continue;
    }
    processFinishOrderFrame(entry, context);
  }
}

function processFinishOrderFrame([node, expanded]: FinishOrderFrame, context: FinishOrderContext) {
  const { graph, seen, order, stack } = context;
  if (expanded) {
    order.push(node);
    return;
  }
  if (seen.has(node)) {
    return;
  }
  seen.add(node);
  stack.push([node, true]);
  for (const target of graph[node] ?? []) {
    if (!seen.has(target)) {
      stack.push([target, false]);
    }
  }
}

function collectComponent(start: number, reverse: Set<number>[], seen: Set<number>) {
  const component: number[] = [];
  const queue = [start];
  seen.add(start);
  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    if (node === undefined) {
      continue;
    }
    component.push(node);
    for (const target of reverse[node] ?? []) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return component;
}

function renderQspBody(parts: readonly string[]) {
  const body = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => '<p>' + escapeImportedHtml(part) + '</p>')
    .join('');
  if (body.length <= MAX_INTERACTION_BODY_LENGTH) {
    return body;
  }
  const truncated = truncateImportedText(
    parts.filter(Boolean).join('\n\n'),
    MAX_INTERACTION_BODY_LENGTH - 20,
  );
  return '<p>' + escapeImportedHtml(truncated) + '</p>';
}

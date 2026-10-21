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

/** Lowers ordered source into the existing draft graph, not a runtime call model. */
export function buildQspDraftGraph(
  locations: AnalyzedQspLocation[],
  report: QspImportReport,
  onMapped: (fileName: string) => void,
) {
  const nodes: QspDraftNode[] = [];
  const edges: QspDraftEdge[] = [];
  const nodeFiles = new Map<string, string>();
  const targets = new Map(
    locations.map(({ location }, index) => [
      targetKey(location.name, location.entryArgument),
      index,
    ]),
  );
  const calls = new Map<Call, { owner: number; target: number }>();
  const issue = (source: QspSourcePosition, code: string, message: string) => {
    addQspSourceIssue(report, source, code, message);
    report.unsupportedStatementCount += 1;
  };
  const analyses = (entry: AnalyzedQspLocation) => [
    entry.analysis,
    ...entry.actions.map((a) => a.analysis),
  ];

  locations.forEach((entry, owner) => {
    for (const analysis of analyses(entry)) {
      for (const statement of analysis.statements) {
        if (statement.kind !== 'call' || !statement.target) continue;
        const target = targets.get(
          targetKey(statement.target.locationName, statement.target.argument),
        );
        if (target === undefined) {
          issue(
            statement.source,
            'missing_subroutine_target',
            `No importable QSP subroutine or ARGS[0] variant matches "${statement.target.locationName}". The call path stops here.`,
          );
          continue;
        }
        const base = locations[targets.get(targetKey(statement.target.locationName))!];
        if (
          statement.target.argument !== undefined &&
          (base.location.code.some((line) => line.trim()) ||
            base.location.description.length ||
            base.actions.length)
        ) {
          issue(
            statement.source,
            'unsupported_subroutine_argument_scope',
            'This ARGS[0] call also requires shared base code or actions; it was not connected because argument scope cannot be preserved.',
          );
          continue;
        }
        calls.set(statement, { owner, target });
      }
    }
  });

  const adjacency = locations.map(() => new Set<number>());
  for (const { owner, target } of calls.values()) adjacency[owner].add(target);
  const cyclic = cyclicVertices(adjacency);
  for (const [call, { target }] of calls) {
    if (!cyclic.has(target)) continue;
    issue(
      call.source,
      'recursive_subroutine_call',
      'This call can enter a recursive or re-entrant QSP call cycle. A single return stat cannot preserve its pending returns; the call was not connected.',
    );
    calls.delete(call);
  }

  // Reserve even unsupported source identifiers, not only successfully mapped stats.
  const reserved = new Set<string>();
  for (const { location } of locations) {
    for (const line of [...location.code, ...location.actions.flatMap((action) => action.code)]) {
      for (const match of line.matchAll(/[$%]?__qsp_return_[a-z0-9_.]*/gi))
        reserved.add(qspVariableKey(match[0]));
    }
  }
  const returnVariables = new Map<number, string>();
  for (const { target } of calls.values()) {
    if (returnVariables.has(target)) continue;
    const location = locations[target].location;
    const slug = normalizeQspName(location.name).replace(/[^a-z0-9_]/g, '_') || 'location';
    const base = `$__qsp_return_${slug}`;
    let name = base;
    let suffix = 1;
    while (reserved.has(qspVariableKey(name)) || reserved.has(qspVariableKey(name.slice(1)))) {
      name = `${base}_${suffix++}`;
    }
    reserved.add(qspVariableKey(name));
    returnVariables.set(target, name);
  }

  // Navigation abandons the active call chain. Clear possible ancestors so a later
  // ordinary visit cannot expose an abandoned continuation through a stale value.
  const ancestors = locations.map(() => new Set<number>());
  for (const { owner, target } of calls.values()) ancestors[target].add(owner);
  const activeVariableCache = new Map<number, string[]>();
  const activeVariables = (owner: number) => {
    const cached = activeVariableCache.get(owner);
    if (cached) return cached;
    const found = new Set<number>([owner]);
    const queue = [owner];
    for (let index = 0; index < queue.length; index += 1) {
      for (const parent of ancestors[queue[index]]) {
        if (!found.has(parent)) {
          found.add(parent);
          queue.push(parent);
        }
      }
    }
    const variables = [...found].flatMap((index) =>
      returnVariables.has(index) ? [returnVariables.get(index)!] : [],
    );
    activeVariableCache.set(owner, variables);
    return variables;
  };

  const exits = new Map<number, string[]>();
  const returns: Array<{
    target: number;
    continuation: string;
    variable: string;
    value: string;
    source: QspSourcePosition;
  }> = [];
  const translatedCalls = new Set<Call>();
  const pendingNavigation: Array<{ from: string; target: QspNavigationTarget }> = [];
  const addEdge = (from: string, to: string, conditionGroups?: QspSourceCondition[][]) => {
    edges.push({ from, to, ...(conditionGroups ? { conditionGroups } : {}) });
  };
  const addNode = (key: string, title: string, source: QspSourcePosition) => {
    const node: QspDraftNode = {
      key,
      title: truncateImportedText(title, 200),
      body: '',
      effects: [],
    };
    nodes.push(node);
    nodeFiles.set(key, source.fileName);
    return node;
  };
  const setEffect = (
    node: QspDraftNode,
    variableName: string,
    value: string,
    source: QspSourcePosition,
  ) => {
    node.effects.push({ variableName, operation: 'set', value, source });
  };
  const buildPath = (
    owner: number,
    key: string,
    title: string,
    analysis: QspCodeAnalysis,
    description: string[],
    source: QspSourcePosition,
    conditionGroups?: QspSourceCondition[][],
  ): string | undefined => {
    let node = addNode(key, title, source);
    node.conditionGroups = conditionGroups;
    const ordered =
      returnVariables.has(owner) || analysis.statements.some((s) => s.kind === 'call');
    if (!ordered) {
      node.body = renderQspBody([...description, ...analysis.text]);
      node.effects = [...analysis.effects];
      for (const target of analysis.navigationTargets)
        pendingNavigation.push({ from: key, target });
      return analysis.navigationTargets.length ? undefined : key;
    }
    let text = [...description];
    let segment = 0;
    for (const statement of analysis.statements) {
      if (statement.kind === 'text') {
        text.push(statement.text);
        continue;
      }
      if (statement.kind === 'effect') {
        node.effects.push(statement.effect);
        continue;
      }
      node.body = renderQspBody(text);
      if (statement.kind === 'barrier') {
        addQspSourceIssue(
          report,
          statement.source,
          'subroutine_control_flow_stopped',
          'An ordered call path stops at unsupported control flow; no speculative return or later statements were connected.',
        );
        return undefined;
      }
      if (statement.kind === 'navigation') {
        for (const variable of activeVariables(owner)) setEffect(node, variable, '', source);
        if (statement.target) pendingNavigation.push({ from: node.key, target: statement.target });
        return undefined;
      }
      if (statement.kind === 'exit') return node.key;
      if (statement.kind !== 'call') continue;
      const call = calls.get(statement);
      if (!call) return undefined;
      translatedCalls.add(statement);
      const variable = returnVariables.get(call.target)!;
      const continuation = `${key}:continue:${++segment}`;
      // A path segment has only this call as its outgoing transition. Action
      // alternatives live on their own interactions, so only this path sets it.
      setEffect(node, variable, continuation, statement.source);
      addEdge(node.key, `location:${call.target}`);
      returns.push({
        target: call.target,
        continuation,
        variable,
        value: continuation,
        source: statement.source,
      });
      report.convertedStatementCount += 1;
      report.approximatedStatementCount += 1;
      addQspSourceIssue(
        report,
        statement.source,
        'subroutine_requires_traversal',
        'QSP GS/GOSUB adds content and actions to the current screen and resumes immediately. This import uses interactive traversal of shared content and a conditional return choice; screen composition and argument/local scope are not reproduced.',
      );
      node = addNode(
        continuation,
        `${title} — Continue${segment > 1 ? ` ${segment}` : ''}`,
        source,
      );
      setEffect(node, variable, '', statement.source);
      text = [];
    }
    node.body = renderQspBody(text);
    return node.key;
  };

  locations.forEach(({ location, analysis, actions }, owner) => {
    const title =
      location.entryArgument === undefined
        ? location.name
        : `${location.name} · ${location.entryArgument}`;
    const end = buildPath(
      owner,
      `location:${owner}`,
      title,
      analysis,
      location.description,
      location.source,
    );
    onMapped(location.source.fileName);
    const normalExits = end ? [end] : [];
    const ordered =
      returnVariables.has(owner) || analysis.statements.some((s) => s.kind === 'call');
    const exit = analysis.statements.find((s) => s.kind === 'exit');
    for (const [actionIndex, { action, analysis: actionAnalysis }] of actions.entries()) {
      const key = `action:${owner}:${actionIndex}`;
      const actionEnd = buildPath(
        owner,
        key,
        action.name,
        actionAnalysis,
        [],
        action.source,
        action.conditionGroups,
      );
      // Preserve legacy inspection of actions after GOTO for non-call imports.
      const actionInput =
        (end && (!ordered || !exit || exit.source.line >= action.source.line) ? end : undefined) ??
        (!ordered ? `location:${owner}` : undefined);
      if (actionInput) addEdge(actionInput, key);
      if (actionEnd && actionInput) normalExits.push(actionEnd);
      if (action.image) {
        addQspSourceIssue(
          report,
          action.source,
          'action_image_ignored',
          `The image attached to the action "${action.name}" was not imported.`,
        );
        report.approximatedStatementCount += 1;
      }
      onMapped(action.source.fileName);
    }
    exits.set(owner, normalExits);
    if (returnVariables.has(owner) && actions.length) {
      addQspSourceIssue(
        report,
        location.source,
        'subroutine_action_lifetime_approximation',
        'Subroutine actions are retained as choices before returning. QSP would keep composing these actions on the caller screen; that action lifetime is not reproduced.',
      );
      report.approximatedStatementCount += 1;
    }
  });
  for (const call of calls.keys()) {
    if (!translatedCalls.has(call)) {
      issue(
        call.source,
        'subroutine_after_control_flow',
        'This static call follows an earlier termination, unresolved call, or unsupported control-flow boundary; it was not connected.',
      );
    }
  }
  const returnsByTarget = new Map<number, typeof returns>();
  for (const pending of returns) {
    const group = returnsByTarget.get(pending.target) ?? [];
    group.push(pending);
    returnsByTarget.set(pending.target, group);
  }
  for (const [target, continuations] of returnsByTarget) {
    let sources = exits.get(target) ?? [];
    // A shared ordinary exit avoids the exits × callers edge cross-product.
    // Small paths return directly to avoid an unnecessary extra reader step.
    if (sources.length * continuations.length > sources.length + continuations.length + 1) {
      const { location } = locations[target];
      const exit = addNode(
        `location:${target}:return`,
        `${location.name} — Return`,
        location.source,
      );
      for (const source of sources) addEdge(source, exit.key);
      sources = [exit.key];
    }
    for (const pending of continuations) {
      for (const from of sources) {
        addEdge(from, pending.continuation, [
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
  for (const { from, target } of pendingNavigation) {
    const base = targets.get(targetKey(target.locationName));
    if (base === undefined) {
      addQspSourceIssue(
        report,
        target.source,
        'missing_location_target',
        `The target QSP location "${target.locationName}" was not found.`,
        'error',
      );
      continue;
    }
    const variant =
      target.argument === undefined
        ? undefined
        : targets.get(targetKey(target.locationName, target.argument));
    if (target.argument !== undefined && variant === undefined) {
      addQspSourceIssue(
        report,
        target.source,
        'navigation_argument_variant_not_found',
        `The location "${target.locationName}" has no importable ARGS[0] variant for "${target.argument}"; navigation was connected to its base interaction.`,
      );
      report.approximatedStatementCount += 1;
    }
    addEdge(from, `location:${variant ?? base}`);
    addQspSourceIssue(
      report,
      target.source,
      'automatic_navigation_requires_choice',
      'QSP executes GOTO immediately; the imported graph exposes the destination as an additional reader choice.',
    );
    report.approximatedStatementCount += 1;
  }
  return { nodes, edges, nodeFiles, returnVariables: new Set(returnVariables.values()) };
}

function targetKey(name: string, argument?: string) {
  return `${normalizeQspName(name)}\u0000${argument ?? ''}`;
}

/** Iterative Kosaraju: large source graphs must not consume the JS call stack. */
function cyclicVertices(graph: Set<number>[]) {
  const reverse = graph.map(() => new Set<number>());
  graph.forEach((targets, owner) => {
    for (const target of targets) reverse[target].add(owner);
  });
  const seen = new Set<number>();
  const order: number[] = [];
  for (let start = 0; start < graph.length; start += 1) {
    if (seen.has(start)) continue;
    const stack: Array<[number, boolean]> = [[start, false]];
    while (stack.length) {
      const [node, expanded] = stack.pop()!;
      if (expanded) {
        order.push(node);
        continue;
      }
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push([node, true]);
      for (const target of graph[node]) if (!seen.has(target)) stack.push([target, false]);
    }
  }
  seen.clear();
  const cyclic = new Set<number>();
  for (const start of order.reverse()) {
    if (seen.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    seen.add(start);
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      component.push(node);
      for (const target of reverse[node]) {
        if (!seen.has(target)) {
          seen.add(target);
          queue.push(target);
        }
      }
    }
    if (component.length > 1 || graph[start].has(start))
      for (const node of component) cyclic.add(node);
  }
  return cyclic;
}

function renderQspBody(parts: readonly string[]) {
  const body = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeImportedHtml(part)}</p>`)
    .join('');
  if (body.length <= MAX_INTERACTION_BODY_LENGTH) return body;
  return `<p>${escapeImportedHtml(truncateImportedText(parts.filter(Boolean).join('\n\n'), MAX_INTERACTION_BODY_LENGTH - 20))}</p>`;
}

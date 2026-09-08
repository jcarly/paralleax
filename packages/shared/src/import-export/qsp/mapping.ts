import { defaultStoryAccess } from '../../access-control.js';
import { MAX_INTERACTION_BODY_LENGTH } from '../../model/interactions.js';
import type { Interaction } from '../../model/interactions.js';
import type { Story } from '../../model/stories.js';
import type { StatEffect, StatValueType } from '../../model/stats.js';
import { layoutImportedGraph } from '../layout.js';
import { escapeImportedHtml, truncateImportedText, uniqueImportedValues } from '../source-utils.js';
import { buildImportedTrigger } from '../story-builders.js';
import { analyzeQspCode } from './analyzer.js';
import { qspVariableInitialValue, qspVariableKey, qspVariableValueType } from './expressions.js';
import type {
  ParsedQspLocation,
  QspDraftEdge,
  QspDraftNode,
  QspSourceCondition,
  QspVariableEffect,
} from './models.js';
import { normalizeQspName } from './parser.js';
import { addQspSourceIssue } from './report.js';
import type { QspImportOptions, QspImportReport } from './types.js';

export function mapQspLocationsToStory(
  locations: ParsedQspLocation[],
  sourceName: string,
  report: QspImportReport,
  options: QspImportOptions,
): Story {
  const nodes: QspDraftNode[] = [];
  const edges: QspDraftEdge[] = [];
  const edgeKeys = new Set<string>();
  const addEdge = (from: string, to: string) => {
    const key = `${from}\u0000${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };
  const locationKeys = new Map<string, string>();
  const pendingTargets: Array<{
    from: string;
    targetName: string;
    argument?: string;
    source: ParsedQspLocation['source'];
  }> = [];
  const analyzedLocations = locations.map((location) => ({
    location,
    analysis: analyzeQspCode(location.code, location.source, report),
    actions: location.actions.map((action) => ({
      action,
      analysis: analyzeQspCode(action.code, action.source, report),
    })),
  }));
  const variables = collectQspVariables(analyzedLocations);
  const variableIds = new Map(
    variables.map((variable) => [
      variable.key,
      { definitionId: options.createId(), assignmentId: options.createId() },
    ]),
  );

  analyzedLocations.forEach(({ location, analysis: locationAnalysis, actions }, locationIndex) => {
    const locationKey = `location:${locationIndex}`;
    locationKeys.set(qspTargetKey(location.name, location.entryArgument), locationKey);
    nodes.push({
      key: locationKey,
      title: truncateImportedText(
        location.entryArgument === undefined
          ? location.name
          : `${location.name} · ${location.entryArgument}`,
        200,
      ),
      body: renderQspBody([...location.description, ...locationAnalysis.text]),
      effects: locationAnalysis.effects,
    });
    for (const target of locationAnalysis.navigationTargets) {
      pendingTargets.push({
        from: locationKey,
        targetName: target.locationName,
        ...(target.argument !== undefined ? { argument: target.argument } : {}),
        source: location.source,
      });
    }
    if (locationAnalysis.navigationTargets.length > 0) {
      reportAutomaticNavigationApproximation(report, location.source);
    }
    actions.forEach(({ action, analysis: actionAnalysis }, actionIndex) => {
      const actionKey = `action:${locationIndex}:${actionIndex}`;
      nodes.push({
        key: actionKey,
        title: truncateImportedText(action.name, 200),
        body: renderQspBody(actionAnalysis.text),
        effects: actionAnalysis.effects,
        ...(action.conditionGroups ? { conditionGroups: action.conditionGroups } : {}),
      });
      addEdge(locationKey, actionKey);
      if (action.image) {
        addQspSourceIssue(
          report,
          action.source,
          'action_image_ignored',
          `The image attached to the action "${action.name}" was not imported.`,
        );
        report.approximatedStatementCount += 1;
      }
      for (const target of actionAnalysis.navigationTargets) {
        pendingTargets.push({
          from: actionKey,
          targetName: target.locationName,
          ...(target.argument !== undefined ? { argument: target.argument } : {}),
          source: action.source,
        });
      }
      if (actionAnalysis.navigationTargets.length > 0) {
        reportAutomaticNavigationApproximation(report, action.source);
      }
    });
  });

  for (const pending of pendingTargets) {
    const baseTarget = locationKeys.get(qspTargetKey(pending.targetName));
    if (!baseTarget) {
      addQspSourceIssue(
        report,
        pending.source,
        'missing_location_target',
        `The target QSP location "${pending.targetName}" was not found.`,
        'error',
      );
      continue;
    }
    const variantTarget =
      pending.argument === undefined
        ? undefined
        : locationKeys.get(qspTargetKey(pending.targetName, pending.argument));
    const target = variantTarget ?? baseTarget;
    if (pending.argument !== undefined && !variantTarget) {
      addQspSourceIssue(
        report,
        pending.source,
        'navigation_argument_variant_not_found',
        `The location "${pending.targetName}" has no importable ARGS[0] variant for "${pending.argument}"; navigation was connected to its base interaction.`,
      );
      report.approximatedStatementCount += 1;
    }
    addEdge(pending.from, target);
  }

  const incoming = new Map(nodes.map(({ key }) => [key, [] as string[]]));
  for (const edge of edges) incoming.get(edge.to)?.push(edge.from);
  locations.slice(1).forEach((location, index) => {
    const key = `location:${index + 1}`;
    if ((incoming.get(key) ?? []).length > 0) return;
    addQspSourceIssue(
      report,
      location.source,
      'unreachable_location_imported_as_root',
      `The location "${location.name}${location.entryArgument === undefined ? '' : ` (${location.entryArgument})`}" has no supported incoming path and is exposed as a root interaction for graph inspection.`,
    );
    report.approximatedStatementCount += 1;
  });

  const ids = new Map(nodes.map((node) => [node.key, options.createId()]));
  const positions = layoutImportedGraph(nodes, edges);
  const interactions: Interaction[] = nodes.map((node) => {
    const triggerId = options.createId();
    const statEffects = mapQspEffects(node.effects, variableIds);
    return {
      id: ids.get(node.key)!,
      title: node.title,
      body: node.body,
      position: positions.get(node.key)!,
      ...(statEffects.length > 0 ? { statEffects } : {}),
      triggers: [
        buildImportedTrigger(
          triggerId,
          uniqueImportedValues(incoming.get(node.key) ?? []).map((key) => ids.get(key)!),
          node.conditionGroups?.map((group) =>
            group.map((condition) => ({
              statId: variableIds.get(qspVariableKey(condition.variableName))!.assignmentId,
              operator: condition.operator,
              value: condition.value,
            })),
          ) ?? [[]],
        ),
      ],
    };
  });
  report.interactionCount = interactions.length;
  return {
    id: options.storyId,
    revision: 1,
    title: importedStoryTitle(sourceName),
    startDateTime: options.timestamp.slice(0, 16),
    locations: [],
    characters: [],
    statDefinitions: variables.map((variable) => ({
      id: variableIds.get(variable.key)!.definitionId,
      name: displayQspVariableName(variable.name),
      valueType: variable.valueType,
      category: 'QSP',
    })),
    stats: variables.map((variable) => ({
      id: variableIds.get(variable.key)!.assignmentId,
      statDefinitionId: variableIds.get(variable.key)!.definitionId,
      initialValue: qspVariableInitialValue(variable.name),
    })),
    itemDefinitions: [],
    graphDecorations: [],
    interactions,
    access: { ...defaultStoryAccess },
    createdAt: options.timestamp,
    updatedAt: options.timestamp,
  };
}

function collectQspVariables(
  locations: Array<{
    analysis: { effects: QspVariableEffect[] };
    actions: Array<{
      action: { conditionGroups?: QspSourceCondition[][] };
      analysis: { effects: QspVariableEffect[] };
    }>;
  }>,
) {
  const variables = new Map<
    string,
    { key: string; name: string; valueType: Extract<StatValueType, 'number' | 'string'> }
  >();
  const add = (name: string) => {
    const key = qspVariableKey(name);
    if (!variables.has(key)) {
      variables.set(key, { key, name, valueType: qspVariableValueType(name) });
    }
  };
  for (const location of locations) {
    for (const effect of location.analysis.effects) add(effect.variableName);
    for (const action of location.actions) {
      for (const effect of action.analysis.effects) add(effect.variableName);
      for (const group of action.action.conditionGroups ?? []) {
        for (const condition of group) add(condition.variableName);
      }
    }
  }
  return [...variables.values()];
}

function mapQspEffects(
  effects: QspVariableEffect[],
  variableIds: ReadonlyMap<string, { definitionId: string; assignmentId: string }>,
): StatEffect[] {
  const collapsed = new Map<string, Omit<StatEffect, 'statId'>>();
  for (const effect of effects) {
    const key = qspVariableKey(effect.variableName);
    const current = collapsed.get(key);
    if (effect.operation === 'set') {
      collapsed.set(key, { operation: 'set', value: effect.value });
      continue;
    }
    const currentValue = typeof current?.value === 'number' ? current.value : 0;
    collapsed.set(key, {
      operation: current?.operation === 'set' ? 'set' : 'add',
      value: currentValue + (effect.value as number),
    });
  }
  return [...collapsed].map(([key, effect]) => ({
    statId: variableIds.get(key)!.assignmentId,
    ...effect,
  }));
}

function displayQspVariableName(name: string) {
  const indexStart = name.indexOf('[');
  const sourceName = indexStart < 0 ? name : name.slice(0, indexStart);
  const value = sourceName
    .replace(/^\$/, '')
    .replace(/[_.-]+/g, ' ')
    .trim();
  const baseName = value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : 'QSP variable';
  if (indexStart < 0) return baseName;
  const serializedIndex = name.slice(indexStart + 1, -1);
  let displayIndex = serializedIndex;
  if (serializedIndex.startsWith('"')) {
    try {
      displayIndex = String(JSON.parse(serializedIndex));
    } catch {
      // Canonical imported references are valid JSON; retain the source if legacy data is not.
    }
  }
  return `${baseName} [${displayIndex}]`;
}

function reportAutomaticNavigationApproximation(
  report: QspImportReport,
  source: ParsedQspLocation['source'],
) {
  addQspSourceIssue(
    report,
    source,
    'automatic_navigation_requires_choice',
    'QSP executes GOTO immediately; the imported graph exposes the destination as an additional reader choice.',
  );
  report.approximatedStatementCount += 1;
}

function renderQspBody(parts: readonly string[]) {
  const body = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeImportedHtml(part)}</p>`)
    .join('');
  if (body.length <= MAX_INTERACTION_BODY_LENGTH) return body;
  return `<p>${escapeImportedHtml(
    truncateImportedText(parts.filter(Boolean).join('\n\n'), MAX_INTERACTION_BODY_LENGTH - 20),
  )}</p>`;
}

function importedStoryTitle(sourceName: string) {
  const withoutExtension = sourceName
    .replace(/\.(?:qsp|gam|qsps|qsp-txt|txt-qsp|qsrc)$/i, '')
    .trim();
  return truncateImportedText(withoutExtension || 'Imported QSP story', 200);
}

function qspTargetKey(locationName: string, argument?: string) {
  return `${normalizeQspName(locationName)}\u0000${argument === undefined ? '' : argument}`;
}

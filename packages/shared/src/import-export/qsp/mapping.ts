import { defaultStoryAccess } from '../../access-control.js';
import type { Interaction } from '../../model/interactions.js';
import type { Story } from '../../model/stories.js';
import type { StatEffect, StatValueType } from '../../model/stats.js';
import { layoutImportedGraph } from '../layout.js';
import { truncateImportedText, uniqueImportedValues } from '../source-utils.js';
import { buildImportedTrigger } from '../story-builders.js';
import { analyzeQspCode } from './analyzer.js';
import { qspVariableInitialValue, qspVariableKey, qspVariableValueType } from './expressions.js';
import type { ParsedQspLocation, QspSourceCondition, QspVariableEffect } from './models.js';
import { buildQspDraftGraph } from './control-flow.js';
import { addQspSourceIssue } from './report.js';
import type { QspImportOptions, QspImportReport } from './types.js';

const PROGRESS_REPORT_INTERVAL = 25;

export function mapQspLocationsToStory(
  locations: ParsedQspLocation[],
  sourceName: string,
  report: QspImportReport,
  options: QspImportOptions,
): Story {
  let totalMappingWork =
    locations.reduce((total, location) => total + 1 + location.actions.length, 0) * 3;
  let completedMappingWork = 0;
  const reportMappingProgress = (currentFile: string) => {
    completedMappingWork += 1;
    if (
      completedMappingWork === 1 ||
      completedMappingWork % PROGRESS_REPORT_INTERVAL === 0 ||
      completedMappingWork === totalMappingWork
    ) {
      options.onProgress?.({
        phase: 'mapping',
        completed: completedMappingWork,
        total: totalMappingWork,
        currentFile,
      });
    }
  };

  options.onProgress?.({ phase: 'mapping', completed: 0, total: totalMappingWork });
  const analyzedLocations = locations.map((location) => {
    const analysis = analyzeQspCode(location.code, location.source, report);
    reportMappingProgress(location.source.fileName);
    return {
      location,
      analysis,
      actions: location.actions.map((action) => {
        const actionAnalysis = analyzeQspCode(action.code, action.source, report);
        reportMappingProgress(action.source.fileName);
        return { action, analysis: actionAnalysis };
      }),
    };
  });
  const { nodes, edges, nodeFiles, returnVariables } = buildQspDraftGraph(
    analyzedLocations,
    report,
    reportMappingProgress,
  );
  totalMappingWork = completedMappingWork + nodes.length;
  const variables = collectQspVariables(analyzedLocations);
  for (const name of returnVariables) {
    variables.push({ key: qspVariableKey(name), name, valueType: 'string' });
  }
  const variableIds = new Map(
    variables.map((variable) => [
      variable.key,
      { definitionId: options.createId(), assignmentId: options.createId() },
    ]),
  );

  const incoming = new Map(nodes.map(({ key }) => [key, [] as (typeof edges)[number][]]));
  for (const edge of edges) incoming.get(edge.to)?.push(edge);
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
    const statEffects = mapQspEffects(node.effects, variableIds);
    const incomingEdges = incoming.get(node.key) ?? [];
    // Inputs sharing a condition variant remain OR on one Trigger. Returns
    // with different conditions must remain separate availability variants.
    const variants = new Map<string, { inputs: string[]; groups: QspSourceCondition[][] }>();
    for (const edge of incomingEdges) {
      const groups = edge.conditionGroups ?? [[]];
      const key = JSON.stringify(
        groups.map((group) =>
          group.map((condition) => ({
            variableName: condition.variableName,
            operator: condition.operator,
            value: condition.value,
          })),
        ),
      );
      const variant = variants.get(key) ?? { inputs: [], groups };
      variant.inputs.push(edge.from);
      variants.set(key, variant);
    }
    if (!variants.size || (node.key === 'location:0' && returnVariables.size > 0)) {
      variants.set('root', { inputs: [], groups: [[]] });
    }
    const interaction = {
      id: ids.get(node.key)!,
      title: node.title,
      body: node.body,
      position: positions.get(node.key)!,
      ...(statEffects.length > 0 ? { statEffects } : {}),
      triggers: [...variants.values()].map(({ inputs, groups }) => {
        const combined = groups.flatMap((group) =>
          (node.conditionGroups ?? [[]]).map((own) => [...group, ...own]),
        );
        const trigger = buildImportedTrigger(
          options.createId(),
          uniqueImportedValues(inputs).map((key) => ids.get(key)!),
          combined.map((group) =>
            group.map((condition) => ({
              statId: variableIds.get(qspVariableKey(condition.variableName))!.assignmentId,
              operator: condition.operator,
              value: condition.value,
            })),
          ),
        );
        // Disconnected generated nodes remain inspectable without becoming roots.
        if (!inputs.length && !/^location:\d+$/.test(node.key)) trigger.appearanceProbability = 0;
        return trigger;
      }),
    };
    reportMappingProgress(nodeFiles.get(node.key) ?? sourceName);
    return interaction;
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
      name: returnVariables.has(variable.name)
        ? variable.name.slice(1)
        : displayQspVariableName(variable.name),
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

function importedStoryTitle(sourceName: string) {
  const withoutExtension = sourceName
    .replace(/\.(?:qsp|gam|qsps|qsp-txt|txt-qsp|qsrc)$/i, '')
    .trim();
  return truncateImportedText(withoutExtension || 'Imported QSP story', 200);
}

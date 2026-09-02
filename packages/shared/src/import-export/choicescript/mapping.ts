import { defaultStoryAccess } from '../../access-control.js';
import type { Interaction } from '../../model/interactions.js';
import type { Story } from '../../model/stories.js';
import type { StatValue, StatValueType } from '../../model/stats.js';
import { layoutChoiceScriptGraph } from './graph-builder.js';
import {
  escapeHtml,
  humanizeIdentifier,
  normalizeIdentifier,
  truncate,
  unique,
} from './helpers.js';
import type {
  DirectEdge,
  DraftNode,
  ParsedScene,
  SourceCondition,
  Statement,
  VariableDeclaration,
} from './models.js';
import { addChoiceScriptSourceIssue as addIssue } from './report.js';
import type { ChoiceScriptImportOptions, ChoiceScriptImportReport } from './types.js';

export function mapChoiceScriptGraphToStory(
  graph: { nodes: DraftNode[]; edges: DirectEdge[] },
  orderedScenes: ParsedScene[],
  declarations: VariableDeclaration[],
  report: ChoiceScriptImportReport,
  options: ChoiceScriptImportOptions,
): Story {
  const variableIds = new Map(
    declarations.map((declaration) => [
      declaration.sourceKey,
      { definitionId: options.createId(), assignmentId: options.createId() },
    ]),
  );
  const interactionIds = new Map(graph.nodes.map((node) => [node.key, options.createId()]));
  const incoming = new Map(graph.nodes.map((node) => [node.key, [] as DirectEdge[]]));
  for (const edge of graph.edges) incoming.get(edge.to)?.push(edge);
  const positions = layoutChoiceScriptGraph(graph.nodes, graph.edges);
  const interactions: Interaction[] = graph.nodes.map((node) => {
    const incomingEdges = incoming.get(node.key) ?? [];
    const triggerGroups = new Map<
      string,
      { inputKeys: string[]; condition?: ReturnType<typeof mapSourceCondition> }
    >();
    for (const edge of incomingEdges) {
      const condition = edge.condition
        ? mapSourceCondition(edge.condition, declarations, variableIds, report)
        : undefined;
      const signature = JSON.stringify(condition ?? null);
      const group = triggerGroups.get(signature) ?? { inputKeys: [], condition };
      group.inputKeys.push(edge.from);
      triggerGroups.set(signature, group);
    }
    const triggers =
      incomingEdges.length === 0
        ? [buildTrigger(options.createId(), [], [])]
        : [...triggerGroups.values()].map((group) =>
            buildTrigger(
              options.createId(),
              unique(group.inputKeys).map((key) => interactionIds.get(key)!),
              group.condition ? [group.condition] : [],
            ),
          );
    const statEffects = node.effects.flatMap((effect) => {
      const declaration = resolveVariableDeclaration(declarations, effect.sceneName, effect.name);
      const ids = declaration ? variableIds.get(declaration.sourceKey) : undefined;
      if (!declaration || !ids) {
        addIssue(
          report,
          effect.source,
          'unknown_variable_effect',
          `The variable "${effect.name}" is assigned but has no supported declaration.`,
        );
        report.approximatedCommandCount += 1;
        return [];
      }
      if (typeof effect.value !== declaration.valueType) {
        addIssue(
          report,
          effect.source,
          'variable_type_mismatch',
          `The assignment to "${effect.name}" does not match its declared type.`,
        );
        report.approximatedCommandCount += 1;
        return [];
      }
      return [
        {
          statId: ids.assignmentId,
          operation: effect.operation,
          value: effect.value,
        },
      ];
    });
    return {
      id: interactionIds.get(node.key)!,
      title: node.title,
      body: renderVariableInterpolations(node.body, node.sceneName, declarations, variableIds),
      position: positions.get(node.key)!,
      ...(statEffects.length > 0 ? { statEffects } : {}),
      triggers,
    };
  });
  report.interactionCount = interactions.length;

  const title =
    orderedScenes.find(({ name }) => name === 'startup')?.title ??
    orderedScenes.find(({ title: candidate }) => candidate)?.title ??
    humanizeIdentifier(orderedScenes[0].name);
  return {
    id: options.storyId,
    revision: 1,
    title: truncate(title.trim() || 'Imported ChoiceScript story', 200),
    startDateTime: options.timestamp.slice(0, 16),
    locations: [],
    characters: [],
    statDefinitions: declarations.map((declaration) => ({
      id: variableIds.get(declaration.sourceKey)!.definitionId,
      name: declaration.temporary
        ? `${humanizeIdentifier(declaration.name)} (${humanizeIdentifier(declaration.sceneName ?? '')})`
        : humanizeIdentifier(declaration.name),
      valueType: declaration.valueType,
      category: declaration.temporary ? 'ChoiceScript temp' : 'ChoiceScript',
    })),
    stats: declarations.map((declaration) => ({
      id: variableIds.get(declaration.sourceKey)!.assignmentId,
      statDefinitionId: variableIds.get(declaration.sourceKey)!.definitionId,
      initialValue: declaration.value,
    })),
    itemDefinitions: [],
    graphDecorations: [],
    interactions,
    access: { ...defaultStoryAccess },
    createdAt: options.timestamp,
    updatedAt: options.timestamp,
  };
}

function buildTrigger(
  id: string,
  inputInteractionIds: string[],
  conditions: NonNullable<Interaction['triggers'][number]['conditions']>,
): Interaction['triggers'][number] {
  return {
    id,
    inputInteractionIds,
    conditionGroups: [{ id: `${id}:conditions`, conditions }],
    appearanceProbability: 100,
    timerSeconds: null,
  };
}

export function collectChoiceScriptVariableDeclarations(
  scenes: ParsedScene[],
  report: ChoiceScriptImportReport,
): VariableDeclaration[] {
  const declarations: VariableDeclaration[] = [];
  const visit = (statements: Statement[]) => {
    for (const statement of statements) {
      if (statement.kind === 'choice') {
        for (const option of statement.options) visit(option.statements);
        continue;
      }
      if (statement.kind !== 'declare') continue;
      const sourceKey = statement.temporary
        ? temporaryVariableKey(statement.source.sceneName, statement.name)
        : globalVariableKey(statement.name);
      if (declarations.some((declaration) => declaration.sourceKey === sourceKey)) {
        addIssue(
          report,
          statement.source,
          'duplicate_variable_declaration',
          `The variable "${statement.name}" is declared more than once in the same scope.`,
          'error',
        );
        continue;
      }
      declarations.push({
        sourceKey,
        name: statement.name,
        ...(statement.temporary ? { sceneName: statement.source.sceneName } : {}),
        value: statement.value,
        valueType: inferStatValueType(statement.value),
        temporary: statement.temporary,
        source: statement.source,
      });
    }
  };
  for (const scene of scenes) visit(scene.statements);
  return declarations;
}

function resolveVariableDeclaration(
  declarations: VariableDeclaration[],
  sceneName: string,
  name: string,
) {
  const normalizedName = normalizeIdentifier(name);
  return (
    declarations.find(
      ({ sourceKey }) => sourceKey === temporaryVariableKey(sceneName, normalizedName),
    ) ?? declarations.find(({ sourceKey }) => sourceKey === globalVariableKey(normalizedName))
  );
}

function mapSourceCondition(
  condition: SourceCondition,
  declarations: VariableDeclaration[],
  variableIds: ReadonlyMap<string, { definitionId: string; assignmentId: string }>,
  report: ChoiceScriptImportReport,
) {
  const declaration = resolveVariableDeclaration(
    declarations,
    condition.source.sceneName,
    condition.name,
  );
  const ids = declaration ? variableIds.get(declaration.sourceKey) : undefined;
  if (!declaration || !ids || typeof condition.value !== declaration.valueType) {
    addIssue(
      report,
      condition.source,
      'unsupported_variable_condition',
      `The condition on "${condition.name}" could not be mapped to a typed stat.`,
    );
    report.approximatedCommandCount += 1;
    return undefined;
  }
  if (declaration.valueType !== 'number' && !['eq', 'neq'].includes(condition.operator)) {
    addIssue(
      report,
      condition.source,
      'unsupported_variable_operator',
      `The condition on "${condition.name}" uses a numeric operator on a non-numeric value.`,
    );
    report.approximatedCommandCount += 1;
    return undefined;
  }
  return {
    statId: ids.assignmentId,
    operator: condition.operator,
    value: condition.value,
  };
}

function renderVariableInterpolations(
  body: string,
  sceneName: string,
  declarations: VariableDeclaration[],
  variableIds: ReadonlyMap<string, { definitionId: string; assignmentId: string }>,
) {
  return body.replace(
    /<span data-cs-variable="([a-z_][a-z0-9_]*)"><\/span>/gi,
    (_match, name: string) => {
      const declaration = resolveVariableDeclaration(declarations, sceneName, name);
      const ids = declaration ? variableIds.get(declaration.sourceKey) : undefined;
      return ids
        ? `<span data-stat-value="${escapeHtml(ids.assignmentId)}"></span>`
        : `\${${name}}`;
    },
  );
}

function globalVariableKey(name: string) {
  return `global:${normalizeIdentifier(name)}`;
}

function inferStatValueType(value: StatValue): StatValueType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function temporaryVariableKey(sceneName: string, name: string) {
  return `temp:${normalizeIdentifier(sceneName)}:${normalizeIdentifier(name)}`;
}

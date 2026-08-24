import { defaultStoryAccess } from '../../access-control.js';
import { MAX_INTERACTION_BODY_LENGTH } from '../../model/interactions.js';
import type { Interaction } from '../../model/interactions.js';
import type { Story } from '../../model/stories.js';
import type { StatEffect, StatValue, StatValueType } from '../../model/stats.js';
import type { StatComparisonOperator } from '../../triggers/conditions.js';
import type {
  ChoiceScriptImportIssue,
  ChoiceScriptImportOptions,
  ChoiceScriptImportReport,
  ChoiceScriptImportResult,
  ChoiceScriptSourceFile,
} from './types.js';

interface SourceLine {
  fileName: string;
  sceneName: string;
  number: number;
  indent: number;
  text: string;
}

type Statement =
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

interface ChoiceOption {
  title: string;
  statements: Statement[];
  condition?: SourceCondition;
  source: SourceLine;
}

interface SourceCondition {
  name: string;
  operator: StatComparisonOperator;
  value: StatValue;
  source: SourceLine;
}

interface VariableDeclaration {
  sourceKey: string;
  name: string;
  sceneName?: string;
  value: StatValue;
  valueType: StatValueType;
  temporary: boolean;
  source: SourceLine;
}

interface SourceEffect {
  name: string;
  sceneName: string;
  operation: StatEffect['operation'];
  value: StatValue;
  source: SourceLine;
}

interface ParsedScene {
  name: string;
  fileName: string;
  statements: Statement[];
  title?: string;
  sceneList: string[];
}

interface DraftNode {
  key: string;
  title: string;
  body: string;
  sceneName: string;
  sourceLine: number;
  effects: SourceEffect[];
}

interface DirectEdge {
  from: string;
  to: string;
  condition?: SourceCondition;
}

interface DeferredEdge {
  from: string;
  anchor: string;
  source: SourceLine;
}

const MAX_IMPORTED_PASSAGE_TEXT_LENGTH = 12_000;

export function importChoiceScript(
  sourceFiles: ChoiceScriptSourceFile[],
  options: ChoiceScriptImportOptions,
): ChoiceScriptImportResult {
  const issues: ChoiceScriptImportIssue[] = [];
  const report: ChoiceScriptImportReport = {
    format: 'choicescript',
    sourceFileCount: sourceFiles.length,
    sceneCount: 0,
    interactionCount: 0,
    convertedCommandCount: 0,
    approximatedCommandCount: 0,
    ignoredCommandCount: 0,
    issues,
  };
  const scenes = parseScenes(sourceFiles, report);
  report.sceneCount = scenes.length;
  if (scenes.length === 0 || issues.some(({ severity }) => severity === 'error')) {
    return { report };
  }

  const orderedScenes = orderScenes(scenes, issues);
  const declarations = collectVariableDeclarations(orderedScenes, report);
  const variableIds = new Map(
    declarations.map((declaration) => [
      declaration.sourceKey,
      { definitionId: options.createId(), assignmentId: options.createId() },
    ]),
  );
  const finishSceneNames = unique([orderedScenes[0].name, ...orderedScenes[0].sceneList]);
  const builder = new GraphBuilder(finishSceneNames, report);
  for (const scene of orderedScenes) builder.compileScene(scene);
  const graph = builder.finish();
  if (issues.some(({ severity }) => severity === 'error') || graph.nodes.length === 0) {
    if (graph.nodes.length === 0) {
      issues.push({
        severity: 'error',
        code: 'no_importable_content',
        message: 'No importable narrative content was found.',
      });
    }
    return { report };
  }

  const interactionIds = new Map(graph.nodes.map((node) => [node.key, options.createId()]));
  const incoming = new Map(graph.nodes.map((node) => [node.key, [] as DirectEdge[]]));
  for (const edge of graph.edges) incoming.get(edge.to)?.push(edge);
  const positions = layoutGraph(graph.nodes, graph.edges);
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
        ? [{ id: options.createId(), inputInteractionIds: [], conditions: [] }]
        : [...triggerGroups.values()].map((group) => ({
            id: options.createId(),
            inputInteractionIds: unique(group.inputKeys).map((key) => interactionIds.get(key)!),
            conditions: group.condition ? [group.condition] : [],
          }));
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
  const story: Story = {
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
  return { story, report };
}

function parseScenes(
  files: ChoiceScriptSourceFile[],
  report: ChoiceScriptImportReport,
): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  const seenNames = new Set<string>();
  for (const file of files) {
    const sceneName = normalizeIdentifier(file.name.replace(/\.txt$/i, ''));
    if (!sceneName) {
      report.issues.push({
        severity: 'error',
        code: 'invalid_scene_name',
        message: `The file name "${file.name}" does not define a valid scene name.`,
        fileName: file.name,
      });
      continue;
    }
    if (seenNames.has(sceneName)) {
      report.issues.push({
        severity: 'error',
        code: 'duplicate_scene',
        message: `More than one source file defines the scene "${sceneName}".`,
        fileName: file.name,
      });
      continue;
    }
    seenNames.add(sceneName);
    const lines = tokenize(file, sceneName);
    const metadata = readSceneMetadata(lines);
    scenes.push({
      name: sceneName,
      fileName: file.name,
      statements: parseStatements(lines, 0, lines.length, report),
      title: metadata.title,
      sceneList: metadata.sceneList,
    });
  }
  return scenes;
}

function tokenize(file: ChoiceScriptSourceFile, sceneName: string): SourceLine[] {
  return file.content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((raw, index) => {
      const indentation = raw.match(/^[\t ]*/)?.[0] ?? '';
      const indent = [...indentation].reduce(
        (total, character) => total + (character === '\t' ? 4 : 1),
        0,
      );
      return {
        fileName: file.name,
        sceneName,
        number: index + 1,
        indent,
        text: raw.trim(),
      };
    });
}

function readSceneMetadata(lines: SourceLine[]) {
  let title: string | undefined;
  const sceneList: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const titleMatch = line.text.match(/^\*title\s+(.+)$/i);
    if (titleMatch) title = titleMatch[1].trim();
    if (!/^\*scene_list\b/i.test(line.text)) continue;
    for (let child = index + 1; child < lines.length; child += 1) {
      const candidate = lines[child];
      if (!candidate.text) continue;
      if (candidate.indent <= line.indent) break;
      const name = normalizeIdentifier(candidate.text.split(/\s+/)[0]);
      if (name) sceneList.push(name);
    }
  }
  return { title, sceneList };
}

function parseStatements(
  lines: SourceLine[],
  start: number,
  end: number,
  report: ChoiceScriptImportReport,
): Statement[] {
  const statements: Statement[] = [];
  let textLines: string[] = [];
  let textSource: SourceLine | undefined;
  const flushText = () => {
    while (textLines[0] === '') textLines.shift();
    while (textLines.at(-1) === '') textLines.pop();
    if (textLines.length > 0 && textSource) {
      statements.push({ kind: 'text', lines: textLines, source: textSource });
    }
    textLines = [];
    textSource = undefined;
  };

  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const choiceMatch = line.text.match(/^\*(choice|fake_choice)\b/i);
    if (choiceMatch) {
      flushText();
      const parsed = parseChoice(lines, index, end, report);
      statements.push({
        kind: 'choice',
        fake: choiceMatch[1].toLowerCase() === 'fake_choice',
        options: parsed.options,
        source: line,
      });
      report.convertedCommandCount += 1;
      index = parsed.endIndex - 1;
      continue;
    }
    if (!line.text) {
      if (textLines.length > 0) textLines.push('');
      continue;
    }
    if (!line.text.startsWith('*')) {
      textSource ??= line;
      textLines.push(line.text);
      if (/@\{|\[b\]|\[i\]|\$\{[^a-z_]/i.test(line.text)) {
        addIssue(
          report,
          line,
          'dynamic_text_preserved',
          'Dynamic ChoiceScript text is preserved literally and is not evaluated.',
        );
        report.approximatedCommandCount += 1;
      }
      continue;
    }

    const command = line.text.match(/^\*([a-z_]+)/i)?.[1]?.toLowerCase() ?? '';
    const argument = line.text.replace(/^\*[a-z_]+\s*/i, '').trim();
    if (command === 'line_break') {
      textSource ??= line;
      textLines.push('');
      report.convertedCommandCount += 1;
      continue;
    }
    flushText();
    if (command === 'label') {
      statements.push({ kind: 'label', name: normalizeIdentifier(argument), source: line });
      report.convertedCommandCount += 1;
    } else if (command === 'goto') {
      statements.push({ kind: 'goto', label: normalizeIdentifier(argument), source: line });
      report.convertedCommandCount += 1;
    } else if (command === 'goto_scene') {
      const [scene, label] = argument.split(/\s+/);
      statements.push({
        kind: 'gotoScene',
        scene: normalizeIdentifier(scene),
        ...(label ? { label: normalizeIdentifier(label) } : {}),
        source: line,
      });
      report.convertedCommandCount += 1;
    } else if (command === 'finish') {
      statements.push({ kind: 'finish', source: line });
      report.convertedCommandCount += 1;
    } else if (command === 'ending') {
      statements.push({ kind: 'ending', source: line });
      report.convertedCommandCount += 1;
    } else if (command === 'create' || command === 'temp') {
      const declaration = readVariableDeclaration(argument);
      if (!declaration) {
        addIssue(
          report,
          line,
          'unsupported_variable_declaration',
          `The *${command} declaration could not be converted to a typed variable.`,
        );
        report.approximatedCommandCount += 1;
      } else {
        statements.push({
          kind: 'declare',
          name: declaration.name,
          value: declaration.value,
          temporary: command === 'temp',
          source: line,
        });
        report.convertedCommandCount += 1;
      }
    } else if (command === 'set') {
      const assignment = readVariableAssignment(argument);
      if (!assignment) {
        addIssue(
          report,
          line,
          'unsupported_variable_assignment',
          'The *set expression could not be converted to a set/add stat effect.',
        );
        report.approximatedCommandCount += 1;
      } else {
        statements.push({ kind: 'set', ...assignment, source: line });
        report.convertedCommandCount += 1;
      }
    } else if (['title', 'author', 'product', 'copyright', 'comment'].includes(command)) {
      report.ignoredCommandCount += 1;
    } else if (['scene_list', 'achievement', 'stat_chart'].includes(command)) {
      report.ignoredCommandCount += 1;
      index = skipIndentedBlock(lines, index, end);
    } else {
      addIssue(
        report,
        line,
        `unsupported_${command || 'command'}`,
        `The *${command || 'unknown'} command is not represented by Paralleax and was ignored.`,
      );
      report.approximatedCommandCount += 1;
    }
  }
  flushText();
  return statements;
}

function parseChoice(
  lines: SourceLine[],
  choiceIndex: number,
  end: number,
  report: ChoiceScriptImportReport,
): { options: ChoiceOption[]; endIndex: number } {
  const choiceLine = lines[choiceIndex];
  let optionIndent: number | undefined;
  let cursor = choiceIndex + 1;
  while (cursor < end) {
    const candidate = lines[cursor];
    if (!candidate.text) {
      cursor += 1;
      continue;
    }
    if (candidate.indent <= choiceLine.indent) break;
    if (readOptionHeader(candidate.text)) {
      optionIndent = candidate.indent;
      break;
    }
    cursor += 1;
  }
  if (optionIndent === undefined) {
    addIssue(
      report,
      choiceLine,
      'choice_without_options',
      'A ChoiceScript choice has no readable options.',
      'error',
    );
    return { options: [], endIndex: Math.max(cursor, choiceIndex + 1) };
  }

  const optionStarts: number[] = [];
  let choiceEnd = end;
  for (let index = cursor; index < end; index += 1) {
    const candidate = lines[index];
    if (candidate.text && candidate.indent <= choiceLine.indent) {
      choiceEnd = index;
      break;
    }
    if (candidate.indent === optionIndent && readOptionHeader(candidate.text))
      optionStarts.push(index);
  }
  const options = optionStarts.map((optionStart, optionIndex) => {
    const source = lines[optionStart];
    const header = readOptionHeader(source.text)!;
    const condition = header.conditionExpression
      ? readSourceCondition(header.conditionExpression, source)
      : undefined;
    if (header.conditional && !condition) {
      addIssue(
        report,
        source,
        'conditional_option_approximated',
        'A conditional option was imported as always available.',
      );
      report.approximatedCommandCount += 1;
    }
    const bodyEnd = optionStarts[optionIndex + 1] ?? choiceEnd;
    report.convertedCommandCount += 1;
    return {
      title: header.title || 'Untitled option',
      statements: parseStatements(lines, optionStart + 1, bodyEnd, report),
      ...(condition ? { condition } : {}),
      source,
    };
  });
  return { options, endIndex: choiceEnd };
}

function readOptionHeader(
  text: string,
): { title: string; conditional: boolean; conditionExpression?: string } | undefined {
  const direct = text.match(/^#\s*(.*)$/);
  if (direct) return { title: direct[1].trim(), conditional: false };
  const conditional = text.match(/^\*(?:selectable_if|if)\s+(.+?)\s*#\s*(.*)$/i);
  if (conditional) {
    return {
      title: conditional[2].trim(),
      conditional: true,
      conditionExpression: conditional[1].trim(),
    };
  }
  return undefined;
}

function skipIndentedBlock(lines: SourceLine[], index: number, end: number): number {
  let cursor = index + 1;
  while (cursor < end && (!lines[cursor].text || lines[cursor].indent > lines[index].indent))
    cursor += 1;
  return cursor - 1;
}

function readVariableDeclaration(argument: string) {
  const match = argument.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
  if (!match) return undefined;
  const value = readLiteral(match[2]);
  return value === undefined ? undefined : { name: normalizeIdentifier(match[1]), value };
}

function readVariableAssignment(
  argument: string,
): { name: string; operation: StatEffect['operation']; value: StatValue } | undefined {
  const match = argument.match(/^([a-z_][a-z0-9_]*)\s+(.+)$/i);
  if (!match) return undefined;
  const name = normalizeIdentifier(match[1]);
  const expression = match[2].trim();
  const relative = expression.match(/^([+-])\s*(\d+(?:\.\d+)?)$/);
  if (relative) {
    return {
      name,
      operation: 'add',
      value: Number(relative[2]) * (relative[1] === '-' ? -1 : 1),
    };
  }
  const selfRelative = expression.match(
    new RegExp(`^${escapeRegExp(name)}\\s*([+-])\\s*(\\d+(?:\\.\\d+)?)$`, 'i'),
  );
  if (selfRelative) {
    return {
      name,
      operation: 'add',
      value: Number(selfRelative[2]) * (selfRelative[1] === '-' ? -1 : 1),
    };
  }
  const value = readLiteral(expression);
  return value === undefined ? undefined : { name, operation: 'set', value };
}

function readSourceCondition(expression: string, source: SourceLine): SourceCondition | undefined {
  const normalized = expression
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  const negated = normalized.match(/^not\s*\(\s*([a-z_][a-z0-9_]*)\s*\)$/i);
  if (negated) {
    return {
      name: normalizeIdentifier(negated[1]),
      operator: 'eq',
      value: false,
      source,
    };
  }
  const truthy = normalized.match(/^([a-z_][a-z0-9_]*)$/i);
  if (truthy) {
    return { name: normalizeIdentifier(truthy[1]), operator: 'eq', value: true, source };
  }
  const comparison = normalized.match(/^([a-z_][a-z0-9_]*)\s*(<=|>=|!=|<>|=|<|>)\s*(.+)$/i);
  if (!comparison) return undefined;
  const value = readLiteral(comparison[3]);
  if (value === undefined) return undefined;
  const operators: Record<string, StatComparisonOperator> = {
    '=': 'eq',
    '!=': 'neq',
    '<>': 'neq',
    '<': 'lt',
    '<=': 'lte',
    '>': 'gt',
    '>=': 'gte',
  };
  return {
    name: normalizeIdentifier(comparison[1]),
    operator: operators[comparison[2]],
    value,
    source,
  };
}

function readLiteral(expression: string): StatValue | undefined {
  const text = expression
    .trim()
    .replace(/^\((.*)\)$/, '$1')
    .trim();
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
  }
  const quoted = text.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/);
  return quoted ? (quoted[1] ?? quoted[2] ?? '') : undefined;
}

function collectVariableDeclarations(
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

function orderScenes(scenes: ParsedScene[], issues: ChoiceScriptImportIssue[]): ParsedScene[] {
  const byName = new Map(scenes.map((scene) => [scene.name, scene]));
  const startup = byName.get('startup') ?? scenes[0];
  if (!byName.has('startup')) {
    issues.push({
      severity: 'warning',
      code: 'missing_startup_scene',
      message: `No startup.txt file was selected; "${startup.fileName}" is used as the entry scene.`,
      fileName: startup.fileName,
    });
  }
  const orderedNames = unique([startup.name, ...startup.sceneList]);
  for (const scene of scenes) if (!orderedNames.includes(scene.name)) orderedNames.push(scene.name);
  for (const sceneName of startup.sceneList) {
    if (!byName.has(sceneName)) {
      issues.push({
        severity: 'error',
        code: 'missing_scene_file',
        message: `The *scene_list references "${sceneName}", but its .txt file was not selected.`,
        fileName: startup.fileName,
      });
    }
  }
  return orderedNames.flatMap((name) => (byName.has(name) ? [byName.get(name)!] : []));
}

class GraphBuilder {
  readonly nodes: DraftNode[] = [];
  readonly edges: DirectEdge[] = [];
  private readonly deferredEdges: DeferredEdge[] = [];
  private readonly anchors = new Map<string, string>();
  private nodeSequence = 0;

  constructor(
    private readonly finishSceneNames: string[],
    private readonly report: ChoiceScriptImportReport,
  ) {}

  compileScene(scene: ParsedScene) {
    if (scene.statements.length === 0) return;
    this.compileStatements(
      scene,
      scene.statements,
      [],
      [sceneAnchor(scene.name)],
      humanizeIdentifier(scene.name),
    );
  }

  finish() {
    for (const edge of this.deferredEdges) {
      const target = this.anchors.get(edge.anchor);
      if (!target) {
        addIssue(
          this.report,
          edge.source,
          'missing_jump_target',
          `The jump target "${displayAnchor(edge.anchor)}" was not found.`,
          'error',
        );
        continue;
      }
      this.connect(edge.from, target);
    }
    return { nodes: this.nodes, edges: this.edges };
  }

  private compileStatements(
    scene: ParsedScene,
    statements: Statement[],
    initialActive: string[],
    initialAnchors: string[],
    initialTitle: string,
  ): string[] {
    let active = [...initialActive];
    let pendingAnchors = [...initialAnchors];
    let pendingTitle = initialTitle;
    let terminated = false;
    let pendingEffects: SourceEffect[] = [];

    const createNode = (title: string, body: string, source: SourceLine) => {
      const node = this.addNode(scene, title, body, source);
      node.effects.push(...pendingEffects);
      pendingEffects = [];
      for (const predecessor of active) this.connect(predecessor, node.key);
      for (const anchor of pendingAnchors) this.defineAnchor(anchor, node.key, source);
      active = [node.key];
      pendingAnchors = [];
      pendingTitle = humanizeIdentifier(scene.name);
      terminated = false;
      return node;
    };

    for (let index = 0; index < statements.length; index += 1) {
      const statement = statements[index];
      if (statement.kind === 'declare' || statement.kind === 'set') {
        if (statement.kind === 'declare' && !statement.temporary) continue;
        const effect: SourceEffect = {
          name: statement.name,
          sceneName: scene.name,
          operation: statement.kind === 'set' ? statement.operation : 'set',
          value: statement.value,
          source: statement.source,
        };
        const activeNodes = active.flatMap((key) => {
          const node = this.nodes.find((candidate) => candidate.key === key);
          return node ? [node] : [];
        });
        if (activeNodes.length > 0) {
          for (const node of activeNodes) node.effects.push(effect);
        } else {
          pendingEffects.push(effect);
        }
        continue;
      }
      if (statement.kind === 'label') {
        const anchor = labelAnchor(scene.name, statement.name);
        pendingAnchors.push(anchor);
        pendingTitle = humanizeIdentifier(statement.name || 'label');
        terminated = false;
        continue;
      }
      if (statement.kind === 'text') {
        if (terminated && pendingAnchors.length === 0) continue;
        const text = passageText(statement.lines, this.report, statement.source);
        if (text) createNode(pendingTitle, text, statement.source);
        continue;
      }
      if (statement.kind === 'choice') {
        if (terminated && pendingAnchors.length === 0) continue;
        if (active.length === 0 || pendingAnchors.length > 0) {
          createNode(pendingTitle, '', statement.source);
        }
        const branchSource = [...active];
        const branchExits: string[] = [];
        for (const option of statement.options) {
          const optionStatements = [...option.statements];
          const firstText =
            optionStatements[0]?.kind === 'text' ? optionStatements.shift() : undefined;
          const optionNode = this.addNode(
            scene,
            option.title,
            firstText?.kind === 'text'
              ? passageText(firstText.lines, this.report, firstText.source)
              : '',
            option.source,
          );
          for (const predecessor of branchSource) {
            this.connect(predecessor, optionNode.key, option.condition);
          }
          branchExits.push(
            ...this.compileStatements(scene, optionStatements, [optionNode.key], [], option.title),
          );
        }
        active = unique(branchExits);
        terminated = active.length === 0;
        continue;
      }
      if (statement.kind === 'goto') {
        for (const from of active) {
          this.deferredEdges.push({
            from,
            anchor: labelAnchor(scene.name, statement.label),
            source: statement.source,
          });
        }
        active = [];
        terminated = true;
        continue;
      }
      if (statement.kind === 'gotoScene') {
        for (const from of active) {
          this.deferredEdges.push({
            from,
            anchor: statement.label
              ? labelAnchor(statement.scene, statement.label)
              : sceneAnchor(statement.scene),
            source: statement.source,
          });
        }
        active = [];
        terminated = true;
        continue;
      }
      if (statement.kind === 'finish') {
        const sceneIndex = this.finishSceneNames.indexOf(scene.name);
        const nextSceneName = this.finishSceneNames[sceneIndex + 1];
        if (nextSceneName) {
          for (const from of active) {
            this.deferredEdges.push({
              from,
              anchor: sceneAnchor(nextSceneName),
              source: statement.source,
            });
          }
        }
        active = [];
        terminated = true;
        continue;
      }
      if (statement.kind === 'ending') {
        active = [];
        terminated = true;
      }
    }
    if (pendingAnchors.length > 0)
      createNode(pendingTitle, '', statements.at(-1)?.source ?? fallbackSource(scene));
    return active;
  }

  private addNode(scene: ParsedScene, title: string, body: string, source: SourceLine): DraftNode {
    const node: DraftNode = {
      key: `node:${this.nodeSequence++}`,
      title: truncate(title.trim() || 'Untitled interaction', 200),
      body,
      sceneName: scene.name,
      sourceLine: source.number,
      effects: [],
    };
    this.nodes.push(node);
    return node;
  }

  private connect(from: string, to: string, condition?: SourceCondition) {
    if (
      from === to ||
      this.edges.some(
        (edge) =>
          edge.from === from &&
          edge.to === to &&
          JSON.stringify(edge.condition) === JSON.stringify(condition),
      )
    ) {
      return;
    }
    this.edges.push({ from, to, ...(condition ? { condition } : {}) });
  }

  private defineAnchor(anchor: string, nodeKey: string, source: SourceLine) {
    if (this.anchors.has(anchor)) {
      addIssue(
        this.report,
        source,
        'duplicate_label',
        `The label "${displayAnchor(anchor)}" is defined more than once.`,
        'error',
      );
      return;
    }
    this.anchors.set(anchor, nodeKey);
  }
}

function passageText(
  lines: string[],
  report: ChoiceScriptImportReport,
  source: SourceLine,
): string {
  const paragraphs: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(' '));
    current = [];
  };
  for (const line of lines) {
    if (line) current.push(line);
    else flush();
  }
  flush();
  let text = paragraphs.join('\n\n');
  if (text.length > MAX_IMPORTED_PASSAGE_TEXT_LENGTH) {
    addIssue(
      report,
      source,
      'passage_truncated',
      `A passage exceeded ${MAX_IMPORTED_PASSAGE_TEXT_LENGTH} characters and was truncated.`,
    );
    text = truncate(text, MAX_IMPORTED_PASSAGE_TEXT_LENGTH);
    report.approximatedCommandCount += 1;
  }
  const html = paragraphsFromText(text);
  return html.length <= MAX_INTERACTION_BODY_LENGTH
    ? html
    : paragraphsFromText(truncate(text, 8_000));
}

function paragraphsFromText(text: string) {
  return text
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(
        /\$\{([a-z_][a-z0-9_]*)\}/gi,
        (_match, name: string) =>
          `<span data-cs-variable="${escapeHtml(normalizeIdentifier(name))}"></span>`,
      );
      return `<p>${escaped}</p>`;
    })
    .join('');
}

function layoutGraph(nodes: DraftNode[], edges: DirectEdge[]) {
  const indegree = new Map(nodes.map(({ key }) => [key, 0]));
  const outgoing = new Map(nodes.map(({ key }) => [key, [] as string[]]));
  for (const edge of edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const depth = new Map(nodes.map(({ key }) => [key, 0]));
  const queue = nodes.filter(({ key }) => indegree.get(key) === 0).map(({ key }) => key);
  const processed = new Set<string>();
  while (queue.length > 0) {
    const key = queue.shift()!;
    processed.add(key);
    for (const target of outgoing.get(key) ?? []) {
      depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(key) ?? 0) + 1));
      indegree.set(target, (indegree.get(target) ?? 1) - 1);
      if (indegree.get(target) === 0) queue.push(target);
    }
  }
  let fallbackDepth = Math.max(0, ...depth.values());
  for (const node of nodes) if (!processed.has(node.key)) depth.set(node.key, ++fallbackDepth);
  const layers = new Map<number, string[]>();
  for (const node of nodes) {
    const layer = depth.get(node.key) ?? 0;
    layers.set(layer, [...(layers.get(layer) ?? []), node.key]);
  }
  const result = new Map<string, { x: number; y: number }>();
  for (const [layer, keys] of layers) {
    keys.forEach((key, index) => result.set(key, { x: 80 + index * 320, y: 120 + layer * 220 }));
  }
  return result;
}

function addIssue(
  report: ChoiceScriptImportReport,
  source: SourceLine,
  code: string,
  message: string,
  severity: ChoiceScriptImportIssue['severity'] = 'warning',
) {
  report.issues.push({ severity, code, message, fileName: source.fileName, line: source.number });
}

function normalizeIdentifier(value: string | undefined) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

function humanizeIdentifier(value: string) {
  const text = value.replace(/[_-]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Interaction';
}

function sceneAnchor(scene: string) {
  return `scene:${normalizeIdentifier(scene)}`;
}

function labelAnchor(scene: string, label: string) {
  return `${sceneAnchor(scene)}#${normalizeIdentifier(label)}`;
}

function displayAnchor(anchor: string) {
  return anchor.replace(/^scene:/, '').replace('#', ' / ');
}

function fallbackSource(scene: ParsedScene): SourceLine {
  return { fileName: scene.fileName, sceneName: scene.name, number: 1, indent: 0, text: '' };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

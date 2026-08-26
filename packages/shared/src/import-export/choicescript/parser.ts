import type { StatEffect, StatValue } from '../../model/stats.js';
import type { StatComparisonOperator } from '../../triggers/conditions.js';
import { escapeRegExp, normalizeIdentifier } from './helpers.js';
import type {
  ChoiceOption,
  ParsedScene,
  SourceCondition,
  SourceLine,
  Statement,
} from './models.js';
import { addChoiceScriptImportIssue, addChoiceScriptSourceIssue as addIssue } from './report.js';
import type { ChoiceScriptImportReport, ChoiceScriptSourceFile } from './types.js';

export function parseChoiceScriptScenes(
  files: ChoiceScriptSourceFile[],
  report: ChoiceScriptImportReport,
): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  const seenNames = new Set<string>();
  for (const file of files) {
    const sceneName = normalizeIdentifier(file.name.replace(/\.txt$/i, ''));
    if (!sceneName) {
      addChoiceScriptImportIssue(report, {
        severity: 'error',
        code: 'invalid_scene_name',
        message: `The file name "${file.name}" does not define a valid scene name.`,
        fileName: file.name,
      });
      continue;
    }
    if (seenNames.has(sceneName)) {
      addChoiceScriptImportIssue(report, {
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

import type { QspCodeAnalysis, QspSourcePosition } from './models.js';
import { parseQspAssignment } from './expressions.js';
import { consumedLiteralLength, findOutsideQuotes, parseQspStringLiteral } from './parser.js';
import { addQspSourceIssue, touchQspFeature } from './report.js';
import type { QspFeatureId, QspImportReport } from './types.js';

export function analyzeQspCode(
  lines: readonly string[],
  source: QspSourcePosition,
  report: QspImportReport,
): QspCodeAnalysis {
  const analysis: QspCodeAnalysis = { text: [], targetLocationNames: [], effects: [] };
  let unsupportedBlockDepth = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const sourceAtLine = { ...source, line: source.line + lineIndex };
    const trimmedLine = lines[lineIndex].trim();
    if (unsupportedBlockDepth > 0) {
      if (/^end\b/i.test(trimmedLine)) {
        unsupportedBlockDepth -= 1;
        continue;
      }
      if (/^(?:act|if|loop)\b.*:\s*$/i.test(trimmedLine)) unsupportedBlockDepth += 1;
      const category = classifyUnsupportedCommand(trimmedLine);
      unsupported(
        report,
        sourceAtLine,
        category.feature === 'dynamic_code' ? 'conditions' : category.feature,
        category.code === 'unsupported_statement'
          ? 'unsupported_conditional_block_statement'
          : category.code,
        category.code === 'unsupported_statement'
          ? 'A statement inside an unsupported QSP control block was not imported.'
          : category.message,
      );
      continue;
    }
    if (/^(?:if|loop)\b.*:\s*$/i.test(trimmedLine)) {
      const category = classifyUnsupportedCommand(trimmedLine);
      unsupported(report, sourceAtLine, category.feature, category.code, category.message);
      unsupportedBlockDepth = 1;
      continue;
    }
    const commands = splitQspCommands(lines[lineIndex]);
    for (const command of commands) {
      const trimmed = command.trim();
      if (!trimmed || trimmed.startsWith('!')) continue;
      const assignment = parseQspAssignment(trimmed, sourceAtLine);
      if (assignment.kind === 'parsed') {
        analysis.effects.push(assignment.effect);
        report.convertedStatementCount += 1;
        touchQspFeature(report, 'variables');
        continue;
      }
      if (assignment.kind === 'unsupported') {
        unsupported(
          report,
          sourceAtLine,
          'variables',
          'unsupported_variable_statement',
          assignment.message,
        );
        continue;
      }
      const output = /^(\*?p(?:l)?|nl)\b\s*(.*)$/i.exec(trimmed);
      if (output) {
        if (output[1].toLocaleLowerCase() === 'nl' && !output[2]) {
          analysis.text.push('');
          report.convertedStatementCount += 1;
          touchQspFeature(report, 'text_output');
          continue;
        }
        const literal = parseQspStringLiteral(output[2]);
        if (literal !== undefined && consumedLiteralLength(output[2]) === output[2].trim().length) {
          analysis.text.push(literal);
          report.convertedStatementCount += 1;
          touchQspFeature(report, 'text_output');
        } else {
          unsupported(
            report,
            { ...source, line: source.line + lineIndex },
            'text_output',
            'dynamic_text_expression',
            'A calculated QSP text expression was not imported.',
          );
        }
        continue;
      }
      const bareLiteral = parseQspStringLiteral(trimmed);
      if (bareLiteral !== undefined && consumedLiteralLength(trimmed) === trimmed.length) {
        analysis.text.push(bareLiteral);
        report.convertedStatementCount += 1;
        touchQspFeature(report, 'text_output');
        continue;
      }
      const navigation = /^(?:goto|gt)\b\s*(.*)$/i.exec(trimmed);
      if (navigation) {
        const targetExpression = navigation[1];
        const target = parseQspStringLiteral(targetExpression);
        if (!target || containsQspInterpolation(targetExpression)) {
          unsupported(
            report,
            { ...source, line: source.line + lineIndex },
            'navigation',
            'dynamic_navigation_target',
            'A calculated QSP location target could not be connected.',
          );
          continue;
        }
        analysis.targetLocationNames.push(target);
        report.convertedStatementCount += 1;
        touchQspFeature(report, 'navigation');
        const remainder = targetExpression.slice(consumedLiteralLength(targetExpression)).trim();
        if (remainder) {
          addQspSourceIssue(
            report,
            { ...source, line: source.line + lineIndex },
            'navigation_arguments_ignored',
            `Arguments passed to the location "${target}" were not imported.`,
          );
          report.approximatedStatementCount += 1;
        }
        continue;
      }
      if (/^(?:exit|end)\b/i.test(trimmed)) continue;
      const category = classifyUnsupportedCommand(trimmed);
      unsupported(
        report,
        { ...source, line: source.line + lineIndex },
        category.feature,
        category.code,
        category.message,
      );
    }
  }
  if (analysis.targetLocationNames.length > 1) {
    addQspSourceIssue(
      report,
      source,
      'multiple_linear_navigation_targets',
      'Several linear GOTO statements were found; all are shown as alternative graph paths.',
    );
    report.approximatedStatementCount += 1;
  }
  return analysis;
}

function containsQspInterpolation(value: string) {
  return /<<[\s\S]*?>>/.test(value);
}

function splitQspCommands(line: string): string[] {
  // QSP also uses `&` as an expression operator. Until calculated expressions are
  // supported, keep an entire assignment together so it is reported instead of
  // silently importing only the literal prefix as the assigned value.
  if (
    findOutsideQuotes(line, '&') >= 0 &&
    /^\s*(?:(?:set|let)\s+)?[$%]?[a-z_][a-z0-9_.]*(?:\s*\[[^\]]*\])?\s*(?:=|\+=|-=|\*=|\/=)/i.test(
      line,
    )
  ) {
    return [line];
  }

  const commands: string[] = [];
  let remaining = line;
  while (remaining) {
    const delimiter = findOutsideQuotes(remaining, '&');
    if (delimiter < 0) break;
    commands.push(remaining.slice(0, delimiter));
    remaining = remaining.slice(delimiter + 1);
  }
  commands.push(remaining);
  return commands;
}

function unsupported(
  report: QspImportReport,
  source: QspSourcePosition,
  feature: QspFeatureId,
  code: string,
  message: string,
) {
  addQspSourceIssue(report, source, code, message);
  report.unsupportedStatementCount += 1;
  touchQspFeature(report, feature);
}

function classifyUnsupportedCommand(command: string): {
  feature: QspFeatureId;
  code: string;
  message: string;
} {
  if (/^(?:if|elseif|else)\b/i.test(command))
    return {
      feature: 'conditions',
      code: 'unsupported_condition',
      message: 'This QSP conditional cannot be reduced to supported Trigger condition groups.',
    };
  if (/^(?:gosub|gs|func|return)\b/i.test(command))
    return {
      feature: 'subroutines',
      code: 'unsupported_subroutine',
      message:
        'QSP location calls, arguments, return values, and call stacks are not yet imported.',
    };
  if (/^(?:jump)\b|^:/i.test(command))
    return {
      feature: 'local_jumps',
      code: 'unsupported_local_jump',
      message: 'QSP local labels and JUMP control flow are not yet imported.',
    };
  if (/^(?:loop)\b/i.test(command))
    return {
      feature: 'loops',
      code: 'unsupported_loop',
      message: 'QSP loops are not executed during import.',
    };
  if (/^(?:dynamic)\b/i.test(command))
    return {
      feature: 'dynamic_code',
      code: 'unsupported_dynamic_code',
      message: 'Dynamically evaluated QSP code cannot be statically imported.',
    };
  if (/^(?:addobj|delobj|killobj|unselect)\b/i.test(command))
    return {
      feature: 'inventory',
      code: 'unsupported_inventory_or_action_state',
      message:
        'QSP inventory and mutable action state are not yet mapped to Paralleax items or triggers.',
    };
  if (/^(?:delact|cla)\b/i.test(command))
    return {
      feature: 'actions',
      code: 'unsupported_mutable_action_state',
      message: 'QSP action removal and clearing are not yet mapped to Trigger availability.',
    };
  if (/^(?:settimer)\b/i.test(command))
    return {
      feature: 'runtime_events',
      code: 'unsupported_runtime_timer',
      message: 'The QSP runtime timer and counter event are not yet imported.',
    };
  if (/^(?:play|close|view|msg|menu|showacts|showinput|showobjs|showstat|wait)\b/i.test(command))
    return {
      feature: 'media_and_ui',
      code: 'unsupported_media_or_ui',
      message: 'QSP media, menus, windows, and UI commands are not yet imported.',
    };
  if (/^(?:savegame|opengame|input|user_text)\b/i.test(command))
    return {
      feature: 'saves_and_input',
      code: 'unsupported_save_or_input',
      message: 'QSP save, load, and interactive input semantics are not yet imported.',
    };
  if (/^(?:inclib|freelib)\b/i.test(command))
    return {
      feature: 'libraries',
      code: 'unsupported_library',
      message: 'QSP libraries are not resolved by the single-game-file importer.',
    };
  if (/^(?:act)\b/i.test(command))
    return {
      feature: 'actions',
      code: 'unsupported_dynamic_action',
      message: 'This QSP action declaration could not be reduced to a static option.',
    };
  if (
    /^(?:set\b|let\b|local\b|killvar\b|[a-z_$%][a-z0-9_$%]*(?:\[[^\]]+\])?\s*(?:=|\+=|-=|\*=|\/=))/i.test(
      command,
    )
  )
    return {
      feature: 'variables',
      code: 'unsupported_variable_statement',
      message:
        'Only scalar or literal-index array assignments with literal values are currently mapped to typed Story stats.',
    };
  return {
    feature: 'dynamic_code',
    code: 'unsupported_statement',
    message: `The QSP statement "${command.slice(0, 80)}" was not imported.`,
  };
}

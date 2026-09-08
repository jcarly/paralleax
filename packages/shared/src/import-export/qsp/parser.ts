import type {
  ParsedActBlock,
  ParsedQspAction,
  ParsedQspLocation,
  QspSourceLocation,
} from './models.js';
import { readQsp, readQsps } from './converter.js';
import {
  andQspConditionGroups,
  negateQspConditionGroups,
  parseQspConditionExpression,
} from './expressions.js';
import { addQspImportIssue, addQspSourceIssue, touchQspFeature } from './report.js';
import type { QspImportReport, QspImportSource } from './types.js';

export function parseQspSource(
  source: QspImportSource,
  report: QspImportReport,
): ParsedQspLocation[] {
  const decodedFiles = decodeQspFiles(source, report);
  if (decodedFiles.length === 0) return [];

  const decodedLocations = decodedFiles.flatMap((file) =>
    file.locations.map((location, locationIndex) => ({
      location,
      fileName: file.name,
      codeLine: file.codeLines[locationIndex] ?? 1,
    })),
  );
  if (decodedLocations.length === 0) {
    addQspImportIssue(report, {
      severity: 'error',
      code: 'no_locations',
      message: 'The QSP source does not contain any readable location.',
      fileName: source.name,
    });
    return [];
  }

  const orderedLocations =
    source.format === 'locations' ? putLikelyEntryFirst(decodedLocations) : decodedLocations;
  const names = new Set<string>();
  const parsed = orderedLocations.flatMap(({ location, fileName, codeLine }, locationIndex) => {
    const name = location.name.trim();
    if (!name) {
      addQspImportIssue(report, {
        severity: 'error',
        code: 'empty_location_name',
        message: 'A QSP location has no name.',
        fileName,
      });
      return [];
    }
    const normalizedName = normalizeQspName(name);
    if (names.has(normalizedName)) {
      addQspImportIssue(report, {
        severity: 'error',
        code: 'duplicate_location',
        message: `The QSP location "${name}" is defined more than once.`,
        fileName,
        locationName: name,
      });
      return [];
    }
    names.add(normalizedName);
    const sourcePosition = { fileName, locationName: name, line: codeLine };
    const variants = extractLocationArgumentVariants(location.code, sourcePosition, report);
    const extracted = extractActBlocks(variants.baseCode, sourcePosition, report);
    const compiledActions = location.actions.map((action) => ({
      ...action,
      source: sourcePosition,
    }));
    const sourceActions = extracted.blocks.map(({ action, sourceLine, conditionGroups }) => ({
      ...action,
      source: { ...sourcePosition, line: sourceLine },
      ...(conditionGroups ? { conditionGroups } : {}),
    }));
    const locations: ParsedQspLocation[] = [
      {
        name,
        description: location.description,
        code: extracted.remainingCode,
        actions: deduplicateActions([...compiledActions, ...sourceActions]),
        source: sourcePosition,
      },
    ];
    for (const variant of variants.variants) {
      const variantExtracted = extractActBlocks(variant.code, variant.source, report);
      locations.push({
        name,
        entryArgument: variant.argument,
        description: [],
        code: variantExtracted.remainingCode,
        actions: variantExtracted.blocks.map(({ action, sourceLine, conditionGroups }) => ({
          ...action,
          source: { ...variant.source, line: sourceLine },
          ...(conditionGroups ? { conditionGroups } : {}),
        })),
        source: variant.source,
      });
    }
    if (/^\$/.test(name)) {
      addQspSourceIssue(
        report,
        sourcePosition,
        locationIndex === 0 ? 'service_location_as_entry' : 'service_location_semantics',
        locationIndex === 0
          ? 'The first QSP location looks like a service location but is imported as the Story entry.'
          : `The service-like location "${name}" is imported without its QSP runtime event semantics.`,
      );
      report.approximatedStatementCount += 1;
      touchQspFeature(report, 'runtime_events');
    }
    return locations;
  });
  report.locationCount = orderedLocations.length;
  report.actionCount = parsed.reduce((total, location) => total + location.actions.length, 0);
  touchQspFeature(report, 'locations', orderedLocations.length);
  touchQspFeature(report, 'actions', report.actionCount);
  return parsed;
}

function decodeQspFiles(
  source: QspImportSource,
  report: QspImportReport,
): Array<{ name: string; locations: QspSourceLocation[]; codeLines: number[] }> {
  if (source.format === 'locations') {
    return source.content.flatMap((file) => {
      const decoded = decodeTextQspFile(file.name, file.content, report);
      if (decoded[0]?.locations.length === 0) {
        addQspImportIssue(report, {
          severity: 'error',
          code: 'no_locations_in_source_file',
          message: 'The selected .qsrc file does not contain a readable QSP location.',
          fileName: file.name,
        });
        return [];
      }
      return decoded;
    });
  }
  try {
    if (source.format === 'binary') {
      if (!(source.content instanceof ArrayBuffer)) throw new Error('Expected binary content.');
      return [{ name: source.name, locations: readQsp(source.content), codeLines: [] }];
    }
    if (typeof source.content !== 'string') throw new Error('Expected UTF-8 text content.');
    return decodeTextQspFile(source.name, source.content, report);
  } catch (caught) {
    addQspImportIssue(report, {
      severity: 'error',
      code: 'invalid_qsp_file',
      message: caught instanceof Error ? caught.message : 'The QSP file could not be decoded.',
      fileName: source.name,
    });
    return [];
  }
}

function decodeTextQspFile(
  fileName: string,
  sourceContent: string,
  report: QspImportReport,
): Array<{ name: string; locations: QspSourceLocation[]; codeLines: number[] }> {
  const content = sourceContent.replace(/^\uFEFF/, '');
  try {
    return [
      {
        name: fileName,
        locations: readQsps(content),
        codeLines: findTextLocationCodeLines(content),
      },
    ];
  } catch (caught) {
    addQspImportIssue(report, {
      severity: 'error',
      code: 'invalid_qsp_file',
      message: caught instanceof Error ? caught.message : 'The QSP file could not be decoded.',
      fileName,
    });
    return [];
  }
}

function putLikelyEntryFirst<T extends { location: QspSourceLocation }>(locations: T[]) {
  const index = locations.findIndex(({ location }) => normalizeQspName(location.name) === 'start');
  if (index <= 0) return locations;
  return [locations[index], ...locations.slice(0, index), ...locations.slice(index + 1)];
}

function extractLocationArgumentVariants(
  lines: string[],
  source: { fileName: string; locationName: string; line: number },
  report: QspImportReport,
) {
  const baseCode = [...lines];
  const variants: Array<{
    argument: string;
    code: string[];
    source: { fileName: string; locationName: string; line: number };
  }> = [];
  const variantsByArgument = new Map<string, (typeof variants)[number]>();
  let outerBlockDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^end\b/i.test(trimmed) && outerBlockDepth > 0) {
      outerBlockDepth -= 1;
      continue;
    }
    if (outerBlockDepth > 0) {
      if (/^(?:act|if|loop)\b.*:\s*$/i.test(trimmed)) outerBlockDepth += 1;
      continue;
    }
    const opening = /^if\b\s*(.+):\s*$/i.exec(trimmed);
    const argument = opening ? parseLocationArgumentSelector(opening[1]) : undefined;
    if (argument === undefined) {
      if (/^(?:act|if|loop)\b.*:\s*$/i.test(trimmed)) outerBlockDepth += 1;
      continue;
    }
    const endIndex = findMultilineBlockEnd(lines, index, lines.length);
    if (endIndex === undefined) continue;
    baseCode[index] = '';
    baseCode[endIndex] = '';
    if (argument) {
      for (let removed = index + 1; removed < endIndex; removed += 1) baseCode[removed] = '';
      const code = lines.slice(index + 1, endIndex);
      const sourceLine = source.line + index + 1;
      const existing = variantsByArgument.get(argument);
      if (existing) {
        const gap = sourceLine - existing.source.line - existing.code.length;
        if (gap > 0) existing.code.push(...Array<string>(gap).fill(''));
        existing.code.push(...code);
      } else {
        const variant = {
          argument,
          code,
          source: { ...source, line: sourceLine },
        };
        variants.push(variant);
        variantsByArgument.set(argument, variant);
      }
    }
    index = endIndex;
    report.convertedStatementCount += 1;
    touchQspFeature(report, 'conditions');
  }
  return { baseCode, variants };
}

function parseLocationArgumentSelector(expression: string): string | undefined {
  const selector = /^\s*\$args\s*\[\s*0\s*\]\s*=\s*/i.exec(expression);
  if (!selector) return undefined;
  const literalExpression = expression.slice(selector[0].length).trim();
  const value = parseQspStringLiteral(literalExpression);
  return value !== undefined &&
    consumedLiteralLength(literalExpression) === literalExpression.length
    ? value
    : undefined;
}

function extractActBlocks(
  lines: string[],
  source: { fileName: string; locationName: string; line: number },
  report: QspImportReport,
): { blocks: ParsedActBlock[]; remainingCode: string[] } {
  const blocks: ParsedActBlock[] = [];
  const remainingCode: string[] = [];
  let outerBlockDepth = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (outerBlockDepth === 0) {
      const conditional = tryParseConditionalActions(lines, index, source);
      if (conditional) {
        blocks.push(...conditional.blocks);
        index = conditional.endIndex;
        report.convertedStatementCount +=
          conditional.blocks.length + conditional.controlStatementCount;
        touchQspFeature(report, 'conditions', conditional.conditionCount);
        continue;
      }
    }
    if (/^end\b/i.test(trimmed) && outerBlockDepth > 0) {
      outerBlockDepth -= 1;
      remainingCode.push(lines[index]);
      continue;
    }
    if (outerBlockDepth > 0) {
      if (/^(?:act|if|loop)\b.*:\s*$/i.test(trimmed)) outerBlockDepth += 1;
      remainingCode.push(lines[index]);
      continue;
    }
    if (/^(?:if|loop)\b.*:\s*$/i.test(trimmed)) {
      outerBlockDepth += 1;
      remainingCode.push(lines[index]);
      continue;
    }
    const header = parseActHeader(lines[index]);
    if (!header) {
      remainingCode.push(lines[index]);
      continue;
    }
    if (!header.name) {
      addQspSourceIssue(
        report,
        { ...source, line: source.line + index },
        'dynamic_action_name',
        'An action with a calculated name could not be converted.',
      );
      report.unsupportedStatementCount += 1;
      touchQspFeature(report, 'actions');
      remainingCode.push(lines[index]);
      continue;
    }
    const parsed = readActBlock(lines, index, lines.length, source, header);
    if (!parsed) {
      addQspSourceIssue(
        report,
        { ...source, line: source.line + index },
        'unterminated_action',
        `The action "${header.name}" has no matching END.`,
        'error',
      );
      break;
    }
    blocks.push(parsed.block);
    index = parsed.nextIndex;
    report.convertedStatementCount += 1;
  }
  return { blocks, remainingCode };
}

function tryParseConditionalActions(
  lines: string[],
  startIndex: number,
  source: { fileName: string; locationName: string; line: number },
):
  | {
      blocks: ParsedActBlock[];
      endIndex: number;
      conditionCount: number;
      controlStatementCount: number;
    }
  | undefined {
  const opening = /^\s*if\b\s*(.+):\s*$/i.exec(lines[startIndex]);
  if (!opening) return undefined;
  const endIndex = findMultilineBlockEnd(lines, startIndex, lines.length);
  if (endIndex === undefined) return undefined;
  const branches = parseConditionalBranches(lines, startIndex, endIndex, source, opening[1]);
  if (!branches) return undefined;
  const blocks: ParsedActBlock[] = [];
  let excludedGroups: NonNullable<ParsedActBlock['conditionGroups']> = [[]];
  let conditionCount = 0;
  for (const branch of branches) {
    let effectiveGroups = excludedGroups;
    if (branch.conditionGroups) {
      conditionCount += branch.conditionGroups.reduce((total, group) => total + group.length, 0);
      const combined = andQspConditionGroups(excludedGroups, branch.conditionGroups);
      const negated = negateQspConditionGroups(branch.conditionGroups);
      if (!combined || !negated) return undefined;
      effectiveGroups = combined;
      const nextExcluded = andQspConditionGroups(excludedGroups, negated);
      if (!nextExcluded) return undefined;
      excludedGroups = nextExcluded;
    }
    const branchBlocks = readActionOnlyBranch(lines, branch.startIndex, branch.endIndex, source);
    if (!branchBlocks) return undefined;
    blocks.push(...branchBlocks.map((block) => ({ ...block, conditionGroups: effectiveGroups })));
  }
  if (blocks.length === 0) return undefined;
  return {
    blocks,
    endIndex,
    conditionCount,
    controlStatementCount: branches.length,
  };
}

function parseConditionalBranches(
  lines: string[],
  startIndex: number,
  endIndex: number,
  source: { fileName: string; locationName: string; line: number },
  openingExpression: string,
) {
  const openingGroups = parseQspConditionExpression(openingExpression, {
    ...source,
    line: source.line + startIndex,
  });
  if (!openingGroups) return undefined;
  const branches: Array<{
    startIndex: number;
    endIndex: number;
    conditionGroups?: NonNullable<ParsedActBlock['conditionGroups']>;
  }> = [{ startIndex: startIndex + 1, endIndex, conditionGroups: openingGroups }];
  let depth = 1;
  let hasElse = false;
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const trimmed = lines[index].trim();
    if (/^end\b/i.test(trimmed)) {
      depth -= 1;
      continue;
    }
    if (depth === 1) {
      const elseif = /^\s*(?:elseif|else\s+if)\b\s*(.+):\s*$/i.exec(lines[index]);
      if (elseif) {
        if (hasElse) return undefined;
        const conditionGroups = parseQspConditionExpression(elseif[1], {
          ...source,
          line: source.line + index,
        });
        if (!conditionGroups) return undefined;
        branches.at(-1)!.endIndex = index;
        branches.push({ startIndex: index + 1, endIndex, conditionGroups });
        continue;
      }
      if (/^\s*else\s*:?\s*$/i.test(lines[index])) {
        if (hasElse) return undefined;
        hasElse = true;
        branches.at(-1)!.endIndex = index;
        branches.push({ startIndex: index + 1, endIndex });
        continue;
      }
    }
    if (/^(?:act|if|loop)\b.*:\s*$/i.test(trimmed)) depth += 1;
  }
  return branches;
}

function readActionOnlyBranch(
  lines: string[],
  startIndex: number,
  endIndex: number,
  source: { fileName: string; locationName: string; line: number },
) {
  const blocks: ParsedActBlock[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith('!')) continue;
    const header = parseActHeader(lines[index]);
    if (!header?.name) return undefined;
    const parsed = readActBlock(lines, index, endIndex, source, header);
    if (!parsed) return undefined;
    blocks.push(parsed.block);
    index = parsed.nextIndex;
  }
  return blocks;
}

function readActBlock(
  lines: string[],
  startIndex: number,
  limit: number,
  source: { fileName: string; locationName: string; line: number },
  header: { name?: string; image?: string; inlineCode?: string },
): { block: ParsedActBlock; nextIndex: number } | undefined {
  if (!header.name) return undefined;
  if (header.inlineCode) {
    const line = source.line + startIndex;
    return {
      block: {
        action: {
          name: header.name,
          ...(header.image ? { image: header.image } : {}),
          code: [header.inlineCode],
        },
        sourceLine: line,
        endLine: line,
      },
      nextIndex: startIndex,
    };
  }
  const endIndex = findMultilineBlockEnd(lines, startIndex, limit);
  if (endIndex === undefined) return undefined;
  return {
    block: {
      action: {
        name: header.name,
        ...(header.image ? { image: header.image } : {}),
        code: lines.slice(startIndex + 1, endIndex),
      },
      sourceLine: source.line + startIndex,
      endLine: source.line + endIndex,
    },
    nextIndex: endIndex,
  };
}

function findMultilineBlockEnd(lines: string[], startIndex: number, limit: number) {
  let depth = 1;
  for (let index = startIndex + 1; index < limit; index += 1) {
    const trimmed = lines[index].trim();
    if (/^end\b/i.test(trimmed)) {
      depth -= 1;
      if (depth === 0) return index;
      continue;
    }
    if (/^(?:act|if|loop)\b.*:\s*$/i.test(trimmed)) depth += 1;
  }
  return undefined;
}

function parseActHeader(
  line: string,
): { name?: string; image?: string; inlineCode?: string } | null {
  const match = /^\s*act\b\s*(.*)$/i.exec(line);
  if (!match) return null;
  const colon = findOutsideQuotes(match[1], ':');
  if (colon < 0) return {};
  const argumentsText = match[1].slice(0, colon).trim();
  const inlineCode = match[1].slice(colon + 1).trim();
  const name = parseQspStringLiteral(argumentsText);
  if (!name) return {};
  const afterName = argumentsText.slice(consumedLiteralLength(argumentsText)).trim();
  const image = afterName.startsWith(',')
    ? parseQspStringLiteral(afterName.slice(1).trim())
    : undefined;
  return { name, ...(image ? { image } : {}), ...(inlineCode ? { inlineCode } : {}) };
}

function deduplicateActions(actions: ParsedQspAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const signature = JSON.stringify([
      action.name,
      action.image ?? '',
      action.code,
      action.conditionGroups ?? [],
    ]);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function parseQspStringLiteral(value: string): string | undefined {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') return undefined;
  let result = '';
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) {
      result += value[index];
      continue;
    }
    if (value[index + 1] === quote) {
      result += quote;
      index += 1;
      continue;
    }
    return result;
  }
  return undefined;
}

export function consumedLiteralLength(value: string): number {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') return 0;
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) continue;
    if (value[index + 1] === quote) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return 0;
}

export function findOutsideQuotes(value: string, delimiter: string): number {
  let quote = '';
  let braces = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) {
        if (value[index + 1] === quote) index += 1;
        else quote = '';
      }
      continue;
    }
    if (character === "'" || character === '"') quote = character;
    else if (character === '{') braces += 1;
    else if (character === '}') braces = Math.max(0, braces - 1);
    else if (character === delimiter && braces === 0) return index;
  }
  return -1;
}

export function normalizeQspName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function findTextLocationCodeLines(content: string) {
  const result: number[] = [];
  let inLocation = false;
  content.split(/\r?\n/).forEach((line, index) => {
    if (!inLocation && line.startsWith('#')) {
      result.push(index + 2);
      inLocation = true;
    } else if (inLocation && line.startsWith('-')) {
      inLocation = false;
    }
  });
  return result;
}

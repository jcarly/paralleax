/**
 * Removes non-executable QSP source while preserving physical lines. Keeping
 * one output entry per input entry lets later parser and report stages retain
 * their source positions without treating comments or multiline strings as
 * executable statements.
 */
export function lexQspLines(lines: readonly string[]): string[] {
  const state: QspLexState = { blockComment: false, stringQuote: undefined };
  return lines.map((line) => lexQspLine(line, state));
}

type QspLexState = {
  blockComment: boolean;
  stringQuote: "'" | '"' | undefined;
};

function lexQspLine(line: string, state: QspLexState): string {
  let executable = '';
  const continuesMultilineString = Boolean(state.stringQuote);

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (state.blockComment) {
      if (character === '!' && line[index + 1] === '}') {
        state.blockComment = false;
        index += 1;
      }
      continue;
    }

    if (state.stringQuote) {
      if (character === state.stringQuote && line[index + 1] === state.stringQuote) {
        if (!continuesMultilineString) {
          executable += `${character}${line[index + 1]}`;
        }
        index += 1;
        continue;
      }
      if (character === state.stringQuote) {
        if (!continuesMultilineString) {
          executable += character;
        }
        state.stringQuote = undefined;
        continue;
      }
      if (!continuesMultilineString) {
        executable += character;
      }
      continue;
    }

    if (character === '!' && line[index + 1] === '{') {
      state.blockComment = true;
      index += 1;
      continue;
    }
    if (character === '!' && !isQspNotEqualOperator(line, index)) {
      break;
    }

    executable += character;
    if (character === "'" || character === '"') {
      state.stringQuote = character;
    }
  }

  return executable;
}

function isQspNotEqualOperator(line: string, index: number) {
  const statementStart =
    Math.max(line.lastIndexOf('&', index - 1), line.lastIndexOf(':', index - 1)) + 1;
  if (!/^\s*(?:if|elseif)\b/i.test(line.slice(statementStart, index))) {
    return false;
  }
  return line.slice(index + 1).includes(':');
}

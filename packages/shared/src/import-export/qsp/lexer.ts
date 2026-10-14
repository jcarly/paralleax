/**
 * Removes non-executable QSP source while preserving physical lines. Keeping
 * one output entry per input entry lets later parser and report stages retain
 * their source positions without treating comments or multiline strings as
 * executable statements.
 */
export function lexQspLines(lines: readonly string[]): string[] {
  const executableLines: string[] = [];
  let blockComment = false;
  let stringQuote: "'" | '"' | undefined;

  for (const line of lines) {
    let executable = '';
    const continuesMultilineString = Boolean(stringQuote);

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (blockComment) {
        if (character === '!' && line[index + 1] === '}') {
          blockComment = false;
          index += 1;
        }
        continue;
      }

      if (stringQuote) {
        if (character === stringQuote && line[index + 1] === stringQuote) {
          if (!continuesMultilineString) executable += `${character}${line[index + 1]}`;
          index += 1;
          continue;
        }
        if (character === stringQuote) {
          if (!continuesMultilineString) executable += character;
          stringQuote = undefined;
          continue;
        }
        if (!continuesMultilineString) executable += character;
        continue;
      }

      if (character === '!' && line[index + 1] === '{') {
        blockComment = true;
        index += 1;
        continue;
      }
      if (character === '!') break;

      executable += character;
      if (character === "'" || character === '"') stringQuote = character;
    }

    executableLines.push(executable);
  }

  return executableLines;
}

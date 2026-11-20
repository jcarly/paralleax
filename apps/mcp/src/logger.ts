/**
 * Diagnostics go to stderr: stdout carries the MCP protocol. Entries hold tool
 * names, identifiers, outcomes and API request IDs, never tokens or story text.
 */
export interface ToolLogEntry {
  tool: string;
  outcome: 'ok' | 'error';
  storyId?: string;
  code?: string;
  requestId?: string;
  durationMs: number;
}

export interface ToolLogger {
  log(entry: ToolLogEntry): void;
}

export function createToolLogger(
  write: (line: string) => void = (line) => process.stderr.write(line),
): ToolLogger {
  return {
    log(entry) {
      write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
    },
  };
}

export const silentToolLogger: ToolLogger = { log: () => undefined };

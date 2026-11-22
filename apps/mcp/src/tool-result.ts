import type { CallToolResult } from '@modelcontextprotocol/server';
import { ParalleaxApiError } from './api-client.js';
import { ConfigurationError } from './config.js';

/** A structured, client-safe tool failure. Never carries tokens or stack traces. */
export interface ToolErrorPayload {
  code: string;
  message: string;
  status?: number;
  requestId?: string;
  details?: unknown;
  hint?: string;
}

/** Thrown by tool handlers for failures they detect or for partially applied writes. */
export class ToolError extends Error {
  override readonly name = 'ToolError';

  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const hints: Partial<Record<string, string>> = {
  AUTHENTICATION_REQUIRED:
    'The Paralleax session is missing or expired. Ask the user to run "paralleax-mcp login".',
  FORBIDDEN: 'The signed-in user cannot perform this action on this story.',
  STORY_NOT_FOUND: 'Call list_stories to find a story the user can access.',
  TRIGGER_CONNECTION_EXISTS:
    'Another Trigger already connects these Interactions; reuse it instead of adding one.',
  RATE_LIMITED: 'The Paralleax API rate limit was reached. Wait a minute before retrying.',
  API_UNREACHABLE: 'Check that the Paralleax API is running and PARALLEAX_API_URL is correct.',
  WRITE_OUTCOME_UNKNOWN:
    'Call commit_story_changes again with the same proposalId: a proposal already applied is reported as already_applied, never applied twice.',
  STORY_REVISION_CONFLICT:
    'The story changed since the preview. Read it again, rebuild the batch and preview it; do not reuse this proposal.',
  STORY_CHANGE_PROPOSAL_NOT_FOUND:
    'Proposals expire one hour after their preview and belong to the user and story that previewed them. Preview the batch again, then commit.',
  STORY_CHANGES_INVALID:
    'The batch is invalid; read details.diagnostics and preview a corrected batch.',
};

export function toolSuccess(payload: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function apiErrorPayload(error: ParalleaxApiError): ToolErrorPayload {
  const hint = hints[error.code] ?? (error.status === 403 ? hints.FORBIDDEN : undefined);
  return {
    code: error.code,
    message: error.message,
    status: error.status,
    ...(error.requestId === undefined ? {} : { requestId: error.requestId }),
    ...(error.details === undefined ? {} : { details: error.details }),
    ...(hint === undefined ? {} : { hint }),
  };
}

function localErrorPayload(error: unknown): ToolErrorPayload {
  if (error instanceof ToolError) {
    const hint = hints[error.code];
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
      ...(hint === undefined ? {} : { hint }),
    };
  }
  if (error instanceof ConfigurationError) {
    return { code: 'CONFIGURATION_ERROR', message: error.message };
  }
  return { code: 'INTERNAL_ERROR', message: 'The Paralleax MCP server failed unexpectedly' };
}

export function toolErrorPayload(error: unknown): ToolErrorPayload {
  return error instanceof ParalleaxApiError ? apiErrorPayload(error) : localErrorPayload(error);
}

export function toolFailure(error: unknown): CallToolResult {
  const payload = toolErrorPayload(error);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: payload }, null, 2) }],
    structuredContent: { error: payload },
  };
}

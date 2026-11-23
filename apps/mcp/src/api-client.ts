import type { z } from 'zod';
import { errorBodySchema } from './api-contract.js';
import { apiEndpoint } from './config.js';
import { sessionCookieHeader } from './session-cookie.js';

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

/** Paralleax API error contract: `{ status, code, message, requestId, details? }`. */
export class ParalleaxApiError extends Error {
  override readonly name = 'ParalleaxApiError';
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId;
    this.details = init.details;
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  apiUrl: URL;
  sessionToken: string | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export type QueryValue = string | number | undefined;
type Schema<T> = z.ZodType<T, unknown>;

const DEFAULT_TIMEOUT_MS = 15_000;
const USER_AGENT = 'paralleax-mcp/0.1';

export const defaultFetch: FetchLike = (input, init) => fetch(input, init);

async function readJson(response: Response): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    return undefined;
  }
}

/** The request got no HTTP response: the API is down or the URL is wrong. */
export function apiUnreachableError(apiUrl: URL): ParalleaxApiError {
  return new ParalleaxApiError({
    status: 503,
    code: 'API_UNREACHABLE',
    message: `The Paralleax API at ${apiUrl.origin} could not be reached`,
  });
}

/** Converts an API error response, keeping only the documented public fields. */
export async function apiErrorFromResponse(response: Response): Promise<ParalleaxApiError> {
  const parsed = errorBodySchema.safeParse(await readJson(response));
  const body = parsed.success ? parsed.data : {};
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  return new ParalleaxApiError({
    status: response.status,
    code: body.code ?? `HTTP_${response.status}`,
    message: message ?? 'Request failed',
    requestId: body.requestId,
    details: body.details,
  });
}

export function parseApiResponse<T>(schema: Schema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ParalleaxApiError({
      status: 502,
      code: 'API_CONTRACT_MISMATCH',
      message: 'The Paralleax API returned an unexpected response',
    });
  }
  return parsed.data;
}

/**
 * Minimal client for the Paralleax HTTP API. Every call goes through the API's
 * guards (session, rate limits, validation, story access), so the MCP server
 * never makes an authorization decision of its own.
 */
export class ParalleaxApiClient {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(
    path: string,
    schema: Schema<T>,
    query: Record<string, QueryValue> = {},
  ): Promise<T> {
    return parseApiResponse(schema, await this.request('GET', this.url(path, query)));
  }

  async post<T>(path: string, body: unknown, schema: Schema<T>): Promise<T> {
    return parseApiResponse(schema, await this.request('POST', this.url(path), body));
  }

  async patch<T>(path: string, body: unknown, schema: Schema<T>): Promise<T> {
    return parseApiResponse(schema, await this.request('PATCH', this.url(path), body));
  }

  private async request(method: string, url: string, body?: unknown): Promise<unknown> {
    if (this.options.sessionToken === undefined) {
      throw new ParalleaxApiError({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
        message: 'No Paralleax session is configured; run "paralleax-mcp login"',
      });
    }
    const headers: Record<string, string> = {
      ...sessionCookieHeader(this.options.sessionToken),
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await this.send(method, url, headers, body);
    if (!response.ok) {
      throw await apiErrorFromResponse(response);
    }
    return readJson(response);
  }

  private async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        // A redirect could forward the session cookie to another server.
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (method !== 'GET' && error instanceof Error && error.name === 'TimeoutError') {
        // The request may have reached the API: retrying could write twice.
        throw new ParalleaxApiError({
          status: 504,
          code: 'WRITE_OUTCOME_UNKNOWN',
          message: 'The Paralleax API did not answer in time; the change may have been saved',
        });
      }
      throw apiUnreachableError(this.options.apiUrl);
    }
  }

  private url(path: string, query: Record<string, QueryValue> = {}): string {
    const url = new URL(apiEndpoint(this.options.apiUrl, path));
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.href;
  }
}

/** Encodes a caller-provided identifier as a single URL path segment. */
export function pathSegment(value: string): string {
  return encodeURIComponent(value);
}

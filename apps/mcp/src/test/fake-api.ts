import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach } from 'vitest';
import { z } from 'zod';
import { ParalleaxApiClient, type FetchLike } from '../api-client.js';
import { parseApiUrl } from '../config.js';
import type { ToolLogEntry } from '../logger.js';
import { createParalleaxMcpServer } from '../server.js';

/** One recorded HTTP request sent by the MCP server to the stubbed API. */
export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export type RouteResponse = { status?: number; body: unknown };
export type Route = (request: RecordedRequest) => RouteResponse | undefined;

export const API_URL = 'http://localhost:3000/api';
export const TEST_TOKEN = 'secret-session-token';

const jsonObject = z.record(z.string(), z.unknown());

function requestBody(init: RequestInit): Record<string, unknown> {
  return typeof init.body === 'string' ? jsonObject.parse(JSON.parse(init.body)) : {};
}

/**
 * Canned HTTP responses keyed by "METHOD /path". This stubs the network edge
 * only; Paralleax behavior itself is covered against the real API in the
 * end-to-end spec.
 */
export function stubFetch(routes: Record<string, Route | RouteResponse>) {
  const requests: RecordedRequest[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    const url = new URL(input);
    const request: RecordedRequest = {
      method: init.method ?? 'GET',
      path: url.pathname.replace(/^\/api/, ''),
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(new Headers(init.headers)),
      body: requestBody(init),
    };
    requests.push(request);
    const route = routes[`${request.method} ${request.path}`];
    const response = typeof route === 'function' ? route(request) : route;
    const { status = 200, body } = response ?? {
      status: 404,
      body: { status: 404, code: 'NOT_FOUND', message: 'Not found', requestId: 'req-404' },
    };
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  };
  return { fetchImpl, requests };
}

export async function connectClient(
  fetchImpl: FetchLike,
  options: { sessionToken?: string | null } = {},
) {
  const logs: ToolLogEntry[] = [];
  const api = new ParalleaxApiClient({
    apiUrl: parseApiUrl(API_URL),
    sessionToken: options.sessionToken === null ? undefined : (options.sessionToken ?? TEST_TOKEN),
    fetch: fetchImpl,
  });
  const server = createParalleaxMcpServer({ api, logger: { log: (entry) => logs.push(entry) } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'paralleax-mcp-test', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    logs,
    async call(name: string, args: Record<string, unknown>) {
      const result = await client.callTool({ name, arguments: args });
      return { isError: result.isError === true, data: result.structuredContent };
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}

export function interaction(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Interaction ${id}`,
    body: `<p>Body of ${id}</p>`,
    position: { x: 80, y: 120 },
    triggers: [
      {
        id: `trigger-${id}`,
        inputInteractionIds: [],
        conditionGroups: [{ id: `group-${id}`, conditions: [] }],
        appearanceProbability: 100,
        timerSeconds: null,
      },
    ],
    ...overrides,
  };
}

/** Connects a client per test and closes it after each test of the file. */
export function connectPerTest() {
  let current: Awaited<ReturnType<typeof connectClient>> | undefined;
  afterEach(async () => {
    await current?.close();
    current = undefined;
  });
  return async (...args: Parameters<typeof connectClient>) => {
    current = await connectClient(...args);
    return current;
  };
}

/** Builds the API error body returned by the exception filter. */
export function apiError(status: number, code: string, message = code, requestId = 'request-id') {
  return { status, body: { status, code, message, requestId } };
}

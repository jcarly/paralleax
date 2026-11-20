import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { apiEndpoint, parseApiUrl } from '../config.js';
import { sessionCookieHeader, sessionTokenFromSetCookie } from '../session-cookie.js';

/** Direct API calls used to set up and inspect end-to-end scenarios. */
const configured = process.env.PARALLEAX_MCP_E2E_API_URL;
export const e2eApiUrl =
  configured === undefined || configured === '' ? undefined : parseApiUrl(configured);
const apiUrl = e2eApiUrl ?? parseApiUrl('http://localhost:3000/api');

export interface Account {
  email: string;
  token: string;
}

const storySchema = z.looseObject({
  id: z.string(),
  revision: z.number(),
  interactions: z.array(
    z.looseObject({
      id: z.string(),
      title: z.string(),
      triggers: z.array(
        z.looseObject({ id: z.string(), inputInteractionIds: z.array(z.string()) }),
      ),
    }),
  ),
});

export function e2eUrl(): URL {
  return apiUrl;
}

export async function rest(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(apiEndpoint(apiUrl, path), {
    method,
    headers: { ...sessionCookieHeader(token), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json: unknown = response.status === 204 ? undefined : await response.json();
  return { status: response.status, json };
}

export async function readStory(token: string, storyId: string) {
  return storySchema.parse((await rest(token, 'GET', `/stories/${storyId}`)).json);
}

/** Registers a verified account (development APIs skip email verification). */
export async function register(label: string): Promise<Account> {
  const email = `mcp-${label}-${randomUUID()}@paralleax.invalid`;
  const response = await fetch(apiEndpoint(apiUrl, '/auth/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery', displayName: `MCP ${label}` }),
  });
  const token = sessionTokenFromSetCookie(response.headers.getSetCookie());
  if (token === undefined) {
    throw new Error(`Registration failed with status ${response.status}`);
  }
  return { email, token };
}

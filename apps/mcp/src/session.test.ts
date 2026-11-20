import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { apiEndpoint, parseApiUrl } from './config.js';
import { login, logout } from './login.js';
import { sessionTokenFromSetCookie } from './session-cookie.js';
import { resolveSessionToken, writeStoredSession } from './session-store.js';

const directories: string[] = [];
const localApi = parseApiUrl('http://localhost:3000/api');
const credentials = { email: 'author@example.test', password: 'password' };
const posixIt = process.platform === 'win32' ? it.skip : it;

async function storedSessionFile() {
  const file = await tempFile();
  await writeStoredSession(file, { apiUrl: localApi.href, token: 'stored', createdAt: 'now' });
  return file;
}

async function tempFile() {
  const directory = await mkdtemp(join(tmpdir(), 'paralleax-mcp-'));
  directories.push(directory);
  return join(directory, 'nested', 'session.json');
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

it('only accepts https or loopback API URLs without embedded credentials', () => {
  expect(parseApiUrl('http://localhost:3000/api/').href).toBe('http://localhost:3000/api');
  expect(parseApiUrl('https://paralleax.example/api').origin).toBe('https://paralleax.example');
  expect(() => parseApiUrl('http://paralleax.example/api')).toThrow(/https/);
  expect(() => parseApiUrl('https://user:pass@paralleax.example/api')).toThrow(/credentials/);
  expect(() => parseApiUrl('not a url')).toThrow(/absolute/);
  expect(apiEndpoint(parseApiUrl('https://paralleax.example'), '/stories')).toBe(
    'https://paralleax.example/stories',
  );
});

it('extracts only the Paralleax session cookie', () => {
  expect(
    sessionTokenFromSetCookie(['other=1; Path=/', 'paralleax_session=abc; HttpOnly; Path=/']),
  ).toBe('abc');
  expect(sessionTokenFromSetCookie(['paralleax_session=; Max-Age=0'])).toBeUndefined();
});

it('stores the session privately and never sends it to another API origin', async () => {
  const file = await tempFile();
  await writeStoredSession(file, { apiUrl: localApi.href, token: 'stored', createdAt: 'now' });
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(await resolveSessionToken(localApi, {}, file)).toBe('stored');
  expect(await resolveSessionToken(localApi, { PARALLEAX_SESSION_TOKEN: 'env' }, file)).toBe('env');
  await expect(
    resolveSessionToken(parseApiUrl('https://other.example/api'), {}, file),
  ).rejects.toThrow(/belongs to/);
  expect(await resolveSessionToken(localApi, {}, join(file, '..', 'none.json'))).toBeUndefined();
});

it('logs in through the regular endpoint, then revokes and deletes the session', async () => {
  const file = await tempFile();
  const calls: string[] = [];
  const fetchImpl = (input: string, init: RequestInit) => {
    calls.push(`${init.method ?? 'GET'} ${input}`);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', 'paralleax_session=fresh-token; HttpOnly; Path=/');
    const user = JSON.stringify({ id: 'u1', displayName: 'Author' });
    return Promise.resolve(new Response(user, { headers }));
  };
  const user = await login(localApi, credentials, file, fetchImpl);
  expect(user.displayName).toBe('Author');
  expect(await readFile(file, 'utf8')).toContain('fresh-token');
  expect(await logout(file, { fetch: fetchImpl })).toBe(true);
  await expect(stat(file)).rejects.toThrow();
  expect(calls).toEqual([
    'POST http://localhost:3000/api/auth/login',
    'POST http://localhost:3000/api/auth/logout',
  ]);
});

it('surfaces login failures from the API and stores nothing', async () => {
  const file = await tempFile();
  const body = JSON.stringify({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid' });
  const fetchImpl = () => Promise.resolve(new Response(body, { status: 401 }));
  await expect(login(localApi, credentials, file, fetchImpl)).rejects.toMatchObject({
    code: 'INVALID_CREDENTIALS',
  });
  await expect(stat(file)).rejects.toThrow();
});

posixIt('refuses a session file other OS users can read', async () => {
  const file = await storedSessionFile();
  await chmod(file, 0o644);
  await expect(resolveSessionToken(localApi, {}, file)).rejects.toThrow(/other users/);
  expect(await resolveSessionToken(localApi, {}, file, { checkPermissions: false })).toBe('stored');
});

it('keeps the session file when the API cannot revoke the session', async () => {
  const file = await storedSessionFile();
  const unreachable = () => Promise.reject(new Error('offline'));
  const refused = () => Promise.resolve(new Response(null, { status: 500 }));
  for (const fetchImpl of [unreachable, refused]) {
    await expect(logout(file, { fetch: fetchImpl })).rejects.toMatchObject({
      code: 'SESSION_REVOCATION_FAILED',
    });
    expect((await stat(file)).isFile()).toBe(true);
  }
});

it('deletes only the local file with localOnly, without calling the API', async () => {
  const file = await storedSessionFile();
  await chmod(file, 0o644);
  const calls: string[] = [];
  const fetchImpl = (input: string) => {
    calls.push(input);
    return Promise.resolve(new Response(null, { status: 204 }));
  };
  expect(await logout(file, { localOnly: true, fetch: fetchImpl })).toBe(false);
  await expect(stat(file)).rejects.toThrow();
  expect(calls).toEqual([]);
  expect(await logout(file, { fetch: fetchImpl })).toBe(false);
});

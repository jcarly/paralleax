import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDeployment } from './deployment-smoke.mjs';

test('deployment smoke checks require the web and both API probes', async () => {
  const requested = [];
  const fetchImpl = async (url) => {
    requested.push(url.toString());
    return url.pathname === '/healthz'
      ? new Response('ok\n', { status: 200 })
      : Response.json({ status: 'ok' });
  };

  await assert.doesNotReject(() =>
    checkDeployment('https://alpha.example.com', { fetchImpl, signal: AbortSignal.timeout(1000) }),
  );
  assert.deepEqual(requested, [
    'https://alpha.example.com/healthz',
    'https://alpha.example.com/api/health',
    'https://alpha.example.com/api/ready',
  ]);
});

test('deployment smoke checks refuse insecure public URLs and unhealthy probes', async () => {
  await assert.rejects(() => checkDeployment('http://alpha.example.com'), /require HTTPS/);
  await assert.rejects(
    () =>
      checkDeployment('https://alpha.example.com', {
        fetchImpl: async () => new Response('unavailable', { status: 503 }),
      }),
    /returned HTTP 503/,
  );
});

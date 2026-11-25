import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const uploadLimit = 33 * 1024 * 1024;
const image = process.argv[2] ?? 'paralleax-web:ci';
const containerName = `paralleax-native-proxy-${process.pid}-${randomUUID().slice(0, 8)}`;
const requestsSeen = [];
const api = createServer((request, response) => {
  void handleApiRequest(request, response, requestsSeen);
});

await listen(api);
let containerStarted = false;
try {
  const apiPort = api.address()?.port;
  assert.equal(typeof apiPort, 'number');
  const dockerGateway = execFileSync(
    'docker',
    ['network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}'],
    { encoding: 'utf8' },
  ).trim();
  assert.match(dockerGateway, /^\d{1,3}(?:\.\d{1,3}){3}$/);
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--publish',
      '127.0.0.1::8080',
      '--env',
      `API_HOST=${dockerGateway}`,
      '--env',
      `API_PORT=${apiPort}`,
      '--env',
      'PORT=8080',
      '--env',
      'NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1',
      '--env',
      'NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx',
      '--env',
      'VITE_POSTHOG_API_HOST=',
      '--env',
      'SENTRY_DSN=',
      '--env',
      'SENTRY_CSP_ORIGIN=',
      image,
    ],
    { stdio: 'inherit' },
  );
  containerStarted = true;
  const proxyUrl = await waitForProxy(containerName);
  await verifyRuntimeConfigurations(proxyUrl, dockerGateway, apiPort);
  await verifyAcceptedFiles(proxyUrl, requestsSeen);
  await verifyRejectedFiles(proxyUrl, requestsSeen);
  process.stdout.write(
    'Production Nginx forwarded valid Story uploads above 128 KiB and rejected files over 33 MiB.\n',
  );
} finally {
  if (containerStarted) {
    try {
      execFileSync('docker', ['stop', containerName], { stdio: 'ignore' });
    } catch {
      // The container can exit itself after a failed Nginx startup.
    }
  }
  await close(api);
}

async function verifyRuntimeConfigurations(stagingUrl, gateway, apiPort) {
  const stageResponse = await fetch(`${stagingUrl}/runtime-config.json`);
  assert.equal(stageResponse.status, 200);
  assert.match(stageResponse.headers.get('cache-control'), /no-store/);
  const stage = await stageResponse.json();
  assert.equal(stage.sentryDsn, null);
  assert.equal(stage.posthogProjectToken, null);
  const stageCsp = (await fetch(stagingUrl)).headers.get('content-security-policy');
  assert.doesNotMatch(stageCsp, /sentry|posthog|production\.example/);

  const name = `${containerName}-configured`;
  try {
    startConfiguredContainer(name, gateway, apiPort);
    const configuredUrl = await waitForProxy(name);
    await verifyConfiguredResponse(configuredUrl);
    const emptyAgain = await (await fetch(`${stagingUrl}/runtime-config.json`)).json();
    assert.deepEqual(emptyAgain, stage);
    const leaked = execFileSync(
      'docker',
      [
        'exec',
        name,
        'sh',
        '-c',
        "if grep -R -l -E 'production\\.example|feedback\\.example|phc_runtime_test|private-canary' /usr/share/nginx/html; then exit 1; fi",
      ],
      { encoding: 'utf8' },
    );
    assert.equal(leaked, '');
  } finally {
    try {
      execFileSync('docker', ['stop', name], { stdio: 'ignore' });
    } catch {
      /* already stopped */
    }
  }
}

function startConfiguredContainer(name, gateway, apiPort) {
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      name,
      '--publish',
      '127.0.0.1::8080',
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--env',
      `API_HOST=${gateway}`,
      '--env',
      `API_PORT=${apiPort}`,
      '--env',
      'VITE_SENTRY_DSN=https://public@production.example/42',
      '--env',
      'VITE_POSTHOG_PROJECT_TOKEN=phc_runtime_test',
      '--env',
      'VITE_POSTHOG_API_HOST=https://feedback.example',
      '--env',
      'VITE_POSTHOG_FEEDBACK_SURVEY_ID=survey-test',
      '--env',
      'SENTRY_AUTH_TOKEN=private-canary',
      '--env',
      'BREVO_API_KEY=private-canary',
      image,
    ],
    { stdio: 'pipe' },
  );
}

async function verifyConfiguredResponse(configuredUrl) {
  const response = await fetch(`${configuredUrl}/runtime-config.json`);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const text = await response.text();
  const config = JSON.parse(text);
  assert.equal(config.sentryDsn, 'https://public@production.example/42');
  assert.equal(config.posthogApiHost, 'https://feedback.example');
  assert.doesNotMatch(text, /private-canary|phx_/);
  const csp = (await fetch(configuredUrl)).headers.get('content-security-policy');
  assert.match(
    csp,
    /connect-src 'self' https:\/\/production\.example https:\/\/feedback\.example;/,
  );
  assert.doesNotMatch(csp, /public@|private-canary/);
}

async function handleApiRequest(request, response, forwardedRequests) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(bytes);
    size += bytes.byteLength;
  }
  const body = Buffer.concat(chunks, size);
  forwardedRequests.push({ method: request.method, path: request.url, size, body });
  if (!isValidLargeStory(request, body)) {
    response.writeHead(400).end();
    return;
  }
  response.writeHead(request.url === '/api/stories/imports/native' ? 201 : 200, {
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify({ interactionCount: 3 }));
}

function isValidLargeStory(request, body) {
  if (!isNativeUploadRequest(request)) {
    return false;
  }
  try {
    return isLargeStory(JSON.parse(body.toString('utf8')));
  } catch {
    return false;
  }
}

function isNativeUploadRequest(request) {
  return (
    request.method === 'POST' &&
    ['/api/stories/imports/native', '/api/stories/imports/native/preview'].includes(
      request.url ?? '',
    ) &&
    request.headers['content-type'] === 'application/octet-stream'
  );
}

function isLargeStory(value) {
  return (
    value.format === 'paralleax.story' &&
    value.version === 1 &&
    value.story.title === 'Proxy-size verification' &&
    Array.isArray(value.story.interactions) &&
    value.story.interactions.length === 3 &&
    value.story.interactions.every(isLargeInteraction)
  );
}

function isLargeInteraction(interaction) {
  return (
    typeof interaction.id === 'string' &&
    interaction.body.length === 50_000 &&
    interaction.position.x === 80 &&
    interaction.position.y === 120 &&
    Array.isArray(interaction.triggers)
  );
}

async function verifyAcceptedFiles(proxyUrl, forwardedRequests) {
  const bytes = Buffer.from(JSON.stringify(largeValidStory()));
  assert.ok(bytes.byteLength > 128 * 1024);
  for (const [path, expectedStatus] of [
    ['/api/stories/imports/native/preview', 200],
    ['/api/stories/imports/native', 201],
  ]) {
    const response = await fetch(`${proxyUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes,
    });
    assert.equal(response.status, expectedStatus, `${path} should pass through Nginx`);
    assert.deepEqual(await response.json(), { interactionCount: 3 });
  }
  assert.deepEqual(
    forwardedRequests.map(({ path, size }) => ({ path, size })),
    [
      { path: '/api/stories/imports/native/preview', size: bytes.byteLength },
      { path: '/api/stories/imports/native', size: bytes.byteLength },
    ],
  );
}

async function verifyRejectedFiles(proxyUrl, forwardedRequests) {
  const excessive = Buffer.alloc(uploadLimit + 1, 32);
  for (const path of ['/api/stories/imports/native/preview', '/api/stories/imports/native']) {
    const response = await fetch(`${proxyUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: excessive,
    });
    assert.equal(response.status, 413, `${path} should enforce the 33 MiB limit`);
  }
  assert.equal(forwardedRequests.length, 2, 'oversized uploads must not reach the API');
}

function largeValidStory() {
  return {
    format: 'paralleax.story',
    version: 1,
    story: {
      title: 'Proxy-size verification',
      interactions: Array.from({ length: 3 }, (_, index) => ({
        id: `scene-${index}`,
        title: '',
        body: 'x'.repeat(50_000),
        position: { x: 80, y: 120 },
        triggers: [],
      })),
    },
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForProxy(name) {
  const portOutput = execFileSync('docker', ['port', name, '8080/tcp'], {
    encoding: 'utf8',
  }).trim();
  const port = portOutput.slice(portOutput.lastIndexOf(':') + 1);
  const proxyUrl = `http://127.0.0.1:${port}`;
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${proxyUrl}/healthz`);
      if (response.ok) {
        return proxyUrl;
      }
      lastError = new Error(`Nginx healthcheck returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`Production Nginx did not become ready: ${String(lastError)}`);
}

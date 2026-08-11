import { pathToFileURL } from 'node:url';

const checks = [
  { path: '/healthz', kind: 'text' },
  { path: '/api/health', kind: 'json' },
  { path: '/api/ready', kind: 'json' },
];

export async function checkDeployment(baseUrl, options = {}) {
  const origin = deploymentOrigin(baseUrl, options.allowHttp ?? false);
  const fetchImpl = options.fetchImpl ?? fetch;
  const results = [];

  for (const check of checks) {
    const url = new URL(check.path, origin);
    const response = await fetchImpl(url, {
      redirect: 'error',
      signal: options.signal ?? AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`${check.path} returned HTTP ${response.status}`);
    if (check.kind === 'json') {
      const body = await response.json();
      if (body?.status !== 'ok') throw new Error(`${check.path} did not report status ok`);
    } else if ((await response.text()).trim() !== 'ok') {
      throw new Error(`${check.path} did not return the web health marker`);
    }
    results.push({ path: check.path, status: response.status });
  }

  return results;
}

function deploymentOrigin(value, allowHttp) {
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (allowHttp || local))) {
    throw new Error('Deployment smoke checks require HTTPS outside localhost');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Deployment URL must contain only an origin');
  }
  return url.origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.argv[2] ?? process.env.DEPLOYMENT_URL;
  if (!baseUrl) {
    console.error('Usage: npm run smoke:deployment -- https://alpha.example.com');
    process.exitCode = 1;
  } else {
    checkDeployment(baseUrl, { allowHttp: process.env.ALLOW_HTTP_SMOKE === 'true' })
      .then((results) => {
        for (const result of results) console.log(`ok ${result.status} ${result.path}`);
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
  }
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readRepositoryFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Dockerfile exposes a Railway-selectable runtime while defaulting to web', async () => {
  const dockerfile = await readRepositoryFile('Dockerfile');

  assert.match(dockerfile, /^ARG RUNTIME_TARGET=web$/m);
  assert.match(dockerfile, /^FROM \$\{RUNTIME_TARGET\} AS runtime$/m);
  assert.match(dockerfile, /^FROM node:24-alpine AS api$/m);
  assert.match(dockerfile, /^FROM nginx:alpine AS web$/m);
});

test('Railway API deployment migrates first and probes process health', async () => {
  const configuration = JSON.parse(await readRepositoryFile('deploy/railway.api.json'));
  const apiEntrypoint = await readRepositoryFile('apps/api/src/main.ts');

  assert.equal(configuration.build.builder, 'DOCKERFILE');
  assert.equal(configuration.build.dockerfilePath, 'Dockerfile');
  assert.equal(configuration.deploy.preDeployCommand, 'node apps/api/dist/main.js --migrate');
  assert.equal(configuration.deploy.healthcheckPath, '/api/health');
  assert.match(apiEntrypoint, /await app\.listen\(config\.port\);/);
  assert.doesNotMatch(apiEntrypoint, /await app\.listen\(config\.port,\s*['"]::['"]\);/);
});

test('Railway web deployment probes the public reverse proxy', async () => {
  const configuration = JSON.parse(await readRepositoryFile('deploy/railway.web.json'));
  const nginxConfiguration = await readRepositoryFile('deploy/nginx.conf.template');
  const dockerfile = await readRepositoryFile('Dockerfile');

  assert.equal(configuration.build.builder, 'DOCKERFILE');
  assert.equal(configuration.build.dockerfilePath, 'Dockerfile');
  assert.equal(configuration.deploy.healthcheckPath, '/healthz');
  assert.match(dockerfile, /^ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1$/m);
  assert.match(nginxConfiguration, /^\s*listen \$\{PORT\};$/m);
  assert.match(nginxConfiguration, /^\s*resolver \$\{NGINX_LOCAL_RESOLVERS\} valid=10s;$/m);
  assert.match(nginxConfiguration, /^\s*set \$api_upstream "\$\{API_HOST\}:\$\{API_PORT\}";$/m);
  assert.match(nginxConfiguration, /^\s*proxy_pass http:\/\/\$api_upstream\$request_uri;$/m);
  assert.doesNotMatch(nginxConfiguration, /proxy_pass http:\/\/\$\{API_HOST\}/);
});

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

test('Railway API deployment migrates first and probes readiness', async () => {
  const configuration = JSON.parse(await readRepositoryFile('deploy/railway.api.json'));

  assert.equal(configuration.build.builder, 'DOCKERFILE');
  assert.equal(configuration.build.dockerfilePath, 'Dockerfile');
  assert.equal(configuration.deploy.preDeployCommand, 'node apps/api/dist/main.js --migrate');
  assert.equal(configuration.deploy.healthcheckPath, '/api/ready');
});

test('Railway web deployment probes the public reverse proxy', async () => {
  const configuration = JSON.parse(await readRepositoryFile('deploy/railway.web.json'));

  assert.equal(configuration.build.builder, 'DOCKERFILE');
  assert.equal(configuration.build.dockerfilePath, 'Dockerfile');
  assert.equal(configuration.deploy.healthcheckPath, '/healthz');
});

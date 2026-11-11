import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const readRepositoryFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the Dockerfile exposes a Railway-selectable runtime while defaulting to web', async () => {
  const dockerfile = await readRepositoryFile('Dockerfile');

  assert.match(dockerfile, /^ARG RUNTIME_TARGET=web$/m);
  assert.match(dockerfile, /^FROM \$\{RUNTIME_TARGET\} AS runtime$/m);
  assert.match(dockerfile, /^FROM node:26-alpine AS api$/m);
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
  assert.match(
    nginxConfiguration,
    /connect-src 'self' \$\{SENTRY_CSP_ORIGIN\} \$\{VITE_FORMBRICKS_APP_URL\}/,
  );
  assert.match(dockerfile, /^ARG VITE_SENTRY_DSN=$/m);
  assert.match(dockerfile, /^ENV VITE_SENTRY_DSN=\$\{VITE_SENTRY_DSN\}$/m);
  assert.match(
    dockerfile,
    /COPY deploy\/sentry-csp\.envsh \/docker-entrypoint\.d\/15-sentry-csp\.envsh/,
  );
  assert.match(dockerfile, /chmod \+x \/docker-entrypoint\.d\/15-sentry-csp\.envsh/);
  assert.match(dockerfile, /^ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1$/m);
  assert.match(nginxConfiguration, /^\s*listen \$\{PORT\};$/m);
  assert.match(nginxConfiguration, /^\s*resolver \$\{NGINX_LOCAL_RESOLVERS\} valid=10s;$/m);
  // HTML must revalidate while hashed chunks may be cached long-term.
  assert.match(nginxConfiguration, /location \/assets\/ \{\s*try_files \$uri =404;\s*expires 1y;/);
  assert.match(
    nginxConfiguration,
    /location \/ \{\s*try_files \$uri \$uri\/ \/index\.html;\s*expires -1;/,
  );

  assert.match(nginxConfiguration, /^ {4}client_max_body_size 128k;$/m);
  assert.match(nginxConfiguration, /^\s*set \$api_upstream "\$\{API_HOST\}:\$\{API_PORT\}";$/m);
  assert.match(nginxConfiguration, /^\s*proxy_pass http:\/\/\$api_upstream\$request_uri;$/m);
  assert.match(
    nginxConfiguration,
    /^\s*location ~ \^\/api\/stories\/\[\^\/\]\+\/comment-threads\/events\$ \{$/m,
  );
  assert.match(nginxConfiguration, /^\s*proxy_buffering off;$/m);
  assert.match(nginxConfiguration, /^\s*proxy_read_timeout 1h;$/m);
  const administratorImportLocation = nginxConfiguration.match(
    /^\s*location = \/api\/stories\/imports\/qsp\/admin \{(?<body>[\s\S]*?)^\s{4}\}$/m,
  )?.groups?.body;
  assert.ok(administratorImportLocation);
  assert.match(administratorImportLocation, /^\s*client_max_body_size 0;$/m);
  assert.match(administratorImportLocation, /^\s*client_body_timeout 1h;$/m);
  assert.match(administratorImportLocation, /^\s*proxy_request_buffering off;$/m);
  assert.match(administratorImportLocation, /^\s*proxy_read_timeout 1h;$/m);
  assert.match(administratorImportLocation, /^\s*proxy_send_timeout 1h;$/m);
  assert.doesNotMatch(nginxConfiguration, /proxy_pass http:\/\/\$\{API_HOST\}/);
});

test('the optional Formbricks web build and CSP use the same public app URL', async () => {
  const dockerfile = await readRepositoryFile('Dockerfile');
  const productionCompose = await readRepositoryFile('compose.production.yaml');
  const nginxConfiguration = await readRepositoryFile('deploy/nginx.conf.template');

  assert.match(dockerfile, /^ARG VITE_FORMBRICKS_WORKSPACE_ID=$/m);
  assert.match(dockerfile, /^ARG VITE_FORMBRICKS_APP_URL=$/m);
  assert.match(productionCompose, /^\s+VITE_FORMBRICKS_APP_URL: \$\{VITE_FORMBRICKS_APP_URL:-\}$/m);
  assert.match(
    nginxConfiguration,
    /connect-src 'self' \$\{SENTRY_CSP_ORIGIN\} \$\{VITE_FORMBRICKS_APP_URL\}/,
  );
  assert.match(nginxConfiguration, /script-src 'self' \$\{VITE_FORMBRICKS_APP_URL\}/);
});

test('local development exposes services only through IPv4 loopback', async () => {
  const localCompose = await readRepositoryFile('compose.yaml');

  assert.match(localCompose, /^\s+- '127\.0\.0\.1:5432:5432'$/m);
  assert.match(localCompose, /^\s+- '127\.0\.0\.1:\$\{API_PORT:-3300\}:3000'$/m);
  assert.match(localCompose, /^\s+- '127\.0\.0\.1:5173:5173'$/m);
  assert.match(localCompose, /^\s+CORS_ORIGIN: \$\{CORS_ORIGIN:-http:\/\/127\.0\.0\.1:5173\}$/m);
  assert.doesNotMatch(localCompose, /^\s+- '5432:5432'$/m);
  assert.doesNotMatch(localCompose, /^\s+- '\$\{API_PORT:-3300\}:3000'$/m);
  assert.doesNotMatch(localCompose, /^\s+- '5173:5173'$/m);
});

test(
  'the Sentry CSP origin uses only the public DSN hostname',
  { skip: process.platform === 'win32' },
  () => {
    const scriptPath = fileURLToPath(new URL('../deploy/sentry-csp.envsh', import.meta.url));
    const originFor = (dsn) =>
      execFileSync('sh', ['-c', '. "$1"; printf "%s" "$SENTRY_CSP_ORIGIN"', 'sh', scriptPath], {
        encoding: 'utf8',
        env: { ...process.env, VITE_SENTRY_DSN: dsn },
      });

    assert.equal(
      originFor('https://public-key@o123.ingest.de.sentry.io/42'),
      'https://o123.ingest.de.sentry.io',
    );
    assert.equal(
      originFor('https://public-key@o987.ingest.sentry.io/42'),
      'https://o987.ingest.sentry.io',
    );
    assert.equal(originFor(''), '');
    assert.equal(originFor('not-a-dsn'), '');
    assert.equal(originFor('https://key@bad-host.example;unsafe/42'), '');
  },
);

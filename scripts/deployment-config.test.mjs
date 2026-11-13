import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRailwayContext, github } from 'railway/iac';

const readRepositoryFile = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Dockerfile targets share the common build while compiling only their own app', async () => {
  const dockerfile = await readRepositoryFile('Dockerfile');

  assert.match(dockerfile, /^ARG RUNTIME_TARGET=web$/m);
  assert.match(dockerfile, /^FROM \$\{RUNTIME_TARGET\} AS runtime$/m);
  assert.match(dockerfile, /^FROM node:24-alpine AS build$/m);
  assert.match(dockerfile, /^FROM build AS shared-build$/m);
  assert.match(dockerfile, /^RUN npm run build --workspace=@paralleax\/shared$/m);
  assert.match(dockerfile, /^FROM shared-build AS api-build$/m);
  assert.match(dockerfile, /^RUN npm run build --workspace=@paralleax\/api$/m);
  assert.match(dockerfile, /^FROM shared-build AS web-build$/m);
  assert.match(dockerfile, /^RUN --mount=type=secret,id=sentry_auth_token,required=false \\/m);
  assert.match(
    dockerfile,
    /SENTRY_AUTH_TOKEN="\$\(cat \/run\/secrets\/sentry_auth_token\)" npm run build --workspace=@paralleax\/web/,
  );
  assert.match(dockerfile, /^COPY --from=api-build \/workspace\/apps\/api\/dist apps\/api\/dist$/m);
  assert.match(
    dockerfile,
    /^COPY --from=web-build \/workspace\/apps\/web\/dist \/usr\/share\/nginx\/html$/m,
  );
  assert.match(
    dockerfile,
    /^COPY deploy\/sentry-csp\.envsh \/docker-entrypoint\.d\/15-sentry-csp\.envsh$/m,
  );
  assert.match(dockerfile, /^FROM node:24-alpine AS api$/m);
  assert.match(dockerfile, /^FROM nginx:alpine AS web$/m);
  assert.doesNotMatch(dockerfile, /^ARG SENTRY_AUTH_TOKEN=/m);
});

test('Railway IaC partial explicitly retains GitHub sources for the initial migration', async () => {
  const { default: defineProject, partial } = await import('../.railway/railway.ts');
  const configuration = await defineProject(createRailwayContext({ environment: 'production' }));
  const services = configuration.resources;
  const api = services.find(({ name }) => name === '@paralleax/api');
  const web = services.find(({ name }) => name === '@paralleax/web');

  assert.equal(partial, 'paralleax-apps');
  assert.deepEqual(
    services.map(({ name }) => name),
    ['@paralleax/api', '@paralleax/web'],
  );
  assert.ok(api);
  assert.ok(web);
  const migrationSource = github('jcarly/paralleax', { branch: 'main' });
  assert.deepEqual(api.source, migrationSource);
  assert.deepEqual(web.source, migrationSource);
  assert.equal(api.configFile, undefined);
  assert.equal(web.configFile, undefined);
  assert.deepEqual(Object.keys(api.variables).sort(), [
    'API_HOST',
    'API_PORT',
    'BREVO_API_KEY',
    'CORS_ORIGIN',
    'DATABASE_URL',
    'EMAIL_FROM',
    'EMAIL_REPLY_TO',
    'NODE_ENV',
    'NO_PROXY',
    'POSTGRES_DB',
    'POSTGRES_PASSWORD',
    'POSTGRES_SSL',
    'POSTGRES_USER',
    'REGISTRATION_MODE',
    'RUNTIME_TARGET',
    'SENTRY_DSN',
    'WEB_PORT',
  ]);
  assert.deepEqual(Object.keys(web.variables).sort(), [
    'API_HOST',
    'API_PORT',
    'RUNTIME_TARGET',
    'VITE_SENTRY_DSN',
  ]);
  assert.ok(Object.values(api.variables).every(({ type }) => type === 'preserve'));
  assert.ok(Object.values(web.variables).every(({ type }) => type === 'preserve'));
});

test('Railway API IaC uses Docker, watches its build inputs, and migrates before healthcheck', async () => {
  const { default: defineProject } = await import('../.railway/railway.ts');
  const { resources } = await defineProject(createRailwayContext({ environment: 'production' }));
  const configuration = resources.find(({ name }) => name === '@paralleax/api');
  const apiEntrypoint = await readRepositoryFile('apps/api/src/main.ts');

  assert.ok(configuration);
  assert.equal(configuration.build.builder, 'DOCKERFILE');
  assert.equal(configuration.build.dockerfilePath, 'Dockerfile');
  assert.equal(configuration.build.buildEnvironment, 'V3');
  assert.deepEqual(configuration.build.watchPatterns, [
    '/Dockerfile',
    '/.dockerignore',
    '/package.json',
    '/package-lock.json',
    '/apps/api/**',
    '/apps/*/package.json',
    '/packages/shared/**',
    '/packages/*/package.json',
    '/scripts/smoke-qsp-worker.mjs',
    '/scripts/smoke-choicescript-worker.mjs',
  ]);
  assert.deepEqual(configuration.deploy.preDeployCommand, ['node apps/api/dist/main.js --migrate']);
  assert.equal(configuration.networking.privateNetworkEndpoint, 'paralleaxapi');
  assert.equal(configuration.deploy.healthcheckPath, '/api/health');
  assert.equal(configuration.deploy.healthcheckTimeout, 300);
  assert.deepEqual(configuration.deploy.multiRegionConfig, { sfo: { numReplicas: 1 } });
  assert.equal(configuration.deploy.runtime, 'V2');
  assert.equal(configuration.deploy.useLegacyStacker, false);
  assert.equal(configuration.deploy.ipv6EgressEnabled, false);
  assert.equal(configuration.deploy.restartPolicyType, 'ON_FAILURE');
  assert.equal(configuration.deploy.restartPolicyMaxRetries, 10);
  assert.match(apiEntrypoint, /await app\.listen\(config\.port\);/);
  assert.doesNotMatch(apiEntrypoint, /await app\.listen\(config\.port,\s*['"]::['"]\);/);
});

test('Railway web IaC uses Docker and preserves its release, region, and networking settings', async () => {
  const { default: defineProject } = await import('../.railway/railway.ts');
  const { resources } = await defineProject(createRailwayContext({ environment: 'production' }));
  const configuration = resources.find(({ name }) => name === '@paralleax/web');

  assert.ok(configuration);
  assert.equal(configuration.build.builder, 'DOCKERFILE');
  assert.equal(configuration.build.dockerfilePath, 'Dockerfile');
  assert.equal(configuration.build.buildEnvironment, 'V3');
  assert.deepEqual(configuration.build.watchPatterns, [
    '/Dockerfile',
    '/.dockerignore',
    '/package.json',
    '/package-lock.json',
    '/apps/web/**',
    '/apps/*/package.json',
    '/packages/shared/**',
    '/packages/*/package.json',
    '/scripts/check-web-bundle.mjs',
    '/deploy/nginx.conf.template',
    '/deploy/sentry-csp.envsh',
  ]);
  assert.equal(configuration.deploy.healthcheckPath, '/healthz');
  assert.equal(configuration.deploy.healthcheckTimeout, 300);
  assert.equal(configuration.networking.privateNetworkEndpoint, 'paralleaxweb');
  assert.deepEqual(configuration.networking.customDomains, { 'paralleax.app': { port: 8080 } });
  assert.deepEqual(configuration.deploy.multiRegionConfig, { sfo: { numReplicas: 1 } });
  assert.equal(configuration.deploy.runtime, 'V2');
  assert.equal(configuration.deploy.useLegacyStacker, false);
  assert.equal(configuration.deploy.ipv6EgressEnabled, false);
  assert.equal(configuration.deploy.restartPolicyType, 'ON_FAILURE');
  assert.equal(configuration.deploy.restartPolicyMaxRetries, 10);
});

test('the public web reverse proxy and healthcheck share the Railway runtime port', async () => {
  const nginxConfiguration = await readRepositoryFile('deploy/nginx.conf.template');
  const dockerfile = await readRepositoryFile('Dockerfile');

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

test('production Compose and release builds pass Sentry upload credentials only as a web build secret', async () => {
  const productionCompose = await readRepositoryFile('compose.production.yaml');
  const workflow = await readRepositoryFile('.github/workflows/ci.yml');

  assert.match(workflow, /^\s+- 'scripts\/check-web-bundle\.mjs'$/m);
  assert.match(workflow, /^\s+- 'scripts\/smoke-qsp-worker\.mjs'$/m);
  assert.match(workflow, /^\s+- 'scripts\/smoke-choicescript-worker\.mjs'$/m);
  assert.match(productionCompose, /^ {6}secrets:\n {8}- sentry_auth_token$/m);
  assert.match(productionCompose, /^ {2}sentry_auth_token:\n {4}environment: SENTRY_AUTH_TOKEN$/m);
  assert.doesNotMatch(productionCompose, /^\s+SENTRY_AUTH_TOKEN:/m);

  const apiPublishStart = workflow.indexOf('      - name: Publish API image');
  const webPublishStart = workflow.indexOf('      - name: Publish web image');
  const releaseSummaryStart = workflow.indexOf('      - name: Record immutable release references');
  assert.ok(apiPublishStart >= 0 && webPublishStart > apiPublishStart);
  assert.ok(releaseSummaryStart > webPublishStart);
  const apiPublish = workflow.slice(apiPublishStart, webPublishStart);
  const webPublish = workflow.slice(webPublishStart, releaseSummaryStart);
  assert.doesNotMatch(apiPublish, /SENTRY_AUTH_TOKEN|sentry_auth_token/);
  assert.match(webPublish, /--secret id=sentry_auth_token,env=SENTRY_AUTH_TOKEN/);
  assert.doesNotMatch(webPublish, /--build-arg SENTRY_AUTH_TOKEN/);
});

test('Railway image releases use supported source connect options', async () => {
  const workflow = await readRepositoryFile('.github/workflows/ci.yml');
  const releaseStart = workflow.indexOf('      - name: Deploy API then web by immutable digest');
  const smokeStart = workflow.indexOf('      - name: Run deployment smoke check', releaseStart);
  assert.ok(releaseStart >= 0 && smokeStart > releaseStart);

  const release = workflow.slice(releaseStart, smokeStart);
  const sourceConnect = release
    .split('\\n')
    .find((line) => line.includes('railway service source connect --image'));

  assert.ok(sourceConnect, 'the release must connect each service to its immutable image');
  assert.match(sourceConnect, /--image "\\$image"/);
  assert.match(sourceConnect, /--service "\\$service"/);
  assert.match(sourceConnect, /--environment "\\$RAILWAY_ENVIRONMENT"/);
  assert.match(sourceConnect, /--project "\\$RAILWAY_PROJECT_ID"/);
  assert.doesNotMatch(sourceConnect, /--(?:yes|json)\\b/);
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

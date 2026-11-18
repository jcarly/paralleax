import { defineRailway, github, preserve, project, service } from 'railway/iac';

export const partial = 'paralleax-apps';

// Initial migration only: preserve the services' existing GitHub source.
// After a tagged GHCR release, do not re-apply this source without reviewing drift.
const migrationSource = github('jcarly/paralleax', { branch: 'main' });

const apiWatchPatterns = [
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
];

const webWatchPatterns = [
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
];

const apiEnvironment = {
  API_HOST: preserve(),
  API_PORT: preserve(),
  BREVO_API_KEY: preserve(),
  CORS_ORIGIN: preserve(),
  DATABASE_URL: preserve(),
  EMAIL_FROM: preserve(),
  EMAIL_REPLY_TO: preserve(),
  NODE_ENV: preserve(),
  NO_PROXY: preserve(),
  POSTGRES_DB: preserve(),
  POSTGRES_PASSWORD: preserve(),
  POSTGRES_SSL: preserve(),
  POSTGRES_USER: preserve(),
  REGISTRATION_MODE: preserve(),
  RUNTIME_TARGET: preserve(),
  SENTRY_DSN: preserve(),
  WEB_PORT: preserve(),
};

const webEnvironment = {
  API_HOST: preserve(),
  API_PORT: preserve(),
  RUNTIME_TARGET: preserve(),
  VITE_SENTRY_DSN: preserve(),
};

const api = service('@paralleax/api', {
  source: migrationSource,
  build: {
    builder: 'DOCKERFILE',
    dockerfilePath: 'Dockerfile',
    buildEnvironment: 'V3',
    watchPatterns: apiWatchPatterns,
  },
  env: apiEnvironment,
  networking: {
    privateNetworkEndpoint: 'paralleaxapi',
  },
  preDeploy: 'node apps/api/dist/main.js --migrate',
  healthcheck: '/api/health',
  healthcheckTimeout: 300,
  regions: { sfo: 1 },
  deploy: {
    runtime: 'V2',
    useLegacyStacker: false,
    ipv6EgressEnabled: false,
    restartPolicyType: 'ON_FAILURE',
    restartPolicyMaxRetries: 10,
  },
});

const web = service('@paralleax/web', {
  source: migrationSource,
  build: {
    builder: 'DOCKERFILE',
    dockerfilePath: 'Dockerfile',
    buildEnvironment: 'V3',
    watchPatterns: webWatchPatterns,
  },
  env: webEnvironment,
  domains: [{ domain: 'paralleax.app', port: 8080 }],
  networking: {
    privateNetworkEndpoint: 'paralleaxweb',
  },
  healthcheck: '/healthz',
  healthcheckTimeout: 300,
  regions: { sfo: 1 },
  deploy: {
    runtime: 'V2',
    useLegacyStacker: false,
    ipv6EgressEnabled: false,
    restartPolicyType: 'ON_FAILURE',
    restartPolicyMaxRetries: 10,
  },
});

export default defineRailway(() =>
  project('fearless-warmth', {
    resources: [api, web],
  }),
);

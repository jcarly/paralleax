# Staging Environment Plan

Status: Proposed. No Railway resource described here exists yet.

Last reviewed: 2026-11-23

Tracking: PAR-21. Decision record: [ADR-051](../decisions/ADR-051-isolated-railway-staging.md).

## Purpose

Staging validates a release candidate in a production-shaped stack that cannot
read, write or delete production data or credentials. It satisfies the "separate
staging and production projects" gate in the
[alpha deployment runbook](alpha-deployment.md#provider-gates).

This document is a plan. Do not create a project, service, database or volume
until the open decisions at the end are answered and recorded in ADR-051.

## Audit Of The Current Setup

Checked on 2026-11-23 (read-only).

| Area                | Finding                                                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway projects    | One project, `fearless-warmth`, with one `production` environment: `@paralleax/api`, `@paralleax/web`, `Postgres` (`postgres-ssl:18`) and `postgres-volume` (500 MB). There is no staging project or environment.                 |
| Application sources | Both services run immutable `ghcr.io/jcarly/...@sha256:` digests deployed by the tag workflow.                                                                                                                                    |
| IaC                 | `.railway/railway.ts` declares `project('fearless-warmth')` and the `paralleax-apps` partial, with `domains: paralleax.app` and a GitHub `main` bootstrap source. It cannot be reused for another project as is.                  |
| Release workflow    | The `release` job in `.github/workflows/ci.yml` hardcodes the production project id, the `production` environment and `https://paralleax.app`, and authenticates with `RAILWAY_API_TOKEN`. There is no staging deploy path.       |
| Token scope         | The documented token is a workspace (or account) token because `service source connect --image` needs it. Such a token reaches every project in the workspace, so a staging job that used it could also modify production.        |
| Web image           | The web image bakes `VITE_SENTRY_DSN` and the optional PostHog values at build time. The production digest therefore reports browser errors and feedback to the production Sentry and PostHog projects.                           |
| Email               | `TEST_EMAIL_OUTBOX` and the `/api/test/auth/emails/latest` route exist only under `NODE_ENV=test`. `NODE_ENV=production` is the only mode with `Secure` cookies, the exact-`Origin` guard on mutations, helmet CSP and JSON logs. |
| Acceptance suite    | `npm run test:acceptance` against `PARALLEAX_ACCEPTANCE_BASE_URL` needs the test outbox, hence `NODE_ENV=test`, so it cannot validate production cookie or origin behaviour.                                                      |

## Target Topology

```text
browser → Railway edge (HTTPS, generated or staging domain)
        → web service (public, port 8080, /api proxy)
        → api service (no public domain, railway.internal only)
        → staging-only Postgres (own volume)
```

Everything lives in a new Railway project, for example `paralleax-staging`, with
a single `staging` environment. Services keep the production names
(`@paralleax/api`, `@paralleax/web`, `Postgres`) so reference variables and the
runbook stay identical.

### Isolation rules

1. Separate project, and preferably a separate Railway workspace (see decision
   D1). No shared variables, no cross-project references, no PostgreSQL
   connection to the production service.
2. The API has no public domain. The web proxy reaches it through
   `API_HOST=${{api.RAILWAY_PRIVATE_DOMAIN}}` and `API_PORT=3000`.
3. Staging secrets are generated for staging. Nothing is copied from production:
   `DATABASE_URL` references the staging `Postgres`, the Brevo key is a separate
   key, and no database dump from production is restored.
4. Browser reporting must not reach production. The web image sets
   `VITE_SENTRY_DSN` and `VITE_POSTHOG_API_HOST` as container `ENV` from build
   arguments, so a variable that is merely absent in Railway does not clear
   them. Set both explicitly to an empty value on the staging web service, then
   check the effective CSP and the network requests (journey 2). This is a
   stopgap: the bundle still contains the production browser configuration and
   the PostHog feedback control may stay visible without working. The durable
   fix is runtime browser configuration (see Prerequisite fix). The API leaves
   `SENTRY_DSN` unset; it has no baked value.
5. Staging data is disposable. It is never a source for valuable projects, and
   its backups are not part of the production recovery chain.

## Immutable Images

Staging deploys the same GHCR digests that the release will later send to
production, so the artifact under test is the artifact that ships.

- A release candidate is built once by the existing exhaustive CI path and
  recorded by digest in the job summary.
- A manual `workflow_dispatch` staging deploy (not yet written) takes the two
  digests as inputs, refuses tags and branches, and runs in a GitHub Actions
  environment named `staging` with its own secrets and variables.
- It authenticates with a staging-only Railway token (`RAILWAY_STAGING_API_TOKEN`)
  and targets a staging project id variable. It must never read
  `RAILWAY_API_TOKEN`.
- Order matches production: connect the API digest, wait for its pre-deploy
  migration and `/api/health`, connect the web digest, then run
  `npm run smoke:deployment -- https://<staging-domain>`.
- The production release job stays unchanged and does not depend on staging.

Because the web image is shared, its baked browser reporting values point to the
production Sentry and PostHog projects. Rule 4 is only a stopgap.

### Prerequisite fix: runtime browser configuration

Sharing one web digest between staging and production (D4) is accepted only
after browser configuration (Sentry DSN and release, PostHog host, token and
survey id) is read at runtime instead of build time, for example from a
generated `config.js` served by the web container. That change touches the
Dockerfile, the web entrypoint, the CSP template and the web client. It needs
its own task and tests, and ADR-051 must not be accepted before it, or before
an explicit decision to use a separate staging web build.

## Railway Configuration

IaC for staging is a second, separate file for a different project, not an
edit of `.railway/railway.ts`. Keep it outside `.railway/` until the project
exists, because the CLI resolves that directory for the linked project and a
second project file there could be planned against production by mistake.

Proposed shape, to be reviewed with `railway config plan` against the staging
project only:

```ts
import { defineRailway, project, service } from 'railway/iac';

export const partial = 'paralleax-staging-apps';

// Source is set by the staging deploy workflow to an image digest.
// Do not declare a GitHub source: staging never builds from a branch.
const api = service('@paralleax/api', {
  build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile', buildEnvironment: 'V3' },
  networking: { privateNetworkEndpoint: 'paralleaxapi' },
  preDeploy: 'node apps/api/dist/main.js --migrate',
  healthcheck: '/api/health',
  healthcheckTimeout: 300,
  regions: { sfo: 1 },
  deploy: { runtime: 'V2', restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
});

const web = service('@paralleax/web', {
  networking: { privateNetworkEndpoint: 'paralleaxweb' },
  healthcheck: '/healthz',
  healthcheckTimeout: 300,
  regions: { sfo: 1 },
  deploy: { runtime: 'V2', restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 10 },
});

export default defineRailway(() => project('paralleax-staging', { resources: [api, web] }));
```

This snippet is not tested against the SDK. Before it becomes a file, extend
`scripts/deployment-config.test.mjs` the same way the production partial is
tested, and confirm in a plan that the database and volume stay out of scope as
in [ADR-044](../decisions/ADR-044-railway-apps-partial-iac.md).

### Variables

API service:

```dotenv
RUNTIME_TARGET=api
PORT=3000
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
POSTGRES_SSL=true
CORS_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
REGISTRATION_MODE=open
BREVO_API_KEY=<staging-only Brevo API key>
EMAIL_FROM=Paralleax Staging <accounts@staging.<domain>>
```

Web service:

```dotenv
PORT=8080
API_HOST=${{api.RAILWAY_PRIVATE_DOMAIN}}
API_PORT=3000
```

Never set `TEST_EMAIL_OUTBOX`, `DEV_SKIP_EMAIL_VERIFICATION`, any production
credential, or `SENTRY_DSN` here.

### Domain, cookies and CORS

- Use the Railway-generated web domain (`*.up.railway.app`) at first, with a
  custom staging subdomain only after decision D3. Do not generate a public
  domain for the API.
- `CORS_ORIGIN` must equal the exact browser origin, with scheme and no path or
  trailing slash. The API rejects unsafe-method requests whose `Origin` differs.
  After a domain change, update it and redeploy the API.
- The session cookie is `paralleax_session`, `HttpOnly`, `SameSite=Lax`,
  `Secure` only when `NODE_ENV=production`. Because the browser sees a single
  origin through the web proxy, no cross-site cookie setting is needed. Keep
  `NODE_ENV=production` so the `Secure` flag, origin guard and CSP are tested as
  they ship.
- Do not set a cookie `Domain`. The cookie then stays host-only and is not sent
  to any other host, so a staging subdomain of `paralleax.app` would not receive
  the production cookie. The generated Railway domain is still chosen (D3).

### Migrations

The API pre-deploy command runs `node apps/api/dist/main.js --migrate` before
traffic moves, as in production. Migrations are forward-only. A new release
candidate is applied to staging first, on the staging database, which at least
contains data created by the previous release. Do not seed staging from a
production dump.

### Healthchecks

| Probe         | Purpose                                        | Used by             |
| ------------- | ---------------------------------------------- | ------------------- |
| `/api/health` | API process listening                          | Railway healthcheck |
| `/healthz`    | Web process listening                          | Railway healthcheck |
| `/api/ready`  | PostgreSQL reachable, latest migration present | `smoke:deployment`  |

`npm run smoke:deployment -- https://<staging-domain>` must pass before any
browser validation.

## Verification Email And Test Accounts

The API sends verification messages through the Brevo HTTPS API. Production
mode has no outbox, and the test outbox route is not available there. This is
the main tension of the design, and the options are in decision D2.

Recommended default: real Brevo delivery to mailboxes controlled by the
operator.

- Use a Brevo key and sender dedicated to staging, with the staging name in the
  `EMAIL_FROM` display name and subject lines visible to testers.
- Test accounts use plus-addressed or aliased mailboxes owned by the operator,
  for example `operator+staging-author1@<domain>`. Nobody outside the
  operator's list is invited.
- Share test credentials through the team secret manager, never in the
  repository or an issue. Delete accounts at the end of a test campaign.
- Keep `REGISTRATION_MODE=open` only while a campaign runs. Set it to `closed`
  between campaigns. Staging then accepts no new accounts; existing test
  accounts can still sign in.
- Automated acceptance does not run against this staging stack. It runs on an
  ephemeral `NODE_ENV=test` stack with the outbox (as in the current runbook),
  and never on a stack holding real mailboxes, because the outbox route returns
  verification tokens to anyone who knows an address.

## Browser Validation Journeys

Run after the smoke check, in a clean browser profile, on the staging domain.

1. **Transport and headers:** the page loads over HTTPS, HTTP redirects to
   HTTPS, `/api` has no direct public route, response headers include the CSP
   and `X-Frame-Options`.
2. **Reporting isolation:** in DevTools, no request goes to the production
   Sentry or PostHog hosts; blocked requests appear as CSP violations only.
3. **Registration:** register a new test account, confirm sign-in is refused
   before verification, open the verification email, follow its link, and
   confirm sign-in works. Confirm the cookie is `HttpOnly`, `Secure`, `SameSite=Lax`.
4. **Origin guard:** from a different origin, a mutation is refused (HTTP 403);
   the same mutation from the staging origin succeeds.
5. **Authoring:** create a Story, add and edit an Interaction, reload the editor.
6. **Simulation:** run Simulation Mode and confirm reader progress is unchanged.
7. **Persistence:** sign out, sign in again, confirm the Story persists.
8. **Migration:** the first journey after deploying a new digest confirms data
   created before the deploy is intact.
9. **Isolation proof:** an account created on staging cannot sign in to
   production and conversely.

Record digests, migration id, smoke result, operator and time, as for
production.

## Resources And Costs

Resources a staging project would add:

- 3 services: API, web, PostgreSQL (`postgres-ssl:18`), each with one replica;
- 1 persistent volume for PostgreSQL (500 MB, like production);
- 1 public Railway domain (and an optional custom domain);
- outbound network traffic and image pulls from GHCR;
- a Brevo sender or key, and Railway workspace seats if a separate workspace is used.

Railway bills per resource usage (CPU, memory, volume, egress) on top of the
subscription. Services that stay running accrue usage continuously, so an idle
staging stack still costs. A second workspace may need its own subscription. Do
not rely on figures in this repository: read the current
[Railway pricing](https://docs.railway.com/pricing/plans) before provisioning,
and set a usage limit on the staging workspace.

Possible extra spending:

- a new subscription if a separate workspace is chosen;
- usage left running after a campaign (mitigate by teardown or by removing the
  replicas);
- volume growth from test data or imports;
- network egress during large imports or load tests;
- Brevo plan limits if staging emails share the production quota (use a
  separate key, and check the sender limit);
- a custom domain registration, if one is chosen;
- Sentry or PostHog volume if rule 4 fails.

## Risks

| Risk                                              | Mitigation                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Staging token modifies production                 | Project-scoped staging token if it can deploy images, else separate workspace (D1); separate GitHub environment.            |
| Browser events reach production Sentry or PostHog | Explicit empty variables as a stopgap, verified in journey 2; runtime browser configuration before sharing the digest (D4). |
| Verification emails reach real users              | Dedicated Brevo key and sender; operator-owned mailboxes only; registration closed between campaigns.                       |
| Test outbox exposes tokens                        | `NODE_ENV=test` only on ephemeral stacks without real mailboxes.                                                            |
| Staging cookie collides with production           | No cookie `Domain` (host-only); generated Railway domain (D3).                                                              |
| IaC planned against the wrong project             | Separate partial and file outside `.railway/`; confirm the linked project before every plan.                                |
| Staging data treated as valuable                  | Disposable notice, no valuable projects, documented reset.                                                                  |
| Forward-only migration breaks staging             | Rebuild from an empty database; production rollback is image-only.                                                          |
| Forgotten running stack                           | Usage limit; weekly review; teardown procedure below.                                                                       |

## Teardown

Do this in order. Each step is destructive; confirm the project id first.

1. Confirm the target is the staging project, not `fearless-warmth`, by name and id.
2. Set `REGISTRATION_MODE=closed` and tell testers.
3. Export anything worth keeping (logs, screenshots, findings). The database is
   not retained.
4. Remove the custom domain (if any) and its DNS record, so the name cannot be
   taken over.
5. Revoke the staging Brevo key and the staging Railway token, and delete the
   GitHub `staging` environment secrets and variables.
6. Delete the staging project in Railway. This removes its services, the
   PostgreSQL volume and its data.
7. If a separate workspace was created only for staging, delete or downgrade it.
8. Verify in Railway that no volume, domain or usage line remains, and that the
   production project and workspace token are unaffected.

To pause without deleting, scale the staging services down rather than leaving
them running. A paused database still keeps its volume and its cost.

## Decisions Needed Before Provisioning

| Id  | Decision                  | Status and choice                                                                                                                                                                                                                                                              |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Railway isolation         | **Decided:** second project in the current workspace, if a staging-only token can deploy GHCR digests. Test `railway service source connect --image` with a project token; if only a workspace token works, use a separate workspace (one subscription per workspace).         |
| D2  | Email handling            | **Decided:** real Brevo, dedicated key, operator-controlled test addresses, `NODE_ENV=production`.                                                                                                                                                                             |
| D3  | Domain                    | **Decided:** generated `*.up.railway.app` domain.                                                                                                                                                                                                                              |
| D4  | Shared web digest         | **Open:** only after runtime browser configuration (see Prerequisite fix), or choose a separate staging web build.                                                                                                                                                             |
| D5  | Deployment control        | **Open:** manual `workflow_dispatch` plus a GitHub `staging` environment with its own secrets, minimal permissions and required reviewers or restricted deployers.                                                                                                             |
| D6  | Permanence                | **Tentative:** keep staging between campaigns, scaled down.                                                                                                                                                                                                                    |
| D7  | Postgres major and volume | **Open:** confirm the running production server with `SHOW server_version` before fixing the staging image; 500 MB as a starting size.                                                                                                                                         |
| D8  | Access restriction        | **Open, required:** closed registration and an unshared URL are not protection. With `REGISTRATION_MODE=open` anyone can register and trigger Brevo emails. Choose a real restriction (for example HTTP authentication in the web tier) or an explicit campaign-window policy. |

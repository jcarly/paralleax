# Staging Environment Plan

Status: Proposed. No Railway resource described here exists yet.

Last reviewed: 2026-11-27

Tracking: PAR-21. Decision record: [ADR-051](../decisions/ADR-051-isolated-railway-staging.md).

## Purpose

Staging validates a release candidate in a production-shaped stack that cannot
read, write or delete production data or credentials. It satisfies the "separate
staging and production projects" gate in the
[alpha deployment runbook](alpha-deployment.md#provider-gates).

This document is a plan. Do not create a project, service, database or volume
until the open decisions at the end are answered and recorded in ADR-051.

## Audit Of The Current Setup

Checked on 2026-11-27 (read-only).

| Area                | Finding                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway projects    | One project, `fearless-warmth`, with one `production` environment: `@paralleax/api`, `@paralleax/web`, `Postgres` (`postgres-ssl:18`) and `postgres-volume` (500 MB). There is no staging project or environment.                                                                                                                                                   |
| PostgreSQL runtime  | The read-only inventory reports the custom image tag `postgres-ssl:18`. Railway's managed-database inspection actions reject this custom template (`INVALID_ARGUMENT`), and the available deployment logs do not report the server version. The actual `SHOW server_version` result is unverified; the image tag is not proof. No credentials were read or exposed. |
| Application sources | Both services run immutable `ghcr.io/jcarly/...@sha256:` images. Today the tag workflow builds them and immediately deploys them to production.                                                                                                                                                                                                                     |
| IaC                 | `.railway/railway.ts` declares `project('fearless-warmth')` and the `paralleax-apps` partial, with `domains: paralleax.app` and a GitHub `main` bootstrap source. It cannot be reused for another project as is.                                                                                                                                                    |
| Release workflow    | A tag selects full change validation, but `production-images` explicitly skips tags and `release` does not depend on `main-readiness`. It publishes API and web images after its listed checks, then deploys them directly to production. The tag path does not enforce the complete Main readiness image gate, and there is no staging promotion gate.             |
| Token scope         | The production release currently uses `RAILWAY_API_TOKEN`. Staging should use a project-scoped `RAILWAY_TOKEN` secret in the same workspace; it must never receive the production `RAILWAY_API_TOKEN`. Use a separate workspace only if the project token cannot perform the required image deployment.                                                             |
| Web image           | PAR-26 now generates `/runtime-config.json` at container startup from validated public runtime variables. The same web digest can use separate Sentry/PostHog settings per environment; the bundle contains no environment-specific DSNs, tokens or hosts. The CSP is derived from that effective configuration.                                                    |
| Sentry release      | The web image carries the immutable release value used for its source maps. Runtime configuration reads that image value, not a stale runtime override. `SENTRY_AUTH_TOKEN` is only a BuildKit build secret.                                                                                                                                                        |
| Email               | `TEST_EMAIL_OUTBOX` and the `/api/test/auth/emails/latest` route exist only under `NODE_ENV=test`. `NODE_ENV=production` is the only mode with `Secure` cookies, the exact-`Origin` guard on mutations, helmet CSP and JSON logs.                                                                                                                                   |
| Acceptance suite    | `npm run test:acceptance` against `PARALLEAX_ACCEPTANCE_BASE_URL` needs the test outbox, hence `NODE_ENV=test`, so it cannot validate production cookie or origin behaviour.                                                                                                                                                                                        |

## Target Topology

```text
browser → Railway edge (HTTPS, generated or staging domain)
        → web service (public, port 8080, optional Nginx Basic Auth, /api proxy)
        → api service (no public domain, railway.internal only)
        → staging-only Postgres (own volume)
```

Everything lives in a new Railway project, for example `paralleax-staging`, with
a single `staging` environment. Services keep the production names
(`@paralleax/api`, `@paralleax/web`, `Postgres`) so reference variables and the
runbook stay identical.

### Isolation rules

1. A separate Railway project in the existing workspace (D1). Use a
   project-scoped `RAILWAY_TOKEN` for staging and keep the production
   `RAILWAY_API_TOKEN` in the production promotion job only. Do not share
   variables, cross-project references or PostgreSQL connections with
   production. Use a separate workspace only if the project token's actual
   scope is insufficient; that adds a plan subscription.
2. The API has no public domain. The web proxy reaches it through
   `API_HOST=${{api.RAILWAY_PRIVATE_DOMAIN}}` and `API_PORT=3000`.
3. Staging secrets are generated for staging. Nothing is copied from production:
   `DATABASE_URL` references the staging `Postgres`, the Brevo key is a separate
   key, and no database dump from production is restored.
4. Browser configuration is public and environment-specific at runtime. The
   web image generates `/runtime-config.json` at startup from validated
   `VITE_SENTRY_*` and `VITE_POSTHOG_*` values; none are image build arguments
   or defaults. Empty or invalid integration settings disable that integration.
   A configuration-fetch or parse failure leaves the application usable with
   optional browser monitoring and feedback disabled. The CSP origins come from
   the same accepted settings. Never put private credentials in these browser
   variables; they are visible to every visitor.
5. The Sentry browser release is embedded in the immutable web image from the
   release tag used for source-map upload. Runtime settings cannot change it,
   so the release identifier remains consistent with the maps when the same
   digest is promoted. Keep `SENTRY_AUTH_TOKEN` as a build-only secret and keep
   API `SENTRY_DSN`/credentials in API runtime configuration.
6. Staging data is disposable. It is never a source for valuable projects, and
   its backups are not part of the production recovery chain.

## Immutable Images

The goal is build/publish once, validate those immutable artifacts in staging,
then manually promote the exact same API and web digests to production. Runtime
configuration may differ by environment; rebuilding for staging or production
breaks this guarantee.

### Current release behavior

Today a newly created version tag first runs the release workflow's required CI,
then builds and publishes both images to GHCR and immediately deploys them to
production. The workflow is unchanged by this documentation PR. Until PAR-21
implements the separation below, a version tag is a production deployment and
cannot be used as a staging-first approval flow.

### Proposed release path

1. **Exhaustive validation:** require the tagged commit to pass every
   Main-readiness-equivalent check before publication, including Production
   images; do not rely only on tag-specific `release.needs` or a prior green
   main run. Build the API and web candidate images once and run the production
   image checks against those exact candidates.
2. **Publish once:** after the exhaustive checks pass, publish those validated
   image artifacts to GHCR without rebuilding. Record the source commit, tag,
   publishing workflow run id, and both full `ghcr.io/...@sha256:...` image
   references in an immutable release manifest attached to that successful run.
   Publishing does not deploy either image.
3. **Manual staging deploy:** an operator dispatches the staging workflow from
   `main` with the publishing run id. The workflow downloads that run's
   manifest, validates its source, success state and digest format, then deploys
   the API digest followed by the web digest. It runs the staging smoke check
   and records the publishing run id and both digests in a validation artifact.
4. **Manual production promotion:** an operator dispatches a separate
   production-promotion workflow with the successful staging run id. Before
   deployment, it verifies the staging run succeeded and that its validation
   artifact names the same publishing run id and exact API/web digest pair from
   the original manifest. It then deploys those references without building,
   and runs the production smoke check. No manually retyped or independently
   selected pair is accepted.

The two digests are therefore tied together by the release manifest, then
rechecked against the successful staging validation record before promotion.
Both environments receive those exact `@sha256:` references; neither workflow
rebuilds or substitutes a tag.

The staging job runs only through `workflow_dispatch` from `main`, in a
branch-restricted GitHub Actions `staging` environment. Give it only
`contents: read` and `actions: read` to verify the source run and download its
manifest (plus `packages: read` only if GHCR images are private), and a
project-scoped Railway token in the `RAILWAY_TOKEN` secret. See Railway's
[token scopes](https://docs.railway.com/integrations/api#choosing-a-token-type).
Production promotion runs separately, with only the read permissions needed for
the staging run and manifest, and is the only job that receives the existing
`RAILWAY_API_TOKEN`. The manual dispatch is the deployment control for the
single operator; no additional GitHub environment approver is required.
Verify the project token can deploy image digests before provisioning. If its
scope is insufficient, use a separate Railway workspace rather than sharing
the production token.

### Runtime browser configuration (implemented by PAR-26)

`deploy/sentry-csp.envsh` generates the allowlisted browser config at web
container startup; Nginx serves the same-origin `/runtime-config.json` with
`Cache-Control: no-store`. `deploy/runtime-config.jq` validates and serializes
only the public Sentry DSN, optional tracing rate, PostHog project token, host
and feedback survey id, plus the immutable release file copied into the image.
The source bundle has no environment-specific observability values. CSP
connect origins are derived from this generated config, and the web application
continues to start when configuration cannot be loaded. Incomplete Sentry or
PostHog settings leave the relevant integration disabled. Development continues
to use Vite's local `.env` values; the container-generated config applies to the
production image.

Before the first deployment of this image, migrate the intended public Sentry
and PostHog values from build configuration to the web service's runtime
environment. Keep source-map upload credentials in the build secret only. D4
is decided: staging and production can use the same web digest.

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
# Optional public browser settings; set per environment at runtime, never at build.
VITE_SENTRY_DSN=<staging-public-sentry-dsn>
VITE_SENTRY_TRACES_SAMPLE_RATE=0
VITE_POSTHOG_PROJECT_TOKEN=<staging-public-project-token>
VITE_POSTHOG_API_HOST=https://<staging-posthog-host>
VITE_POSTHOG_FEEDBACK_SURVEY_ID=<staging-survey-id>
```

Leave optional values empty to disable that integration. These are browser-visible
public values, not secrets. Never set `TEST_EMAIL_OUTBOX`,
`DEV_SKIP_EMAIL_VERIFICATION`, a production credential, `SENTRY_AUTH_TOKEN`, or
the API's `SENTRY_DSN` on the web service.

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
browser validation. If D8 Basic Auth is selected, implement an optional
credential input for this command that does not print or persist the secret.
Railway's API healthcheck stays on the private API service; `/healthz` remains
open for the web healthcheck.

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

## Staging HTTP Protection (D8)

**Proposed:** use Nginx's built-in
[HTTP Basic Auth module](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)
at the public web proxy, if the compatibility checks below pass. Keep TLS
enabled. Apply auth to the app, static assets, `/runtime-config.json` and all
same-origin API locations, including the special import and SSE locations.
Leave only the exact `/healthz` location unauthenticated for Railway's web
healthcheck. The Railway API healthcheck calls the private API directly.

The web image runs as the unprivileged `nginx` user. Its entrypoint already
generates runtime files in `/tmp/nginx`, which is created writable by `nginx`;
do not assume `/run` is writable. Store one pre-hashed htpasswd line as a
staging-only runtime secret. When enabled, write it to `/tmp/nginx/htpasswd`
during startup with `umask 077` and mode `0600`, then point Nginx at that file.
Do not bake credentials or hashes into the image or log them. When the secret is
unset, explicitly disable Basic Auth and remove any stale file. Production and
local development keep the secret unset and auth disabled.

### Compatibility requirements

- Browser requests can use the proxy's Basic challenge and continue sending the
  Paralleax session `Cookie`/`Set-Cookie` headers. Verify login, logout,
  registration, and cookie flags through the protected staging origin.
- Preserve streaming behavior on the comments, story events, import progress
  and QSP progress SSE paths: `/api/stories/:storyId/comment-threads/events`,
  `/api/stories/:storyId/events`, `/api/imports/:importId/events`, and
  `/api/stories/imports/qsp/progress/:progressId`. Keep their current
  unbuffered proxying and long read timeout. Verify EventSource reconnects
  after the browser has authenticated.
- Preserve request size limits, request buffering and long timeouts on native,
  QSP and ChoiceScript import paths: `/api/stories/imports/choicescript`,
  `/api/stories/imports/native/preview`, `/api/stories/imports/native`,
  `/api/stories/imports/qsp`, and `/api/stories/imports/qsp/admin`. Verify
  representative uploads succeed through the protected proxy.
- Keep `/api/ready` protected. Add optional staging credentials to
  `smoke:deployment` and Playwright `httpCredentials`; neither path may print
  the secret. CI must exercise both protected and unprotected modes.
- The local MCP API client currently authenticates to Paralleax using a session
  cookie and does not send an `Authorization` header. Its non-browser HTTP
  requests cannot answer a Basic challenge, so add an optional staging-only
  Basic credential to its transport if MCP validation must go through this
  proxy. At `http` scope, map Basic auth to an empty upstream value and apply
  `proxy_set_header Authorization $api_authorization` in every proxied API,
  SSE and import location. The [Nginx `map` directive](https://nginx.org/en/docs/http/ngx_http_map_module.html)
  is valid at `http` scope, and an empty value in
  [`proxy_set_header`](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header)
  is omitted upstream. This consumes the proxy credential while preserving the
  app session cookie; verify the API receives no Basic credentials. Remote
  OAuth/Bearer authentication is not implemented by the current MCP client; if
  introduced later, Basic Auth and Bearer both need the `Authorization` header,
  so they must not be combined on the same protected route without an explicit
  separate-route/auth design.

A shared rotating secret adds no hosting service but has no per-user audit,
SSO or identity lifecycle. It is the simplest option if the single operator
accepts those limits and can distribute it securely. If the MCP credential
change or shared-secret limits are unacceptable, defer public staging access or
evaluate an identity-aware proxy as a separate decision; that adds a provider,
configuration and likely a paid plan.

### Production-mode regression checks when auth is disabled

Before enabling Basic Auth in staging, run the production-mode web container
with the secret unset. Verify `/healthz`, `/runtime-config.json`, static assets,
login/API cookie traffic and the deployment smoke check behave as before; API
responses do not contain a Basic challenge; `/tmp/nginx/htpasswd` is absent.
Keep these checks in CI. After implementation, run the existing production
smoke path as a read-only verification, without changing production settings or
deploying from this plan.

## Browser Validation Journeys

Run after the smoke check, in a clean browser profile, on the staging domain.
When D8 Basic Auth is enabled, supply its staging-only credentials through the
browser's HTTP-auth mechanism; do not store them in the repository or in browser
test output. Also exercise the MCP HTTP client with its optional proxy
credentials, without logging either Basic credentials or session cookies.

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

An isolated staging project adds three single-replica services (API, web and
PostgreSQL `postgres-ssl:18`), a PostgreSQL volume (500 MB starting assumption),
a generated public web domain, network egress, and a staging mail sender/key.
Image builds and GHCR image storage do not incur Railway resource charges.

The current [Railway pricing](https://docs.railway.com/pricing) lists
$10/GB-month of RAM, $20/vCPU-month, $0.15/GB-month for volumes and $0.05/GB of
egress. Hobby has a $5/month subscription including $5 of resource usage; Pro
has a $20/month subscription including $20 of usage. Recheck before
provisioning.

For planning only, assume the complete active stack averages 1–2 GB RAM and
0.5–1 vCPU. That is about $20–$40/month for compute, plus about $0.08/month for
a 500 MB volume and egress. Actual cost depends on observed resource use; the
current plan's included usage offsets the first $5 or $20. A separate workspace
can add another plan subscription.

### D6 options

| Mode                                                        | Resource estimate                                                                                                                                                                                                  | Ready again                                                                                                                                                                        | Data retention and trade-off                                                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Always on                                                   | About $20–$40/month compute plus $0.08 storage and egress in the example above.                                                                                                                                    | Immediate.                                                                                                                                                                         | Database and test accounts remain between campaigns; cleanup and retention are still required.                                                                                         |
| Explicitly remove deployments, keep project/services/volume | No deployment compute while stopped; about $0.08/month for a 500 MB volume, within the plan usage allowance; the paid plan minimum remains.                                                                        | Plan 5–15 minutes to redeploy the saved database image and pinned API/web images, then run readiness and smoke checks. This is an estimate, not an SLA; measure the first restore. | Test data remains on the attached PostgreSQL volume. Retention, access and backup rules still apply.                                                                                   |
| Railway Serverless sleep                                    | Potentially no compute while each service is asleep, plus volume storage, egress and plan costs. If PostgreSQL stays awake, its illustrative 0.5–1 GB RAM and 0.25–0.5 vCPU profile is $10–$20/month plus storage. | Railway samples inactivity after 5 minutes; practical sleep is about 5–10 minutes. The first request has a cold start and can return 502.                                          | Data persists. API database connections, private-network traffic and telemetry can prevent API/web sleep; API connections can wake a sleeping database. Must be measured, not assumed. |
| Campaign-only, destroy project and volume                   | Four 4-hour campaigns/month at the example profile: roughly $0.45–$0.88 compute plus egress; subscription minimum still applies.                                                                                   | Plan at least 5–15 minutes to recreate, deploy, migrate and smoke check; estimates are not guarantees.                                                                             | Deleting the volume deletes staging data. Volume deletion is queued and becomes permanent within 48 hours; configuration and accounts need recreating too.                             |

**Recommended for one operator:** after a campaign, explicitly remove the latest
successful deployment from the web, API and PostgreSQL services with Railway's
[`railway down`](https://docs.railway.com/cli/down), while keeping the project,
services and PostgreSQL volume. The CLI removes the deployment, not the service;
the volume is independently attached to the service. Redeploy from the immutable
release manifest and pinned image digests, never from a repository build. Start
PostgreSQL from its saved image source, confirm its volume, then deploy the API
digest (pre-deploy migration and readiness), followed by the web digest and
smoke check. This avoids assumptions about network-idle detection and retains
test data for the next campaign. The operator must confirm the
project/environment before each command.

Railway documents that deployment deletion does not delete the service and
describes the [volume lifecycle](https://docs.railway.com/volumes/reference)
separately. Volume attachment and data integrity after stopping/redeploying this
custom `postgres-ssl:18` service remain an operational validation gate. During
the first staging campaign, verify the volume remains attached, run a read-only
data check after redeployment, and record the actual restoration time before
adopting the procedure.

Railway [Serverless](https://docs.railway.com/deployments/serverless) is the
alternative if automatic wake is worth the uncertainty. Railway detects
outbound activity, not simply absence of inbound browser requests. Database
pools, telemetry, NTP and private-network traffic may prevent sleep; a sleeping
service wakes on traffic, can have a cold start, and the first request may return 502. Do not assume the app, API, database connections or telemetry permit
automatic sleep. Full destruction is simpler on storage cost but deletes the
volume and test data and takes more operator steps to restore.

Possible extra spending:

- a new subscription if a separate workspace is chosen;
- retained volume storage between campaigns (about $0.08/month at 500 MB,
  within the plan usage allowance; the paid plan minimum remains);
- volume growth from test data or imports;
- network egress during large imports or load tests;
- Brevo plan limits if staging emails share the production quota (use a
  separate key, and check the sender limit);
- a custom domain registration, if one is chosen.

## Risks

| Risk                                              | Mitigation                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Staging token modifies production                 | Project-scoped staging token if it can deploy images, else separate workspace (D1); isolated GitHub `staging` environment. |
| Browser events reach production Sentry or PostHog | Use only per-environment runtime values; verify effective `/runtime-config.json`, CSP and browser requests (D4).           |
| Verification emails reach real users              | Dedicated Brevo key and sender; operator-owned mailboxes only; registration closed between campaigns.                      |
| Test outbox exposes tokens                        | `NODE_ENV=test` only on ephemeral stacks without real mailboxes.                                                           |
| Staging cookie collides with production           | No cookie `Domain` (host-only); generated Railway domain (D3).                                                             |
| IaC planned against the wrong project             | Separate partial and file outside `.railway/`; confirm the linked project before every plan.                               |
| Staging data treated as valuable                  | Disposable notice, no valuable projects, retention decision and reset procedure (D6).                                      |
| Forward-only migration breaks staging             | Rebuild from an empty database; production rollback is image-only.                                                         |
| Unauthorized browsing or signup                   | Web-tier Basic Auth (D8), plus closed registration between campaigns.                                                      |
| Forgotten running stack                           | `railway down` after a campaign, written service order and monthly cost review; volume storage still accrues.              |

## Teardown

Do this in order. Each step is destructive; confirm the project id first.

1. Confirm the target is the staging project, not `fearless-warmth`, by name and id.
2. Set `REGISTRATION_MODE=closed` and tell testers.
3. Export anything worth keeping (logs, screenshots, findings). Decide whether
   to retain tester accounts/data for the next campaign or delete them under the
   agreed retention period (D6).
4. Remove the custom domain (if any) and its DNS record, so the name cannot be
   taken over.
5. Revoke the staging Brevo key and the staging Railway token, and delete the
   GitHub `staging` environment secrets and variables.
6. For full teardown, delete the staging project and explicitly verify that its
   PostgreSQL volume is deleted as well. Railway queues volume deletion and
   permanently deletes it within 48 hours; do not confuse `railway down` (which
   removes only a deployment) with deleting the persistent data.
7. If a separate workspace was created only for staging, delete or downgrade it.
8. Verify in Railway that no volume, domain or usage line remains, and that the
   production project and workspace token are unaffected.

Between campaigns, the D6 recommendation is to remove deployments and keep the
project, services and PostgreSQL volume. Volume storage continues to accrue;
compute does not accrue for removed deployments. Follow the first-cycle
operational validation above before relying on data retention or the measured
reactivation time.

## PAR-21 Implementation Still Required

This PR proposes the architecture and records its gates; it does not implement
or provision staging. The remaining work is:

1. Split the release path in `.github/workflows/ci.yml`: preserve exhaustive CI
   before publication; build and publish once; write a manifest with commit,
   tag, publishing run id, and both immutable image digests; do not deploy from
   the publication job.
2. Add a manually dispatched staging workflow that downloads and validates the
   publishing manifest, deploys the API then web digest, runs smoke/browser
   validation, and records a staging validation artifact containing the exact
   source run id and digest pair.
3. Add manual production promotion that accepts a successful staging run id,
   verifies its record against the original release manifest, then deploys the
   same API/web digests without rebuilding. Only this job gets production
   RAILWAY_API_TOKEN; the staging environment gets project-scoped
   RAILWAY_TOKEN.
4. Add staging IaC and, after the required decisions and operational gates,
   create the separate project/services and set least-privilege secrets.
5. Before the first deployment, migrate public Sentry/PostHog browser values
   from build configuration to web-service runtime variables. Keep the Sentry
   release and matching source maps image-bound and SENTRY_AUTH_TOKEN
   build-only.
6. If D8 is accepted, generate `/tmp/nginx/htpasswd` at startup with restrictive
   permissions, disable/remove it when unset, protect the web and proxy routes,
   exempt only `/healthz`, and strip Basic credentials before forwarding API
   requests. Add optional credentials to smoke, browser and MCP clients.
7. Add CI coverage for auth enabled/disabled, healthchecks, cookie flows, SSE,
   imports, MCP, and the absence of forwarded Basic credentials. Keep production
   mode without the auth secret as a regression case.
8. Complete the read-only PostgreSQL version check, the initial staging
   validation, and the stop/redeploy volume-retention and restoration-time
   measurement described below.

## Decisions and Operational Gates

ADR-051 remains Proposed. This plan may be reviewed before the operational
gates below are complete; those gates are prerequisites to provisioning or
deploying staging, not prerequisites to reviewing this documentation PR.

### Settled inputs

- D2: use real Brevo delivery with a staging-only key and operator-controlled
  test mailboxes, under NODE_ENV=production.
- D3: start with a generated *.up.railway.app domain.
- D4: PAR-26 implements same-web-digest promotion with public browser
  configuration generated at runtime and an immutable Sentry release matching
  the source maps. Runtime public values must be migrated before its first
  deployment.

### Human choices before provisioning

| Decision                    | Proposed choice                                                                                                                                                                                                                                                                           | Advantage                                                                                                                               | Limit and estimated cost                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 - Railway isolation      | Separate project in the existing workspace, using project-scoped RAILWAY_TOKEN. Use a separate workspace only if that token cannot perform the required deployment.                                                                                                                       | Keeps services and data isolated without another workspace or subscription; the staging job cannot read production RAILWAY_API_TOKEN.   | Confirm project-token CLI/image-deploy support before the first deploy. A separate workspace can add another plan minimum: currently $5/month on Hobby or $20/month on Pro, subject to included usage and current pricing.                                                                                                |
| D5 - Deployment control     | Manual dispatch by the single operator from main, branch-restricted staging environment, least-privilege contents/actions permissions; packages read only for private images. No additional GitHub approver. Production promotion is a separate manual dispatch after staging validation. | Deliberate, auditable release hand-off and distinct staging/production credentials; no added hosting cost or approval-role maintenance. | One person can initiate promotion without a second reviewer. The production workflow must validate the exact successful staging run and both digests before it receives RAILWAY_API_TOKEN.                                                                                                                                |
| D6 - Between-campaign state | Recommend railway down for web, API and PostgreSQL deployments while retaining the project, services and attached 500 MB volume.                                                                                                                                                          | No deployment compute while stopped; keeps test data and avoids a sleep-detection dependency.                                           | About $0.08/month volume storage within the plan usage allowance; the paid plan minimum remains. Estimate 5–15 minutes to restore, not an SLA. Data persists, so account cleanup and retention remain necessary. Validate attachment, integrity and actual time on the first staging cycle.                               |
| D8 - HTTP access            | Recommend Nginx Basic Auth over HTTPS, with the shared staging secret consumed by the proxy and optional support in the MCP/smoke/browser clients.                                                                                                                                        | Reuses the existing web proxy; no additional service or subscription.                                                                   | One rotating shared credential has no individual audit, SSO or user lifecycle. MCP currently sends only its Paralleax session cookie, so it needs optional Basic credentials to pass the proxy challenge. If that small change is unacceptable, defer public staging access rather than add an identity proxy dependency. |

D5 is the finalized proposal: no second approver is part of this plan. Human
approval of ADR-051 and the D1, D6 and D8 choices remains necessary before
provisioning.

### Operational validation gates

- D1: before the first staging image deployment, verify the staging
  RAILWAY_TOKEN is scoped to the staging project/environment and can deploy a
  public GHCR digest. RAILWAY_API_TOKEN is the current production release
  secret and must remain unavailable to staging.
- D6: on the first staging campaign, remove deployments only in the staging
  project, confirm the PostgreSQL volume remains attached, redeploy the pinned
  database/API/web images, perform a read-only data check, and record actual
  restoration time. Do not enable automatic Serverless sleep on the assumption
  that API database connections or telemetry are idle.
- D7: the production image tag postgres-ssl:18 is not evidence of the running
  server major. Before provisioning, an operator with approved read-only
  database access must execute SHOW server_version against production and record
  only the returned version. That query has not been completed; no credential or
  access restriction is to be bypassed. The 500 MB volume remains a provisional
  sizing assumption.
- D8: before enabling auth, verify staging healthchecks, browser cookie flows,
  all API routes including SSE/imports, and MCP requests. Confirm a Basic header
  is not forwarded to the API and that production-mode containers with the
  secret unset have no auth challenge or htpasswd file. These are future
  implementation checks; no production setting is changed by this plan.
- Release config: migrate public Sentry/PostHog values to runtime variables
  before the first deployment of the PAR-26 web image. Confirm the effective
  runtime JSON/CSP and source-map release in staging, then validate that
  promotion uses the same manifest and both digests.

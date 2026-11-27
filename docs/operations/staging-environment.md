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
| Application sources | Both services run immutable `ghcr.io/jcarly/...@sha256:` digests deployed by the tag workflow.                                                                                                                                                                                                                                                                      |
| IaC                 | `.railway/railway.ts` declares `project('fearless-warmth')` and the `paralleax-apps` partial, with `domains: paralleax.app` and a GitHub `main` bootstrap source. It cannot be reused for another project as is.                                                                                                                                                    |
| Release workflow    | The `release` job in `.github/workflows/ci.yml` hardcodes the production project id, the `production` environment and `https://paralleax.app`, and authenticates with `RAILWAY_API_TOKEN`. There is no staging deploy path.                                                                                                                                         |
| Token scope         | The documented production token is workspace-scoped. A staging workflow must use a staging-only project token if that token can deploy GHCR digests, or an isolated workspace token otherwise; it must never read `RAILWAY_API_TOKEN`.                                                                                                                              |
| Web image           | PAR-26 now generates `/runtime-config.json` at container startup from validated public runtime variables. The same web digest can use separate Sentry/PostHog settings per environment; the bundle contains no environment-specific DSNs, tokens or hosts. The CSP is derived from that effective configuration.                                                    |
| Sentry release      | The web image carries the immutable release value used for its source maps. Runtime configuration reads that image value, not a stale runtime override. `SENTRY_AUTH_TOKEN` is only a BuildKit build secret.                                                                                                                                                        |
| Email               | `TEST_EMAIL_OUTBOX` and the `/api/test/auth/emails/latest` route exist only under `NODE_ENV=test`. `NODE_ENV=production` is the only mode with `Secure` cookies, the exact-`Origin` guard on mutations, helmet CSP and JSON logs.                                                                                                                                   |
| Acceptance suite    | `npm run test:acceptance` against `PARALLEAX_ACCEPTANCE_BASE_URL` needs the test outbox, hence `NODE_ENV=test`, so it cannot validate production cookie or origin behaviour.                                                                                                                                                                                        |

## Target Topology

```text
browser → Railway edge (HTTPS, generated or staging domain)
        → web service (public, port 8080, Nginx Basic Auth, /api proxy)
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

Staging deploys the exact API and web GHCR digests that the release will later
send to production, so the artifacts under test are the artifacts that ship.
Runtime configuration may differ by environment; rebuilding an image for
staging invalidates this promotion guarantee.

- A release candidate is built once by the existing exhaustive CI path and
  recorded by digest in the job summary.
- A manual `workflow_dispatch` staging deploy (not yet written) takes both
  `sha256` digests as inputs, refuses tags and branches, and runs only from
  `main` in a GitHub Actions environment named `staging` with its own secrets
  and variables.
- It authenticates with a staging-only Railway token (`RAILWAY_STAGING_API_TOKEN`)
  and targets a staging project id variable. It must never read
  `RAILWAY_API_TOKEN`.
- Order matches production: connect the API digest, wait for its pre-deploy
  migration and `/api/health`, connect the web digest, then run
  `npm run smoke:deployment -- https://<staging-domain>`.
- The production release job stays unchanged and does not depend on staging.

The GitHub Actions job gets only `contents: read` (and `packages: read` only if
the images are private). Its Railway token is scoped to the staging project; if
Railway cannot deploy digest sources with a project token, isolate it in a
separate workspace rather than reusing the production token. The manual dispatch
is the deployment approval for this single-operator workflow; no additional
reviewer is required to trigger each campaign.

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
browser validation. If D8 Basic Auth is enabled, the smoke command must receive
the staging-only HTTP credentials without printing them; Railway's API
healthcheck stays on the private API service, and `/healthz` remains open for
the web healthcheck.

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

Recommended: use Nginx's built-in
[HTTP Basic Auth module](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)
at the public web proxy. Apply `auth_basic` and `auth_basic_user_file` to the
server so the app, static assets, generated `/runtime-config.json` and same-origin
`/api` proxy are all protected. Keep TLS enabled; Basic Auth is only appropriate
over HTTPS.

Store a pre-hashed `htpasswd` entry as a staging-only runtime secret and write it
to a mode-`0600` file under `/run` during container startup. Do not bake the
password or hash into the image, log it, or place it in a browser test artifact.
Rotate the shared password between campaigns. A shared account is simple and
has no direct hosting cost, but it provides no per-user audit trail, SSO or
identity lifecycle; choose an identity proxy only if those controls become a
requirement.

Use an exact `/healthz` location with `auth_basic off` so Railway's public web
healthcheck can still probe the process. The API healthcheck calls the private
API service directly and is unaffected. Keep `/api/ready` protected: the
deployment smoke command must support a staging-only username/password and send
the Basic Auth header without logging it. Browser journeys can use the browser's
HTTP credentials; any Playwright run aimed at protected staging must configure
`httpCredentials`. The normal acceptance suite continues on its isolated
`NODE_ENV=test` stack and does not need these credentials.

## Browser Validation Journeys

Run after the smoke check, in a clean browser profile, on the staging domain.
When D8 Basic Auth is enabled, supply its staging-only credentials through the
browser's HTTP-auth mechanism; do not store them in the repository or in browser
test output.

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

Railway currently charges $10/GB-month of RAM, $20/vCPU-month, $0.15/GB-month
for volumes and $0.05/GB of egress. Hobby is a $5/month minimum including the
first $5 of usage; Pro is $20/month including the first $20. These rates change,
so recheck the official [pricing page](https://docs.railway.com/pricing) before
provisioning.

For planning only, assume the complete active stack averages 1–2 GB RAM and
0.5–1 vCPU. That is about $20–$40/month for compute, plus about $0.08/month for
a 500 MB volume and egress. The actual invoice depends on observed resources;
the existing plan's included usage offsets the first $5 or $20. A second
workspace can add a separate plan minimum.

### D6 options

| Mode                                   | Resource estimate                                                                                                                                                                                                                          | Ready again                                                                                                                          | Data retention and trade-off                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Always on                              | About $20–$40/month compute + $0.08 storage in the example above.                                                                                                                                                                          | Immediate.                                                                                                                           | Database and test accounts remain between campaigns; still needs cleanup and retention rules.                                                                                                 |
| On-demand web/API, PostgreSQL retained | Web and API can use Railway's serverless sleep mode and incur no compute while asleep. PostgreSQL remains online; an illustrative 0.5–1 GB RAM and 0.25–0.5 vCPU DB profile is about $10–$20/month, plus $0.08 storage and egress.         | A request wakes a sleeping service; allow seconds to a few minutes as an unverified planning range and measure the first wake.       | 500 MB database volume and tester data persist. Sleep/wake does not reset state; ensure accounts and data are removed under a retention schedule.                                             |
| Campaign-only stack, delete after      | At four 4-hour campaigns per month, the example full-stack profile costs roughly $0.45–$0.88 compute, plus egress. Add $0.08/month only if a 500 MB volume is kept; delete it to erase the data. The workspace plan minimum still applies. | Reserve 5–15 minutes to redeploy images, run migrations, healthchecks and smoke validation; this is a planning estimate, not an SLA. | Destroying the volume deletes tester data; retaining it preserves that data and its storage charge. Recreating the whole stack adds operator steps and more chances to mis-target production. |

Recommended starting point for one operator: sleep the web and API services
between campaigns and retain only the isolated PostgreSQL service/volume. It
avoids a second hosting platform and avoids rebuilding the database each time.
If the database's baseline cost is not acceptable, choose campaign-only creation
and explicitly accept data deletion; first validate the wake path and timing on
a disposable environment. Railway's [serverless mode](https://docs.railway.com/platform/advanced-concepts#deploy-options)
documents zero resource usage for sleeping services. The estimate does not
assume that PostgreSQL itself can safely sleep or wake on a database connection.

Possible extra spending:

- a new subscription if a separate workspace is chosen;
- PostgreSQL compute left running between campaigns under the recommended D6
  mode;
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
| Forgotten running stack                           | Railway sleep for web/API; usage limit and monthly review of the PostgreSQL service.                                       |

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
   permanently deletes it within 48 hours; do not confuse stopping/removing a
   deployment with deleting its persistent data.
7. If a separate workspace was created only for staging, delete or downgrade it.
8. Verify in Railway that no volume, domain or usage line remains, and that the
   production project and workspace token are unaffected.

Between campaigns, the D6 recommendation is to enable Railway serverless sleep
for web and API and leave PostgreSQL online. Sleeping services do not incur
compute, but the database continues to incur compute and its 500 MB volume
continues to incur storage charges. Railway volumes persist independently of
application image/deployment changes.

## Decisions Needed Before Provisioning

| Id  | Decision                  | Status and choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Railway isolation         | **Conditional:** second project in the current workspace if a project-scoped staging token can deploy GHCR digests; otherwise a separate workspace (and subscription). Verify token scope before provisioning.                                                                                                                                                                                                                                                                                     |
| D2  | Email handling            | **Decided:** real Brevo, dedicated key, operator-controlled test addresses, `NODE_ENV=production`.                                                                                                                                                                                                                                                                                                                                                                                                 |
| D3  | Domain                    | **Decided:** generated `*.up.railway.app` domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| D4  | Shared web digest         | **Decided by PAR-26:** promote the exact same web digest; configure public Sentry/PostHog values at container runtime. Release identity and source maps travel with the image.                                                                                                                                                                                                                                                                                                                     |
| D5  | Deployment control        | **Recommended decision:** manual `workflow_dispatch` from `main`, two digest-only inputs, a branch-restricted GitHub `staging` environment, staging-only Railway token, and `GITHUB_TOKEN` limited to `contents: read` (plus `packages: read` only for private images). Manual dispatch is the operator gate; production secrets/token are unavailable to the job.                                                                                                                                 |
| D6  | Permanence                | **Recommended:** on-demand web/API using Railway serverless sleep; retain the isolated PostgreSQL service and 500 MB volume between campaigns for simple reactivation. Human validation remains: accept roughly $10–$20/month illustrative DB compute plus storage, or choose campaign-only teardown and lose tester data. Measure wake time and actual resource use before committing to a budget.                                                                                                |
| D7  | Postgres major and volume | **Open:** the live template tag is `postgres-ssl:18`, but the actual server version was not verifiable through the authorized read-only connector. An operator with approved read-only DB access must run `SHOW server_version` and record only the result; 500 MB remains a provisional volume size.                                                                                                                                                                                              |
| D8  | Access restriction        | **Recommended:** Nginx HTTP Basic Auth at the web proxy, protecting the app, `/runtime-config.json` and `/api`; exempt only `/healthz`. API healthchecks remain direct/private. Before enabling it, add optional staging credentials to `smoke:deployment` and configure browser `httpCredentials`; automated acceptance remains on its existing ephemeral `NODE_ENV=test` stack. Human validation: accept one shared rotating secret (no per-user audit/SSO) or choose a separate identity proxy. |

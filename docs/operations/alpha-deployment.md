# Creator Alpha Deployment

Status: Required operator runbook

Last reviewed: 2026-10-28

## Scope

This runbook prepares Paralleax for a small creator alpha. Account creation is
open while enabled, but every new account must verify its email address before
sign-in. This runbook does not authorize public story publication or anonymous
reading. The deployment remains provider-neutral: a hosting provider, managed
PostgreSQL service, public domain, and operator contact must be selected before
production registration is enabled or user projects are retained as valuable
data.

Guided usability sessions may use explicitly disposable test Stories in a
controlled non-production environment after the alpha notice and standard
account, access, and privacy safeguards are ready. Do not use those sessions to
accept valuable project data. Complete the provider and operator gates below
before authors rely on the service to retain their projects.

The authoring guide stores only its step and active Story pointer in the
browser's account-scoped `localStorage`; it does not send guide activity to an
analytics service. Do not enable journey milestones or a post-Simulation survey
until an explicit consent flow and the alpha notice describe the purpose, fields,
provider, and retention. The separate Formbricks feedback button is voluntary,
but opening it sends survey context and Formbricks can record the full URL,
including a Story id. Review the [Formbricks runbook](formbricks-feedback.md)
and reflect that metadata in the tester notice before collecting responses.

## Required Topology

Use one public HTTPS origin for the browser and API:

```text
browser → TLS edge → Paralleax web container → /api proxy → API container → managed PostgreSQL
```

The web container serves the Vite build, applies browser security headers, and
proxies `/api` to the private API service. The API rejects production mutations
whose `Origin` header does not exactly match `CORS_ORIGIN`. Do not expose the API
container directly to the public Internet.

The hosting edge must terminate TLS, redirect HTTP to HTTPS, and add HSTS after
the domain and certificate have been verified. Keep the web and API containers
on a private network.

## Provider Gates

Before accepting valuable user-created project data, record evidence for all of
the following. Test accounts and feedback remain subject to the alpha notice and
the service's normal security, access, and privacy controls:

- separate staging and production projects;
- a managed PostgreSQL 17-compatible database with encrypted connections;
- automated encrypted backups in a separate failure domain;
- a completed restore drill following the PostgreSQL recovery runbook;
- secret-manager entries for every production environment value;
- application logs, error reporting, uptime probes, and alert recipients;
- the operator identity, contact address, retention period, and incident channel
  in the alpha-test notice;
- a tested application-image rollback and a separate database recovery decision.

## Environment

Use `.env.production.example` only as a list of required names. Store real values
in the provider secret manager, never in a deployed file or the repository.

For the private alpha, use:

```dotenv
NODE_ENV=production
CORS_ORIGIN=https://alpha.example.com
REGISTRATION_MODE=open
BREVO_API_KEY=<brevo-api-key-kept-in-the-secret-manager>
EMAIL_FROM=Paralleax <accounts@alpha.example.com>
# EMAIL_REPLY_TO is optional.
POSTGRES_SSL=true

# Optional Sentry monitoring. Set both DSNs to enable API/browser error reports.
# Use one immutable commit or image digest in both release values.
SENTRY_DSN=https://<api-public-key>@o<organization>.ingest.sentry.io/<project>
SENTRY_RELEASE=<immutable-commit-or-image-digest>
VITE_SENTRY_DSN=https://<web-public-key>@o<organization>.ingest.sentry.io/<project>
VITE_SENTRY_RELEASE=<immutable-commit-or-image-digest>
```

`BREVO_API_KEY` must contain a Brevo API key, not an SMTP key. The API sends
transactional messages over HTTPS so deployment plans that block outbound SMTP
do not require a mail-port exception.

To enable the optional contextual feedback button, also set
`VITE_FORMBRICKS_WORKSPACE_ID` and `VITE_FORMBRICKS_APP_URL` before building the
web image. They are public build inputs, not server secrets. Follow the
[Formbricks feedback runbook](formbricks-feedback.md) before collecting tester
responses.

Open registration does not grant a session immediately: the user must consume
the verification link delivered to their email address. Set
`REGISTRATION_MODE=closed` whenever no more accounts should be created. The API
rejects the removed `access-code` mode and `REGISTRATION_ACCESS_CODE` setting;
delete both legacy values from the deployment environment before release.

## Build And Release

The multi-stage `Dockerfile` uses Node 24, matching the repository and CI, and
has two production targets. Each compiles the shared
package and only the application in its target, so web source changes do not
affect the API image build and vice versa:

```bash
docker build --target api --tag registry.example/paralleax-api:<commit> .
docker build --target web --tag registry.example/paralleax-web:<commit> .
```

Use immutable commit or digest references. GitHub Actions builds both targets
when Docker, production Compose, deployment, or dependency-manifest files change.
Application pull requests still run the affected workspace build and tests. A
newly created version tag in the exact `x.y.z` format runs exhaustive CI first;
only after all required checks pass does the release job publish API and web
images to GHCR and deploy those image digests to the Railway alpha. The job
deploys the API first, waits for its healthcheck, then deploys the web image and
runs the deployment smoke check. Re-tagging or deleting a version does not
deploy. No branch push publishes images or runs the GitHub Actions release job.

The release tags each image with the version and source commit for discovery,
but Railway receives `ghcr.io/...@sha256:...` references. The web Sentry release
and API `SENTRY_RELEASE` are set from the version tag so both services identify
the same release. The workflow uses the existing public web Sentry DSN and
optional public Formbricks build values from GitHub Actions repository variables.
If browser source maps are enabled, store `SENTRY_AUTH_TOKEN` as a GitHub Actions
secret. Only the web image build mounts it as a BuildKit secret; it is not passed
to the API build, a build argument, or the final image. Local production Compose
uses the same build-secret mount when `SENTRY_AUTH_TOKEN` is present in the
operator environment. Since BuildKit does not include secret contents in its
cache key, use `docker compose build --no-cache web` after adding or rotating the
local token so a cached web layer cannot skip the upload.

Run the API image once as a migration job before replacing application traffic:

```bash
node apps/api/dist/main.js --migrate
```

Only start the new API after the migration succeeds. Readiness must remain out
of service until PostgreSQL is reachable and the latest migration is present.

For a local production-shaped smoke environment connected to a non-production
managed database:

```bash
docker compose --env-file .env.production -f compose.production.yaml up --build
```

The Compose file runs the migration container first, then the API, then the web
container after API health succeeds. It intentionally does not create a
PostgreSQL service. Valuable alpha projects must use the selected managed
service; disposable session data must stay in the isolated test environment and
follow its stated reset/retention limit.

### Railway

Railway does not run this Compose topology as one container. Create three
services in the same project and environment: Railway PostgreSQL, `api`, and
`web`. Connect both application services to this repository with the repository
root as their root directory.

The tag release job targets the existing `fearless-warmth` project and its
`production` environment, where the services are named `@paralleax/api` and
`@paralleax/web`. GitHub Actions is the sole application deployment path: disable
Railway's native GitHub auto-deploy trigger on both services. Otherwise a push
to `main` can deploy independently of CI and later replace a tagged release.
The first successful version-tag release switches each application service
source from the branch to its published image digest; PostgreSQL remains
unchanged.

The production configuration was checked on 2026-11-11. Both application
services were still connected to `main` with native deployments active. The API
service's effective builder was `RAILPACK` despite the repository declaring
`DOCKERFILE`; its failed build rejected the Dockerfile's BuildKit secret mount.
The API watched only `/apps/api/**` and the web service only `/apps/web/**`,
missing shared packages and Docker build inputs. The live Config File Path
settings still point at the legacy custom files until the one-time migration
below is applied. Do not treat repository configuration as proof that the live
Railway builder, triggers, or Config File Path have changed. Once the first
version tag deploys, verify both sources show immutable GHCR digests and the API
and web healthchecks still pass.

The app settings are now authored in `.railway/railway.ts` as the named
`paralleax-apps` partial. It owns only `@paralleax/api` and `@paralleax/web`.
Postgres and `postgres-volume` remain outside IaC ownership, so a plan for this
partial must not list either resource. For the initial migration, the file
explicitly declares the existing `jcarly/paralleax` `main` source for both
services: the tested CLI plan would otherwise replace each `source.repo` and
`source.type` with `null`. GitHub Actions still selects immutable image digests
for tagged releases; this GitHub declaration is a one-time migration bootstrap,
not a permanent release source. The file declares the existing app variable
names with `preserve()` so Railway keeps their values, including secrets and
service references, without exposing them in Git. Add or remove a
name in that preserve list whenever an app variable is added or retired.
Existing private network endpoints and the `paralleax.app` web domain are also
represented in IaC; Railway-generated service domains remain provider-managed.

To migrate the live app settings:

1. Before merging the legacy JSON file removals or pushing a source change,
   disable native GitHub auto-deploy on both app services and verify it is off.
2. Install Railway CLI `5.68.0` or newer, link the repository root to
   `fearless-warmth` / `production`, and run `railway config partials list`.
   Resolve any existing owner for either app service before proceeding.
3. In each application's Railway service settings, clear the custom Config File
   Path (`/deploy/railway.api.json` or `/deploy/railway.web.json`). Railway
   requires legacy service configuration to be cleared before IaC can manage
   that service.
4. Run `railway config plan` and review the full plan. It may update build or
   deploy settings on the API and web only, and remove the old Railpack build
   command. Stop if it creates, deletes, or changes another resource, a variable,
   domain, source, Postgres, or volume. In particular, verify that all existing
   application variables are preserved and the immutable image sources remain
   untouched.
5. Apply only the reviewed plan with `railway config apply`. If Railway stages a
   deployment, keep the existing release validation gates and do not deploy an
   unvalidated image.
6. Run `railway config plan` again and confirm there is no remaining drift.

**Source drift after the first tagged release:** the GitHub Actions workflow
changes both sources to immutable GHCR image digests. The IaC file still declares
GitHub `main` to preserve the pre-release source during migration. A later
`railway config plan` may therefore propose replacing an image digest with the
GitHub repository. Do **not** apply that plan. Before making any further IaC
changes, reconcile the source-of-truth strategy so the current immutable images
are retained. A source change requires an explicit release decision, even when
all other parts of the plan are safe.

Railway's automatic Config as Code converter is not used for these custom file
paths. The TypeScript config writes the Docker builder and restart policy
explicitly so the migration does not depend on converter output.

Before creating the first release tag, configure the GitHub repository:

- Create a Railway **workspace token** with access to `fearless-warmth`, or an
  **account token** if the project belongs to your personal Railway account.
  Store it as the repository Actions secret `RAILWAY_API_TOKEN`. The tagged
  release changes service sources to GHCR images, which requires broader
  permissions than a project-scoped `RAILWAY_TOKEN` provides. Do not pass both
  token types to the same CLI invocation. Treat this credential as privileged;
  keep it in GitHub Actions secrets, not build arguments or application images.
  The workflow verifies read access to both services before building images.
- Copy the existing `VITE_SENTRY_DSN` build value into the `VITE_SENTRY_DSN`
  Actions variable. If enabled, also add `VITE_FORMBRICKS_WORKSPACE_ID` and
  `VITE_FORMBRICKS_APP_URL` and `VITE_SENTRY_TRACES_SAMPLE_RATE` as Actions
  variables.
- If browser source-map uploads are enabled, add `SENTRY_AUTH_TOKEN` as an
  Actions secret and `SENTRY_ORG`, `SENTRY_PROJECT`, and optional `SENTRY_URL`
  as Actions variables. Keep the token in GitHub Actions only; Railway deploys
  the already-built web image and does not need this build secret.
- The workflow publishes packages linked to this public repository and checks
  that both image digests can be pulled anonymously before it changes either
  Railway service. If that check fails on the first release, set both package
  visibilities to Public in GitHub Packages settings and rerun the tag workflow.
  Public images require no Railway registry credentials.

The workflow switches the service source to a digest but does not create Railway
credentials. The IaC partial keeps the API migration pre-deploy command
`node apps/api/dist/main.js --migrate`, the `/api/health` API healthcheck, and
the `/healthz` web healthcheck configured after the service source changes from
the repository to an image.

Configure the `api` service with these variables:

```dotenv
RUNTIME_TARGET=api
PORT=3000
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
POSTGRES_SSL=true
CORS_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
REGISTRATION_MODE=open
SENTRY_DSN=<api-sentry-dsn>
SENTRY_RELEASE=<immutable-commit-or-image-digest>
```

The `Postgres` and `web` names in reference variables are case-sensitive and
must match the Railway service names. A custom public domain may replace the
generated web domain in `CORS_ORIGIN`. Do not generate a public domain for the
API service. The IaC API config runs migrations as a Railway pre-deploy command,
then uses `/api/health` to verify that the HTTP process is listening. Database
and schema readiness remain mandatory release checks through `/api/ready`;
Railway's deployment healthcheck should not conflate an HTTP listener failure
with a PostgreSQL readiness failure.

Keep the `web` service's public domain on container port `8080` and set:

```dotenv
PORT=8080
API_HOST=${{api.RAILWAY_PRIVATE_DOMAIN}}
API_PORT=3000
```

If Formbricks feedback is enabled, add its two `VITE_FORMBRICKS_*` values to the
web service so Railway makes them available to the Docker build and the runtime
Content Security Policy.

Browser reports are configured at image build time. Set `VITE_SENTRY_DSN`,
`VITE_SENTRY_TRACES_SAMPLE_RATE`, and the release value through the GitHub
Actions variables used by the tag workflow. For source-map uploads, provide
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` there as described above.
The token needs Sentry project write/release administration access and must not
be exposed as a `VITE_*` value, a build argument, or part of the final web image.

Nginx listens on `PORT`, and both image and Railway healthchecks use that same
value. Keep the public-domain target port and `PORT` aligned; `8080` is the
documented default.

`API_HOST=api` is only the Docker Compose default. Railway private DNS uses a
name under `railway.internal`; leaving the Compose default in Railway makes
the `/api` proxy target invalid. Nginx resolves that target at request time so
the web process and `/healthz` can start while the API service or its private DNS
is still converging. The web image explicitly enables the official Nginx
entrypoint's local-resolver discovery so this runtime resolution uses Railway's
container DNS. API requests remain unavailable until the target resolves. Deploy
the API successfully before the web service, then run the release verification
below.

## Release Verification

After every deployment:

1. Confirm the provider reports both containers healthy.
2. Run `npm run smoke:deployment -- https://alpha.example.com`.
3. On an isolated test stack and database, run the real-stack browser acceptance
   path. Its API must run with `NODE_ENV=test` and `TEST_EMAIL_OUTBOX=true` so the
   harness can follow a verification link without exposing test messages from the
   production deployment:
   `PARALLEAX_ACCEPTANCE_BASE_URL=https://acceptance.example.com npm run test:acceptance`.
   It creates a uniquely named test account and Story and must not target the
   production user database.
4. Register a new account and confirm that its verification link is required
   before sign-in.
5. Create a story, add and edit an interaction, and reload the editor.
6. Run Simulation Mode and confirm it does not alter reader progress.
7. Sign out, sign in again, and confirm the story and reader progress persist.
8. Record the image digests, migration id, database backup identifier, smoke
   result, operator, and deployment time.

## Monitoring And Alerts

Probe `/healthz` for the public web path, `/api/health` for API liveness, and
`/api/ready` for PostgreSQL/schema readiness. Alert on sustained non-2xx results,
HTTP 5xx spikes, repeated restarts, database saturation, backup age, failed
backups, and disk or connection exhaustion.

Application logs contain request ids but intentionally exclude request bodies,
cookies, tokens, and query strings. Configure an error-reporting service to keep
the request id while applying the same redaction rules.

### Sentry

Sentry is optional and disabled until its DSN is configured. Use separate API
and browser projects where practical, and set the same immutable release value
for both so an incident can be tied to one deployed image. The integration sends
only error type, stack location, release, environment, request id, method,
status, and stable application error code. It removes users, story content,
request/response data, cookies, headers, query parameters, breadcrumbs, local
variables, source context, and exception messages before delivery.

Tracing is off unless `SENTRY_TRACES_SAMPLE_RATE` or
`VITE_SENTRY_TRACES_SAMPLE_RATE` is explicitly set to a number from `0` to `1`.
Begin with a small rate such as `0.05`, review the resulting data and volume,
then adjust deliberately. Browser trace headers are restricted to same-origin
`/api` requests.

Browser source maps are generated and uploaded only when all of
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are present during the
web build. The build fails if only a subset is configured, deletes `.map` files
after a successful upload, and disables the plugin's own telemetry. Do not serve
source maps publicly.

## Rollback And Recovery

Application rollback means redeploying the previous immutable API and web image
digests. It does not reverse database migrations. Migrations are forward-only.

If a release fails without data corruption, stop the new application instances,
restore the previous image digests, and verify readiness and the smoke suite. If
data corruption is possible, stop writes and follow the PostgreSQL recovery
runbook: restore into a separate database, verify it, and switch the secret-managed
connection only after validation.

Never perform the first restore drill during an incident.

## Remaining Boundary

This foundation does not provide provider-managed scheduling, TLS, DNS, secrets,
monitoring, account self-service export or deletion, or legal approval.
Transactional email is required for registration, verification, and recovery;
operating the Brevo account, its authenticated sender domain, API credentials,
deliverability monitoring, and retention policy remains an operator responsibility
before registration is enabled.

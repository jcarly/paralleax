# Private Alpha Deployment

Status: Required operator runbook

Last reviewed: 2026-08-10

## Scope

This runbook prepares Paralleax for a small, invitation-only creator alpha. It
does not authorize open registration, public story publication, or anonymous
reading. The deployment remains provider-neutral: a hosting provider, managed
PostgreSQL service, public domain, and operator contact must be selected before
real users are invited.

## Required Topology

Use one public HTTPS origin for the browser and API:

```text
browser -> TLS edge -> Paralleax web container -> /api proxy -> API container -> managed PostgreSQL
```

The web container serves the Vite build, applies browser security headers, and
proxies `/api` to the private API service. The API rejects production mutations
whose `Origin` header does not exactly match `CORS_ORIGIN`. Do not expose the API
container directly to the public Internet.

The hosting edge must terminate TLS, redirect HTTP to HTTPS, and add HSTS after
the domain and certificate have been verified. Keep the web and API containers
on a private network.

## Provider Gates

Before accepting real user data, record evidence for all of the following:

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
REGISTRATION_MODE=access-code
REGISTRATION_ACCESS_CODE=<at-least-16-random-characters>
POSTGRES_SSL=true
```

Distribute the invitation code separately from the application URL. Rotate it
if it is disclosed. Set `REGISTRATION_MODE=closed` when no more accounts should
be created. `REGISTRATION_MODE=open` is not appropriate for the private alpha.

## Build And Release

The multi-stage `Dockerfile` has two production targets:

```bash
docker build --target api --tag registry.example/paralleax-api:<commit> .
docker build --target web --tag registry.example/paralleax-web:<commit> .
```

Use immutable commit or digest references. GitHub Actions builds both targets on
every push and pull request. A provider deployment should pull those exact
images instead of rebuilding an unreviewed working tree.

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
PostgreSQL service because real alpha data must use the selected managed service.

### Railway

Railway does not run this Compose topology as one container. Create three
services in the same project and environment: Railway PostgreSQL, `api`, and
`web`. Connect both application services to this repository with the repository
root as their root directory.

Configure the `api` service with Config File Path
`/deploy/railway.api.json` and these variables:

```dotenv
RUNTIME_TARGET=api
PORT=3000
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
POSTGRES_SSL=true
CORS_ORIGIN=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
REGISTRATION_MODE=access-code
REGISTRATION_ACCESS_CODE=<at-least-16-random-characters>
```

The `Postgres` and `web` names in reference variables are case-sensitive and
must match the Railway service names. A custom public domain may replace the
generated web domain in `CORS_ORIGIN`. Do not generate a public domain for the
API service. The API configuration runs migrations as a Railway pre-deploy
command and admits traffic only when `/api/ready` succeeds.

Configure the `web` service with Config File Path
`/deploy/railway.web.json`, generate its public domain on container port `8080`,
and set:

```dotenv
PORT=8080
API_HOST=${{api.RAILWAY_PRIVATE_DOMAIN}}
API_PORT=3000
```

`API_HOST=api` is only the Docker Compose default. Railway private DNS uses a
name under `railway.internal`; leaving the Compose default in Railway makes
Nginx exit with `host not found in upstream "api"`. Deploy the API successfully
before the web service, then run the release verification below.

## Release Verification

After every deployment:

1. Confirm the provider reports both containers healthy.
2. Run `npm run smoke:deployment -- https://alpha.example.com`.
3. Register with the current invitation code.
4. Create a story, add and edit an interaction, and reload the editor.
5. Run Simulation Mode and confirm it does not alter reader progress.
6. Sign out, sign in again, and confirm the story and reader progress persist.
7. Record the image digests, migration id, database backup identifier, smoke
   result, operator, and deployment time.

## Monitoring And Alerts

Probe `/healthz` for the public web path, `/api/health` for API liveness, and
`/api/ready` for PostgreSQL/schema readiness. Alert on sustained non-2xx results,
HTTP 5xx spikes, repeated restarts, database saturation, backup age, failed
backups, and disk or connection exhaustion.

Application logs contain request ids but intentionally exclude request bodies,
cookies, tokens, and query strings. Configure an error-reporting service to keep
the request id while applying the same redaction rules.

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
monitoring, email delivery, account recovery, account self-service export or
deletion, or legal approval. Those require the selected operator and provider
before invitations are sent.

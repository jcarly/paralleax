# ADR-051 - Isolated Railway Staging Project

**Status:** Proposed

**Date:** 2026-11-27

## Context

The alpha runs in the Railway project `fearless-warmth` with one production
environment. There is no staging project. On a version tag, the current
workflow selects full change validation, but `production-images` explicitly
skips tags and `release` does not depend on `main-readiness`. It then builds and
publishes API and web images to GHCR and immediately deploys those digests to
production with `RAILWAY_API_TOKEN`. The tag path does not enforce the complete
Main readiness image gate and has no staging validation or promotion gate.

PAR-26 generates public browser observability configuration at web-container
startup from validated runtime values and derives CSP origins from that
configuration. The web image carries the immutable Sentry release used by its
source maps. Empty or incomplete optional integrations are disabled, the
application remains usable if runtime configuration is unavailable, and local
development continues using Vite environment files.

## Proposed Decision

- Create a separate Railway project in the current workspace, with an isolated
  PostgreSQL service and volume, a private API service, and a public web service.
  Use a project-scoped staging `RAILWAY_TOKEN`. Use a separate workspace only
  if that project token cannot perform the required image deployment. The
  production `RAILWAY_API_TOKEN` remains restricted to the production promotion
  job.
- Require every Main-readiness-equivalent release check, including production
  image validation, to pass on the exact tagged commit before publication. Build
  each API and web candidate image once and validate those exact candidates.
  After success, publish those same artifacts to GHCR without rebuilding, then
  record the source commit, tag, publishing run id and both immutable GHCR
  `@sha256:` references in a release manifest. The publish job must not deploy.
- Let the single operator manually dispatch staging from `main`. The staging
  job downloads and validates the release manifest, deploys the API then web
  digest, and records the exact source run and digest pair after smoke and
  browser checks pass. Give the job only `contents: read` and `actions: read` to
  inspect the source run and download its manifest (plus `packages: read` if
  images are private), and a project-scoped `RAILWAY_TOKEN` in a
  branch-restricted GitHub staging environment. No extra GitHub approver is
  required.
- Make production promotion a separate manual dispatch from a successful
  staging run. Before deployment, verify the successful staging validation
  record matches the original release manifest, including both digests and the
  source run id. Deploy those same references without rebuilding and run the
  production smoke check. Only this job receives `RAILWAY_API_TOKEN`.
- Run staging with `NODE_ENV=production` and real transactional email to
  operator-controlled mailboxes. Automated acceptance retains its ephemeral
  `NODE_ENV=test` stack and outbox.
- Keep staging IaC as a separate partial for the staging project, never in the
  production partial.
- Set public Sentry/PostHog browser values on each web service at runtime. The
  same image generates `/runtime-config.json` with `Cache-Control: no-store`,
  validates values and derives CSP origins from accepted configuration. The web
  bundle contains no environment-specific observability settings. Missing or
  incomplete settings disable the relevant integration, and unavailable config
  does not stop the app. Keep the Sentry release and uploaded source maps
  image-bound; keep `SENTRY_AUTH_TOKEN` build-only.
- Between campaigns, prefer removing the latest successful web, API and
  PostgreSQL deployments with `railway down`, while retaining the project,
  services and attached PostgreSQL volume. Re-deploy the pinned images from the
  release manifest. Do not assume Serverless sleep will trigger while database
  connections, telemetry or private-network traffic continues. Validate volume
  retention, data integrity and restoration time during the first staging
  campaign. Full project/volume destruction remains an option only if loss of
  test data is accepted.
- If D8 is approved, use Nginx Basic Auth at the public web proxy over HTTPS.
  Write a pre-hashed staging credential to `/tmp/nginx/htpasswd` at startup as
  the unprivileged `nginx` user, with restrictive permissions. Do not assume
  `/run` is writable. Remove the file and disable auth when the secret is
  unset. Protect the app, runtime config, API, SSE and import routes; exempt
  only exact `/healthz`. Strip the Basic `Authorization` header before
  forwarding API requests while preserving session cookies. The current local
  MCP client sends a Paralleax session cookie and no Authorization header; add
  optional staging Basic credentials to its HTTP transport if it must use the
  protected proxy. Current remote OAuth/Bearer auth is not implemented and
  cannot share the same Authorization header with Basic on one route without a
  separate design.

The proposal and operational procedure are in the
[staging plan](../operations/staging-environment.md).

## Decisions and Gates

D2 (dedicated Brevo delivery and operator-controlled mailboxes) and D3 (generated
Railway domain) are settled inputs. D4 is implemented by PAR-26. D5 is finalized
as a single-operator manual workflow without an additional approver. D1
(same-workspace project token), D6 (remove deployments but retain the volume),
and D8 (shared Basic credential and MCP support) remain human choices before
provisioning.

D7 remains an operational prerequisite: the production image tag
`postgres-ssl:18` does not establish the server version. An operator with
authorized read-only access must run `SHOW server_version` and record only the
result. The check has not been completed and must not be bypassed.

Keep this ADR **Proposed** until a human accepts the remaining choices and the
plan has been reviewed before provisioning. Operational gates do not block
review of this documentation PR.

## Consequences

- This ADR and PR #265 change documentation only. They do not modify the
  production release workflow, create Railway resources, deploy images or
  change production.
- PAR-21 still needs the workflow split, immutable manifest, staging deploy,
  verified manual promotion, staging IaC, runtime-variable migration, optional
  Basic Auth and client/test support, and the operational checks listed in the
  staging plan.
- No production credential is available to staging. If a project token cannot
  deploy the published image digests, use a separate workspace rather than
  sharing the production token.
- Production-mode staging cannot use the outbox-based acceptance suite. If
  manual verification becomes a bottleneck, a protected staging outbox needs a
  separate decision because it changes configuration semantics.
- Development continues to use local Vite environment configuration; runtime
  configuration applies to the production web image.
- An explicitly stopped staging volume continues to store test data and incur
  storage charges. Apply a retention period and verify restoration before
  relying on this mode.
- Basic Auth adds no hosting service but has a shared-secret lifecycle and no
  per-user audit trail. When its secret is unset, production and local
  development must remain unauthenticated.

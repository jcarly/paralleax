# ADR-051 - Isolated Railway Staging Project

**Status:** Proposed  
**Date:** 2026-11-27

## Context

The alpha runs in the Railway project `fearless-warmth` with one `production`
environment. The alpha runbook requires separate staging and production projects
before valuable data is accepted, but no staging exists. The release workflow,
the IaC file and the Railway token all target production. PAR-26 now generates
public browser observability configuration from validated runtime values and
derives the production web CSP from those same values. The Sentry release
identifier and matching source maps are fixed to the web image. Production mode
is the only mode with `Secure` cookies, the exact-origin guard and the production
CSP, while the test email outbox exists only in test mode.

## Proposed Decision

- Create a separate Railway project (in the current workspace if a staging-only
  token can deploy images, otherwise in a separate workspace) with its
  own PostgreSQL service and volume, API without a public domain, and public web
  service.
- Deploy the exact immutable API and web GHCR digests that the release will
  promote, through a manual `workflow_dispatch` from `main`, with digest-only
  inputs and an isolated GitHub `staging` environment. Keep the workflow token
  to `contents: read` (and `packages: read` only when the images are private) and
  use a staging-only Railway token. Do not expose the production release token
  or modify the production release job.
- Run the staging API with `NODE_ENV=production` and real transactional email to
  operator-controlled mailboxes. Automated acceptance keeps using ephemeral
  `NODE_ENV=test` stacks with the outbox.
- Keep staging IaC as a separate partial for a different project, never in the
  production file.
- Set public Sentry/PostHog values on each web service at runtime. The web image
  creates `/runtime-config.json` with `Cache-Control: no-store`, validates the
  values and builds CSP origins from the effective configuration. Empty or
  incomplete configuration disables the corresponding integration; an
  unavailable config does not prevent the app from running. No
  environment-specific observability values or secrets belong in the web bundle.
- Keep Sentry release identity immutable inside the web image so it matches the
  uploaded source maps after digest promotion. Keep `SENTRY_AUTH_TOKEN` as a
  BuildKit build secret only.
- Prefer an on-demand staging environment: let web and API sleep between
  campaigns and keep only the isolated PostgreSQL service/volume for easier
  reactivation. The volume and database contents persist until explicitly
  deleted. If the database baseline cost is unacceptable, use campaign-only
  teardown and accept loss of test data.
- Protect the web proxy with HTTP Basic Auth, leaving `/healthz` open for the
  Railway web healthcheck. Keep the API healthcheck private. Deployment smoke
  and browser journeys must send staging-only credentials; automated acceptance
  remains on the existing test-mode stack.

Operational details, risks, costs and teardown are in the
[staging plan](../operations/staging-environment.md).

## Open Questions

D2 (real Brevo, production mode) and D3 (generated domain) are decided. D4 is
implemented by PAR-26. D1 remains conditional on project-token capability; D5,
D6 and D8 are the recommended operating choices above, pending human acceptance
of cost, retention and shared-password trade-offs. D7 remains open until an
authorized read-only `SHOW server_version` result is recorded. Keep this ADR
**Proposed** until the operator has approved the remaining choices and the plan
has been reviewed before provisioning.

## Consequences

- No Railway resource is created by this record.
- A staging-only project token limits blast radius; if Railway requires a
  workspace token for image deployment, use a separate workspace rather than
  reusing the production token.
- Production-mode staging cannot be driven by the outbox-based acceptance suite.
  If manual verification becomes a bottleneck, a protected staging outbox needs
  its own ADR because it changes configuration semantics.
- Development continues to read local Vite environment configuration. The
  production container's generated runtime configuration does not remove that
  local workflow.
- The D6 cost comparison, data-retention rules and D8 healthcheck/test
  compatibility are in the [staging plan](../operations/staging-environment.md).

# ADR-051 - Isolated Railway Staging Project

**Status:** Proposed  
**Date:** 2026-11-23

## Context

The alpha runs in the Railway project `fearless-warmth` with one `production`
environment. The alpha runbook requires separate staging and production projects
before valuable data is accepted, but no staging exists. The release workflow,
the IaC file and the Railway token all target production. The web image bakes
browser reporting values at build time. Production mode is the only mode with
`Secure` cookies, the exact-origin guard and the production CSP, while the test
email outbox exists only in test mode.

## Proposed Decision

- Create a separate Railway project (in the current workspace if a staging-only
  token can deploy images, otherwise in a separate workspace) with its
  own PostgreSQL service and volume, API without a public domain, and public web
  service.
- Deploy the immutable GHCR digests that the release will promote, through a
  manual staging workflow with its own GitHub environment and Railway token.
  The production release job is unchanged.
- Run the staging API with `NODE_ENV=production` and real transactional email to
  operator-controlled mailboxes. Automated acceptance keeps using ephemeral
  `NODE_ENV=test` stacks with the outbox.
- Keep staging IaC as a separate partial for a different project, never in the
  production file.
- Isolate browser reporting. Empty runtime variables are only a stopgap because
  the image bakes `ENV` values; sharing the web digest requires runtime browser
  configuration first.

Operational details, risks, costs and teardown are in the
[staging plan](../operations/staging-environment.md).

## Open Questions

D1 (second project, workspace only if needed), D2 (real Brevo, production mode)
and D3 (generated domain) are decided. The status stays Proposed until runtime
browser configuration or a separate staging web build is chosen (D4), access
restriction (D8), deployment control (D5) and the Postgres version (D7) are
settled.

## Consequences

- No Railway resource is created by this record.
- A separate workspace token limits the blast radius of the staging workflow.
- Production-mode staging cannot be driven by the outbox-based acceptance suite.
  If manual verification becomes a bottleneck, a protected staging outbox needs
  its own ADR because it changes configuration semantics.
- Until browser configuration is read at runtime, a shared web image carries
  the production Sentry and PostHog values; empty variables only block them
  through the CSP, as the browser journey verifies.

# ADR-030: Optional Privacy-Preserving Sentry Monitoring

Status: Accepted

Date: 2026-10-11

## Context

The private alpha needs actionable application-error reports in addition to
health probes and structured server logs. Operators need a way to correlate an
incident with a release and request id without exporting authored stories,
account data, authentication material, or user-entered error content to a
third-party service.

## Decision

Use the official Sentry SDKs for the NestJS API and React web application.
Sentry remains disabled unless the relevant DSN is explicitly configured. The
API records unhandled and 5xx failures through the existing global exception
filter; the browser SDK records unhandled client errors.

Events keep only safe diagnostic metadata: error type and stack location,
release, environment, request id, HTTP method/status, and stable Paralleax API
error code. Before delivery, the integration removes users, authored content,
request/response data, cookies, headers, query parameters, breadcrumbs, local
variables, source context, generic extra/context objects, and exception
messages. Session Replay, user identification, and application-state capture
are not enabled.

Performance tracing is opt-in through a sample-rate environment variable and
starts disabled. Browser tracing, when enabled, propagates trace headers only to
same-origin `/api` calls.

Browser source maps are uploaded only when the web build receives all of
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`. The build removes maps
after a successful upload. The token is a build secret, never a `VITE_*` value,
and never part of the final web image.

## Consequences

- Operators configure Sentry DSNs and release values in the deployment secret
  manager; no DSN or token is committed to this repository.
- Health/readiness probes, database monitoring, backup monitoring, and uptime
  alerting remain independent operational responsibilities.
- Sentry data needs periodic volume and privacy review before increasing the
  tracing sample rate or enabling additional product capabilities.

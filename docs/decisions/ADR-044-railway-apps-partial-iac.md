# ADR-044 - Railway App Services as a Named IaC Partial

**Status:** Accepted  
**Date:** 2026-11-11

## Context

The Railway production project has two application services and a PostgreSQL
service backed by a persistent volume. The repository already controls API and
web releases through GitHub Actions, which publishes immutable GHCR digests and
sets each application's source during a tagged release. Railway's legacy
Config as Code files are custom paths under `deploy/` and can disagree with the
live service settings.

Railway Infrastructure as Code is project-oriented. A full project file that
omits a resource can delete it. Managing the database and its volume in this
migration would add data-lifecycle risk and require importing the live database
configuration. The API and web services share one repository and release
workflow, while PostgreSQL has a separate persistence lifecycle.

## Decision

- Define the API and web settings in `.railway/railway.ts` under the stable
  named partial `paralleax-apps`.
- Keep Postgres and its persistent volume outside this partial. Do not declare a
  database resource or volume in the file.
- Preserve the Dockerfile builder, build-input watch patterns, API migration
  pre-deploy command, healthchecks, timeouts, runtime, region, private network
  endpoints, and restart policies in IaC. Keep the existing custom web domain.
- Explicitly declare the existing `jcarly/paralleax` `main` source during initial
  migration. The real Railway plan showed that omitting `source` would change
  `source.repo` and `source.type` to `null`, despite the intended preservation.
- GitHub Actions remains responsible for deploying immutable GHCR digests on
  tagged releases. The declared GitHub source is a migration bootstrap value,
  not a permanent instruction to switch a released service back to GitHub.
- Declare each existing application variable with `preserve()` so Railway keeps
  its current value, including secrets and references, without exposing values in
  the repository. Update the preserved names whenever a service variable is
  added or removed.
- Clear each application's legacy Config File Path, then review a fresh
  `railway config plan`. Apply only a plan that changes the intended API/web
  settings and contains no unrelated resources or destructive changes.
- Pin the official TypeScript SDK in development dependencies so the config can
  be evaluated and covered by operational tests.

The named partial is a deliberate exception to Railway's one-file-per-project
guidance for monorepos: it gives this repository ownership of its two app
services while leaving the independently managed database and volume untouched.

## Consequences

- IaC ownership metadata will cover the API and web services only after the
  reviewed plan is applied. The repository change alone does not change Railway.
- Any future IaC file targeting this environment must use a named partial once
  partial ownership exists.
- A plan must be reviewed before every apply. Database or volume actions are
  outside this decision and require a separate migration plan.
- Railway IaC treats omitted service variables as unmanaged deletions; the
  explicit `preserve()` list prevents that. A new app variable must be added to
  the list before applying a later plan.
- Railway's native GitHub auto-deploy triggers remain a separate live setting
  and must stay disabled so pushes cannot replace a tagged image release.
- After the first tagged release changes the service sources to GHCR image
  digests, the IaC GitHub bootstrap declarations become stale. Future
  `railway config plan` runs may propose reverting the source to GitHub.
  Never apply such a plan: first reconcile source ownership and the immutable
  digests in IaC or the release workflow. There is no automatic "preserve
  current source" guarantee for omitted sources in the observed CLI plan.

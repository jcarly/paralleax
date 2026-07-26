# Production Readiness

Status: Current

Last reviewed: 2026-07-26

Implemented: Partial

## Purpose

This document is the project-wide operational and product-readiness baseline.
Feature work must not silently move Paralleax toward public production while
leaving data recovery, security, observability, scalability, accessibility, or
publication semantics undefined.

The current application is suitable for demonstrations, a closed alpha, and
small test stories. It is not yet ready for an open public production service.

## Non-Negotiable Priorities

### P0 — Before Real User Data

- Implemented foundation: historical JSON stories, graph relationships,
  conditions, and ownership are converted instead of deleted; unit tests forbid
  wholesale story deletion and PostgreSQL tests cover the upgrade path.
- Implemented foundation: migrations execute through an explicit command rather
  than from repositories or user requests.
- Add an automated migration test that starts from representative legacy data
  and verifies rows and foreign keys after every migration.
- Implemented foundation: repository backup/restore commands validate archives,
  require an explicit restore target, and CI restores into a temporary database
  and compares migrations and core row counts.
- Configure monitored, encrypted, off-host PostgreSQL backup scheduling and
  complete a recorded restoration drill in the selected production provider.
- Add staging, production secret management, exact CORS origins, and verified
  secure-cookie behavior behind the production proxy.
- Implemented foundation: process health and PostgreSQL/schema readiness
  endpoints.
- Implemented foundation: structured production logs, request identifiers,
  request completion logs, and stable API error envelopes that hide unexpected
  internal details.
- Add request, field-length, story-size, and write-rate limits.
- Document incident communication, rollback, privacy, account export, and
  account deletion.

### P1 — Before an Open Creator Alpha

- Add email verification, password reset, password change, and session
  revocation.
- Make story listing a lightweight summary query rather than assembling every
  complete graph.
- Introduce targeted persistence commands for common field and position edits;
  reserve complete graph mutation for structural operations.
- Add protection against navigating away or closing during unresolved saves.
- Add accessibility tests and a manual keyboard/focus audit.
- Add dependency, secret, and container scanning.
- Provide a production Docker image, deployment pipeline, and tested rollback.
- Add quotas and scheduled expired-session cleanup.

### P2 — Before Public Story Reading

- Separate editable drafts from immutable published versions.
- Add explicit private, unlisted, and public visibility.
- Validate a story before publication and expose stable public reader URLs.
- Keep author simulation and public reading as separate product surfaces.
- Add publication metadata, reporting, moderation, and content licensing rules.

### P3 — Before Collaboration

- Add story members and explicit roles.
- Add entity-level revisions and optimistic concurrency with `409 Conflict`.
- Define compare, reload, overwrite, and merge behavior.
- Add change history, undo/redo, comments, annotations, and review workflows.

## Architecture Constraints

### Persistence and Migrations

- A production request must never be responsible for schema migration.
- Production migrations must be observable, repeatable, and backed by a tested
  recovery path.
- New migrations must be forward-only and preserve user data.
- Bulk import is a separate workflow with validation, progress, audit output,
  and rollback; it must not reuse ordinary one-row-at-a-time editor writes.

### Story Projections

Use different projections for different workloads:

- `StorySummary` for lists;
- a lightweight graph projection for navigation;
- on-demand interaction details for editing;
- an immutable complete snapshot for published reading and simulation.

Do not introduce viewport loading before measurements justify it. First remove
known full-graph work from list and targeted mutation paths.

### Mutation Scope

Prefer direct entity updates for titles, bodies, positions, locations, and stat
values. Complete graph loading and story-level locking remain acceptable for
complex structural mutations until their invariants have narrower transactional
commands.

Before real-time collaboration, independent entities need revisions so unrelated
edits do not serialize through one story lock.

### Operational Errors

API errors should have stable machine-readable codes and request identifiers.
Production responses must not expose SQL details or stack traces. Logs should be
structured and redact credentials, cookies, tokens, and authored sensitive
content.

## Performance Baselines

Measure before architectural optimization, but include representative large
stories rather than assuming manual-size graphs:

- story list query count, response size, and latency;
- story graph load time and payload size;
- common field-save and node-move latency;
- writer complexity and number of SQL round trips;
- import throughput;
- editor responsiveness with hundreds and thousands of interactions;
- PostgreSQL connection utilization;
- API p50, p95, and p99 latency.

Replace repeated order searches with identifier maps where profiling confirms
quadratic behavior. Use batched insert or PostgreSQL `COPY` for large imports
and templates.

## Security and Abuse Baseline

- Validate `Origin` for mutative cookie-authenticated requests once the final
  frontend/API topology is known; add a CSRF token if topology requires it.
- Keep exact credentialed CORS origins and secure production cookies.
- Enforce input lengths, story quotas, write-rate limits, and import limits.
- Clean expired sessions with scheduled maintenance rather than a global cleanup
  on every authenticated request.
- Support account recovery, session revocation, export, and deletion before open
  registration.

## Accessibility and Device Support

- Desktop editing is the primary fully supported authoring surface.
- Tablet landscape may have partial editing support.
- Mobile should prioritize reading; limited editing must be communicated
  honestly.
- Respect `prefers-reduced-motion`.
- Test login, story list, reader, and editor with automated accessibility checks.
- Audit keyboard navigation, focus restoration, dialogs, icon labels, live save
  announcements, graph selection state, and non-drag alternatives.

## Product Reliability

The editor must eventually provide:

- undo/redo;
- global search and filters;
- graph validation and a visible problem list;
- multi-selection for bulk authoring;
- recovery from slow, failed, and out-of-order saves.

Simulation should expose current state, failed conditions, pending effects, and
author-controlled state overrides. Public readers must not expose these debug or
editing tools.

## Delivery Sequence

1. Data safety: migrations, backup, restoration, health, and readiness.
2. Operations: structured logs, request IDs, stable errors, staging, and a
   production image.
3. Efficient persistence: summaries, targeted updates, order maps, and bulk
   writes.
4. Account safety: verification, recovery, revocation, CSRF review, and quotas.
5. Publication: validation, immutable versions, visibility, and public reading.
6. Collaboration: roles, entity revisions, conflicts, history, and review.

This sequence takes precedence over adding broad simulation complexity when the
intended milestone is public hosting.

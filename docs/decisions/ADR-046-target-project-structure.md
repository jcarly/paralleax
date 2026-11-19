# ADR-046 - Target Project Structure: Pragmatic Ports and Adapters

**Status:** Accepted  
**Date:** 2026-11-19 (proposed and accepted the same day)

## Context

[ADR-003](ADR-003-engine-first.md) keeps narrative logic in `packages/shared`,
independent of React, NestJS and HTTP. That core holds: ESLint and
dependency-cruiser enforce it ([ADR-039](ADR-039-automated-architecture-guardrails.md)).
Around it, the layers grew without an explicit target. A review on 2026-11-19
found:

- **Narrative rules in the API.** API application services
  (`apps/api/src/stories/application/`, about 6,950 lines) validate domain
  invariants themselves: references that must belong to the same Story,
  stat value types, which stats may change over time or accept `add` effects,
  condition and temporal-condition validity. `AGENTS.md` and ADR-003 place
  these rules in `packages/shared`; a future exporter, importer or reference
  evaluator would have to reimplement them.
- **Application layer coupled to HTTP.** The same services throw NestJS HTTP
  exceptions: about 70 `BadRequestException`, 40 `NotFoundException`,
  22 `ForbiddenException` and 7 `ConflictException` across `application/`,
  `comments.service.ts` and `auth.service.ts`. Only one domain error exists
  (`StoryHistoryConflictError`).
- **Dependencies point at concrete adapters.** Application services inject the
  concrete `StoriesRepository` class. The two persistence modules
  (`stories.repository.ts`, 1,647 lines; `stories.persistence.writer.ts`,
  1,678 lines) mix SQL, Story assembly and access checks.
- **Foreign-format adapters inside the engine.** The QSP and ChoiceScript
  importers (5,250 lines) and their only external dependency,
  `@qsp/converters`, live in `packages/shared` and are re-exported by its
  facade. They do not reach the web bundle (verified 2026-11-19), but they
  contradict "keep source-specific code outside the narrative engine" in
  `AGENTS.md` and will travel with `shared` once it backs the documented Story
  format or a portable evaluator.
- **Three web layouts at once.** 19 modules at the root of `apps/web/src`
  (graph layout, selection, connection, navigation), 67 files in `components/`
  mixing design-system primitives with feature inspectors, and 12 `features/`
  folders.
- **Test doubles that test themselves.** A 963-line in-memory
  `StoriesRepository` hid two undo bugs until the e2e specs ran on PostgreSQL
  (jcarly/paralleax#155). Some API unit specs still stub PostgreSQL by matching
  SQL text, which couples them to queries rather than behavior.

A textbook hexagonal architecture would add a port interface and an in-memory
adapter for every dependency. The last finding is the reason this ADR does not:
a second implementation of persistence is exactly what failed.

## Decision

Adopt a pragmatic ports-and-adapters structure: one pure domain, use cases that
know only the domain and the ports they own, adapters at the edges, and no
parallel implementation of an adapter for testing.

### 1. Layers and dependency rule

Dependencies point inward only:

```text
adapters (HTTP controllers, SSE, PostgreSQL, email, storage, workers, React)
  → application (use cases, transactions, authorization orchestration)
    → domain (packages/shared: model, invariants, operations, evaluation)
```

- **Domain (`packages/shared`)** owns every narrative invariant, including
  reference validation ("belongs to the same Story"), stat typing and effect
  rules, and condition validity. It reports violations as typed domain errors
  or diagnostics, never as HTTP errors.
- **Application (`apps/api/src/<area>/application/`)** composes domain
  operations, permissions, quotas and transactions. It throws application
  errors (for example `StoryNotFound`, `StoryAccessDenied`,
  `DomainValidationFailed`, `StoryHistoryConflict`, `StoryQuotaExceeded`) and
  does not import NestJS HTTP exceptions. NestJS dependency-injection decorators
  remain allowed: the framework wires the layers, but it does not define them.
- **Inbound adapters** (controllers, DTO validation, guards, SSE) translate
  HTTP to use cases. One exception filter maps application and domain errors to
  HTTP status codes and the existing `{ status, code, message }` body, so the
  API contract does not change.
- **Outbound adapters** (PostgreSQL repositories, email, import-report storage,
  import workers) implement what the application needs.

### 2. Ports only where they pay

- An application service depends on a **port** (an abstract class used as the
  NestJS injection token, implemented by the adapter) when the application must
  not know the adapter: persistence of Stories and comments, email delivery,
  report storage.
- Introduce each port when its area is next touched; do not create a port
  layer up front.
- **No production-equivalent fakes.** Tests stub a port per test, with only
  the answers that test needs, or run the real adapter (PostgreSQL). A complete
  in-memory implementation of a port is not allowed.

### 3. Packages

```text
packages/shared      domain: model, invariants, operations, reader, history,
                     native Story format (future), import report contract
packages/importers   foreign-format adapters: QSP, ChoiceScript; depends on
                     shared; owns @qsp/converters
apps/api             HTTP and persistence adapters, application use cases
apps/web             React adapter: features, design system, API client
```

- The **native Story format** (roadmap "Next" item 1) is Paralleax's own model
  and belongs in `shared`. **Foreign formats** belong in `packages/importers`.
- The source-neutral import report contract (`import-export/common`) stays in
  `shared`, because the API and web exchange it. Source-specific report types
  and helpers such as `serializeQspLocationBundle` move with their importer.
- `shared` must not import `importers`. The API workers and the web import
  dialog may.

### 4. API persistence

Split the large persistence modules by responsibility, keeping one transaction
owner per use case: Story assembly, editor and runtime projections (already
separate), access predicates (already centralized), and the writer by entity
family. Keep the repository class as the adapter that implements the port.

### 5. Web

- **Features first:** a feature folder (`features/<area>/`) owns its components,
  hooks and state. `components/` keeps only design-system primitives.
- Graph modules at the root move to `features/story-editor/graph/`, which
  shrinks the React Flow allowlist in `.dependency-cruiser.cjs`.
- `pages/` are route shells; `api.ts` remains the single HTTP adapter.

### 6. Test strategy

| Layer        | Tested with                                    | Doubles allowed                          |
| ------------ | ---------------------------------------------- | ---------------------------------------- |
| Domain       | Shared unit tests (most rules live here)       | None needed                              |
| Application  | Unit tests with per-test stubs of ports        | Stubs answering only what the test needs |
| Persistence  | PostgreSQL integration and e2e specs           | None: real database                      |
| HTTP surface | HTTP boundary specs                            | Stubbed persistence                      |
| Web          | Component tests, Playwright for critical flows | Mocked API responses                     |

- A bug fix starts with a regression test that fails without the fix.
- Unit specs that stub PostgreSQL by matching SQL text are replaced by
  PostgreSQL specs when their module is next touched.

### 7. Enforcement

Each rule becomes a check when its first migration step lands:

- dependency-cruiser: `packages/shared` must not depend on `packages/importers`;
  application modules must not depend on controllers or DTO modules.
- ESLint `no-restricted-imports` in `application/` folders: no NestJS HTTP
  exception classes.

### 8. Migration, incremental

Each step is a backlog entry with its own tests; none blocks product work:

1. Application errors and the exception filter mapping; convert one area, then
   the others when touched. API responses stay identical.
2. Move one family of invariants at a time from API services to `shared` (same-
   Story references, stats and effects, conditions), with shared unit tests.
3. Extract `packages/importers` when the native Story format work starts.
4. Introduce persistence ports and split the persistence modules when they are
   next touched.
5. Move web modules feature by feature when touched.

## Alternatives considered

- **Status quo.** Cheapest now; narrative rules keep spreading into the API and
  importers keep growing inside the engine.
- **Full hexagonal: ports and in-memory adapters everywhere.** Rejected: it
  recreates the parallel persistence implementation that hid real bugs, and
  adds interfaces with a single implementation.
- **Importers as a `@paralleax/shared/import` sub-export.** Rejected: cheaper,
  but the code and `@qsp/converters` would still ship with the engine package.
- **Result types instead of error classes.** Rejected: more explicit, but a
  larger change across every service and controller; error classes fit the
  existing NestJS exception filter.
- **Persistence ports only once a second adapter exists.** Rejected: the point
  of a port here is the dependency direction, not substitution. Ports are
  introduced when their area is next touched (section 2).

## Consequences

- Positive: one owner per narrative rule, reusable by exporters, importers and
  a future evaluator; the application layer becomes testable without HTTP;
  smaller persistence modules; a test strategy that names what may be doubled.
- Negative: a new workspace to maintain; an error-mapping table to keep
  complete; temporary inconsistency while areas migrate one by one.
- Unchanged: the domain invariants, the HTTP API contract, persisted data, and
  ADR-003's engine boundary.

## Resolved questions

Settled by the author on 2026-11-19:

1. Importers: a separate `packages/importers` workspace.
2. Errors: application and domain error classes, mapped by one exception filter.
3. Persistence ports: introduced when their area is next touched.

# Story persistence follow-up — 2026-11-03

## Targeted audit

`StoriesRepository.find` read story metadata and then assembled the Story from
separate relational queries issued through `Pool.query`. Under PostgreSQL's
default `READ COMMITTED` isolation, each statement can see a different snapshot.
A mutation could commit between those reads, returning metadata from one
revision with child rows from another. The mutation path itself locks the Story
row and writes its metadata, differential graph changes, and history event in
one transaction.

The repository also had 11 non-null assertions in its Story projection:

- Three repeated `Map.get` assertions followed length checks on the same maps.
- One stat-effect value relied on the database's exclusive value-or-expression
  constraint.
- Seven graph-decoration fields relied on a database `CHECK`. Because SQL `CHECK`
  constraints accept an unknown result, nullable dimensions and text styles could
  pass the existing shape constraint as `NULL`.

The writer's broad differential-persistence functions remain a separate review
target. No SQL query optimization was justified without measurements, and the
mutation transaction, write contract, schema, and API payload remain unchanged.

## Changes

- Full Story reads now run in a read-only `REPEATABLE READ` transaction, so every
  query used to assemble a Story sees the same database snapshot.
- Graph decorations are checked before projection. Missing frame dimensions or
  text content/style now produce a clear persistence error instead of a
  TypeScript-valid response containing `NULL` fields.
- Map values are bound once before optional projection, and the stat-effect row
  type records the database's value-or-expression invariant. The full Story
  reader and runtime slice now share effect and trigger projections, removing an
  exact duplicate and the runtime reader's remaining stat-value assertion.
  Eleven `no-non-null-assertion` suppressions in `stories.repository.ts` and one
  in `story-runtime.persistence.ts` were removed.
- On `origin/main` at `765e614` (after Lot A), the ESLint suppression total was
  3,661; this slice removes 12 findings, for 3,649. The
  exact-clone baseline drops from 16 pairs to 15.

## Verification and limits

- `npm run test -w @paralleax/api -- src/stories/stories.repository.spec.ts
src/stories/persistence/story-runtime.persistence.spec.ts`: 25 tests passed,
  including incomplete frame and text-decoration rows.
- `npm run typecheck -w @paralleax/api` passed.
- ESLint, CSS baseline pruning and dependency-baseline checks passed. The
  repository's aggregate prune command stopped when its duplicate scanner hit a
  sandbox `EPERM` while spawning Node; a direct jscpd scan and the same
  shrink-only clone comparison passed with 15 pairs and one stale pair pruned.
  The architecture gate passed across 595 modules and 2,171 dependencies.
- `POSTGRES_TEST_DATABASE_URL` is unset in this environment, so the dedicated
  PostgreSQL integration suite could not run here. The new read mode is
  transaction-only and does not write data or change schema.

# ADR-027: Paginated Story Read Projections

Status: Accepted

Date: 2026-09-03

## Context

The canonical `Story` aggregate is useful for deterministic domain operations and
complete persistence, but returning that aggregate for every library, editor,
reader, and Simulation Mode read makes latency and browser memory grow with the
entire authored graph. Story-list cards require only metadata. The editor can
become useful before all bodies and Trigger conditions arrive. A player step
requires the current journey and structurally relevant options, not unrelated
branches or graph decorations.

Splitting these reads must not create a second narrative model or move Trigger
semantics into SQL or React. Pages from different Story revisions must also not
be silently combined.

## Decision

The API exposes purpose-specific, paginated read projections while the canonical
`Story`, relational schema, and shared reader operations remain unchanged.

- Story-library queries return paginated `StorySummary` rows. Search, capability
  filters, ownership filters, and sorting execute in PostgreSQL. Interactions,
  Triggers, context entities, effects, and condition content are not assembled.
- Editor loading first obtains a metadata/count bootstrap, then context lists,
  interaction summaries, Trigger structures, interaction content, and Trigger
  content. Each stage is paginated. The web projects those pages into its one
  `Story` state and keeps mutation controls read-only until the projection is
  complete.
- Reader and Simulation Mode loading first obtains an authorized bootstrap and
  paginated runtime context. Each narrative step then requests a runtime slice:
  only journey interactions that are not already hydrated, plus paginated option
  interactions.
  Option Triggers are limited to Triggers whose inputs contain the current
  interaction and inputless Triggers with contextual conditions. Before the
  first interaction, all inputless Triggers are candidates. Only the matching
  Triggers, their inputs, conditions, probability, timer, output content, and
  effects are returned.
- Long saved journeys are divided into bounded interaction-id chunks. Additional
  chunks explicitly omit option discovery. A new slice removes candidates from
  the previous step while retaining the locally hydrated journey, so advancing
  does not transfer the complete journey again.
- Reader-progress reads and deletes authorize from a metadata-only runtime
  access projection. Progress writes rebuild their trusted derived state from paginated
  context plus only the supplied journey interactions, avoiding a hidden
  complete-Story read during each autosave.
- Minimal interaction title references accompany visited-interaction conditions
  so diagnostics remain readable without loading the referenced interaction
  body or graph structure.

Every bootstrap and page carries the authored Story revision. The editor retries
from a new bootstrap when revisions differ. Runtime loading rejects a mixed
revision so the route can retry or report a recoverable error. The shared Trigger
evaluator and reader replay remain authoritative after the partial transport
projection is assembled.

The complete Story read remains available for compatibility and application
operations that still require the aggregate. It is not used by the story library,
the editor's initial load, or the player’s normal option loading.

## Consequences

- Library latency and payload size no longer grow with full graph content.
- Authors see context and graph structure before heavier content pages finish.
- Reader and Simulation Mode network and browser memory scale with context,
  journey length, and current branching rather than the complete graph.
- Server-side progress persistence scales with context and journey length rather
  than unrelated authored branches.
- Runtime context entities are still all loaded because deterministic replay and
  arbitrary typed conditions may reference them; they are transported in bounded
  pages. Narrower dependency-indexed context slices can be added later without
  changing reader semantics.
- PostgreSQL performs structural candidate discovery only. Condition truth,
  seeded probability, timers, effects, and replay are still evaluated by shared
  framework-independent code.
- Additional projection endpoints and consistency handling increase transport
  complexity, so their assembly and authorization behavior require dedicated
  unit, API, and PostgreSQL integration tests.

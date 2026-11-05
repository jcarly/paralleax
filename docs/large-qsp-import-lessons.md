# Large QSP Import Lessons

This note retains source-neutral engineering lessons from large-corpus QSP
import analysis. It does not identify or reproduce any external story, source
repository, revision, narrative text, or media. It describes capability gaps and
operational risks; it is not a promise of full QSP runtime compatibility.

## Model boundary

A QSP location can combine prose, actions, conditions, state changes, reusable
procedures, menus, and navigation. One source location may therefore map to
several Paralleax Interactions, and one imported path may need to preserve
sequential behavior rather than translate each file one-to-one.

The adapter can inspect compiled/text game files and source location files. It
maps a bounded subset of literal selectors and static acyclic subroutine paths
into ordinary Interactions and Triggers. This structural approximation is not a
QSP runtime. Dynamic navigation, general procedure arguments and scope,
recursion, mutable action lists, presentation behavior, and event hooks require
explicit diagnostics or future product decisions.

## Import safety and operations

Before enabling large imports operationally:

- run schema migrations through an explicit deployment or administrative job;
- keep migrations forward-only and data-preserving, and verify schema version;
- back up before migration/import and test restoration;
- validate and map the full import before committing one transaction;
- use bounded requests, batched persistence, progress reporting, and resumable
  or safely restartable behavior;
- provide stable diagnostics, import identifiers, audit reports, rollback
  procedures, quotas, and production readiness checks;
- keep imported drafts separate from immutable published versions.

Large graph operations also need lightweight summaries, targeted mutations,
identifier-to-order maps, and measured limits. Structural operations may still
need full-graph changes, but routine edits should not require cloning and
persisting the whole Story.

## Domain capabilities exposed by complex imports

- Persisted play sessions need versioned saves, current position, visited events,
  character and world state, scheduled events, and reproducible random state.
- Variables need types, constrained values, stable identifiers, defaults,
  validated conditions/effects, and a migration strategy when definitions change.
- Time-based stories need clocks, calendars, durations, schedules, cooldowns,
  deadlines, and bounded background updates.
- Rich interactions need typed inventory and relationships, action semantics,
  reusable predicates/effects, quests, procedures with parameters and return
  values, and explicit control-flow limits.
- Dynamic presentation needs safe interpolation, conditional content, reusable
  fragments, licensed media, and responsive reader layouts.
- Large worlds need editor filtering, search, grouping, virtualization, partial
  loading, unreachable-content checks, loop detection, and performance budgets.

These are independent product capabilities. An import should not silently
change Paralleax semantics to imitate an external runtime; it should report
which concepts are supported, approximated, or unsupported.

## Validation guidance

Use appropriately licensed, source-controlled corpora that do not expose
third-party story content in the repository. Measure parsing and mapping time,
peak memory, diagnostic volume, generated graph size, and reader/editor
resolution. Keep synthetic fixtures small and original. A corpus that fails the
final import gate can still reveal useful scaling and diagnostic behavior, but
its results are observations rather than performance guarantees.

## Suggested implementation order

1. Make migrations explicit, data-preserving, backed up, and restoration-tested.
2. Add lightweight Story projections, targeted mutations, and bulk persistence.
3. Add operational visibility, rollback, and immutable published versions.
4. Define persisted play sessions and typed variables.
5. Add time, typed conditions/effects, and explicit action semantics.
6. Extend inventory, relationships, schedules, reusable procedures, and quests.
7. Add safe dynamic content and media support.
8. Add bounded randomness and event scheduling.
9. Make authoring and validation scale to large Stories.

Do not treat this sequence as a specification for any one source project. Every
import capability still requires a clear Paralleax use case, safe semantics, and
licensed test data.

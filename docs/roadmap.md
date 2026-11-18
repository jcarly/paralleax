# Roadmap

Status reviewed: 2026-11-18.

This page answers one question: **what comes next, and in which order?** It is
deliberately short. What exists today is in [Current scope](current-scope.md).
Milestone goals, remaining scope, and exit criteria (V0.1 to V1.0) are kept in
[Roadmap history and milestone detail](roadmap-history.md), together with the
priority decisions recorded before 2026-11-18.

Product positioning, the priority audience, and the competitive context are in
[Positioning](positioning.md). Operational gates are in
[Production readiness](production-readiness.md); implementation debt is in the
[Code quality backlog](code-quality-backlog.md).

## Priority decision, 2026-11-18

The first priority audience is **game studios and visual-novel teams** (see
[Positioning](positioning.md)). For that audience, getting structured Story data
out of Paralleax and into a game engine is a condition of adoption, not a
post-V1 extra.

Consequence: **engine-oriented data export moves from "Post-V1 direction" to the
next priority after the current guided-session work.** This does not change the
[non-goals](non-goals.md): Paralleax exports structured, documented Story data;
it does not become a game engine, a rendering engine, or a universal export
runtime. Executable and video exports remain post-V1.

This decision supersedes the "Not Required for V1.0: Unity export" line in the
[milestone detail](roadmap-history.md#not-required-for-v10) for data export
only.

## Now

Validate the essential authoring journey with external authors, on disposable
projects, and make the platform safe for valuable data. Full task descriptions,
dependencies, and acceptance criteria are in
[Next delivery tasks](roadmap-history.md#next-delivery-tasks).

| #   | Task                                                 | Status                    |
| --- | ---------------------------------------------------- | ------------------------- |
| 1   | Prepare the alpha session brief                      | To do                     |
| 2   | Complete confirmed Lot A quick fixes                 | To do                     |
| 3   | Run guided author sessions on disposable projects    | To do                     |
| 4   | Triage observations and close essential blockers     | After 3                   |
| 5   | Complete the valuable-project safety gate (P0)       | Can run in parallel       |
| 6   | Ship the next UX improvement selected by observation | After 4                   |
| 8   | Make import reports durable                          | Before production imports |

Recommended addition to the session brief (task 1): include at least one
studio or visual-novel participant and one task that follows a Story from the
editor to the data an engine would consume, even before export exists, to learn
what that data must contain.

## Next

### 1. Stable Story format and native export / restore

Former task 7, promoted.

- Write `docs/story-format.md`: the versioned, documented JSON representation of
  authored Story data (Interactions, Triggers, condition groups, effects, stats,
  items, locations, characters, calendar, Groups), with stable identifiers.
  This answers the open question in
  [Open questions → Story Format and Examples](open-questions.md#story-format-and-examples).
- Deliver export and restore of that format, with validation before persistence.
- **Acceptance:** a representative Story round-trips without loss of supported
  entities or links; invalid input is rejected with diagnostics; the format has a
  version number and a compatibility rule.

### 2. Engine-oriented data export

- Define what an engine needs beyond the backup format: a runtime-oriented
  projection (flattened availability rules, typed state declarations, content
  with interpolation markers) or the same format plus a reference evaluator.
- Ship one reference integration for one engine, as a small example project or
  loader, not a plugin ecosystem.
- **Decision required before starting:** which engine first (Unity, Godot, or
  Ren'Py) and whether the reference evaluator is a port of `packages/shared` or
  a documented specification. See [Positioning](positioning.md#decisions-required).
- **Acceptance:** a Story authored in Paralleax runs in the chosen engine sample
  with the same availability results as Paralleax Simulation for a set of
  recorded journeys.

### 3. Durable Story-level collaboration groundwork

Unchanged from the milestone detail (V0.3 / V0.8): field-scoped concurrency and
text merging per [ADR-034](decisions/ADR-034-collaborative-offline-authoring.md),
when guided sessions or studio feedback show that the current invalidate-and-
reload model blocks real teams.

## Proposed, not yet decided

These items are recommended by the 2026-11-18 documentation review. They need an
explicit decision before they change the order above.

- **Minimal `Why unavailable?` on the graph.** Reuse the deterministic
  diagnostics that Simulation Mode already computes and show them from the
  authored graph, before the full Workbench projections (currently phase 4 of 5
  in [Workbench](workbench.md#delivery-order)). Rationale: explainability is the
  core promise and the clearest difference from competing tools.
- **Story content localisation.** Studios and visual-novel teams usually ship in
  several languages. [Open questions → Story Translation](open-questions.md#story-translation)
  still asks whether this is worth implementing at all. With the new audience,
  the recommendation is to decide the model (locale variants inside one Story
  versus an export/import workflow through the Story format) soon after the Story
  format exists.
- **Ink-inspired source mode.** Keep as planned in
  [ADR-043](decisions/ADR-043-ink-inspired-narrative-source.md); writers in
  studios often prefer text and version control.

## Later

See [Post-V1 directions](roadmap-history.md#post-v1-directions) for the full
list. Highlights: immutable publication and public reading (V0.9), reader
analytics, embeddable reader, executable exports, managed media, multi-participant
narratives, and external agent integrations.

## How to update this page

- Keep it short: a decision, a table, a few bullets per priority.
- Record a priority change as a dated "Priority decision" section with its
  consequence, as required by [AGENTS.md](../AGENTS.md).
- Put detailed scope and exit criteria in
  [milestone detail](roadmap-history.md), and implemented behaviour in
  [Current scope](current-scope.md).

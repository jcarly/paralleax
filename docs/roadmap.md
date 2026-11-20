# Roadmap

Status reviewed: 2026-11-19.

This page answers one question: **what comes next, and in which order?** It is
deliberately short. What exists today is in [Current scope](current-scope.md).
Milestone goals, remaining scope, and exit criteria (V0.1 to V1.0) are kept in
[Roadmap history and milestone detail](roadmap-history.md), together with the
priority decisions recorded before 2026-11-18.

Product positioning, the audience hypothesis, and the competitive context are in
[Positioning](positioning.md). Operational gates are in
[Production readiness](production-readiness.md); implementation debt is in the
[Code quality backlog](code-quality-backlog.md).

## Priority decision, 2026-11-20

**A private, local MCP prototype exists; external agent integration stays a
Post-V1 direction and is not delivered to users.** The task that commissioned
the prototype required write tools, which deviates from the planned read-only
first stage ([ADR-047](decisions/ADR-047-local-mcp-adapter-over-http-api.md)).

| Stage                                                       | Status                                      |
| ----------------------------------------------------------- | ------------------------------------------- |
| Local MCP prototype, read and write ([guide](mcp.md))       | Implemented, being finalized                |
| Safe writes: preview, diff, commit against a known revision | Required before any wider release           |
| Remote MCP with delegated authentication (OAuth)            | To plan if the functional test justifies it |

Consequences:

- It does not displace the open-alpha sequence below. The prototype only
  works with a local or development API, never with production stories.
- The next step is a functional test: whether an assistant helps the author
  build a complex Story without multiplying errors or useless interactions.
  Its outcome decides the priority of the remaining stages; OAuth and remote
  access are not started before it.

## Priority decision, 2026-11-19

**Goal: open the creator alpha to everyone and collect feedback continuously**,
instead of running guided author sessions first. Organizing guided sessions is
too costly; feedback comes from the in-app feedback button
([Formbricks](operations/formbricks-feedback.md)) and from real use.

Consequences:

- The open-alpha gates in [Production readiness](production-readiness.md)
  become the critical path, starting with the valuable-project safety gate (P0):
  strangers will store real work. Backups use a scheduled, encrypted `pg_dump`
  uploaded outside the hosting provider (object storage such as Backblaze B2
  costs a few cents a month at alpha size); provider-native backups alone do not
  meet the separate-failure-domain gate.
- QSP and ChoiceScript imports stay available. Their reports are sent to the
  browser without server-side storage (task 8, redefined), which removes the
  durable-storage prerequisite; durable retention is deferred.
- The Interaction inspector legibility pass (task 11) is required before
  opening: authors discover Paralleax without a moderator. The rest of the
  design and clarity pass stays proposed.
- Guided sessions (former tasks 1, 3 and 4) become optional. Run one only to
  answer a specific question that feedback cannot.
- Refactoring is **not** frozen. It continues in parallel, with CI guarding
  regressions, when it serves a [backlog](code-quality-backlog.md) entry or an
  area that a current task touches. It does not replace a task of the sequence
  below.
- Entries below that waited on guided sessions (collaboration groundwork, the
  audience hypothesis behind engine export) now wait on collected feedback. The
  feedback survey asks the author's profile so the
  [audience hypothesis](positioning.md#audience-hypothesis) can still be tested;
  its questions and verification are in
  [Formbricks feedback](operations/formbricks-feedback.md#open-alpha-survey).
- Feedback is self-selected: authors who give up early rarely answer it. The
  absence of negative feedback is not evidence that the editor is clear; task 10
  reads feedback together with simple activity counts.
- The 2026-11-18 decision (Story format and native export first in "Next") is
  unchanged. Native export is **not** a prerequisite of the open alpha: operator
  backups protect stored work, and the alpha notice states that authors cannot
  export their Stories yet. Export stays the first "Next" item after opening.

## Priority decision, 2026-11-18

**The Story format and native export / restore move up to the first "Next"
priority** (former task 7). They are useful for every audience: authors cannot
control their data without them (see [Business model](business-model.md#data-control)),
and they are the prerequisite for any later integration.

**Engine integration is not part of this decision.** It depends on the audience
hypothesis in [Positioning](positioning.md#audience-hypothesis) (game studios and
visual-novel teams), which guided sessions must test first. It stays under
[Proposed, not yet decided](#proposed-not-yet-decided), and the "Not Required for
V1.0" list in the [milestone detail](roadmap-history.md#not-required-for-v10) is
unchanged.

## Now

Make the product safe and clear enough to open publicly, then learn from
feedback. Task numbers refer to
[Next delivery tasks](roadmap-history.md#next-delivery-tasks); their acceptance
criteria still apply, except that "observed evidence" now means collected
feedback.

| #          | Task                                                       | Status                                                                                                                                       |
| ---------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 2          | Complete confirmed Lot A quick fixes                       | 1 of 3 implemented (Story deletion confirmation, still untested); localized default Interaction text and the "add a choice" wording remain   |
| 5          | Complete the valuable-project safety gate (P0)             | To do: legacy-data migration test, scheduled encrypted off-host `pg_dump` and restore drill, staging and HTTPS verification                  |
| 8          | Deliver import reports without server-side retention       | To do: send the full report to the browser, keep no server copy, drop the 7-day retention promise                                            |
| 11         | Make the Interaction inspector legible                     | To do: mockup validated by the author first, then implementation                                                                             |
| 9          | Open the creator alpha                                     | After 2, 5, 8 and 11: close the open-alpha gates, rehearse manual account export/deletion, configure the feedback survey, publish the notice |
| 10         | Triage feedback and ship the next improvement it points to | Continuous, from 9                                                                                                                           |
| 1, 3, 4, 6 | Guided sessions and observation triage                     | Optional since 2026-11-19                                                                                                                    |

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

### 2. Durable Story-level collaboration groundwork

Unchanged from the milestone detail (V0.3 / V0.8): field-scoped concurrency and
text merging per [ADR-034](decisions/ADR-034-collaborative-offline-authoring.md),
when collected feedback shows that the current invalidate-and-
reload model blocks real teams.

## Proposed, not yet decided

These items come from the 2026-11-18 documentation review and the 2026-11-19
priority review. They need an
explicit decision before they change the order above.

- **Engine-oriented data export**, to validate with users. If collected feedback
  confirm the studio and visual-novel hypothesis, it becomes the next priority
  after the Story format:
  - define what an engine needs beyond the backup format: a runtime-oriented
    projection (flattened availability rules, typed state declarations, content
    with interpolation markers) or the same format plus a reference evaluator;
  - ship one reference integration for one engine, as a small example project or
    loader, not a plugin ecosystem;
  - decide first which engine (Ren'Py, Unity, or Godot) and whether the
    reference evaluator is a port of `packages/shared` or a documented
    specification (see [Positioning](positioning.md#decisions-required));
  - acceptance: a Story authored in Paralleax runs in the engine sample with the
    same availability results as Paralleax Simulation for recorded journeys,
    given the same random seed and the same recorded choice-step start times
    (probability and timers are otherwise not reproducible).
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
- **Design and clarity pass.** Make the editor read before it edits (the
  inspector part is task 11 in "Now"): fewer words in favour of icons, graph zoom, and authored
  information (Trigger conditions, effects) visible on the graph. Product topics
  that need definition first: code mode, Groups as an explorer, Simulation,
  linear writing, and the actor / spectator distinction. Inventory in the
  [backlog](code-quality-backlog.md#design-and-clarity-2026-11-19). Each topic
  starts with a mockup. First step: test a mockup tool (static HTML first)
  before removing the code prototype; see
  [UI prototype](ui-prototype.md#status-2026-11-19).

The architecture review proposed on 2026-11-19 is decided in
[ADR-046](decisions/ADR-046-target-project-structure.md). Its migration steps
are refactoring under the 2026-11-19 rule: they proceed in parallel and are
tracked in the [backlog](code-quality-backlog.md#adr-046-migration-2026-11-19).

## Before V1.0

Remaining milestone work required by the
[V1.0 baseline](roadmap-history.md#v10-baseline), in the order of the
milestones. Each milestone keeps its goals, remaining scope, and exit criteria in
the [milestone detail](roadmap-history.md).

- **V0.2 to V0.4:** finish reliable large-Story authoring, revisions and
  permissions, and typed world state.
- **V0.5:** dynamic execution.
- **V0.6:** import/export compatibility (the Story format and native export
  above are its first deliverables).
- **V0.7:** authoring beta usability requirements.
- **V0.8:** collaboration and review beyond the current foundation.
- **V0.9:** publishing readiness: immutable published versions, publication
  validation (including an alert on choices without labels), stable public reader URLs, reader-journey analytics with their
  privacy gates, moderation and licensing rules.
- Production operations and recovery gates in
  [Production readiness](production-readiness.md) (P0 to P2).

## Post-V1

See [Post-V1 directions](roadmap-history.md#post-v1-directions) for the full
list. Highlights: embeddable reader, standalone and executable exports, advanced
video export, managed media, richer story discovery, multi-participant
narratives, advanced collaboration, and external agent integrations. These are
directions for exploration, not commitments to an order.

## How to update this page

- Keep it short: a decision, a table, a few bullets per priority.
- Record a priority change as a dated "Priority decision" section with its
  consequence, as required by [AGENTS.md](../AGENTS.md).
- Put detailed scope and exit criteria in
  [milestone detail](roadmap-history.md), and implemented behaviour in
  [Current scope](current-scope.md).

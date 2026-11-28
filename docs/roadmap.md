# Roadmap

Status reviewed: 2026-11-25.

This page answers one question: **what comes next, and in which order?** It is
deliberately short. What exists today is in [Current scope](current-scope.md).
Milestone goals, remaining scope, and exit criteria (V0.1 to V1.0) are kept in
[Roadmap history and milestone detail](roadmap-history.md), together with the
priority decisions recorded before 2026-11-18.

Product positioning, the audience hypothesis, and the competitive context are in
[Positioning](positioning.md). Operational gates are in
[Production readiness](production-readiness.md); implementation debt is in the
[Code quality backlog](code-quality-backlog.md).

## Priority decision, 2026-11-25

Task 8 is split into two deliveries. The alpha first lot returns complete counts
and up to 50 diagnostics, prioritizing errors, without retaining a server report.
The interface identifies a truncated preview. Full report download with bounded
memory remains a separate follow-up, to start after the first lot is validated.
The preview does not satisfy the original complete-report acceptance criterion.

## Priority decision, 2026-11-23

**Full co-editing and character-centred views become the first two product
priorities after the open-alpha prerequisites.** The project owner decided this
while preparing the La Prépa pitch. They no longer wait on collected feedback.

1. **Full co-editing**
   ([PAR-27](https://linear.app/paralleax/issue/PAR-27)): field-scoped text
   merging per [ADR-034](decisions/ADR-034-collaborative-offline-authoring.md),
   collaborator presence, and Story events distributed across several API
   instances. Today's live synchronisation reloads the Story only for clients of
   the same API process ([Current scope](current-scope.md)).
2. **Character-centred views and NPC routes**
   ([PAR-28](https://linear.app/paralleax/issue/PAR-28)): the character
   projection of the [Workbench](workbench.md), showing where a character
   appears, which routes are open to them, which conditions block them, and
   their state along a simulated journey. Autonomous NPC behaviour stays out of
   scope.

Consequences:

- The open-alpha sequence in [Now](#now) (tasks 2, 5, 8, 11, then 9) keeps its
  order and stays first.
- Collaboration is not the main differentiator: Arcweave is ahead on real-time
  collaboration ([Positioning](positioning.md#competitive-landscape)). Full
  co-editing is a baseline that teams expect; character views carry the
  differentiation, together with explainable availability.
- Until PAR-27 ships, public material says "live synchronisation", not
  "real-time co-editing". Until PAR-28 ships, character views are presented as
  in development.
- Engine-oriented export and the other items under
  [Proposed, not yet decided](#proposed-not-yet-decided) stay behind these two.

## Priority decision, 2026-11-21

**The local MCP prototype passed its functional test; the safe-writes stage is
engaged.** The project owner validated the prototype functionally. The
commissioned next step is the editorial change batch foundation
([ADR-050](decisions/ADR-050-editorial-change-batches.md),
[Story change batches](story-changes.md)): preview, diff and atomic commit
against a known revision, exposed in the local MCP server, which no longer
writes directly.

Consequences:

- The batch contract is provider-neutral: the editor, imports and tests can use
  it; it is not an assistant-specific path.
- It does not displace the open-alpha sequence below, starting with the
  valuable-project safety gate (P0). It reuses the existing transaction,
  history and editor rules, and the MCP server stays local and development-only.
- OAuth and remote MCP remain unplanned until a later decision. Deletion and
  the remaining context-entity operations wait until preview and review are
  proven in use.

**Update, 2026-11-22.** The project owner commissioned characters and locations
as operations of the same batch contract (`create_character`, `update_character`,
`create_location`, `update_location`), with temporary references in interaction
`locationId` and `characterIds` and in `characterId` and `locationId` conditions.
This narrows the "context-entity operations wait" consequence above to groups,
stats and items; deletion stays out of scope. No new MCP tool and no new
preview/commit mechanism.

**Update, 2026-11-23.** The project owner commissioned stat definitions,
assignments and their use in effects and conditions as operations of the same
batch contract ([ADR-050 amendment](decisions/ADR-050-editorial-change-batches.md)),
as a targeted MCP task delivered in two pull requests: definitions,
assignments, temporary references, literal effects and conditions first;
references in expressions and item-related cases later. It does not displace
the open-alpha prerequisites (tasks 2, 5, 8 and 11). Groups and items remain
unsupported by batches; deletion stays out of scope.

## Priority decision, 2026-11-20

**A private, local MCP prototype exists; external agent integration stays a
Post-V1 direction and is not delivered to users.** The task that commissioned
the prototype required write tools, which deviates from the planned read-only
first stage ([ADR-047](decisions/ADR-047-local-mcp-adapter-over-http-api.md)).

| Stage                                                       | Status                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| Local MCP prototype, read and write ([guide](mcp.md))       | Implemented, validated functionally on 2026-11-21               |
| Safe writes: preview, diff, commit against a known revision | Implemented for Interactions and Triggers (2026-11-21, ADR-050) |
| Remote MCP with delegated authentication (OAuth)            | Not planned yet                                                 |

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
([PostHog survey](operations/posthog-feedback.md)) and from real use.

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
  [PostHog feedback](operations/posthog-feedback.md#open-alpha-survey).
- Feedback is self-selected: authors who give up early rarely answer it. The
  absence of negative feedback is not evidence that the editor is clear; task 10
  reads feedback together with simple activity counts.
- The 2026-11-18 decision promoted native Story export. The feature is now
  implemented; operator backups remain a separate open-alpha safety gate.

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
| 2          | Complete confirmed Lot A quick fixes                       | 1 of 3 done (Story deletion confirmation, tested); untitled Interaction presentation and the "add a choice" audit remain                     |
| 5          | Complete the valuable-project safety gate (P0)             | To do: legacy-data migration test, scheduled encrypted off-host `pg_dump` and restore drill, staging and HTTPS verification                  |
| 8          | Deliver import diagnostics without server-side retention   | First lot: bounded preview; full bounded-memory download is a separate follow-up                                                             |
| 11         | Make the Interaction inspector legible                     | To do: mockup validated by the author first, then implementation                                                                             |
| 9          | Open the creator alpha                                     | After 2, 5, 8 and 11: close the open-alpha gates, rehearse manual account export/deletion, configure the feedback survey, publish the notice |
| 10         | Triage feedback and ship the next improvement it points to | Continuous, from 9                                                                                                                           |
| 1, 3, 4, 6 | Guided sessions and observation triage                     | Optional since 2026-11-19                                                                                                                    |

## Next

### 1. Stable Story format and native export / restore

Former task 7, promoted. Native export and import are implemented in the
current work; final integration remains in progress. The versioned contract and
its limits are documented in [Story format](story-format.md). Import creates a
new private Story; it does not replace an existing one.

The foreign-format importer extraction required by ADR-046 has not yet been
completed. It needs to move the existing adapters and their quality-gate,
worker and deployment integration together; the current native format does
not depend on those adapters.

- Representative round-trip, invalid-input and cross-database checks exercise the
  supported content and references. Compatibility is explicit and versioned.

### 2. Full co-editing

Promoted by the 2026-11-23 decision
([PAR-27](https://linear.app/paralleax/issue/PAR-27)): field-scoped concurrency
and text merging per
[ADR-034](decisions/ADR-034-collaborative-offline-authoring.md), collaborator
presence, and Story events distributed across API instances. It no longer waits
on collected feedback. A durable offline authoring queue stays out of scope.

- Acceptance: two authors edit the same Story, including the same text field,
  through two different API instances, without lost changes or a blocking
  reload.

### 3. Character-centred views and NPC routes

Promoted by the 2026-11-23 decision
([PAR-28](https://linear.app/paralleax/issue/PAR-28)): the character projection
of the [Workbench](workbench.md), built on the existing characters, stats,
inventories and nested items.

- Acceptance: on a Story of at least 300 Interactions, an author who did not
  write it can follow one NPC's possible route and explain why a scene is
  unavailable to that character (the
  [product test](positioning.md#product-test) task).

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
- **Author documentation, then topic guides** (requested 2026-11-20, PAR-7).
  The first-story guide now stops at the first Simulation launch: it covers
  writing a scene, creating a choice and testing, not a finished Story. Next:
  1. complete author-facing documentation for characters, locations, variables
     (stats), items, conditions and effects, building on the
     [Author guide](author-guide.md);
  2. then consider optional guides by topic (characters, variables, conditions,
     and so on), each opened from the `Guide` control and linking to that
     documentation, reusing the existing guide overlay
     ([Onboarding](onboarding.md)).

  Acceptance for step 2 to define when it is scheduled.

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

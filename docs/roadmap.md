# Roadmap

This roadmap describes the progression from the validated narrative core to a public Paralleax platform.

It is organized around **user capabilities** rather than implementation areas. Engineering work supports these milestones but does not define them by itself.

For the authoritative implemented baseline, see [Current scope](current-scope.md). The original narrative-core milestone is documented in [MVP](mvp.md). Operational requirements live in [Production readiness](production-readiness.md), and implementation debt belongs in [Code quality backlog](code-quality-backlog.md).

## How to Read This Roadmap

Each milestone contains:

- **Goal**: the user capability the milestone should unlock.
- **Implemented foundation**: relevant capabilities already present.
- **Remaining scope**: work still required for the milestone.
- **Exit criteria**: observable conditions for considering the milestone complete.
- **Dependencies**: important sequencing constraints.

Version numbers express product progression, not a requirement to finish every possible feature in one domain before moving forward. Small increments from later milestones may be implemented earlier when they validate the architecture or unblock current work.

## Guiding Principles

- Prefer typed, explicit domain concepts over a universal unvalidated variable bag.
- Preserve deterministic reader execution.
- Keep authored story state separate from reader/runtime state.
- Treat React Flow as a projection of the story model.
- Build collaboration on explicit revisions and conflict semantics.
- Build imports as adapters; external engines do not define the Paralleax core.
- Optimize large-story behavior from measurements rather than speculation.
- Extract large orchestration modules progressively while related features are changed.

## V0.1 — Narrative Core — Implemented

### Goal

Validate that an author can model and execute branching interactive narrative without coupling the story engine to the graph UI.

### Implemented foundation

- Story, Interaction, Trigger, and Reader.
- Graph editor.
- Interaction editing and movement without data loss.
- Multiple Trigger inputs and contextual inputless Triggers.
- Alternative condition variants through multiple Triggers.
- Trigger cleanup and structural deletion protections.
- Visible save state and reload recovery.
- PostgreSQL story persistence.
- API, shared, web, PostgreSQL, and Playwright coverage.

### Exit criteria

Completed. The historical criteria remain documented in [MVP](mvp.md).

---

## V0.2 — Reliable Large-Story Authoring — In Progress

### Goal

An author can safely create, navigate, edit, test, and recover a large story without data loss or blocking performance problems.

### Implemented foundation

- Explicit PostgreSQL migrations.
- Health/readiness and stable API error foundations.
- Lightweight `StorySummary` listing.
- Targeted mutation persistence for common operations.
- Atomic Trigger creation.
- Batched complete-story persistence.
- Reproducible large-story PostgreSQL and editor stress tests.
- Save-state protection during navigation and page unload.
- Rich-text and HTTP payload limits.
- Story Canvas foundations.
- Search and reference navigation.
- Simulation Mode foundations.
- Authenticated reader-progress persistence.
- Lazy-loaded editor/player routes.

### Remaining scope

#### Authoring UX

- Refine Story Canvas navigation and interaction ergonomics.
- Add a focused narrative-neighborhood mode for large graphs.
- Improve empty states, contextual actions, keyboard guidance, and shortcuts.
- Add whole-graph auto-layout with immediate undo.
- Continue search/filter/focal-point improvements where large-story tests justify them.
- Consolidate the design system and accessibility behavior.
- Extend interface internationalization when the authoring flows stabilize.

#### Reliability and scale

- Define representative story-size and creator-account performance budgets.
- Profile before changing graph projection or React Flow synchronization.
- Continue replacing unnecessary full-graph persistence with targeted mutations.
- Verify backup and restore procedures.
- Maintain reproducible stress-test fixtures and recorded baselines.

### Exit criteria

V0.2 is complete when:

- critical authoring flows have no known data-loss path;
- failed saves are visible and recoverable;
- backup restoration is documented and routinely verifiable;
- a representative large-story fixture remains usable within documented budgets;
- authors can locate and navigate to relevant interactions without manually scanning the full graph;
- critical editor and reader workflows are covered by automated regression tests;
- the Story Canvas is usable without developer knowledge of the internal graph model.

### Dependencies

- Performance changes require measured evidence.
- Large structural refactors are not V0.2 goals by themselves; extract modules incrementally when needed.

---

## V0.3 — Identity, Revisions, and Permissions — Partial Foundation

### Goal

Stories have reliable ownership and revision semantics so multiple people and future publishing workflows can safely operate on the same project.

### Implemented foundation

- Local user accounts.
- Opaque cookie sessions.
- Creator-only story ownership.

### Remaining scope

#### Revision model

- Add explicit story revisions to mutations.
- Reject obsolete writes with clear conflict responses.
- Define editor merge/retry behavior.
- Preserve user work across recoverable conflicts.

#### Access model

- Centralize access checks in a `StoryAccessPolicy` or equivalent boundary.
- Support private, unlisted, and eventually public visibility.
- Add delegated read/edit/manage permissions.
- Add account recovery and external identity providers when operationally required.

### Exit criteria

V0.3 is complete when:

- every mutable Story has explicit revision/conflict semantics;
- stale writes cannot silently overwrite newer canonical work;
- authorization is centralized rather than scattered across endpoints;
- Story visibility and delegated access can be represented without changing the core narrative model;
- the editor has a defined UX for recoverable conflicts.

### Dependencies

- **Real-time collaboration depends on V0.3.**
- **Suggestion/review workflows depend on V0.3.**
- **Publishing depends on a stable visibility/access model.**

---

## V0.4 — Typed World State — Partially Implemented

### Goal

Authors can model persistent world state beyond visited interactions while the engine remains explicit, typed, deterministic, and understandable.

### Implemented foundation

- Locations and current-location conditions.
- Characters, interaction casts, and presence conditions.
- Numeric character stats, effects, and comparisons.
- Item definitions and exact authored item instances.
- Deterministic inventory replay.
- Recursive item-instance persistence and authoring.
- Character-owned item roots.
- Typed parent relationships and cycle-safe subtree transfers between characters
  and item containers.
- Story-local deterministic time.
- Interaction durations and calendar-based Trigger conditions.

### World-State Model to Clarify

Before adding many new concepts, define which concepts are genuinely distinct domain types and which are configurations of a smaller typed state system.

Candidate concepts include stable attributes, resources, skills, boolean flags, traits, and temporary statuses.

Do not introduce a generic untyped key/value variable bag merely to cover all of these cases.

### Remaining scope

#### General world state

- Define typed non-character state where real scenarios require it.
- Add conditions/effects for accepted state types.
- Persist additional runtime state through deterministic journey replay and/or reader-progress snapshots.
- Improve reference-resolution UX when deleting referenced entities.

#### Character relationships

Model relationships as general directional state between entities rather than hard-coded romance mechanics.

Example conceptual shape:

```text
Alice -> Bob
  trust: 30
  affection: 15
  fear: 0
```

The exact representation requires an ADR before implementation.

#### Story organization

Define a neutral grouping concept for quests, chapters, arcs, scene sequences, or author-defined groups.

First decide whether groups are authoring/navigation metadata only, or executable entities with conditions, completion state, journal behavior, or effects. Do not accidentally turn visual graph grouping into runtime semantics.

#### Items — staged progression

```text
recursive item graph
  -> character possession and nested item containers
  -> equipment and slots
  -> quantities and consumables
  -> modifiers and durability
  -> economy and shops
  -> advanced clothing/layer semantics
```

Only implement later stages when concrete story requirements justify them.

#### Other increments

- Playable character points of view.
- Graph filters/focal points for world entities and groups.
- Author annotations that do not affect execution.
- Explicit final interactions and completed-story semantics.

### Exit criteria

V0.4 is complete when:

- common character/location/stat/item state can be authored without custom code;
- state changes replay deterministically from a journey;
- runtime state can be persisted and restored consistently;
- relationships and grouping have explicit documented semantics;
- the item model supports possession, containers, and a first usable equipment/slot layer;
- unsupported world-state needs can be identified explicitly rather than hidden in ad-hoc fields.

### Dependencies

- Advanced item systems depend on the recursive item graph.
- Equipment/slot semantics should precede advanced clothing.
- New state concepts require domain semantics before editor controls.

---

## V0.5 — Dynamic Execution — Partial Foundation

### Goal

Stories can react not only to world state but also to time and controlled automatic/probabilistic execution.

### Implemented foundation

- Interaction durations.
- Deterministic story-local calendar progression.
- Date, date-range, weekday, and time-slot availability.

### Remaining scope

- Real-time choice countdowns.
- Delayed automatic choices.
- Appearance probability.
- Probabilistic automatic choices.
- Explicit deterministic seeding/replay semantics for probability.
- Simulation controls and diagnostics for timed/probabilistic behavior.

### Exit criteria

V0.5 is complete when:

- timed behavior has defined pause/resume/reload semantics;
- probabilistic behavior is reproducible for debugging when required;
- Simulation Mode can explain why and when an automatic choice occurred;
- automatic execution cannot create uncontrolled loops without explicit protection;
- reader progress can restore dynamic execution consistently.

### Dependencies

- Probability requires an explicit deterministic/debugging strategy.
- Automatic choices depend on stable Reader semantics.
- Real-time timers require persistence/reload semantics before public use.

---

## V0.6 — Import / Export Compatibility

### Goal

Paralleax can ingest and emit non-trivial story data through explicit, validated adapters without making any external engine the specification for the Paralleax core.

### Preferred pipeline

```text
source inventory
  -> source parser
  -> source-neutral intermediate representation
  -> compatibility / unsupported-feature report
  -> Paralleax mapping
  -> validation
  -> import
```

### Remaining scope

- Define a source-neutral intermediate representation.
- Define structural and semantic validation.
- Produce compatibility and unsupported-feature reports.
- Create stable internal import APIs.
- Import one representative non-trivial external scenario without source-specific changes to core semantics.
- Use more complex systems as architecture stress tests.
- Define a stable public Paralleax import/export format after internal compatibility requirements are understood.
- Support export suitable for backup/versioning before promising executable exports.

### Exit criteria

V0.6 is complete when:

- at least one non-trivial external scenario imports through the generic pipeline;
- unsupported source concepts produce explicit compatibility diagnostics;
- source-specific parsing/mapping remains isolated from the narrative engine;
- imported stories pass domain validation;
- representative imported stories can be opened, edited, simulated, saved, and reloaded;
- Paralleax has a documented stable story backup/export representation.

### Dependencies

- Complex imports depend on sufficiently stable domain semantics.
- External projects are compatibility fixtures, not specifications for Paralleax.

---

## V0.7 — Authoring Beta

### Goal

An author who did not build Paralleax can create, test, save, maintain, export, and understand a moderately complex story without developer assistance.

### Scope

- Coherent onboarding and first-story flow.
- Mature Story Canvas navigation.
- Search, filters, and contextual navigation.
- Clear authoring of conditions and effects.
- Usable locations, characters, stats, items, and supported world state.
- Simulation/debugging with actionable explanations.
- Story validation with useful error messages.
- Backup/export and restore/import.
- User-facing documentation.
- Accessibility pass on critical authoring workflows.
- Representative usability testing with external authors.

### Exit criteria

V0.7 is complete when:

- a new author can create a representative branching story without direct developer assistance;
- the author can diagnose unavailable interactions through Simulation Mode;
- common mistakes produce understandable validation/errors;
- the author can back up and restore their work;
- the core workflow passes a documented accessibility review;
- usability testing identifies no blocker requiring knowledge of Paralleax internals.

### Dependencies

- Builds on V0.2 authoring reliability.
- Requires enough of V0.4 to create useful stories.
- Requires V0.6 backup/import-export foundations.
- Does not require real-time collaboration or public publishing.

---

## V0.8 — Collaboration and Review

### Goal

Several contributors can safely propose, review, and edit story content without silently overwriting one another.

### Scope

- Suggestions/contribution proposals.
- Review and approval/rejection workflows.
- Accepted/rejected/pending change history.
- Contributor roles and delegated permissions.
- Event-log or equivalent auditable history.
- Real-time collaboration only where it provides clear value and revision/conflict semantics are proven.

### Exit criteria

V0.8 is complete when:

- contributors can work without receiving full owner privileges;
- proposed changes can be reviewed before becoming canonical;
- conflicting writes cannot silently destroy work;
- important accepted/rejected changes are auditable;
- any real-time editing feature has defined disconnect/reconnect/conflict behavior.

### Dependencies

- Requires V0.3 revisions and permissions.

---

## V0.9 — Publishing Readiness

### Goal

A validated Story can become a stable reader-facing publication without exposing mutable authoring state.

### Scope

- Separate mutable drafts from immutable published versions.
- Validate before publication.
- Stable public reader URLs.
- Private, unlisted, and public visibility.
- Separate author simulation from public reader UX.
- Reporting and moderation foundations.
- Ownership and content-licensing rules.
- Production staging, metrics, error reporting, backup, restore, and rollback gates.

### Exit criteria

V0.9 is complete when:

- published versions remain stable while authors continue editing drafts;
- publication is blocked by defined validation failures;
- public reader access obeys visibility rules;
- rollback and restoration procedures are verified;
- moderation/reporting responsibilities are documented and minimally operational;
- production observability can identify critical failures.

### Dependencies

- Requires V0.3 access semantics.
- Benefits from V0.7 usability maturity.
- Operational gates remain detailed in [Production readiness](production-readiness.md).

---

## V1.0 — Public Platform

### Goal

Paralleax can be offered publicly as a reliable authoring and reading platform with a coherent core product promise.

### V1.0 baseline

- Reliable authoring.
- Typed world state sufficient for representative complex stories.
- Stable reader execution.
- Authoring beta usability requirements met.
- Safe revisions/permissions.
- Story backup/import-export.
- Stable publishing model.
- Production operations and recovery.
- Clear public documentation.

### Not Required for V1.0

These may be valuable later but should not block the first stable public platform:

- Unity export.
- Standalone executable export.
- Advanced video export.
- AI-generated runtime narrative.
- Every possible item/economy/clothing mechanic.
- Real-time collaborative editing if asynchronous review already satisfies collaboration needs.
- Progressive loading before measurements show it is necessary.

---

## Post-V1 Directions

Potential directions include:

- embeddable reader;
- richer hosted story discovery;
- standalone/web-app exports;
- managed media pipelines;
- Unity integration;
- AI-assisted authoring experiments;
- advanced collaboration;
- advanced economy, equipment, and clothing systems;
- progressive loading for very large stories when measured usage justifies it.

These are directions for exploration, not commitments to a particular order.

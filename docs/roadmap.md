# Roadmap

This roadmap describes the progression from the validated narrative core to a public Paralleax platform.

Status reviewed: 2026-08-28.

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

## Current Position and Delivery Order

Paralleax is suitable for demonstrations, private-alpha use, and small or
moderately complex test stories. The implemented product already contains
substantial V0.3, V0.4, V0.6, V0.8, and V0.9 foundations, but that does not make
the later milestones complete: public delivery is still gated by the unfinished
reliability, conflict, exchange-format, accessibility, and publication work.

The near-term delivery sequence is:

1. close the remaining standalone V0.2 reliability and accessibility gaps now
   that durable authored history and global undo/redo are implemented;
2. complete V0.3 optimistic concurrency, conflict recovery, history labels,
   retention, and author-facing history browsing;
3. establish the stable Paralleax backup/import-export contract required by V0.6;
4. add Story validation, onboarding, and accessibility evidence to reach V0.7;
5. then deepen world state, dynamic execution, collaboration, and publishing
   according to validated user needs.

Later milestone foundations may continue to be improved when they support these
steps, but they must not bypass their production dependencies.

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

## V0.2 — Reliable Large-Story Authoring — Advanced, In Progress

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
- Search, filtering, text occurrences, and context-reference navigation.
- Rectangular interaction/Trigger multi-selection and group movement.
- Complete, single-element, and selected-group automatic graph layout.
- Fixed bottom-output/top-input routing and collision-aware Trigger placement.
- Position-aware graph context actions and icon-only canvas tools.
- Simulation Mode with condition diagnostics, forced paths, backward replay,
  inline interaction editing, and option creation.
- Separate authenticated reader and Simulation Mode autosaves plus named manual
  saves shared between the two modes.
- Recoverable reader loading, visible progress-save state, and editor unload/
  navigation guards while saves are pending or failed.
- Deterministic demo-story fixtures and a 2,000-interaction graph baseline.
- English/French interface localization and a reusable design-system foundation.
- Durable per-author Story-content history with atomic reversible deltas,
  conflict-safe inverse revisions, vertical undo/redo controls, and global
  `Ctrl+Z`, `Ctrl+Shift+Z`, and `Ctrl+Y` shortcuts outside editable fields.
- Lazy-loaded editor/player routes.

### Remaining scope

#### Authoring UX

- Add an author-facing history browser with meaningful operation labels and
  grouping; the current controls expose only undo/redo availability.
- Add a focused narrative-neighborhood mode if large-story usability testing
  confirms that search and reference navigation are insufficient.
- Improve empty states, contextual actions, keyboard guidance, and shortcuts.
- Continue search/filter/focal-point improvements where large-story tests justify them.
- Consolidate dialog, loading, empty, recoverable-error, and save-error behavior.
- Complete automated accessibility checks and a manual keyboard/focus audit.
- Extend interface internationalization only as remaining authoring flows stabilize.
- Give Simulation Mode mutations visible saving, failure, and recovery behavior.

#### Reliability and scale

- Define representative story-size and creator-account performance budgets.
- Profile before changing graph projection or React Flow synchronization.
- Continue replacing unnecessary full-graph persistence with targeted mutations.
- Add story-level size/entity quotas and provider-level abuse limits.
- Complete a recorded backup restoration drill in the selected deployment
  environment; keep the existing CI restore verification green.
- Maintain reproducible stress-test fixtures and recorded baselines.
- Add a real-browser regression for late route responses and unresolved-save
  navigation guards.

### Exit criteria

V0.2 is complete when:

- critical authoring flows have no known data-loss path;
- failed saves are visible and recoverable;
- backup restoration is documented and routinely verifiable;
- a representative large-story fixture remains usable within documented budgets;
- authors can locate and navigate to relevant interactions without manually scanning the full graph;
- critical editor and reader workflows are covered by automated regression tests;
- the Story Canvas is usable without developer knowledge of the internal graph model.
- authors can undo and redo supported Story modifications from keyboard and menu
  controls without losing unrelated canonical changes.

### Dependencies

- Performance changes require measured evidence.
- Large structural refactors are not V0.2 goals by themselves; extract modules incrementally when needed.
- Further history browsing, retention, and audit presentation build on the V0.3
  revision/event foundation; do not add graph-only snapshot stacks beside it.

---

## V0.3 — Identity, Revisions, and Permissions — Advanced Foundation

### Goal

Stories have reliable ownership and revision semantics so multiple people and future publishing workflows can safely operate on the same project.

### Implemented foundation

- Local user accounts.
- Opaque cookie sessions.
- Creator ownership and global user/administrator roles.
- Story revisions incremented on authored mutations and returned in mutation
  results and live invalidation events.
- Private, authenticated, invitation, and public Story visibility.
- Owner, collaborator, authenticated-user, and administrator editing policies.
- Story-specific viewer/editor grants with effective read/edit/manage/comment
  capabilities.
- Central shared access resolution consumed by API and web presentation, with
  repository authorization enforced in PostgreSQL.
- Administrator account management and last-administrator protection.
- Process-local live invalidation with deterministic editor reload and
  Simulation Mode replay.
- Append-only PostgreSQL authored-change events, atomically stored precise
  reversible deltas, actor/revision metadata, and recent ordered summaries.
- Current-author undo/redo as inverse canonical revisions. Unrelated later edits
  survive; overlapping or structurally invalid reversals return a conflict.
- Revision-aware editor controls and shortcuts that preserve native text-field
  undo and reuse canonical Story replacement after a successful inverse.

### Remaining scope

#### Revision model

- Require an expected Story or entity revision on every mutable operation where
  an obsolete write could destroy newer canonical work.
- Reject obsolete writes with a stable `409 Conflict` response and request id.
- Define and implement the editor choices for reload, retry, overwrite, or merge
  according to mutation type.
- Preserve active drafts across recoverable conflicts and test concurrent edits
  from separate clients.
- Decide whether conflict scope remains Story-wide or becomes entity/field-level
  for common independent mutations.
- Define snapshot cadence, event compaction, and retention for long-lived large
  Stories without weakening the append-only audit contract.
- Add stable operation labels and optional gesture grouping above the precise
  delta format, then expose a navigable history browser.
- Decide whether explicitly selected older events may be reversed in the future;
  global undo remains scoped to the current author's latest active event.

#### Access model

- Finish consolidating repeated SQL/application access expressions behind one
  explicit policy contract without weakening query-level authorization.
- Decide whether an explicit unlisted visibility differs from invitation and
  public visibility before adding it.
- Add password change/reset, email verification, session revocation, and account
  export/deletion before open registration.
- Add external identity providers only when operationally required.

### Exit criteria

V0.3 is complete when:

- every mutable Story has explicit revision/conflict semantics;
- stale writes cannot silently overwrite newer canonical work;
- authorization is centralized rather than scattered across endpoints;
- Story visibility and delegated access can be represented without changing the core narrative model;
- the editor has a defined UX for recoverable conflicts.
- authored changes have an ordered, durable history that can drive safe
  author-facing undo/redo rather than a transient graph-only snapshot stack.

### Dependencies

- **Real-time collaboration depends on V0.3.**
- **Suggestion/review workflows depend on V0.3.**
- **Publishing depends on a stable visibility/access model.**

---

## V0.4 — Typed World State — Advanced Foundation

### Goal

Authors can model persistent world state beyond visited interactions while the engine remains explicit, typed, deterministic, and understandable.

### Implemented foundation

- Locations and current-location conditions.
- Characters, interaction casts, and presence conditions.
- Reusable number, boolean, and string variables assigned to Stories,
  characters, locations, and item definitions.
- Typed initial values, interaction effects, Trigger comparisons, hourly change,
  inert rich-text interpolation, and deterministic replay.
- Item definitions and exact authored item instances.
- Deterministic inventory replay.
- Recursive item-instance persistence and authoring.
- Character- and location-owned item roots.
- Typed parent relationships and cycle-safe subtree transfers between characters
  locations, and item containers.
- Independent per-instance item variable values and exact-instance effects.
- Story-local deterministic time.
- Interaction durations and calendar-based Trigger conditions.
- One playable-character reader projection with character sheet, inventory, and
  encountered-character presentation.
- Authoring annotations and contextual discussions that remain outside runtime
  Story semantics.

### World-State Model Direction

ADR-021 settled the base direction: stable attributes, resources, boolean flags,
and similar scalar state extend the existing typed-variable model rather than
creating parallel attribute tables or workflows. New concepts should remain
distinct only when their ownership, lifecycle, or invariants materially differ.

Calculated variables, formulas, dependency graphs, traits with non-scalar
semantics, and temporary statuses remain separate decisions. Do not introduce a
generic untyped key/value bag merely to cover them.

### Remaining scope

#### General world state

- Add calculated variables and dependency factors only after cycle, update-order,
  precision, and debugging semantics are documented.
- Decide whether temporary statuses are ordinary variable assignments with an
  expiry rule or a distinct runtime concept.
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

## V0.5 — Dynamic Execution — Early Foundation

### Goal

Stories can react not only to world state but also to time and controlled automatic/probabilistic execution.

### Implemented foundation

- Interaction durations.
- Deterministic story-local calendar progression.
- Date, date-range, weekday, and time-slot availability.
- Deterministic backward replay and persisted reader/simulation journeys that
  provide the restoration boundary for future dynamic behavior.

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

### Implemented foundation

- Experimental ChoiceScript import from the signed-in Story library.
- Staged source parser, typed source model, draft graph compiler/layout,
  Paralleax mapping, and compatibility-report modules.
- Atomic API validation and complete Story persistence.
- Conversion of prose, choices, labels, jumps, simple typed variables, literal
  effects/comparisons, and inert substitutions.
- Explicit source-file/line diagnostics for unsupported commands and expressions.
- Transient source-identifier mapping with no ChoiceScript concepts added to the
  canonical Story model.
- Synthetic regression fixtures plus documented checks against the official
  ChoiceScript example and CSLIB `char_creator`.

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

- Define a source-neutral retained representation for unsupported source and
  richer expressions; the current draft graph remains ChoiceScript-specific.
- Separate dry-run compatibility analysis from Story creation and make the full
  report downloadable.
- Extend structural and semantic validation into a reusable Story validation
  boundary rather than importer-only checks.
- Promote the current internal import boundary only after its contracts are
  stable and source-neutral where required.
- Automate licensed, version-pinned compatibility corpora without copying
  prohibited commercial sources.
- Use more complex systems as architecture stress tests.
- Define a stable public Paralleax import/export format after internal compatibility requirements are understood.
- Support a downloadable Story backup, validation, and restore workflow before
  promising executable or lossless foreign-engine exports.
- Add ZIP/folder and larger background imports with progress and rollback only
  after the synchronous small-project path is proven.

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

### Implemented foundation

- Unified Story library with creation, deletion, search, filtering, sorting, and
  grid/list presentation.
- Five deterministic demonstration Stories covering paths, visited conditions,
  Story variables, character stats/items, and recursive item state.
- Story Canvas creation, selection, navigation, layout, contextual actions, and
  inspectors for the implemented narrative model.
- Simulation diagnostics, forced-path testing, inline editing, and separate
  simulation saves.
- English/French interface and an extensive English user guide.
- Broad unit, API, PostgreSQL, component, coverage, stress, and Playwright suites.

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
- Cohesive loading, empty, failure, recovery, and confirmation patterns across
  the complete authoring workflow.

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

## V0.8 — Collaboration and Review — Partial Foundation

### Goal

Several contributors can safely propose, review, and edit story content without silently overwriting one another.

### Implemented foundation

- Story-specific viewer/editor permissions and reader/editor comment policy.
- Anchored discussions on graph positions, entities, and supported text ranges,
  with replies, open/resolved state, detached-anchor detection, and navigation.
- Reader-contextual interaction discussions.
- Process-local live Story and comment invalidation.
- Deterministic editor refresh and Simulation Mode replay after remote changes.

These features support review and simultaneous awareness, but they are not yet a
safe multi-author conflict or proposal workflow.

### Scope

- Suggestions/contribution proposals.
- Review and approval/rejection workflows.
- Accepted/rejected/pending proposal history layered on the same authored-change
  event foundation used by undo/redo.
- Contributor roles beyond the existing viewer/editor grants where concrete
  review workflows require them.
- Collaborative audit projection of the event history, including actor and
  review metadata without allowing undo to erase past events.
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

## V0.9 — Publishing Readiness — Early Foundation

### Goal

A validated Story can become a stable reader-facing publication without exposing mutable authoring state.

### Implemented foundation

- Anonymous reading of public Stories and authenticated/invitation/private
  visibility for other access modes.
- Stable Story player routes, separate editor-only Simulation Mode, and
  capability-based interface controls.
- Authenticated reader saves kept separate from authored Story persistence.
- Provider-neutral production images, migration-first deployment, health/
  readiness probes, structured request logging, exact production-origin checks,
  smoke tests, and private-alpha operator guidance.

Public visibility currently exposes the mutable authored Story. It is not yet a
versioned publication workflow.

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

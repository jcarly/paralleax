# Open Questions

This page tracks unresolved product and domain decisions. The roadmap and code
quality backlog track delivery work; this page should contain decisions that
need an explicit answer before the affected capability is implemented.

## Users and Permissions

- Define moderation and administrator override rules for display names before
  opening registration beyond the private alpha. The identity shape, rename
  behavior, privacy boundary, and legacy migration are fixed by ADR-006.
- Define external identity-provider account linking before adding Google or
  another provider: trusted verified-email claims, collisions with password
  accounts, unlinking, recovery, and behavior when a provider is unavailable.
- Before implementing change proposals, define who may propose, review, and
  approve them; whether creator override or multiple approvals are supported;
  and how those rights relate to direct editing and story management.

## Change History and Suggestions

- Define author-facing operation labels and grouping on top of the implemented
  precise reversible field/entity deltas, especially for multi-request gestures.
- Define how pending suggestions are previewed: decide whether users inspect a
  list of events, a temporary draft state, or both.
- Define how rejected suggestions are retained and whether they can be reopened.
- Define snapshot cadence, event compaction, and retention for long-lived Story
  histories; avoid one history event per text keystroke.
- Decide whether a future history browser may reverse an explicitly selected
  older event. Global undo currently selects the current author's latest active
  reversible event and rejects overlapping or structurally invalid inverses.
- Decide whether non-text local drafts need a pre-commit undo layer. Text fields
  currently retain native undo while focused; global shortcuts and toolbar
  controls apply only to committed canonical history.

## Comments and Review

- Thread deletion is settled: an authorized thread manager soft-deletes and can
  restore the complete discussion. Before adding individual message deletion,
  define its authority, reply handling, retention, live updates, and undo
  behavior; see [Current scope](current-scope.md).
- Decide how comments anchored to an entity behave when that entity is deleted
  and later restored through Story history. Missing targets are already marked
  detached; threads remain available for reattachment. Choose whether entity
  deletion should also soft-delete or hide its threads, and define how undo,
  restore, and replies behave. Do not permanently delete the discussion.

## Story Format and Examples

- Define a stable `story-format.md` before JSON import/export or external
  integrations depend on the story shape. Relational persistence does not yet
  define an external exchange format.
- Treat the proposed native Interaction source as an editor projection until an
  explicit exchange-format decision says otherwise. Ink/Yarn/ChoiceScript/QSP
  adapters must map only supported concepts into Paralleax canonical content
  and report gaps; matching surface syntax does not promise runtime or
  round-trip compatibility.
- Decide whether documented examples should include simplified JSON, expected
  reader results, and associated regression tests.
- Consider examples for simple branching, visited-history conditions, shared
  triggers, alternative triggers, and cycles.

## Reader State and Completion

- Define whether final interactions are the only explicit story completion rule
  or whether other completion conditions can exist later.
- Define how a stopped branch differs from a completed story once contextual
  inputless triggers and world state exist.
- Before implementing the planned multi-participant narrative model, define how
  a play session assigns authenticated users, guests, and automatic controllers
  to Player seats; how reconnecting humans resume a pending shared decision; and
  which recorded event establishes the deterministic first-human choice.
- Define participant-text precedence and fallback between actor, spectator,
  Character-specific, and Player-specific text. Preserve a useful default so
  authors do not need to author every point-of-view variant.
- Define the compatibility/migration rule between existing interaction character
  casts (scene context and presence conditions) and future actor/spectator
  participant roles (decision and viewpoint semantics). They must not be
  conflated implicitly.

## Interaction Inclusion

- Decide whether the ordered execution representation proposed in
  [Interaction inclusion](interaction-inclusion-proposal.md) extends the current
  rich-content model or introduces an explicit ordered authored-operation layer.
- Define action identity and evaluation timing when an included Interaction
  contributes actions without becoming a visited journey step.
- Define typed call arguments, scoped restoration, cycle rejection, defensive
  execution limits, referenced-target deletion, and reader-progress compatibility
  before any native inclusion-based QSP mapping. The current
  [QSP adapter](qsp-import.md#static-subroutine-paths) uses ordinary interaction
  traversal, stats, and Triggers and does not require or settle these proposals.

## World State, Conditions, Effects, and Items

- For future state concepts beyond typed stat assignments and deterministic
  reader replay, define whether values are authored, persisted per play session,
  or derived.
- Decide whether every Story must retain story-local calendar time or whether a
  future Story may opt out of temporal state. Keep this domain choice separate
  from hiding clock and scene presentation when those details are not useful;
  the current model assigns each Story a start date and time, and Interactions
  have duration semantics.
- Define item-definition deletion behavior when authored conditions or existing
  play-session item instances reference it. Authored item effects currently
  cascade with deletion of their exact item instance.
- Define item transfer rules, stack identity, quantities, and equipment-slot
  conflict behavior. The current reader starts with an empty inventory and
  tracks exact authored item instances.
- ADR-013 settles the recursive instance and relationship direction, including
  rejecting deletion of a non-empty container. Remaining choices are slot
  schema/versioning, capacity units, quantity stacks versus exact-instance
  identity, and the maximum tree depth shown by the authoring UI.
- Decide whether extension properties are schema-backed per item type or limited
  to validated plugin-owned namespaces; avoid unrestricted business logic in
  arbitrary JSON.
- Keep directional relationships separate from character attributes and decide
  which relationship dimensions are available to conditions and effects.

## Story Translation

- Decide whether translating user-authored story content is worth implementing at
  all.
- If explored later, decide whether translations are separate linked stories,
  locale variants inside one story, or an external export/import workflow.
- Keep story translation separate from interface internationalization.

## Editor Technology

- Revisit the React Flow integration only if trigger semantics or story
  operations start changing solely to satisfy rendering constraints, as required
  by [ADR-004](decisions/ADR-004-react-flow-boundary.md).
- Before implementing [ADR-034](decisions/ADR-034-collaborative-offline-authoring.md),
  select a maintained text-collaboration protocol/library and define durable
  local queue recovery, atomic-field conflict presentation, and reconnect
  behavior against the existing rich-text tokens and history model.
- Resolved: each Trigger has its own graph marker, and multiple input edges for
  one Trigger converge on that marker. Historical duplicate source -> target
  routes remain independently visible and deletable; normal authoring prevents
  creating new duplicates. See [Domain invariants](domain-invariants.md) and
  [Trigger semantics](triggers.md).
- **Rich-text source grammar:** The requested direction is a concise native
  Paralleax content syntax inspired by Ink; the sketch in
  [ADR-043](decisions/ADR-043-ink-inspired-narrative-source.md) is not a final
  grammar. Prototype it against current Story data before implementing a
  CodeMirror mode. Resolve:
  - Which existing `TriggerCondition` variants and stat-expression forms the
    first syntax subset represents, and how unsupported existing conditions
    remain lossless and editable.
  - How one condition block's stable id is preserved in source, including copy,
    paste, duplicate ids, missing ids, and deletion. Conditions within a block
    remain AND; `else` and OR are not represented unless the canonical model
    changes in a separate accepted decision.
  - How stable assignment, exact-item, interaction, location, character, item,
    and temporal references are shown without treating a mutable name as the
    identity. Define rename, ambiguity, and deleted-reference diagnostics.
  - Which Markdown-like formatting maps losslessly to the Tiptap schema, and how
    current media, imported markup, links, and unsupported HTML are represented.
    An invalid or lossy draft must never replace canonical content.
  - Whether nested conditional frames are supported and how inline versus
    multi-paragraph spans round-trip without changing comment anchors.
  - Which parser approach supports typed diagnostics and CodeMirror highlighting
    without executing template code. Lezer is a candidate to evaluate after the
    prototype; it does not itself resolve canonical references or domain rules.
  - How changing modes, invalid drafts, paste, and concurrent Story revisions
    interact with the existing atomic body/condition save and change-history path.
- **Global Story Script:** Keep its grammar and change application out of the
  Interaction content mode. Before its separate P2 implementation, define how
  its syntax covers every Trigger shape (including several inputs, condition
  groups, timers, probability, and inputless Triggers), effects, transitions,
  and non-text canvas metadata. Specify stable IDs, targeted diffing, duplicate
  or ambiguous references, preview of additions/changes/deletions, atomic apply,
  revision conflicts, and history. A failed parse must never partially mutate a
  Story.
- **Procedural content:** Before adding variants, decide when and how a choice is
  selected, whether it is stable during a step, how reload and backward
  Simulation behave, and what authored/runtime data must be saved. This likely
  needs a deliberate shared model and engine change, not frontend randomness.

## Story Canvas UX

- Decide whether interaction cards should support several zoom detail levels.
- After responsive layout and bounded inspector resizing are evaluated, decide
  whether the inspector also needs a full-screen or reduced-width mode, including
  how it returns to the graph and retains keyboard focus.
- Decide whether future filters can be combined and whether they use AND, OR, or
  a user-selected mode.
- Validate tag-based combined filters as a low-complexity alternative to
  advanced filter panels.
- Decide whether a separate isolation mode is useful later, beyond dimming
  unrelated interactions.
- Decide how to represent annotation icons without overloading the canvas.
- Decide whether trigger markers should remain circular or move to a diamond or
  hexagon shape.
- Decide how far contextual accent coloring should go when focusing a future
  character, place, or group.
- Validate whether focus mode should include only direct neighbors or a
  configurable graph distance.
- Define the first contextual-menu actions and keyboard shortcuts, including
  browser and text-input conflict rules.
- Validate whether a narrative, reading-oriented projection materially improves
  authoring beyond the inspector and Simulation Mode.

## Hosting and Scale

- Confirm the production frontend/API domain topology before choosing between
  SameSite cookie protection, Origin validation, and CSRF tokens.
- Choose the stable API error code vocabulary before external clients depend on
  it.
- Define health-check depth and logging/redaction requirements before selecting
  a hosting platform.
- Choose managed hosting and authentication providers only when deployment work
  begins; preserve NestJS and shared-domain ownership regardless of provider.
- Define measurable thresholds for introducing progressive loading and cached
  story projections over the normalized model.
- Define backup retention and restoration testing before a public beta.
- Add Redis, queues, workers, replicas, or multiple API instances only in
  response to observed operational bottlenecks.

## Reader and Simulation Saves

- Checkpoint semantics are settled by
  [ADR-040](decisions/ADR-040-reader-simulation-runtime-checkpoints.md): loading
  either mode restores the saved current Interaction and runtime values; current
  authored behavior applies to later steps; full replay is an explicit automated
  comparison and does not replace the checkpoint. The current implementation
  still replays on API save/load and on Simulation Story refresh.
- Resolved 2026-10-25 in ADR-040: Simulation `Back` works before the saved
  Interaction without persisting per-step states. It moves the current
  Interaction and shortens the journey but keeps runtime values such as stats,
  inventory, story time, and location unchanged. The resulting checkpoint is
  intentional debug state and can diverge from replaying the shortened journey.
  Automated replay comparisons must use a clean, unmodified journey and the
  authored Story revision intended by the test; they must not report intentional
  debug-state differences as save corruption.
- Before implementation, define how the API writes and validates checkpoints
  without replaying the full prefix, and how it handles state references when
  authored entities are changed or deleted. An explicit replay comparison is
  only meaningful against the authored Story revision intended by the test.

## Simulation

- Named manual saves are available in both Reader and Simulation Mode. Decide
  whether reusable simulation test fixtures with explicit preconditions are
  useful in addition to those journey saves.
- Decide the Simulation editing boundary: use Reader rendering by default with
  explicit editing on request, then determine whether title/body and option
  creation remain inline and whether effect or Trigger-condition editing belongs
  there or should open the shared Story Canvas inspector. Effect edits follow the
  shared checkpoint contract in ADR-040; Trigger-condition editing remains a
  separate scope decision.
- Define which current values the Simulation state view exposes across Story,
  Character, Location, and exact item-instance assignments. The current context
  panels show playable-character stat values and owned items, not a unified view
  of every owner.
- Decide whether automatic Reader entry should extend beyond the unique opening
  Interaction to later off-path situations. Preserve explicit Simulation start
  selection and do not auto-trigger root Interactions without a narrative rule.

## Devices

- Decide whether tablet editing should become a supported workflow.
- Keep full phone-based graph editing out of current design work unless user
  testing proves it is necessary.

## Documentation and Diagrams

- Decide whether to add a local command for previewing Mermaid or PlantUML
  diagrams.
- Keep generated diagram images out of version control unless the project gains a
  reliable regeneration command.

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

## Story Format and Examples

- Define a stable `story-format.md` before JSON import/export or external
  integrations depend on the story shape. Relational persistence does not yet
  define an external exchange format.
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
- Refine the grouped-edge inspector UX for several triggers that connect the same
  source and target as part of the MVP editor work.
- Define how the graph visually separates several inputs that feed the same
  trigger before reaching one output interaction.

## Story Canvas UX

- Decide whether interaction cards should support several zoom detail levels.
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

## Simulation

- Named manual saves are available in both Reader and Simulation Mode. Decide
  whether reusable simulation test fixtures with explicit preconditions are
  useful in addition to those journey saves.
- Define whether editing an already-visited interaction's effects changes the
  displayed simulated state immediately, only on later steps, or after replay.
- Validate how much inline editing belongs in Simulation Mode before it becomes
  confusing or duplicates the main inspector.

## Devices

- Decide whether tablet editing should become a supported workflow.
- Keep full phone-based graph editing out of current design work unless user
  testing proves it is necessary.

## Documentation and Diagrams

- Decide whether to add a local command for previewing Mermaid or PlantUML
  diagrams.
- Keep generated diagram images out of version control unless the project gains a
  reliable regeneration command.

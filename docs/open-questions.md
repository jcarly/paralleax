# Open Questions

This page tracks design questions that are intentionally postponed. They should
not block the MVP unless a future implementation touches the affected area.

## Users and Permissions

- Define whether `StoryAccessPolicy` evaluates only persisted grants or also
  public defaults, creator ownership, and future invitation state.
- Define stale-revision behavior for each mutation: automatic retry for
  independent fields, explicit conflict UI for structural trigger changes, or a
  common merge policy.
- Define the permission hierarchy: decide whether `manage story settings`
  includes every other permission, whether `edit directly` includes `suggest
changes`, and whether every non-read permission implies `read`.
- Define public access semantics: decide whether public stories are accessible
  without an account or only by authenticated users.
- Define approval rules: decide who can approve pending suggestions, whether the
  creator always has override rights, whether several approvals can be required,
  and whether some permissions allow automatic approval.

## Change History and Suggestions

- Define event granularity: decide whether events are coarse, such as
  `interaction.updated`, or precise, such as `interaction.title.changed`,
  `trigger.input.added`, and `condition.removed`.
- Define how pending suggestions are previewed: decide whether users inspect a
  list of events, a temporary draft state, or both.
- Define how rejected suggestions are retained and whether they can be reopened.
- Define snapshot cadence, event compaction, and retention once change history is
  implemented; avoid one history event per text keystroke.

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
- Define play-session persistence: manual save, autosave, save slots, and how
  save data relates to story updates.

## World State, Conditions, Effects, and Items

- Define the first typed condition and effect families before broad world-state
  entities depend on them. Keep their payloads validated and versionable.
- Decide which values are authored definitions, persisted play-session state, or
  deterministic derived values.
- Define item-definition deletion behavior when authored conditions or existing
  play-session item instances reference it. Authored item effects currently
  cascade with deletion of their exact item instance.
- Define item transfer rules, stack identity, quantities, and equipment-slot
  conflict behavior. The current reader starts with an empty inventory and
  tracks exact authored item instances.
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

- Keep React Flow as a rendering and interaction layer while it fits the editor.
- Revisit the integration if trigger semantics or story operations start changing
  only to satisfy React Flow constraints.
- Refine the grouped-edge inspector UX for several triggers that connect the same
  source and target as part of the MVP editor work.
- Define the connection gesture for multi-input triggers: decide whether existing
  triggers appear as temporary drop targets, split handles, menu choices, or
  another affordance while the author is dragging a new link.
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

- Define whether named simulation states are useful or whether they overlap too
  much with future player saves.
- Define how future stats or world-state changes apply when the current
  interaction is edited during simulation.
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

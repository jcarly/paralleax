# Changelog

All notable project changes are tracked here.

This project follows a lightweight [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style while the MVP is still evolving quickly. Entries are grouped under `Unreleased` until the first tagged version.

## Unreleased

### Added

- PostgreSQL-backed API story persistence using a `jsonb` story document table.
- Database migration runner for PostgreSQL schema creation and future schema
  evolution.
- Docker Compose PostgreSQL service with a persistent `postgres-data` volume and
  local `DATABASE_URL` defaults.
- Author Simulation Mode now opens from the editor test action, lists
  interactions reachable by trigger input logic, dims condition-blocked
  interactions, and lets authors force an unavailable interaction for the current
  simulation journey.
- Simulation choices blocked by MVP visited / not visited conditions now show a
  short unavailability reason.
- Simulation Mode now includes a `Back` action to return to the previous
  interaction in the current test journey.
- Simulation Mode now supports inline editing for the current interaction title
  and content.
- Simulation Mode now supports adding an option from the current interaction and
  immediately editing the new option title in the choice list.
- Simulation Mode now keeps `Add option` below the visible choices and supports
  creating root options before any interaction is selected.
- Options created from Simulation Mode now use the same root or child placement
  helpers as canvas-created interactions so returning to the graph has a valid
  layout.
- Local demo story generator with API and web UI support for creating a populated test story without external AI services.
- Canvas `Add root` action that places new root interactions below the lowest existing root.
- Graph creation shortcuts: dropping an output connection on empty canvas creates a child, and dropping an input connection creates a linked source interaction.
- Hover action buttons on interactions for creating source and child interactions directly from the graph.
- Visible trigger markers on graph links and root interactions.
- Test action from the editor can start the reader from the selected interaction.
- Connections can now target an existing trigger marker to add another input to
  that trigger, while the empty interaction input handle creates a separate
  trigger.
- Shared trigger inputs now visually converge on the same circular trigger marker
  before linking to the output interaction.
- Trigger link deletion now happens directly from the graph link, trigger markers
  are the only selectable trigger surface, and deleting the last trigger converts
  it into a root trigger instead of disabling the action.
- Shared placement helpers and tests for root and parent interaction creation.
- User guide for the current MVP authoring workflow.
- Playwright coverage for editing root trigger path conditions from the interaction inspector.
- Coverage thresholds for API, shared, and web test suites.
- Unit tests for web trigger input deletion planning.
- Unit tests for web canvas connection helpers.
- Unit tests for web editor selection helpers.
- Unit tests for web story-to-graph mapping.
- Unit tests for the API in-memory story repository.
- ESLint flat config, Prettier config, and CI checks for linting and formatting.
- Shared Vitest coverage for pure story operations, trigger cleanup, stale-response merges, and child placement.
- Docker Compose development setup with source bind mounts so code changes apply without rebuilding the image.
- GitLab CI that runs typecheck, coverage, build, and Playwright functional tests on pushed commits and merge requests.
- Playwright functional tests for critical editor regressions.
- API, web, and functional test documentation in the README.
- Coverage commands for API and web test suites.
- Documentation index under `docs/README.md`.
- Story Canvas UX notes covering compact layout, adaptive edge routing, trigger
  marker placement, interaction handles, and inspector behavior.
- Design-system foundation notes for the future visual identity.
- Static Story Canvas mockups for compact graph layout, trigger routing,
  inspector behavior, and author simulation.
- UX principles, navigation, simulation, annotation, and business-model notes
  clarifying that the graph is only one representation of the narrative model.
- Story Canvas UX decisions for left panel behavior, trigger marker actions,
  filtering, keyboard navigation, auto-layout, simulation editing, annotations,
  device targets, and accessibility.
- Creative workspace design direction covering opinionated simplicity, neutral
  interaction cards, contextual accents, trigger marker shape exploration, and
  inline simulation editing.
- Bitmap Story Canvas creative workspace reference saved under `docs/mockups`.
- Trigger semantics documentation covering inputs, deletion behavior, and editor UX.
- API endpoint to delete a trigger from an interaction.
- Web API client support for trigger deletion.
- UI support for selecting a trigger through its graph edge.
- UI support for deleting a trigger from the trigger inspector.
- Tests for multiple trigger inputs, trigger deletion, edge-based trigger editing, interaction title editing, and drag behavior.

### Changed

- Interaction title, content, and position saves are now serialized so rapid
  editor updates cannot overwrite each other in persisted stories.
- Position-only interaction updates no longer replace optional title and body
  fields with `undefined` before persisting the story document.
- API validation now requires story titles, rejects null interaction titles and
  positions plus unknown request fields, and normalizes null interaction bodies
  to empty strings. PostgreSQL now enforces the corresponding non-null story
  document fields.
- Docker Compose now installs dependencies once before starting the API and web
  services, using an isolated `node-modules` volume to prevent concurrent
  installs from corrupting container dependencies, and defines an explicit file
  polling interval compatible with Node.js 24.
- API story operations now use an asynchronous repository boundary so storage can
  be backed by PostgreSQL without changing endpoint semantics.
- PostgreSQL schema creation now lives in explicit migrations instead of the
  story repository.
- Multiple triggers with the same visual route are now grouped into one trigger
  marker and expose their alternative condition groups as `OR` variants in the
  trigger inspector.
- Trigger inspectors can now add an `OR` condition group by creating a new
  trigger variant behind the same grouped visual route.
- Trigger inspectors can now delete a single `OR` group or all `OR` groups behind
  the selected grouped visual route.
- Added regression coverage for deleting a grouped visual trigger input link
  across every `OR` trigger variant behind that route.
- Added regression coverage for grouped trigger route boundaries, including
  exact input-set grouping, root-trigger OR restrictions, and deleting only the
  selected OR visual route.
- New-trigger input handles on interaction cards now stay hidden until the author
  is actively dragging a graph connection.
- Story Canvas automatic placement is now more compact while still skipping
  occupied positions to avoid overlap.
- Trigger links now use adaptive smooth-step routing so arrows and trigger
  marker links read better across vertical, horizontal, and reversed layouts.
- Interaction cards, trigger markers, graph links, and link deletion controls now
  follow the first concrete MVP canvas visual rules.
- Updated the web app visual design toward the Creative Workspace direction with
  warmer tokens, neutral interaction cards, subtler panels, diamond trigger
  markers, and restrained graph links.
- Updated the project runtime target to Node.js 24 and npm 12 for local, CI, and Docker usage.
- Refreshed dependency ranges to match the current stable installed versions without taking the larger Jest, Vite, Vitest, or TypeScript major migrations.
- Web CSS is now organized into explicit sections for tokens, base styles, app shell, story list, editor, graph, reader, and responsive rules.
- Editor colors now use CSS custom properties, and selected trigger edges use the same primary selection color as selected interactions.
- Interaction input and output handles are now always visible, trigger link hover
  reveals the link deletion control without implying the whole edge is
  selectable, and automatic linked interaction creation now defaults to a
  vertical layout.
- Graph link handles now attach to the top and bottom of interactions to match
  the vertical creation flow.
- Trigger output arrows now point to the blue input action instead of the empty
  new-trigger input handle.
- Drag-created interactions now use the connection drop position instead of automatic placement.
- Selected trigger edges are now visually highlighted in the editor.
- The editor minimap was removed to reduce visual noise.
- Interactions now keep at least one trigger; removing the last trigger input turns the trigger into a root trigger instead of deleting it.
- Interaction deletion now turns orphaned triggers into root triggers instead of removing them.
- Story editor API persistence and stale-response merge orchestration now live in
  `useStoryEditorPersistence`.
- Editor inspector UI is now split into dedicated `InteractionInspector` and
  `TriggerInspector` components.
- Interaction input and output controls now act as the visible connection handles.
- Trigger inputs and outputs are no longer duplicated in the trigger inspector;
  the graph is the source of truth for those relationships.
- The editor inspector now only appears for selected interactions or triggers and
  can be closed by clicking the canvas background or its close button.
- Trigger input deletion planning is now isolated in a tested web helper.
- Canvas connection validation and created-trigger selection are now isolated in a tested web helper.
- Editor interaction and trigger selection lookups are now isolated in a tested web helper.
- React Flow node and trigger edge mapping is now isolated in a tested web helper.
- API in-memory storage is now isolated behind `StoriesRepository`, keeping `StoriesService`
  focused on story application behavior.
- Web unit tests now allow enough time for coverage instrumentation on slower local or CI runs.
- Story and trigger operations now live in `packages/shared` and are reused by both the NestJS API and the React editor.
- Root test and coverage commands now include the shared workspace.
- Docker development now uses Node.js 24 and npm 12, matching the documented project requirements.
- Docker development now uses `npm ci` instead of permissive install flags so dependency installation matches CI more closely.
- `npm run docker:up` no longer forces a rebuild on every start; restart the Compose stack when dependencies change.
- Canvas connections now create a dedicated linked trigger instead of mutating the first trigger on the target interaction.
- Edge deletion now removes the selected input link first, deleting the whole trigger only when no input remains.
- Project documentation and UI copy are now normalized in English.
- Interaction deletion now removes triggers that only depended on the deleted interaction.
- Interaction deletion preserves triggers that still have other valid inputs and removes stale conditions.
- Linked trigger conditions are edited through the edge inspector instead of the interaction inspector.
- Interaction inspector only exposes root trigger conditions; linked trigger inputs are edited through connections or the edge inspector.
- New child interactions are positioned below existing outputs to avoid overlap.
- Story merge logic in the editor preserves local title, body, and position when API responses contain stale interaction data.

### Fixed

- Story Canvas no longer crashes when loaded interactions are missing graph
  positions; the graph projection falls back to stable canvas coordinates.
- API story responses and Simulation Mode now normalize missing interaction
  positions with stable defaults.
- Creating an option from a newly created simulation option no longer crashes
  when that parent option has no stored graph position yet.
- Creating or deleting one trigger link no longer silently changes unrelated trigger edges.
- Creating another trigger link after deleting one no longer restores the deleted edge from stale API responses.
- Editing an interaction title no longer blanks the editor page.
- Dragging an interaction no longer clears its title or body.
- Dragging one interaction no longer clears other interactions.
- Dragging an interaction after deleting a trigger no longer restores the deleted edge from stale API data.
- Creating links from the canvas now persists trigger inputs instead of disappearing after creation.
- Demo story generation now sends an explicit JSON body and surfaces action errors in the story list.
- API development and build scripts now use the Nest webpack builder so runtime
  routes include shared-package-backed endpoints such as demo story generation.
- Interactions without triggers no longer render a blank page in the editor.

### Documentation

- Documented PostgreSQL story persistence, Docker database setup, and the ADR for
  storing MVP stories as PostgreSQL `jsonb` documents.
- Expanded the architecture documentation with workspace responsibilities,
  runtime flows, code placement guidance, and verification commands.
- Documented the current Simulation Mode slice and its boundary from the player
  reader.
- Documented target contextual inputless triggers, final interactions, and player
  save direction.
- Added contextual inputless triggers to the MVP reader model.
- Moved grouped route variants for OR condition groups into the MVP documentation.
- Documented the MVP graph connection UX for choosing between existing trigger
  inputs and new triggers.
- Expanded ADRs for the MVP scope, stack, engine independence, and React Flow boundary decisions.
- Documented current reader semantics, non-goals, and reader execution edge cases.
- Added an ADR index and aligned the root README documentation reading order.
- Added the post-MVP roadmap direction for users, story default access, per-user story permissions, suggestions, review visibility, and approval workflows.
- Added the roadmap direction for interface internationalization foundations and translation-ready UI copy.
- Added glossary, domain invariants, and open questions documentation for stable vocabulary, model rules, and postponed design decisions.
- Documented the React Flow integration boundary and the target model for users, story permissions, event-log-based change proposals, and UI-only internationalization.
- Documented the target Story Canvas UI direction with left-side filters, one contextual inspector, neutral future groups, and post-MVP character/place focal points.
- Documented the target Simulation Mode direction for narrative debugging,
  availability diagnostics, simulated preconditions, time travel, forced
  interactions, and graph-editing handoff.
- Removed generated UML image renders so editable diagram sources remain the single source of truth.
- Documented the styling direction: keep plain CSS for the MVP and evaluate Tailwind CSS when the UI surface grows.
- Documented concrete MVP canvas visual rules for interaction cards, compact
  placement, trigger markers, links, and selection states.
- Added and updated product, MVP, architecture, domain model, design principles, roadmap, UML, and ADR documentation.
- Documented the strict MVP boundary: Story, Interaction, Trigger, and Reader only.
- Documented the current trigger model: one output interaction per trigger, multiple input interactions allowed, inputs act as OR conditions.
- Documented verification commands for typecheck, unit/component tests, Playwright, coverage, and build.

## Maintenance Rules

- Update this changelog for every user-visible, architectural, testing, or documentation change.
- Keep `docs/README.md` and `README.md` links current when adding or moving documentation.
- Update `docs/test-scenarios.md` whenever a regression test is added for a behavior that matters to authors.
- Add or update tests with each behavioral change.
- Run the relevant verification commands before considering a change complete.

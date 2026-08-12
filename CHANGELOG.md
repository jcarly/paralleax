# Changelog

## 2026-08-12

- Restored the API's runtime-selected all-interface listener and separated the
  Railway process healthcheck (`/api/health`) from the PostgreSQL/schema release
  check (`/api/ready`), while retaining migration-first deployment.
- Deferred Nginx API hostname resolution until `/api` request time so transient
  Railway private-DNS availability no longer prevents `/healthz` or the static
  web application from starting, and enabled the official image's local DNS
  resolver discovery required by that runtime lookup.

## 2026-08-11

- Added Railway-specific API and web deployment configurations, selectable
  Docker runtime targets, migration/readiness gates, and private-network setup
  guidance so the web proxy resolves the API through `railway.internal` instead
  of the Docker Compose-only `api` hostname.
- Made the Nginx listener and both container healthchecks follow their runtime
  `PORT` value so Railway probes the same port as the running service.

## 2026-08-10

- Added a provider-neutral private-alpha deployment foundation with separate
  production API/web images, same-origin reverse proxying and security headers,
  migration-first Compose orchestration, health-based startup, smoke checks, CI
  image builds, rollback/monitoring guidance, and an operator privacy template.
- Added explicit production registration modes with an invitation-code option,
  exact `Origin` validation for production mutations, and fail-fast environment
  validation while preserving open local development.
- Updated compatible production dependencies and pinned the fixed transitive
  `js-yaml` release; the production dependency audit now reports no known
  vulnerabilities.

- Began integrating the validated UI prototype into the production Story Editor by making the
  real story-context navigation independently scrollable, remembering its collapsed state, and
  presenting locations, characters, stats, and item definitions as compact rows with thumbnails
  and live reference counts.
- Enriched production interaction cards with their real location and present-character avatars
  while keeping React Flow metadata as a projection of the canonical story.
- Reorganized the production Interaction inspector into consistent content, context/timing, stat,
  inventory, and item-stat sections with character thumbnails and matching effect cards, while
  preserving the existing story mutations and duration semantics.
- Separated effect targets from their affected stat or item fields, with searchable character and
  exact item-instance targets shared across stat, inventory, and item-stat effect cards.
- Extended the isolated UX prototype with sign-in, registration, searchable story-library, and
  design-system reference screens, all navigable without an API session.
- Integrated those screens into the authenticated product: real sign-in and registration now use
  the split narrative layout, the persisted story library supports search, filters, sorting, and
  grid/list views, and `/design-system` provides a responsive living UI reference.
- Integrated the validated reader and author-simulation layouts into the real story player, with
  scene context, current location and time, present-character portraits, a left character sheet
  for stats and inventory, a responsive encounter panel, and explicit forcing of unavailable
  options that is available only in Simulation Mode.
- Added optional, persisted categories for locations, characters, reusable stats, and item
  definitions, with same-type suggestions, category-aware search, and grouped context lists that
  keep uncategorized entries together.

## 2026-08-09

- Removed location-owned item instances from the accepted domain model, reader,
  API, persistence, and editor. The forward migration intentionally deletes
  existing location-rooted item subtrees before removing `owner_location_id`;
  character inventories and nested item relationships remain supported.
- Added ADR-014 and updated ADR-013, domain semantics, architecture, roadmap,
  regression scenarios, and author guidance for location-conditioned item
  acquisition.
- Restored API Jest resolution for the shared package's ESM-style relative
  imports after its focused-module extraction.
- Excluded the standalone UI prototype from web unit-test discovery and coverage
  gates so experimental screens do not affect production verification.

## 2026-08-08

- Extracted shared domain types into focused `packages/shared/src/model/`
  modules while preserving the complete `@paralleax/shared` public API.
- Extracted story-calendar types, validation, arithmetic, journey time, and
  temporal-condition matching into focused `packages/shared/src/time/` modules.
- Extracted trigger condition types, eligibility evaluation, available
  interaction selection, and failure diagnostics into
  `packages/shared/src/triggers/`.
- Extracted pure interaction and trigger mutations plus stale-response story
  merging into focused `packages/shared/src/operations/` modules.
- Extracted deterministic reader replay and progress reconstruction into
  `packages/shared/src/reader/`, preserving journey-derived runtime state.
- Replaced GitLab CI with GitHub Actions jobs for quality checks, PostgreSQL 17
  integration and recovery, and Playwright, with seven-day report artifacts.

## 2026-08-07

- Clarified `docs/mvp.md` as a historical narrative-core milestone rather than
  the boundary of the current implementation.
- Made `docs/current-scope.md` the authoritative summary of implemented product scope.
- Reorganized `docs/roadmap.md` around implemented, partial, and future work,
  including a dedicated import/export compatibility direction.
- Updated the root and documentation README files to remove stale MVP-only and
  GitLab-specific guidance and document the AI-assisted development references.

## 2026-08-04

- Replaced complete-graph story listing with a shared `StorySummary` contract
  and one PostgreSQL aggregate query returning interaction counts.
- Added recoverable reader loading errors, retry behavior, and stale-load guards
  for reader and editor route changes.
- Replayed direct-start inventory effects in Simulation Mode and resolved exact
  authored item instances rooted at locations as well as characters.
- Added focused API, shared-engine, and web regression tests for these changes.
- Added a prioritized code-quality backlog covering the remaining review work.
- Added a 64,000-character interaction-body limit and separate per-minute story
  mutation and read throttles, with API regression coverage.
- Upgraded `sanitize-html` to 2.17.5 and refreshed safe transitive dependencies,
  reducing the npm audit result from seven findings to four contextual findings.
- Protected browser closing/reloading and internal link navigation while editor
  saves are pending or failed, with cleanup after a successful save.
- Added rich-text character usage and near-limit feedback, an explicit 128 KiB
  HTTP request-body limit, and stable `413 PAYLOAD_TOO_LARGE` responses.

## 2026-08-02

- Added reproducible 1,000-interaction PostgreSQL and 2,000-interaction editor
  graph stress tests with configurable budgets and recorded baselines.
- Batched complete-story interaction, association, trigger, and trigger-input
  inserts, reducing the measured 1,000-interaction initial save from 68.7 s to
  3.19 s while retaining targeted mutation persistence.
- Isolated local PostgreSQL integration tests in `paralleax_test` and made the
  migration suite restore a current schema before other test files reuse it.
- Accepted ADR-013 for a cycle-safe recursive item-instance graph covering
  character/location ownership, containers, equipment, body parts, slots, and
  a data-preserving migration from flat character inventories.
- Added the first ADR-013 persistence increment: migrated exact items to
  `item_instances`, preserved legacy ids and character ownership, allowed
  location roots, moved exact-effect foreign keys, and retained the existing
  `Character.items` API projection.
- Added typed item-instance parent relationships and slots, cycle-safe subtree
  transfers between characters, controlled non-empty container deletion, and a
  global instance-id persistence diff that preserves exact effects on transfer.
- Added reusable tree authoring for character inventories and location items,
  including character/location/container moves, relationship types, and slots.
- Added context-menu search across locations, characters, stats, and items,
  per-interaction title/body occurrence badges, and cyclic graph navigation.
- Added reference navigation for selected context entities, location/character
  focus dimming, and a lower 5% graph zoom limit for large stories.

## 2026-07-26

- Added one playable character per story, initial character selection, a
  left-side player sheet, right-side encounter cards, and simulation filtering
  for location-blocked options.

- Item obtain/lose effects now select a target character, and deterministic
  runtime instances preserve that owner through reading and progress replay.

- Added reusable row removal controls for character stats, character items, and
  item-definition stats, with cleanup of exact-assignment references.

- Added owned/not-owned item trigger conditions and reusable-definition item
  effects that can obtain or lose any story item without preassigning it to a
  character, including deterministic multiple runtime instances.

- Fixed relational story loading so item stats are selected from item
  definitions instead of the locations table.

- Changed the default Docker Compose API host port from Windows-reserved port
  3000 to configurable `API_PORT` (3300 by default).

- Pinned the root TypeScript toolchain to 5.9.3 so Nest's webpack builder uses
  the same supported compiler version as the API, web, and shared workspaces.

- Added per-interaction obtain/lose effects for exact character item instances,
  deterministic inventory replay, persisted relational effects, reader
  inventory display, and progress reconstruction.

- Replaced the interaction body textarea with a WYSIWYG editor supporting rich
  text, images, GIFs, direct videos, and controlled YouTube/Vimeo embeds.
- Added server- and browser-side rich HTML sanitization and reader media styles.

- Added optional image URLs for locations, characters, reusable items, and
  reusable stats, including stat pictograms, inspector previews, list
  thumbnails, relational persistence, validation, and regression coverage.

- Added one authenticated reader-progress save per user and story, using
  relational ownership/timestamps and a versioned JSONB runtime snapshot.
- Added automatic reader resume, serialized progress saves after each choice,
  visible save status, and saved-progress deletion on restart.
- Reader progress now preserves repeated journey visits and materializes current
  interaction, unique visits, story-local date/time, location, character stats,
  and owned item instances through server-side replay and validation.
- Kept author Simulation Mode isolated from player progress persistence.
- Added deterministic story-local date and time with an authored starting value,
  visible reader/simulation clock, and journey-based reconstruction on restart
  or backward navigation.
- Added non-negative interaction durations that advance story time before the
  following choices are evaluated, including repeated interaction visits.
- Added temporal trigger conditions supporting several exact dates, inclusive
  date ranges, weekdays, and daily or overnight time slots.
- Added editor controls, API validation, relational persistence, migration, and
  shared/API/web regression coverage for story time.
- Added guarded PostgreSQL backup and restore commands with archive validation,
  partial-file publication, credential-safe process invocation, explicit target
  confirmation, and administrative-database protection.
- Added a PostgreSQL CI recovery drill that restores into a temporary database
  and compares migration and core-table row counts with the source.
- Documented initial backup retention, RPO/RTO, migration recovery, and the
  remaining provider scheduling, encryption, alerting, and restoration-drill
  production gates.
- Moved PostgreSQL migration execution out of repository request paths into
  explicit development and production migration commands.
- Replaced destructive legacy story normalization with an in-place relational
  conversion that preserves graph content, trigger conditions, timestamps, and
  ownership.
- Added PostgreSQL legacy-upgrade coverage and a unit guard prohibiting wholesale
  story deletion in future migrations.
- Increased the legacy PostgreSQL migration test timeout to cover a real local
  full-schema upgrade without relying on Jest's five-second unit-test default.
- Added public API liveness and PostgreSQL/schema readiness endpoints, with
  readiness returning `503` without modifying the database when the schema is
  unavailable or behind.
- Added request correlation, body-free structured HTTP completion logs, JSON
  production logging, and a stable API error envelope that hides unexpected
  internal details.
- Added typed web `ApiError` metadata for status, machine code, and request id.
- Updated Docker Compose to complete migrations before starting the API.
- Added a project-wide production-readiness baseline and made its data safety,
  operations, performance, security, accessibility, publication, and
  collaboration gates part of the persistent agent rules and roadmap.
- Added an idempotent, adult-only SQL compatibility prototype inspired by Girl
  Life's broad work, study, village, progression, and inventory systems.
- Added a Girl Life gap analysis covering licensing and safety constraints plus
  the domain, reader, editor, persistence, and import capabilities required for
  a substantially complete mechanical conversion.
- Extended the Girl Life import analysis with current production-readiness
  constraints around migration safety, full-graph operations, bulk persistence,
  observability, backup, restoration, and publication.
- Added reusable story-level item definitions and separate character-owned item
  instances, including support for owning several copies of the same item.
- Added item definition editing, character item assignment, relational
  persistence, same-story validation, and editor/API regression coverage.
- Added focused character and item inspector tests and completed stat definition
  API client coverage, restoring all configured web coverage thresholds.
- Added a collapsible Items list to the editor context menu.
- Added story-level reusable stat definitions that can be assigned to multiple
  characters with independent initial values.
- Added collapsible Locations, Characters, and Stats lists to the editor context
  menu.
- Moved the story context collapse control into the top-right of the left menu
  and removed it from the editor toolbar.
- Added a forward-only migration from character-owned stat names to reusable
  stat definitions.

## 2026-07-24

- Added character-owned numeric stats with relational persistence and
  entity-scoped create/update endpoints.
- Added typed interaction stat effects (`add` and `set`) and numeric trigger
  comparisons, including editor controls and same-story validation.
- Extended reader and simulation state so stat effects are applied in journey
  order and deterministically rebuilt on restart or backward navigation.
- Added story-owned characters with relational persistence, same-story
  interaction casts, entity-scoped API mutations, and validation.
- Added character navigation and editing, multi-character interaction
  assignment, and typed present/absent trigger conditions.
- Extended reader and simulation evaluation with current-interaction character
  presence and unavailable-choice explanations.
- Added story-owned locations with relational PostgreSQL persistence,
  same-story foreign keys, API validation, and entity-scoped mutations.
- Added a collapsible location panel and inspector, interaction location
  assignment, and typed current/not-current trigger conditions.
- Extended reader and simulation state with deterministic current-location
  transitions and location-condition explanations.
- Added entity-scoped interaction and trigger mutation responses with story
  revision metadata.
- Made trigger creation atomic by accepting initial input interactions and
  conditions in its POST request.
- Updated editor and reader persistence to apply saved entities without
  replacing unrelated story state, removing create-then-patch waterfalls.
- Added API and web regressions for the independent mutation contracts and stale
  graph-state protection.
- Added explicit connection choices between extending an existing trigger and
  creating a separate trigger.
- Added saving, saved, and failed editor states with persisted-story reload
  recovery after a failed mutation.
- Added confirmations before deleting interactions, trigger variants, or grouped
  trigger routes.
- Updated the MVP definition to reflect the already implemented identity
  foundation and the completed authoring-reliability criteria.
- Documented the post-MVP item direction: separate item definitions and
  play-session instances, inventories and equipment, typed conditions and
  effects, calculated modifiers, and progressive playable verticals.

## 2026-07-18

- Stored ordered trigger conditions as JSONB on `triggers` while retaining
  relational trigger inputs.
- Enforced same-story trigger outputs and inputs with composite foreign keys and
  cascade deletion, and rejected foreign condition references at the API boundary.
- Removed the reserved migration user and automatic startup seed; PostgreSQL tests
  now create their own persisted user and data explicitly.
- Serialized story mutations with a row lock and introduced story revision metadata.
- Added bounded DTO validation except for unrestricted interaction body length.
- Added Helmet, authentication rate limits, verified PostgreSQL TLS configuration,
  production configuration requirements, OpenAPI documentation, and clearer web
  error messages.
- Documented the deferred API hardening backlog and its implementation triggers,
  including revision conflicts, centralized access policy, operations, error
  contracts, CSRF review, migration layout, and repository projections.
- Added project-specific React, Vite, and React Flow performance guidance based
  on the Vercel React Best Practices catalog, with measurement requirements and
  a prioritized frontend optimization backlog.
- Split the editor, React Flow, and reader into lazy Vite route chunks so the
  authenticated shell and story list no longer download editor code upfront.
- Preload editor and reader route chunks when their story-list links receive
  hover or keyboard focus.

All notable project changes are tracked here.

This project follows a lightweight [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style while the MVP is still evolving quickly. Entries are grouped under `Unreleased` until the first tagged version.

## Unreleased

- Fixed PostgreSQL integration CI by installing the PostgreSQL 17 client instead
  of Debian Bookworm's PostgreSQL 15 client before backup/restore verification.
- Added reusable stat hourly change rates, including positive or negative
  time-based evolution, deterministic journey replay, editor controls,
  PostgreSQL persistence, and reader-progress reconstruction.

### Added

- Reusable stats on item definitions, independent per-instance runtime values,
  time-based evolution, exact item-stat interaction effects, reader-progress
  reconstruction, inventory display, API validation, and editor controls.

- Conditional rich-text frames linked to outgoing interactions. Reader
  visibility follows the existing target triggers, disconnected content remains
  preserved, and Simulation Mode displays unavailable frames with diagnostics.
- Simulation option tooltips now describe conditions for available as well as
  unavailable choices.

- Feature-focused NestJS modules for authentication, stories, database lifecycle,
  and validated runtime configuration.
- Startup validation for database URL, PostgreSQL SSL, port, CORS origin,
  environment mode, and optional legacy story owner email.
- Relational PostgreSQL tables for interactions, triggers, trigger inputs, and
  trigger conditions, with foreign-key cleanup and ordering metadata.
- PostgreSQL regression coverage for relational graph reconstruction and storage.
- Session-expiry feedback that returns the web app to sign-in, plus a complete
  browser regression from registration through sign-out and sign-in.
- Explicit `LEGACY_STORY_OWNER_EMAIL` recovery for stories quarantined during the
  account migration.
- Local account registration and login with scrypt-derived password hashes,
  opaque PostgreSQL-backed sessions, and HTTP-only cookies.
- Mandatory story ownership with creator-scoped API reads and mutations, plus a
  migration owner for stories created before accounts existed.
- Login and registration screens with session restoration and sign-out.
- API, component, and ownership regression coverage for authentication flows.
- PostgreSQL integration tests for restart-safe interaction persistence and
  concurrent mutation behavior, with a dedicated GitLab CI job.
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

- API controllers, services, repositories, DTOs, guards, and tests are now
  colocated under their owning feature instead of sharing a flat source folder.
- Relational story write planning is extracted from `StoriesRepository` into a
  focused persistence writer, leaving the repository responsible for reads,
  ownership scope, migrations, and transactions.
- Story persistence now assembles the domain model from relational rows and
  writes field-level mutation differences instead of replacing one `jsonb`
  document. Existing test stories are intentionally removed by the migration.
- User creation now resolves concurrent duplicate-email registration atomically,
  and authentication activity purges expired sessions using an expiry index.

- Existing story mutations now run in PostgreSQL transactions with row-level
  locking so concurrent requests cannot overwrite each other's story fields.
- Trigger links now route through real top, right, bottom, or left node anchors,
  keeping arrowheads aligned with their final segment and interaction edge.
- Added functional coverage for arrow reorientation when an interaction moves
  across its trigger marker.
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

- Added product lessons for inspector-first contextual editing, a calm canvas,
  focus mode, narrative projection, useful empty states, contextual actions, and
  keyboard navigation while preserving the MVP boundary.
- Added durable hosting and scalability guidance covering managed replaceable
  infrastructure, domain ownership, progressive loading, normalization signals,
  history snapshots, and evidence-driven operational growth.
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

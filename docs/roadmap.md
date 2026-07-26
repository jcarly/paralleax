# Roadmap

## V0.1 - MVP

- Story, Interaction, Trigger, and Reader.
- Graph editor.
- Title/content editing.
- Interaction movement without data loss.
- Output creation without overlap.
- Triggers with several inputs.
- Connection UX for choosing between adding an input to an existing trigger and
  creating a new trigger.
- Visible saving, saved, and failed states with story reload recovery.
- Confirmations before deleting interactions and triggers.
- Contextual inputless triggers with visited / not visited conditions.
- OR condition groups through several triggers between the same interactions.
- Trigger editing from graph markers.
- Trigger cleanup when deleting interactions.
- Visited / not visited conditions.
- PostgreSQL persistence for authored MVP stories.
- API, web, Playwright, and coverage tests in CI.

## V0.2 - Persistence and Robustness

- P0 data safety: migration execution is explicit and the historical JSON graph
  upgrade is data-preserving with representative PostgreSQL coverage; next
  establish automated backups and verify restoration.
- P0 operations: health/readiness checks, structured production logs, request
  IDs, and stable error envelopes are implemented; next add staging, error
  reporting, metrics, and a production rollback path.
- Add a lightweight `StorySummary` list projection without graph assembly.
- Introduce targeted commands for common interaction, location, character, and
  stat updates while retaining full-graph mutation for structural operations.
- Replace avoidable quadratic order lookups and add a dedicated bulk persistence
  path for imports, templates, and large demo stories.
- Implemented foundation: `StoryEditor`, React Flow, and `StoryPlayer` are loaded
  as route chunks after measuring the previous monolithic production bundle.
- Implemented foundation: trigger creation accepts its initial inputs and
  conditions atomically, removing the create-then-patch editor waterfall.
- Add representative large-story profiling before changing graph projection,
  memoization, or React Flow synchronization for performance.
- JSON export/import for stories.
- Story Canvas UX exploration: keep the current graph semantics, but refine the
  editor toward a story-first canvas with denser default spacing, adaptive edge
  routing, cleaner trigger marker placement, left-side navigation/filtering, a
  contextual right inspector, and representative canvas examples.
- Navigation foundation: quick search, recentering, recent selections, and
  model/story navigation patterns for larger graphs.
- Story Canvas focus mode that emphasizes the active interaction and its direct
  narrative neighborhood without hiding the surrounding graph.
- Instructional empty-story state, contextual canvas actions, and a small
  conflict-safe keyboard shortcut foundation.
- Whole-graph auto-layout command with a vertical flow, immediate application,
  and undo support.
- Simulation Mode for authors: reader-like interface, start from any
  interaction, show available interactions, dim unavailable interactions when
  useful, explain unavailability on hover, support forced interactions,
  lightweight title/content/option editing, and link test results back to graph
  editing.
- Evaluate Tailwind CSS for broader UI styling while keeping React Flow-specific graph styles isolated.
- Interface internationalization foundation with UI copy extracted into translation keys or variables.
- Initial locale structure so additional languages can be added without rewriting components.
- Persisted reader sessions and player saves after story persistence is stable.
- Explicit migrations for future schema changes.
- Reproducible demo data.
- UI wording pass for author-facing trigger vocabulary.
- Visual identity and design-system foundation for palette, typography, spacing,
  graph controls, interaction nodes, trigger markers, selection states,
  accessibility, and desktop-first editing.

## V0.3 - Users, Permissions, and Review

- Implemented foundation: local user accounts, opaque cookie sessions, and
  creator-only story ownership.
- Before shared editing, require story revisions on mutations and return a
  conflict when a client writes from an obsolete revision. Define the editor's
  merge or retry behavior before enforcing this precondition.
- Introduce a centralized `StoryAccessPolicy` with explicit `read`, `edit`,
  `manage`, and `delete` capabilities before adding permission checks to feature
  code.
- Account recovery, email verification, and external identity providers remain
  future deployment concerns.
- Story default access settings for private stories, public reading, and public suggestions.
- Per-user story permissions for reading, suggesting edits, reviewing suggestions, direct editing, and managing settings.
- Permission hierarchy and inheritance rules to define before implementation.
- Review rights that let authorized users see all pending suggestions for a story.
- Review workflow for proposed story changes.
- Contribution workflow for proposing interactions or branches before they are
  accepted into the canonical story.
- Approval rules that can require creator or authorized reviewer validation before suggested changes affect the story.
- Event-log-based change history for accepted, rejected, and pending story modifications.

## Deployment Readiness Backlog

The complete gates live in [Production readiness](production-readiness.md).
These items are required before the corresponding public deployment milestone,
not optional cleanup after launch:

- Describe response DTOs, cookie authentication, and `401`, `403`, `404`, and
  `409` responses in the existing OpenAPI document as the permission contract
  stabilizes.
- Introduce a stable machine-readable API error envelope before several clients
  or permission/conflict errors depend on error parsing.
- Add an API and PostgreSQL health endpoint, graceful pool shutdown, structured
  request logs, and request correlation identifiers before operating a hosted
  environment.
- Re-evaluate CSRF protection against the final frontend/API domain topology;
  add explicit Origin checks or CSRF tokens if cookie and SameSite boundaries do
  not provide the intended protection.
- Move SQL migrations to one ordered file per migration when the migration list
  becomes difficult to review; keep the current lightweight runner and do not
  introduce an ORM only for migration organization.
- Split story read projections from write persistence only when permissions,
  lightweight story lists, or progressive loading make the current repository
  materially harder to maintain.

## Publication Readiness

- Separate mutable drafts from immutable published story versions.
- Add validation before publication and stable public reader URLs.
- Add private, unlisted, and public visibility.
- Separate author simulation tools from the public reader.
- Define reporting, moderation, ownership, and content licensing rules.

## V0.4 - Advanced Narrative Model

- Locations are implemented as the first world-state vertical: story-owned
  definitions, interaction movement, and current-location trigger conditions.
- Characters are implemented as story-owned definitions, interaction casts, and
  present/absent trigger conditions.
- Numeric character stats are implemented with initial values, typed interaction
  effects, and trigger comparisons.
- Item definitions and authored character-owned item instances are implemented;
  several instances may reference the same definition.
- Deterministic story-local time, interaction durations, and trigger schedules
  using dates, weekdays, and multiple time slots are implemented.
- Establish typed world-state conditions and interaction effects incrementally;
  do not introduce an unvalidated universal parameter bag.
- Typed variables: stable attributes, changing resources, skills, flags, traits,
  and temporary statuses.
- Extend locations with deletion/reference-resolution UX and persisted session
  state only when those workflows are introduced.
- Extend characters with playable points of view and directional relationships.
- Neutral grouping concept for quests, chapters, arcs, or scene sequences.
- Author annotations that do not affect story execution.
- Story Canvas filters/focal points for future groups, characters, and places.
- General attributes beyond character stats.
- Interaction impacts on general attributes.
- World-based conditions beyond location, character presence, and character stats.
- Contextual inputless triggers based on broader world state.
- Final interactions and explicit story completion.
- A first playable item vertical with item instances in play-session state, one
  inventory, basic equipment, tags, and typed item conditions/effects.
- Later item increments: multiple containers, consumables, durability,
  modifiers, shops, economy, and advanced clothing layers or coverage.

## V0.5 - Timing and Probabilities

- Implemented: interaction durations and calendar-based trigger availability.
- Real-time choice countdowns and delayed automatic choices.
- Appearance probability.
- Probabilistic automatic choices.

## V1.0 - Exports and Integrations

- Embeddable reader.
- Hosted platform publishing and story sharing.
- Web app or executable exports.
- Media support.
- Unity exploration.
- AI experiments.
- Progressive loading for large stories when measured story sizes justify
  lightweight canvas summaries and on-demand details.

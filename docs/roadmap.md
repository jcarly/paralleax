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
- Contextual inputless triggers with visited / not visited conditions.
- OR condition groups through several triggers between the same interactions.
- Trigger editing from graph markers.
- Trigger cleanup when deleting interactions.
- Visited / not visited conditions.
- PostgreSQL persistence for authored MVP stories.
- API, web, Playwright, and coverage tests in CI.

## V0.2 - Persistence and Robustness

- Save status feedback in the editor.
- Visible save error handling.
- Delete confirmations for interactions and triggers.
- JSON export/import for stories.
- Story Canvas UX exploration: keep the current graph semantics, but refine the
  editor toward a story-first canvas with denser default spacing, adaptive edge
  routing, cleaner trigger marker placement, left-side navigation/filtering, a
  contextual right inspector, and representative canvas examples.
- Navigation foundation: quick search, recentering, recent selections, and
  model/story navigation patterns for larger graphs.
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

- User accounts, authentication, and story ownership.
- Story default access settings for private stories, public reading, and public suggestions.
- Per-user story permissions for reading, suggesting edits, reviewing suggestions, direct editing, and managing settings.
- Permission hierarchy and inheritance rules to define before implementation.
- Review rights that let authorized users see all pending suggestions for a story.
- Review workflow for proposed story changes.
- Contribution workflow for proposing interactions or branches before they are
  accepted into the canonical story.
- Approval rules that can require creator or authorized reviewer validation before suggested changes affect the story.
- Event-log-based change history for accepted, rejected, and pending story modifications.

## V0.4 - Advanced Narrative Model

- Characters.
- Places.
- Neutral grouping concept for quests, chapters, arcs, or scene sequences.
- Author annotations that do not affect story execution.
- Story Canvas filters/focal points for future groups, characters, and places.
- Attributes.
- Interaction impacts on attributes.
- World-based conditions.
- Contextual inputless triggers based on broader world state.
- Final interactions and explicit story completion.

## V0.5 - Timing and Probabilities

- Delays.
- Choices with timers.
- Appearance probability.
- Probabilistic automatic choices.

## V1.0 - Exports and Integrations

- Embeddable reader.
- Hosted platform publishing and story sharing.
- Web app or executable exports.
- Media support.
- Unity exploration.
- AI experiments.

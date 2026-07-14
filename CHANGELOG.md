# Changelog

All notable project changes are tracked here.

This project follows a lightweight [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) style while the MVP is still evolving quickly. Entries are grouped under `Unreleased` until the first tagged version.

## Unreleased

### Added

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
- Trigger semantics documentation covering inputs, deletion behavior, and editor UX.
- API endpoint to delete a trigger from an interaction.
- Web API client support for trigger deletion.
- UI support for selecting a trigger through its graph edge.
- UI support for deleting a trigger from the trigger inspector.
- Tests for multiple trigger inputs, trigger deletion, edge-based trigger editing, interaction title editing, and drag behavior.

### Changed

- Editor inspector UI is now split into dedicated `InteractionInspector` and
  `TriggerInspector` components.
- Trigger input deletion planning is now isolated in a tested web helper.
- Canvas connection validation and created-trigger selection are now isolated in a tested web helper.
- Editor interaction and trigger selection lookups are now isolated in a tested web helper.
- React Flow node and trigger edge mapping is now isolated in a tested web helper.
- API in-memory storage is now isolated behind `StoriesRepository`, keeping `StoriesService`
  focused on story application behavior.
- Web unit tests now allow enough time for coverage instrumentation on slower local or CI runs.
- Story and trigger operations now live in `packages/shared` and are reused by both the NestJS API and the React editor.
- Root test and coverage commands now include the shared workspace.
- Docker development now uses Node.js 22 and npm 11, matching the documented project requirements.
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

- Creating or deleting one trigger link no longer silently changes unrelated trigger edges.
- Creating another trigger link after deleting one no longer restores the deleted edge from stale API responses.
- Editing an interaction title no longer blanks the editor page.
- Dragging an interaction no longer clears its title or body.
- Dragging one interaction no longer clears other interactions.
- Dragging an interaction after deleting a trigger no longer restores the deleted edge from stale API data.
- Creating links from the canvas now persists trigger inputs instead of disappearing after creation.
- Interactions without triggers no longer render a blank page in the editor.

### Documentation

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

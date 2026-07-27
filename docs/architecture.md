# Architecture

Paralleax is a TypeScript monorepo for the Story, Interaction, Trigger, and
Reader MVP.

The codebase has three runtime workspaces:

- `apps/web`: React, Vite, and React Flow. It contains the authoring editor,
  player reader, Simulation Mode, UI components, web unit tests, and Playwright
  tests.
- `apps/api`: NestJS. It exposes story endpoints and persists MVP story data in
  PostgreSQL behind a repository abstraction.
- `packages/shared`: framework-independent domain types, reader rules, story
  operations, trigger cleanup rules, stale-response merge rules, graph placement
  helpers, and deterministic demo story generation.

## Architecture Rule

The narrative engine must stay independent from the interface.

The UI creates, visualizes, and edits a story. The engine must be able to
evaluate a story without depending on React, React Flow, or NestJS, so it can be
reused by other renderers: web app, game, Unity, interactive film, or external
tooling.

Domain behavior that must be shared by the editor, API, reader, tests, or future
exporters belongs in `packages/shared`. UI-only projection, selection, and
gesture behavior belongs in `apps/web`. HTTP orchestration, validation boundaries,
and temporary persistence belong in `apps/api`.

## Workspace Responsibilities

### `packages/shared`

`packages/shared/src/index.ts` is the current MVP domain module. It exports:

- story model types: `Story`, `Interaction`, `Trigger`, `TriggerCondition`, and
  shared input/update shapes;
- story operations: `updateInteractionInStory`, `updateTriggerInStory`,
  `deleteTriggerInStory`, and `deleteInteractionFromStory`;
- response merge behavior: `mergeServerStory`, including protection against
  stale responses restoring deleted triggers or trigger inputs;
- graph placement helpers: `getNextRootPosition`, `getNextChildPosition`, and
  `getNextParentPosition`;
- reader and simulation helpers: `getAvailableInteractions`,
  `getInputReachableInteractions`, `getTriggerConditionFailures`, and
  deterministic story-calendar reconstruction;
- `createDemoStory`, the deterministic local story used for manual testing and
  regression-friendly sample data.

Shared code must not import React, React Flow, NestJS, browser APIs, or server
storage. It should be deterministic and unit-testable.

### `apps/api`

The API exposes story operations through `StoriesController`.

The NestJS application is organized by feature rather than technical layer:

- `auth/` owns credentials, sessions, guards, decorators, and auth endpoints;
- `stories/` owns story DTOs, application behavior, persistence, and endpoints;
- `database/` owns the shared PostgreSQL connection and migration lifecycle;
- `config/` validates environment configuration and exposes typed runtime values.

`AppModule` composes these modules without registering their internal providers
directly. Feature modules export only providers required by another module.

`StoriesService` owns application-level story behavior:

- creates and renames stories;
- creates, updates, and deletes interactions;
- creates, updates, and deletes triggers;
- returns the mutated interaction or trigger with story revision metadata for
  entity-scoped create and update endpoints;
- delegates trigger cleanup and story mutation rules to `packages/shared`;
- normalizes missing interaction positions before returning stories;
- updates timestamps before saving modified stories.

`AuthController` exposes registration, login, logout, and current-user endpoints.
`AuthService` derives password hashes with scrypt and issues random opaque session
tokens; only token hashes are stored. `SessionGuard` resolves the HTTP-only session
cookie and protects every route unless it is explicitly public. Expired sessions
are deleted opportunistically during session creation and resolution. User
creation relies on an atomic unique-email insert rather than a prior lookup alone.

`StoriesRepository` owns PostgreSQL reads and writes. Every query, including a
transactional mutation, is scoped by the authenticated creator id so knowledge
of a story id cannot bypass ownership. It assembles relational story,
interaction, trigger, and input rows plus trigger condition JSONB into the domain `Story` expected
by the service and writes field-level differences for mutations.
`stories/persistence/stories.persistence.writer.ts` owns the relational write plan: full graph
replacement for initial saves and entity-level differences for mutations. The
repository remains responsible for ownership-scoped reads and transaction
orchestration, while the writer has no NestJS or connection-pool dependency.
`DatabaseMigrator` owns schema evolution, and `DatabaseConnection` owns the
shared PostgreSQL pool. Migrations run only through the explicit migration
command before the API starts; repositories and user requests never initiate
schema changes. The service does not depend on the physical relational shape,
so storage and query projections can evolve without moving endpoint behavior or
shared domain rules.

Authenticated player progress uses one `story_reader_progress` row per user and
story. Its keys and update timestamp are relational; its versioned JSONB state
contains the ordered journey and materialized runtime values. `StoriesService`
validates same-story references and rebuilds time, location, visits, stats, and
character item inventory before saving. Simulation Mode stays isolated from
this persistence flow.

`HealthModule` exposes an unauthenticated process liveness check at
`GET /api/health` and a readiness check at `GET /api/ready`. Readiness requires
PostgreSQL connectivity, the migration table, and the latest known migration.
It does not apply missing migrations.

Every HTTP request receives an `X-Request-Id`. A syntactically safe identifier
from an upstream proxy is preserved; otherwise the API generates one. Completion
logs contain only the request id, method, path without its query string, status,
and duration. They never log request or response bodies.

`ApiExceptionFilter` returns one stable error envelope:

```json
{
  "status": 404,
  "code": "NOT_FOUND",
  "message": "Story not found",
  "requestId": "..."
}
```

Known operational errors may provide a more specific code. Unexpected errors
return a generic message and never expose exception, stack, or SQL details.
Production Nest logs use JSON output. The web client preserves status, code, and
request id on `ApiError` for future support and recovery workflows.

`AppConfigService` is the only runtime boundary for application environment
values. It validates database and browser origins, port, verified SSL settings,
and environment during startup. Production endpoints must be explicit. Consumers
do not read `process.env` directly.

Story mutations execute inside a transaction and lock their story row before
reading the graph. The repository compares the loaded
domain snapshot with the mutated result, then updates only changed story or
interaction fields and changed trigger structures. Independent concurrent field
updates therefore do not rewrite an unrelated story document. A later
collaboration policy must still define conflicts when two users modify the same
trigger structure.

Interaction and trigger create/update routes do not return the complete story.
They return the saved entity plus the owning story revision and update timestamp.
Trigger creation accepts its initial inputs and conditions in the same request,
so creating a graph link does not require a dependent create-then-patch sequence.
Delete routes may still return the story because their cleanup can affect several
interactions and triggers.

### `apps/web`

`StoryEditor` is the page-level orchestration component for the editor. It wires
React Flow, selection state, inspectors, and persistence actions together.

Supporting editor modules keep pure or focused behavior outside the page
component:

- `hooks/useStoryEditorPersistence.ts`: loading, optimistic updates, API writes,
  save status and error recovery, stale-response merging, and create/delete
  workflows.
- `storyGraph.ts`: projection from the domain story model to React Flow
  interaction nodes, trigger nodes, and trigger edges.
- `storySelection.ts`: selected interaction and trigger lookup helpers.
- `storyConnection.ts`: canvas connection validation and created-trigger lookup.
- `storyTriggerInput.ts`: deletion planning for one trigger input link.
- `components/InteractionInspector.tsx`: interaction content editing.
- `components/RichTextEditor.tsx` and `RichTextContent.tsx`: rich-body authoring
  and defense-in-depth sanitized rendering.
- `components/TriggerInspector.tsx`: trigger condition and OR variant editing.
- `components/InteractionNode.tsx`, `TriggerNode.tsx`, and `TriggerEdge.tsx`:
  React Flow rendering surfaces.

The web app may map a story into React Flow nodes and edges, but it must not
store story semantics as React Flow data. React Flow data is a projection of the
domain model.

Vite loads the editor and reader as separate route chunks. The authenticated
shell and story list therefore do not download React Flow until an author opens
the editor. Route imports remain literal so Vite can analyze and split them
deterministically. Edit and reader links preload their corresponding chunk on
hover or keyboard focus so explicit navigation intent hides most of the added
route-loading latency.

## React Flow Boundary

React Flow is currently a good fit for the editor because Paralleax needs custom
interaction nodes, graph edges, dragging, zooming, panning, and connection
gestures. These needs match React Flow's native primitives without forcing the
narrative model into a UI-specific shape.

The important boundary is that React Flow must remain a canvas interaction and
rendering layer. Stories, interactions, triggers, and reader rules must stay in
the Paralleax domain model and shared packages. The application may map domain
objects to React Flow nodes and edges, but it should not store stories as React
Flow data.

The graph is therefore a representation of the narrative model, not the product
itself. Other surfaces, such as simulation, navigation, filtering, review, or a
future reader platform, must be able to use the same story model without
duplicating it.

Current trigger rendering is a projection: a linked trigger is shown as a small
React Flow trigger node between its input interactions and its output
interaction. Each input edge connects an interaction to that trigger node, and
the trigger node connects to the output interaction. Root triggers remain markers
on the interaction itself. The underlying domain model still owns trigger
semantics; React Flow nodes only make the relationships easier to manipulate.

A warning sign would be changing trigger semantics only to match React Flow
constraints. In that case, the integration should be revisited before the UI
starts shaping the engine.

## Runtime Flows

### Loading a Story in the Editor

1. `StoryEditor` reads the story id from the route.
2. `useStoryEditorPersistence` calls the API client in `apps/web/src/api.ts`.
3. `StoriesController` delegates the request to `StoriesService`.
4. `StoriesService` reads the story from `StoriesRepository`.
5. Before returning the story, the service normalizes missing interaction
   positions with `ensureStoryInteractionPositions`.
6. The web app stores the returned domain story in React state.
7. `storyGraph.ts` maps the story into React Flow nodes and edges for rendering.

The loaded state remains a domain `Story`. React Flow nodes and edges are
recomputed projections.

### Editing Story Content

1. The user edits an interaction title, body, or position in the editor.
2. `useStoryEditorPersistence` applies an optimistic local update through shared
   story operations.
3. The hook sends the API request.
4. The API updates the repository through `StoriesService`.
5. The API returns the saved interaction and story mutation metadata.
6. The hook applies that entity to the current local story without replacing
   unrelated interactions or trigger structures.

Story-level and delete responses still use `mergeServerStory`. Entity-scoped
responses avoid carrying unrelated stale graph state in the first place. When
adding or changing editor persistence behavior, keep both entity application and
stale story merge regressions covered.

Interaction bodies are HTML. The API sanitizes them before persistence with a
strict element, attribute, protocol, and iframe-host allowlist. The web renderer
sanitizes the stored HTML again before using `dangerouslySetInnerHTML`.

### Editing Trigger Links

Trigger link behavior crosses the graph projection and the domain model, so it is
split deliberately:

- `storyGraph.ts` decides how triggers appear as trigger nodes and edges.
- `storyConnection.ts` decides whether a graph connection can become a trigger
  input.
- `storyTriggerInput.ts` decides the local mutation plan for deleting one input
  link.
- `useStoryEditorPersistence` performs optimistic updates and API writes.
- `packages/shared` owns the actual trigger mutation and cleanup rules.

A linked graph edge represents one trigger input. Several graph edges may point
to the same trigger marker when one trigger has several inputs. Several triggers
with the exact same input set are grouped visually as OR condition variants, but
they remain distinct domain triggers.

When a normal canvas connection can either extend an existing trigger or create
a separate trigger, `StoryEditor` presents that choice before calling the
persistence hook. Dropping directly on a trigger marker remains the explicit
shortcut for extending that trigger.

Every editor mutation passes through the persistence hook's save tracker. The
toolbar exposes saving, saved, and failed states. A failed mutation leaves a
visible error with an action that reloads the persisted story, which also
recovers from optimistic local state that the server did not accept.

### Running the Reader

The player reader and Simulation Mode both rely on shared reader helpers.

- `StoryPlayer` calls `getAvailableInteractions` to list playable choices.
- Simulation Mode can call `getInputReachableInteractions` to show interactions
  whose input rule matches even when conditions block them.
- Simulation Mode can call `getTriggerConditionFailures` to explain why an
  interaction is not currently available.

Reader semantics are documented in [Reader semantics](reader-semantics.md). Any
change to these helpers should update that document and the shared tests in the
same change.

### Creating Demo Data

The story list can request a local demo story from the API. The API calls
`createDemoStory` from `packages/shared`, stores the generated story in
`StoriesRepository`, and returns it to the web app.

Demo data should stay deterministic. It is used for manual exploration and as a
stable source of regression-friendly sample structures.

## Where To Put New Code

- Put reusable model behavior in `packages/shared`.
- Put React component state, rendering, and browser-only behavior in `apps/web`.
- Put API route handling, request/response boundaries, and PostgreSQL storage
  access in `apps/api`.
- Put pure editor projection helpers near the editor in `apps/web/src` when they
  exist only to support React Flow or inspector behavior.
- Add tests close to the behavior: shared Vitest tests for domain rules, API
  Jest/Supertest tests for endpoints, web Vitest/Testing Library tests for UI
  behavior, and Playwright tests for critical editor flows.

Before adding a new concept, check [MVP scope](mvp.md), [Domain model](domain-model.md),
and [Non-goals](non-goals.md). Locations and characters are the first post-MVP
context verticals; variables, AI, and player save persistence remain outside the
implemented narrative model.

## Storage

Authored stories are persisted in PostgreSQL during the MVP.

Deployment, progressive loading, normalization signals, and operational growth
are documented separately in [Hosting and scale](hosting-and-scale.md).

The API accesses storage through `StoriesRepository` instead of coupling
`StoriesService` to SQL calls. `StoriesService` still owns application behavior,
while shared story operations own trigger cleanup, normalization, reader rules,
and merge semantics.

The current PostgreSQL schema stores Story, Location, Character, reusable Stat
Definition (including its hourly change rate), Character Stat Assignment,
Item Definition, Character Item Instance, Interaction, Interaction Stat Effect,
Trigger, and trigger input state in
relational tables. Interaction-to-location, interaction-character, and stat
effect references use same-story composite foreign keys. Time-based stat changes
are calculated in the shared engine from interaction durations rather than
stored as runtime events. Ordered typed trigger conditions are
stored as JSONB on their owning trigger and their references are validated by
the application service. Story-local start time and interaction durations are
relational fields; temporal alternatives remain typed trigger-condition JSONB.
Context entity image references use relational text columns. Image binaries and
their upload lifecycle are not stored by the application.
The repository reconstructs
the existing domain `Story`, so persistence normalization does not leak into the
shared engine or the HTTP contract. JSON remains a future versioned import/export
format rather than the database source of truth.

Schema changes must always go through migrations. Do not create, alter, or drop
tables from repositories or services. Add a new migration to the migration list,
make it forward-only, and keep any required data transformation in that migration
so deployed data evolves predictably.

Run migrations as a separate deployment step with `npm run migrate`. Production
starts use `npm run migrate:prod -w @paralleax/api` against the already-built
API bundle. A failed migration must prevent the API deployment from becoming
ready.

Historical JSON stories are converted into relational rows in place. The
conversion preserves their disabled legacy owner until an administrator assigns
them to a real account. Migration tests prohibit wholesale story deletion and
exercise the complete legacy-to-current path against PostgreSQL.

## Styling

The web app currently uses plain CSS with shared custom properties for colors and
elevation. This keeps the MVP light while the graph editor behavior is still
stabilizing.

Tailwind CSS is a candidate to evaluate once the UI surface justifies a
design-system decision. React Flow-specific styles, such as node handles and
trigger markers, may remain in dedicated CSS because they target third-party
graph classes directly.

## Tests and CI

- API: Jest and Supertest.
- PostgreSQL integration: Jest against PostgreSQL 17, including persistence
  across repository instances and concurrent row mutation coverage.
- Web: Vitest and Testing Library.
- Shared: Vitest for narrative rules and pure story operations.
- Functional: Playwright.
- Coverage: Jest coverage for the API, Vitest V8 coverage for shared and the web app,
  with per-workspace thresholds enforced by the coverage commands.
- Code style: ESLint and Prettier.
- GitLab CI: typecheck, coverage, build, and Playwright on every pushed commit.

## Verification Commands

Use the narrowest relevant command while developing, then run the broader checks
before finishing a behavior change.

```bash
npm run test -w @paralleax/shared
npm run test -w @paralleax/api
npm run test -w @paralleax/web
npm run test:e2e -w @paralleax/web
npm run typecheck
npm run coverage
npm run build
```

Documentation-only changes do not require the full test suite unless they also
change implementation semantics. They should still keep links and terminology
aligned with `docs/README.md`, `docs/domain-invariants.md`, and `CHANGELOG.md`.

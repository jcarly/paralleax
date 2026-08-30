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
  helpers, and deterministic demo-story catalog generation.

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

`packages/shared/src/model/` owns the framework-independent model types, grouped
by domain responsibility. `packages/shared/src/index.ts` remains the stable
public facade and re-exports those types alongside the current domain behavior,
so consumers continue importing from `@paralleax/shared`. The package exports:

- story model types: `Story`, `Interaction`, `Trigger`, `TriggerCondition`, and
  shared input/update shapes;
- story operations: `updateInteractionInStory`, `updateTriggerInStory`,
  `deleteTriggerInStory`, and `deleteInteractionFromStory`;
- response merge behavior: `mergeServerStory`, including protection against
  stale responses restoring deleted triggers or trigger inputs;
- graph placement helpers: `getNextRootPosition`, `getNextChildPosition`, and
  `getNextParentPosition`;
- recursive item-graph helpers for authored-item indexing, structural
  reachability, descendant collection, validation, and subtree-preserving moves;
- anchored-comment validation and the shared manager/editor/thread-creator
  authorization rule;
- reader and simulation helpers: `getAvailableInteractions`,
  `getInputReachableInteractions`, `getTriggerConditionFailures`, and
  deterministic story-calendar reconstruction;
- `createDemoStory`, the deterministic local story used for manual testing and
  regression-friendly sample data.

Story-local calendar types, validation, arithmetic, journey reconstruction, and
temporal-condition matching live in `packages/shared/src/time/`. Reader and
trigger logic consume this module instead of owning duplicate calendar rules.

Trigger condition types and deterministic evaluation live in
`packages/shared/src/triggers/`. This module owns input matching, condition
matching, available-interaction selection, and failure diagnostics while
preserving story interaction order and the documented trigger OR/AND semantics.

Pure authored-story mutations live in `packages/shared/src/operations/`, split
between interaction cleanup, trigger mutation, and stale-response merge rules.
API and web orchestration call these operations instead of redefining domain
cleanup or optimistic persistence behavior.

Deterministic reversible authored deltas live in `packages/shared/src/history/`.
They project canonical Story content without access, runtime, ownership,
timestamp, or capability fields. Nested id-bearing entity collections are
matched by stable ids and changed fields carry before/after preconditions, so an
inverse can preserve unrelated later edits and report overlapping conflicts.

Recursive authored-item graph behavior lives in `packages/shared/src/items/`.
The reader uses its structural reachability projection, the API maps its typed
placement failures to HTTP errors, persistence uses its stable owner/index
projection, and the web editor uses the same descendant calculation to exclude
invalid parents.

Reusable stat-assignment target projection and author-facing rich-text reference
resolution live in `packages/shared/src/stats/`. The web editor uses that target
projection for effects and its progressive rich-text variable picker. Rich-text
tokens persist stable assignment and exact-item ids, then project their readable
owner/item/variable path from the current Story so renames require no marker
rewrite. Their editor-only controls support in-content drag-and-drop and are
flattened back to the same inert marker before emitting authored HTML. The API
lowers uniquely resolved `{{owner.variable}}` shorthand to the same stable
assignment markers consumed by the reader.

Inline interaction links use a separate inert rich-text marker containing the
authored label and stable target interaction id. The API sanitizer keeps only
same-Story targets, the editor projects the current target title into a reusable
token/dialog UI, and the reader delegates activation to its existing available
choice transition. New conditional text frames keep only a stable block id in
HTML; structured `ConditionalTextBlock` data is stored on the Interaction and
reuses the shared Trigger condition union, API validation, editor fields, and
deterministic AND evaluator. Legacy target-based frames retain their availability
projection. Links do not reuse either frame format as canonical markup.

Default interaction placement lives in `packages/shared/src/graph/`, while the
deterministic sample story lives in `packages/shared/src/demo/`. The public
`index.ts` facade re-exports both modules and owns no implementation for either
responsibility.

Experimental external-source adapters live in `packages/shared/src/import-export/`.
The ChoiceScript adapter separates typed source parsing, draft graph compilation
and layout, canonical Story mapping, and compatibility reporting behind a thin
pipeline orchestrator. It maps representable control flow and simple state
operations without importing a foreign runtime. Source declarations,
assignments, comparisons, and substitutions use generic Paralleax typed stats.
API orchestration supplies IDs and persists the complete mapped Story in one
transaction; web code owns only local file selection and report presentation.

Deterministic runtime reconstruction lives in `packages/shared/src/reader/`.
Its replay pipeline derives progress, location, typed stat values, and owned item
instances from the authored story plus ordered journey. Non-item and exact-item
stat replay helpers currently remain colocated there pending their incremental
extraction into dedicated domain modules.

Shared code must not import React, React Flow, NestJS, browser APIs, or server
storage. It should be deterministic and unit-testable.

### `apps/api`

The API exposes story operations through `StoriesController`.

The NestJS application is organized by feature rather than technical layer:

- `auth/` owns credentials, sessions, guards, decorators, and auth endpoints;
- `stories/` owns story DTOs, application behavior, persistence, and endpoints;
- `comments/` owns anchored review-thread endpoints, applies the shared thread
  authorization rule, and persists comments without extending the canonical
  story aggregate;
- `database/` owns the shared PostgreSQL connection and migration lifecycle;
- `config/` validates environment configuration and exposes typed runtime values.

`AppModule` composes these modules without registering their internal providers
directly. Feature modules export only providers required by another module.

`StoriesService` is the thin controller-facing compatibility facade. It preserves
the existing controller contract while delegating every responsibility to focused
application services.

`stories/application/story-metadata.ts` owns story lists, authorized reads,
creation, demo creation, title/start-time updates, deletion, and editor-only SSE
access. `story-access.ts` owns access settings and collaborator orchestration.
`story-mutations.ts` is the single API application coordinator for authorized
story mutations: it normalizes legacy positions, updates timestamps and revisions,
and publishes the resulting story change.

`story-history.ts` owns authorized history reads and undo/redo orchestration.
`StoriesRepository.mutate` records a reversible event atomically with every
revisioned content write. The relational `story_change_events` stream is
append-only: inverse events reference the event they reverse, and a reversal
locks the Story, verifies delta preconditions, persists the relational
difference, increments the revision, and publishes the normal live invalidation.
Comments, access changes, Story creation/deletion, and reader progress do not use
this path.

`story-graph.ts` owns interaction, trigger, and graph-decoration orchestration,
including same-story reference validation and compact entity mutation results.
`story-context.ts` owns locations, characters, typed-variable definitions and
assignments, item definitions and instances, and their reference cleanup. Both
reuse the focused shared and API application operations instead of reimplementing
their domain rules.

`stories/application/story-reader-progress.ts` owns authenticated save-slot
reads, same-story journey and item validation, deterministic state
reconstruction, manual-save limits, and save persistence/deletion.
`StoriesService` retains compatibility methods for the controller but delegates
this responsibility to the focused service.

The API Webpack build maps emitted `.js` module specifiers back to TypeScript
sources when it follows workspace aliases. This keeps the shared package's
NodeNext-compatible internal imports valid in both its emitted package and the
API source build.

`AuthController` exposes registration, login, logout, and current-user endpoints.
`AuthService` derives password hashes with scrypt and issues random opaque session
tokens; only token hashes are stored. `SessionGuard` resolves the HTTP-only session
cookie and protects every route unless it is explicitly public. Expired sessions
are deleted opportunistically during session creation and resolution. User
creation relies on an atomic unique-email insert rather than a prior lookup alone.
Production chooses an explicit registration mode; private alpha registration can
require a server-validated invitation code before user creation. A global origin
guard rejects mutative production requests unless their `Origin` exactly matches
the configured public origin, while safe and local/test requests remain unchanged.

`StoriesRepository` owns PostgreSQL reads and writes. Every query, including a
transactional mutation, resolves creator ownership, global administrator status,
story defaults, and any per-user grant in SQL so knowledge of a story id cannot
bypass authorization. Public reads use optional authentication; all mutation
routes still require a session. It assembles relational story,
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

Story listing uses a separate lightweight `StorySummary` projection. Its
aggregate queries return metadata and an interaction count without loading
interactions, triggers, context entities, or item graphs. The authenticated
`GET /api/stories` projection resolves every story accessible to the requesting
account; the anonymous `GET /api/stories/public` projection filters to public
visibility, omits owner account identifiers, and resolves capabilities as a
signed-out reader. Creation endpoints still return the created complete story;
the web workspace converts that one result to a summary locally. Both story and
summary projections include resolved capabilities so the interface can hide
unavailable actions without becoming the security boundary.

The first account becomes the first administrator through a serialized database
transaction. Administrator role updates use the same lock, and the final
administrator cannot be demoted. Story access settings live on `stories`; direct
viewer/editor grants live in `story_user_permissions` and target existing local
accounts. See ADR-017.

Authenticated saves use one `story_reader_progress` row per user, story, and
slot. The slot id, optional manual-save name, and timestamps are relational; the
versioned JSONB state contains the ordered journey and materialized runtime
values. Reserved ids keep reader and Simulation Mode autosaves separate, while
named manual slots are shared between both modes.
`StoryReaderProgressService` validates same-story references and rebuilds time,
location, visits, stats, and character item inventory before saving. Simulation
autosave access additionally requires effective story edit permission. Loading
any slot replays it against the current authored story and the web client then
writes that result to the current mode's autosave.

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

The global throttler defaults to 100 requests per minute. Story reads retain
that limit, while story mutation routes use a stricter 60-per-minute policy.
Authentication registration and login keep their separate lower limits.
Interaction HTML is rejected above 64,000 characters before sanitization and
persistence. Express JSON and form parsing is configured explicitly at 128 KiB.
Parser rejections pass through the API exception filter as a stable
`413 PAYLOAD_TOO_LARGE` envelope without exposing parser details.

`AppConfigService` is the only runtime boundary for application environment
values. It validates database and browser origins, port, verified SSL settings,
and environment during startup. Production endpoints must be explicit. Consumers
do not read `process.env` directly.

Story mutations execute inside a transaction and lock their story row before
reading the graph. The repository compares the loaded
domain snapshot with the mutated result, then updates only changed story or
interaction fields and changed trigger structures. Independent concurrent field
updates therefore do not rewrite an unrelated story document. A later save to
the same field or trigger structure is authoritative; richer conflict
presentation remains future work.

Every successful authored-story transaction publishes a process-local SSE
invalidation after persistence. The editor and Simulation Mode subscribe only
with effective edit permission, coalesce short mutation bursts, and reload the
normal authorized `Story` projection. The event contains no authored payload and
cannot bypass repository authorization. A ready event recovers changes missed
during reconnection, while a heartbeat keeps the reverse-proxy connection alive.

The web editor defers an incoming projection while a local input, drag, or save
is active, then applies the authoritative server story. Simulation instead
rebuilds all runtime values by replaying its current journey against that story
through shared deterministic operations. This covers interaction and trigger
content and positions, context entities, items, stats, and graph decorations
without making React Flow or simulation state canonical. See ADR-020.

Interaction and trigger create/update routes do not return the complete story.
They return the saved entity plus the owning story revision and update timestamp.
Trigger creation accepts its initial inputs and conditions in the same request,
so creating a graph link does not require a dependent create-then-patch sequence.
Delete routes may still return the story because their cleanup can affect several
interactions and triggers.

### `apps/web`

`StoryEditor` is the page-level composition component for the editor. It wires
React Flow, selection state, inspectors, and focused editor controllers to the
persistence actions.

The root route renders the unified story library. Without a session it uses the
anonymous public-summary endpoint; with a session it uses the authorized list of
every story that account can read and exposes filters derived from resolved edit,
comment, and ownership data. Changing sessions clears the previous projection
before loading the next one. The former `/stories` workspace redirects to the
root library for compatibility. Editor, access, and administration routes redirect
signed-out visitors to authentication. Sign-in and registration carry a validated
same-origin `returnTo` path, including its query and fragment, and replace the
authentication history entry after success. The product navigation does not
expose the internal design-system reference.

The editor route also checks the loaded story capability and redirects any
authenticated non-editor to the player. Simulation Mode requires the same
effective edit capability; player query parameters cannot upgrade a reader to
author tooling. Comment-capable readers use an interaction-contextual discussion
panel in `StoryPlayer`, while editors retain the complete graph review layer.

Administrators receive an `Administration` navigation entry backed by the
protected `/admin/users` route. Its account list, summary, search, role filter,
and last-administrator affordance are client projections of the API state. Role
changes always use the administrator endpoints; hiding or disabling a control is
not treated as authorization or concurrency protection.

`apps/web/src/i18n/` owns interface localization through `i18next` and
`react-i18next`. English and French resources are bundled with the web build,
so rendering does not depend on a translation request. Startup selects a saved
interface language first, then a supported browser language, and finally the
English fallback. The selection is stored only in browser local storage and
updates the document language for accessibility; it is not story state and is
never sent to the API.

Translation applies to product copy, including labels, controls, status text,
accessibility names, and reader condition diagnostics. Story titles,
interaction titles and bodies, and the names and descriptions of authored
locations, characters, stats, and items remain exactly as written. Components
compose translated diagnostic phrases around those authored values without
mutating them.

`apps/web/src/features/feedback/` owns the optional Formbricks adapter and its
header control. It initializes only when both public Vite settings are present,
tracks React Router navigation, and emits the `paralleax_feedback_opened` code
action with normalized, non-content hidden fields. It deliberately does not
identify the signed-in account or send authored story content. Formbricks remains
a browser integration and has no dependency on the shared domain, API, or
persistence layers. The production Nginx template permits the configured
Formbricks URL in `script-src` and `connect-src` only when that URL is supplied.

Supporting editor modules keep pure or focused behavior outside the page
component:

- `hooks/useStoryEditorPersistence.ts`: the thin composition facade and single
  optimistic `Story` state owner. It preserves the editor-facing action contract.
- `features/story-editor/persistence/useStoryPersistenceLifecycle.ts`: loading,
  save status and error recovery, live invalidation deferral, and stale-response
  tombstones. It receives the facade's story setter and owns no parallel Story.
- `features/story-editor/persistence/storyGraphPersistence.ts`: interaction,
  trigger, connection, and graph-decoration workflows. It reuses shared story
  operations and the existing mutation-result adapters.
- `features/story-editor/persistence/storyContextPersistence.ts`: location,
  character, typed-variable, and item mutation orchestration. It receives the
  facade's story setter and lifecycle save tracker instead of owning parallel state.
- `features/story-editor/persistence/storyPersistenceTypes.ts`: the small shared
  setter, merger, and save-tracker contracts shared by the collaborators.
- `features/story-editor/history/useStoryHistory.ts`: session-scoped history
  status loading and serialized undo/redo actions. Successful local authored
  saves mark undo as available through the existing persistence facade instead
  of reloading history after every Story revision; revisions not reported by a
  local save resynchronize availability after collaborative changes. Successful
  non-graph inverses reuse the lifecycle's canonical Story replacement path;
  position-only inverses apply their compact shared graph patch to the same
  parent-owned Story state. Both reuse lifecycle save-state reporting instead of
  owning parallel Story state.
- `features/story-editor/graph/useStoryConnectionController.ts`: transient React
  Flow connection gestures, empty-canvas parent/child placement, and the
  new-trigger versus existing-trigger choice. It delegates connection validity to
  `storyConnection.ts` and persistence to the existing graph actions.
- `features/story-editor/selection/useStoryEditorSelection.ts`: the single owner
  for transient inspector targets and rectangle-selection gestures. It resolves
  selected entities from the canonical Story and deliberately preserves context
  references only for interaction navigation that requires them.
- `features/story-editor/navigation/useStoryContextNavigation.ts`: context-panel
  visibility, section state, entity filters and categories, reference summaries,
  text occurrences, and previous/next interaction focus. It consumes the pure
  `storyNavigation.ts` projections and never copies authored entities into local
  state.
- `hooks/useStoryRealtime.ts`: authorized story SSE lifecycle, reconnect status,
  and short-burst invalidation coalescing shared by editor and Simulation Mode.
- `features/realtime/`: invalidation priority, API-not-found recognition, and
  editable-target detection shared by editor and Simulation Mode.
- `features/story/storyMutationResults.ts`: pure mutation metadata and entity
  adapters shared by persistence and Simulation Mode; complete-story legacy
  responses retain their caller-specific merge policy.
- `storyGraph.ts`: projection from the domain story model to React Flow
  interaction nodes, trigger nodes, and trigger edges.
- `features/graph-decorations/`: focused projection, rendering, resizing, and
  inspector UI for authored frame and text decorations.
- `features/feedback/`: optional Formbricks configuration, route-context
  normalization, SDK isolation, and the global feedback control.
- `storySelection.ts`: selected interaction and trigger lookup helpers.
- `storyConnection.ts`: canvas connection validation and created-trigger lookup.
- `storyTriggerInput.ts`: deletion planning for one trigger input link.
- `storyNavigation.ts`: interaction text occurrences, context-reference lookup,
  reusable context-list filtering/category projections, and compact reference
  counts consumed by context navigation for locations, characters, stat
  definitions, and item definitions.
- `components/InteractionInspector.tsx`: interaction content editing.
- `components/RichTextEditor.tsx` and `RichTextContent.tsx`: rich-body authoring
  and defense-in-depth sanitized rendering, including conditional body blocks
  projected from outgoing trigger availability.
- `components/TriggerInspector.tsx`: trigger condition and OR variant editing.
- `components/InteractionNode.tsx`, `TriggerNode.tsx`, and `TriggerEdge.tsx`:
  React Flow rendering surfaces.

Supporting reader modules keep session and presentation responsibilities outside
the route component:

- `features/story-player/useReaderSessionState.ts`: the single React owner of the
  current `ReaderProgressState`. Loads, restarts, step backs, and live Simulation
  Mode refreshes use shared deterministic replay; choices apply the same shared
  operations incrementally. Journey-derived values are not maintained as
  parallel React states.
- `features/story-player/useReaderProgressPersistence.ts`: the ordered,
  authenticated save/delete queue and its presentation status. Simulation Mode
  never calls it.
- `features/story-player/storyPlayerPresentation.ts`: translated condition
  summaries and first-failure labels. It consumes shared trigger diagnostics and
  does not evaluate narrative conditions independently.

The web app may map a story into React Flow nodes and edges, but it must not
store story semantics as React Flow data. React Flow data is a projection of the
domain model.

Vite loads the editor and reader as separate route chunks. The story library and
application shell therefore do not download React Flow until an author opens the
editor. Route imports remain literal so Vite can analyze and split them
deterministically. Edit and reader links preload their corresponding chunk on
hover or keyboard focus so explicit navigation intent hides most of the added
route-loading latency.

## React Flow Boundary

React Flow is currently a good fit for the editor because Paralleax needs custom
interaction nodes, graph edges, dragging, zooming, panning, and connection
gestures. These needs match React Flow's native primitives without forcing the
narrative model into a UI-specific shape.

Canvas panning uses the middle mouse button directly, or the primary button while
the Space key is held. Primary dragging remains available for authored graph
elements and does not pan an empty canvas by itself. This is web interaction
configuration only and is never persisted in the story model.

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

While an interaction is dragged, `StoryEditor` leaves the canonical Story and
the complete React Flow projection unchanged. A focused graph helper replaces
only connected trigger nodes whose positions actually change; the dragged
interaction and React Flow then keep their existing node identities. Automatic
markers use their transient geometric midpoint. A marker with a saved position
follows the displacement of that midpoint through a distance-sensitive elastic
ratio: nearby markers follow more closely, while deliberately distant markers
retain more of their manual placement. Connected edge handles are projected from
the same transient positions so their routing matches the canonical projection
before the mouse is released. Unrelated nodes and edges keep their existing
references. When the drag ends, the final interaction position and any adjusted
saved trigger positions are optimistically persisted; automatic placement is not
converted into authored trigger positions.

Graph decorations cross the same boundary as authored graph positions but do not
carry narrative meaning. The shared `GraphDecoration` union and pure update/delete
operations are framework-independent; the API persists them in the relational
`graph_decorations` table; and the web app projects them as React Flow nodes with
a negative layer beneath interactions and trigger markers. Frame dimensions are
saved when React Flow resizing ends. React Flow node data remains a projection,
not the persistence source of truth.

A warning sign would be changing trigger semantics only to match React Flow
constraints. In that case, the integration should be revisited before the UI
starts shaping the engine.

## Runtime Flows

### Loading a Story in the Editor

1. `StoryEditor` reads the story id from the route.
2. `useStoryEditorPersistence` calls the API client in `apps/web/src/api.ts`.
3. `StoriesController` delegates the request to `StoriesService`.
4. The facade delegates the authorized read to `StoryMetadataService`, which
   reads the story from `StoriesRepository`.
5. Before returning the story, the service normalizes missing interaction
   positions with `ensureStoryInteractionPositions`.
6. The web app stores the returned domain story in React state.
7. `storyGraph.ts` maps the story into React Flow nodes and edges for rendering.

The loaded state remains a domain `Story`. React Flow nodes and edges are
recomputed projections.

### Editing Story Content

1. The user edits an interaction title, body, or position in the editor.
2. `useStoryEditorPersistence` and its focused persistence collaborators apply
   an optimistic local update through shared story operations and adapters.
3. The hook sends the API request.
4. `StoriesService` delegates graph writes to `StoryGraphService`, which applies
   them through the shared `StoryMutationService` coordinator and repository.
5. The API returns the saved interaction and story mutation metadata.
6. The hook applies that entity to the current local story without replacing
   unrelated interactions or trigger structures.

Story-level and delete responses still use `mergeServerStory`. Entity-scoped
responses avoid carrying unrelated stale graph state in the first place. When
adding or changing editor persistence behavior, keep both entity application and
stale story merge regressions covered.

Every revisioned mutation also appends its shared reversible delta inside the
same repository transaction. `GET /stories/:storyId/history` returns recent
event summaries and the current author's undo/redo availability. Undo and redo
apply inverse events on the server. General changes return the complete already
validated authoritative Story. Position-only changes return the shared minimal
interaction/Trigger position patch plus revision metadata, which the editor
applies without replacing untouched entities. Entity-array delta construction
and application build id/placement indexes once, so a graph-wide position change
remains linear in the number of interactions and triggers. Recent entries and
undo/redo availability share one history read query after the repository's
access check. A position-only delta persists all existing interaction positions
and all existing Trigger positions through at most two JSON-backed bulk updates.
Undo and redo store the directly inverted source delta, avoiding both a complete
second diff and a second relational assembly. The editor ignores initial SSE
readiness and change events whose revision is already local, preventing a second
full Story reload after its own inverse. Graph projection indexes interactions by
id once per immutable Story object so trigger placement and edge routing remain
linear instead of repeatedly scanning every interaction. After a successful local
graph-position save, the editor retains a bounded pair of forward/inverse patches.
Undo and redo apply the matching patch to the parent-owned Story state before the
HTTP response, then reconcile it with the durable response. A different local or
remote revision invalidates this cache; a failed reversal rolls the projection
back and reloads the authoritative Story. The cache changes perceived latency
only and never replaces server-side event selection, precondition checks, or
persistence.

Interaction bodies are HTML. The API sanitizes them before persistence with a
strict element, attribute, protocol, and iframe-host allowlist. The web renderer
sanitizes the stored HTML again before using `dangerouslySetInnerHTML`.
Conditional blocks persist only a target interaction id in allowed data
attributes. `StoryPlayer` derives connection, availability, and diagnostics
from the current story graph instead of persisting duplicate rules.

### Editing Trigger Links

Trigger link behavior crosses the graph projection and the domain model, so it is
split deliberately:

- `storyGraph.ts` decides how triggers appear as trigger nodes and edges.
- `storyGraphLayout.ts` computes deterministic, cycle-tolerant vertical placement
  for interaction and grouped trigger-marker projections. It accepts either the
  complete graph or an explicit target list so future multi-selection can reuse
  the same operation without changing persistence semantics.
- `storyGraphCreationLayout.ts` projects a temporary interaction and its linked
  trigger, then asks the scoped layout for their creation position. Click-based
  root, child, parent, and Simulation Mode option creation use this projection;
  connection drops keep their explicit pointer-derived position.
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

Linked trigger markers are draggable. Their optional saved position belongs to
the authored graph projection, is persisted on each represented trigger variant,
and has no reader semantics. Triggers without a saved position retain the stable
automatic placement derived from their inputs and output interaction. Root
trigger markers remain attached to their interaction cards. Moving a connected
interaction can elastically adjust an existing saved marker position, using the
automatic midpoint movement as its reference without discarding the author's
manual offset.

Automatic layout persists only the interaction and linked-trigger positions it
changes. A complete layout includes disconnected components and reserves separate
layers for trigger markers; a scoped layout treats non-target graph nodes as fixed
anchors and obstacles. The web projection supplies each rendered interaction's
measured dimensions so variable-height cards remain separated; base card dimensions
are used until React Flow has measured a card. Decorations and comment pins are
excluded. Layer sweeps retain the ordering with the fewest measured edge crossings,
then use total normalized horizontal connection span as a deterministic tie-breaker.
An adjacent-transposition pass then tests local option inversions that the median
sweeps can miss, accepting only lexicographic improvements to those same metrics.
Within that order, a bottom-up horizontal pass aligns each trigger with its output
interaction and centers each parent interaction on the median of its successor
triggers. This preserves option bundles instead of centering every layer as an
independent compact row.
Edges sharing a vertical interval receive distinct routing lanes immediately above
or below their trigger row so horizontal segments do not pass through unrelated
trigger markers. Edges always
leave an interaction from its bottom-center routing handle and enter an interaction
through its top-center routing handle. Trigger markers are approached vertically
when their endpoints are on different rows.

When a normal canvas connection can either extend an existing trigger or create
a separate trigger, the focused Story Editor connection controller presents that
choice before calling the persistence actions. Dropping directly on a trigger
marker remains the explicit shortcut for extending that trigger.

Every editor mutation passes through the persistence hook's save tracker. The
toolbar exposes saving, saved, and failed states. A failed mutation leaves a
visible error with an action that reloads the persisted story, which also
recovers from optimistic local state that the server did not accept.

While that tracker reports a pending or failed save, `usePendingSaveGuard`
protects browser closing/reloading and internal anchor navigation with native
confirmation. Declarative `BrowserRouter` does not provide transactional
back/forward blocking; covering browser history requires the planned migration
to a React Router data router rather than fragile `popstate` reversal.

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

An administrator can request the local demo catalog from the story library. The
API enforces the administrator role before calling `createDemoStories` from
`packages/shared`, storing all five generated stories atomically through
`StoriesRepository`, and returning them to the web app. Hiding the action for
ordinary users is only an interface adaptation and is not the authorization
boundary.

The ordered catalog progresses from unconditional paths to visited-interaction
conditions, Story-owned variables, character stats with flat items, and a nested
body/equipment item tree with per-instance stats. Demo data stays deterministic
apart from generated globally unique ids. It is used for manual exploration and
as a stable source of regression-friendly sample structures.

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
and [Non-goals](non-goals.md). Locations, characters, typed stored variables,
and player save persistence are implemented context/runtime verticals; calculated
calculated variables and AI-driven runtime behavior remain outside the narrative model.

## Storage

Authored stories are persisted in PostgreSQL during the MVP.

Deployment, progressive loading, normalization signals, and operational growth
are documented separately in [Hosting and scale](hosting-and-scale.md).

The API accesses storage through `StoriesRepository` instead of coupling
application services to SQL calls. `StoriesService` only preserves the
controller-facing contract; focused services own application orchestration,
while shared story operations own trigger cleanup, normalization, reader rules,
and merge semantics.

The current PostgreSQL schema stores Story, Location, Character, reusable typed
Stat Definition (including its hourly change rate), owner-bound Stat Assignment,
Item Definition, story-local Item Instance, Interaction, Interaction Stat Effect, Trigger, trigger
input, and Graph Decoration state in
relational tables. Interaction-to-location, interaction-character, and stat
effect references use same-story composite foreign keys. Time-based stat changes
are calculated in the shared engine from interaction durations rather than
stored as runtime events. Ordered typed trigger conditions are
stored as JSONB on their owning trigger and their references are validated by
the application service. Story-local start time and interaction durations are
relational fields; temporal alternatives remain typed trigger-condition JSONB.
Stat definitions and assignments are relational and constrained to one Story.
Their JSONB values preserve the declared scalar type; owner-shape checks
distinguish Story, character, location, and item-definition assignments. Exact
item-instance stat targets and all other same-story references are validated before
transactional persistence. The writer compares the normalized assignment projection
before replacing those rows, so an unrelated interaction move or text edit does not
rewrite definitions, assignments, or effects. Character characteristics and item
stats are projections of this same stat model, not separate tables or runtime paths.
Reader-progress JSON contains the replayed non-item and per-instance stat values.
Context entity categories and image references use relational text columns.
Categories are organizational metadata only. Image binaries and their upload
lifecycle are not stored by the application.

`item_instances` is now the persistence source of truth for exact authored
items. A root belongs to a character or location; nested instances use typed
parent/child relationships in `item_instance_relationships`. The API projects
each root and its descendants through `Character.items` or `Location.items`.

The former `character_items` data remains archived as
`character_items_legacy` for parity and rollback inspection; repositories and
new writes no longer use it. Transfers are diffed globally by instance id so
moving a subtree between characters, locations, or item containers does not
delete its instances or cascade its exact effects. Reader state reconstructs
inventories and recursive relationships deterministically.
The repository reconstructs
the existing domain `Story`, so persistence normalization does not leak into the
shared engine or the HTTP contract. JSON remains a future versioned import/export
format rather than the database source of truth.

Review discussions use `story_comment_threads` and `story_comment_messages`.
Their JSONB anchor is validated against the current same-story target by the
application service; it is not inserted into `Story` or React Flow's canonical
data. The web editor projects canvas anchors as comment nodes and entity/text
anchors as badges and discussion context. An authorized signed-in player requests
the same resource but projects only threads on the current interaction; anonymous
public reading never requests or renders it.

Authenticated editor and authorized reader clients keep one Server-Sent Events
connection to the story's comment event endpoint. Successful thread mutations
publish a story-local invalidation containing only the thread id, mutation type,
and timestamp. Clients then reload the authorized HTTP projection, so SSE never
becomes a second source of comment data or a way around object-level authorization.
A heartbeat keeps the connection alive through the production reverse proxy, and
the browser reconnects automatically before reloading to recover events missed
while disconnected.

The current story and comment event brokers are process-local. A deployment with
several API replicas must add a shared fan-out transport, such as PostgreSQL
`LISTEN`/`NOTIFY`, before it can guarantee that clients connected to different
replicas receive the same invalidation immediately.

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

The web app uses plain CSS with shared custom properties for colors and elevation.
`apps/web/src/styles.css` owns the token foundation, base controls, application
shell, generic pages, and story-list rules. Feature styles live beside editor,
inspector, graph, review-comment, reader, and Simulation Mode code, while
`responsive.css` contains the final cross-feature media overrides.

`main.tsx` imports these sheets in their deliberate cascade order. Inspector
layout and inspector controls remain two files around the review-comment sheet
because those rule groups were separated in the original cascade; regrouping
them would be a presentation change rather than a module extraction.

Tailwind CSS is a candidate to evaluate once the UI surface justifies a
design-system decision. React Flow-specific styles, such as node handles and
trigger markers, remain in dedicated graph CSS because they target third-party
classes directly.

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
- GitHub Actions: lint, format, typecheck, coverage, build, PostgreSQL 17
  integration and recovery, Playwright, production dependency audit, and
  production image builds on pushes and pull requests.

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

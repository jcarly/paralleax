# MVP Test Scenarios

## Goal

Cover the critical MVP paths: Story, Interaction, Trigger, and Reader.

The first post-MVP location vertical also keeps these regressions covered:

- API: create and update a story-owned location.
- API: reject interaction and trigger location references from another story.
- Editor: list, create, and edit locations from the collapsible left panel.
- Editor: assign a location to an interaction and add a location condition.
- Reader: entering a localized interaction changes current location; an
  unlocalized interaction preserves it.
- Reader: location conditions affect availability and remain correct after
  stepping backward.

The character vertical keeps these regressions covered:

- API: create and update a story-owned character.
- API: reject interaction and trigger character references from another story.
- Editor: list, create, and edit characters from the context panel.
- Editor: assign several characters to an interaction and add a presence condition.
- Reader: present and absent conditions use only the current interaction's cast.

The character-stat vertical keeps these regressions covered:

- API: create and update a character-owned stat; reject foreign references and
  duplicate effects.
- Editor: author an initial value, interaction effect, and trigger comparison.
- Reader: apply `add` and `set` effects in journey order and reconstruct values
  on restart or backward navigation.

## Authentication and Ownership

- Authentication: registration creates a session that the current-user endpoint
  can restore.
- Authentication: invalid credentials are rejected and logout revokes the
  server-side session.
- Authentication: concurrent registration for one normalized email creates one
  account and returns one conflict.
- Authentication: access-code registration rejects missing and incorrect codes,
  accepts the configured code, and closed registration creates no account.
- Production security: safe requests remain available, while every mutative
  request without the exact configured `Origin` is rejected.
- Authentication: an expired session during a protected request returns the UI
  to sign-in with a clear explanation.
- Authentication: expired database sessions are purged during authentication
  activity.
- API ownership: unauthenticated story requests are rejected.
- API ownership: one account cannot list, read, mutate, or delete another
  account's stories.
- Shared/API: new stories default comments to editors; access updates accept only
  `editors` or `readers`, and the migration maps removed policies predictably.
- Web access: a commenter without edit permission is redirected from the graph
  to the player and cannot enable Simulation Mode or a direct starting interaction
  through query parameters.
- Reader comments: an authorized signed-in reader can create and reply to a
  thread on the current interaction, while graph-only and other-interaction
  threads are not projected.
- Browser: an author can register, create a story, sign out, sign back in, and
  find the story again.
- Story library: a failed initial list request shows a distinct recoverable
  error instead of the empty-library message; retry loads the catalogue, and a
  rapid double click during Story creation sends only one request. A temporary
  creation failure preserves the completed form, while a failed next-page load
  preserves existing cards and retries the same page without duplicates.
- Real-stack browser acceptance: with no intercepted Paralleax endpoint, an
  invited author can create a Story, location, character, Story variable,
  interactions and Triggers; persist context, an effect, and a condition; reload
  and sign in again; then traverse the conditioned path in Simulation Mode.
- Real-stack browser acceptance: interaction-content undo and redo update the
  canonical PostgreSQL Story and each result remains intact after a complete
  editor reload.
- Real-stack browser acceptance: taking the browser offline during an interaction
  edit exposes the failed-save state, refusing internal navigation keeps the
  author in the editor, canonical reload discards the unconfirmed value, and the
  next online edit persists across reload.
- Real-stack browser acceptance: reader progress resumes after reload, a named
  save survives reader restart, that save loads into Simulation and becomes its
  independent autosave, and the reset reader autosave remains empty.
- Real-stack browser acceptance: a reader autosave reconstructs a Story variable
  changed by hourly rate and explicit effect, a runtime-obtained item and its
  initial stat, Story time, the deterministic probability seed, option visibility,
  and a Trigger timer consistently after reload.
- Real-stack browser acceptance: an owner invites a second account as a reader,
  the account can read but has no edit or access-management action and a direct
  editor URL redirects to the player; after promotion to editor, that account can
  edit the Story, the owner's already-open editor receives the committed change
  through SSE, and both contexts retain it after reload.
- Real-stack browser acceptance: an invited reader comments on the current
  interaction; the author's open editor receives the thread live, opens it from
  the global list, selects the anchored graph interaction, replies, and resolves
  it; the reader receives both mutations live and finds the resolved discussion
  with both messages after reload.
- Real-stack browser acceptance: a two-scene repository ChoiceScript fixture is
  imported through the library, reports no compatibility warning, exposes both
  branches and its destination in the graph, and traverses one imported path in
  Simulation Mode.
- Real-stack browser acceptance: two repository QSP `.qsrc` locations are
  imported together through the library, expose their action and literal
  `ARGS[0]` destination in the graph, display the QSP coverage report, and
  traverse the imported action path in Simulation Mode.
- Scheduled real-stack browser acceptance: a generated QSP source imports 300
  linked locations into 599 interactions; the browser loads every interaction,
  finds the final one through search, edits and reloads it durably, navigates
  back to the entry through search, and traverses the first imported link in
  Simulation Mode while logging import and editor-load timings.
- Real-stack browser acceptance: one real Story metadata response is held after
  its API commit while a child-interaction creation completes first. Save status
  remains pending until both responses settle; the child then survives movement
  and reload, and its confirmed deletion remains absent after another reload.
- Real-stack browser acceptance: when an interaction creation commits but its
  HTTP response is lost, the editor exposes the uncertain save and canonical
  reload recovers exactly one persisted interaction rather than retrying it.
- Real-stack browser acceptance: concurrent deletion of an input Interaction and
  editing of its destination Trigger can finish in either order without leaving
  a persisted Trigger input that references the deleted Interaction.
- Browser navigation safety: while an authored save remains unresolved, a real
  Chromium `beforeunload` prompt lets the author cancel closing the page, retain
  the local edit, and finish the save normally.
- Reader recovery: a temporary runtime-bootstrap failure exposes a retry action
  that resumes loading without a browser refresh, and rejecting internal
  navigation during an unresolved autosave retains the current reader step until
  persistence finishes.

## Unit / Component Tests

- Rich content: format and persist interaction HTML, insert image/GIF and video
  URLs, and render the result in the reader.
- Rich content security: remove scripts, event handlers, unsafe URLs, and
  unapproved iframe hosts before persistence and display.
- Rich content security: reject SVG/SMIL URL execution, mutation-XSS markup,
  `javascript:` links, hostile iframe attributes, and deeply nested event-handler
  payloads while keeping sanitization idempotent.
- Staged projections: reject duplicated, missing, unknown, misnumbered, or
  revision-inconsistent context, interaction, Trigger, content, and option pages;
  persistent revision churn ends in a controlled error after bounded retries.
- Reader persistence: a pending autosave from a previous Story cannot delay a
  new Story save or update its status after the route changes.
- Editor persistence: a mutation result settling after a Story route change is
  discarded by the shared save lifecycle, and late projection progress or
  completion after unmount cannot update the removed editor.
- Reader interaction: activating one option twice before React rerenders commits
  only one journey transition and one autosave.
- Request streaming: an aborted binary upload rejects instead of returning a
  partial QSP payload to the importer.
- Adversarial generation: deterministic malformed QSP corpora never produce
  duplicate or dangling graph ids, and generated dense/cyclic graph layouts stay
  finite, deterministic, and collision-free.

- Context images: create and update image URLs for a location, character,
  reusable stat, and reusable item, then confirm previews and persisted values.
- Context images: clear an image URL and keep the entity valid without an image.

- Shared: story operations delete only the intended trigger and preserve valid inputs.
- Shared: stale server merges cannot restore locally deleted triggers.
- Shared/API/Web: administrator-only demo generation atomically creates five
  stories covering paths, visited conditions, Story variables, character stats
  with flat items, and nested body/equipment items with stats; ordinary users
  receive a forbidden response.
- API: database migrations create schema state and skip already-applied
  migrations.
- PostgreSQL migration: a legacy JSON story keeps its title, interactions,
  positions, triggers, inputs, conditions, timestamps, and disabled owner after
  the complete relational upgrade.
- PostgreSQL integration suites use a dedicated database, and migration tests
  restore its current schema so repository tests are independent of file order.
- PostgreSQL stress: round-trip a configurable 1,000-interaction story and
  enforce explicit budgets for initial save, complete load, and a common node
  mutation; emit the measured payload size and durations. CI executes this
  baseline weekly and when `run_scheduled_stress` is selected manually.
- Editor stress: project 2,000 linked interactions into React Flow interaction
  nodes, trigger nodes, and edges within the documented local budget.
- Migration policy: no migration may delete, truncate, or drop the stories table
  wholesale.
- API: repositories never execute migrations as part of an authentication or
  story request.
- API: liveness succeeds without querying PostgreSQL; readiness succeeds only
  when PostgreSQL is reachable and the latest schema migration is present.
- API: every request receives a safe request id and completion logs exclude
  query strings and request/response bodies.
- API: validation and domain errors use a stable status/code/message/request-id
  envelope; unexpected errors expose no internal message or stack.
- Web: API errors preserve their status, machine code, and request id while
  retaining the user-facing message.
- Operations: the explicit migration command completes before the API process
  starts in Docker Compose.
- Web build: the Vite manifest keeps Story Editor and Story Player outside the
  initial static chunk graph, reports their compressed incremental costs, and
  rejects route or size-budget regressions.
- API configuration: valid local defaults are typed, while malformed database
  URLs, origins, ports, SSL flags, registration modes, environments, and missing
  production endpoints fail fast.
- API/database: trigger inputs, outputs, and condition references cannot cross
  story boundaries; relational references cascade when their owner is deleted.
- API: story repository assembles, stores, reads, lists, and deletes relational
  story graphs.
- PostgreSQL integration: moving an interaction survives a fresh repository
  instance with its title and body intact.
- API/PostgreSQL: concurrent field-level updates preserve every updated field
  without replacing a monolithic story document.
- Shared: child placement selects a non-overlapping vertical output position.
- Shared: root and parent placement select non-overlapping graph positions.
- Editor: editing an interaction title keeps the page visible and updates the block.
- Editor: an in-flight mutation displays a saving state, a successful mutation
  displays a saved state, and a failed mutation displays its error with a reload
  recovery action.
- Editor: rapid title and content edits are persisted in order so reopening the
  story keeps both values.
- Editor: moving an interaction saves only the position without clearing the title or body.
- API: updating only an interaction position keeps its persisted title and body.
- API/Web: interaction POST and PATCH return and apply only the saved interaction
  plus story revision metadata.
- API/Web: trigger POST accepts initial inputs and conditions atomically; trigger
  POST and PATCH return and apply only the saved trigger plus story revision
  metadata.
- API: interaction PATCH requests reject null titles, null positions, and unknown
  fields, while a null body is persisted as an empty string.
- API/PostgreSQL: relational rows require story and interaction titles,
  interaction bodies, numeric positions, and valid trigger relationships.
- Editor: moving an interaction does not delete titles or content from other interactions.
- Editor graph mapping: interactions loaded without stored canvas positions use
  stable fallback coordinates instead of blanking the Story Canvas.
- Editor: creating an output from an interaction takes existing outputs into account and avoids overlap.
- Editor: hover action buttons create linked child and source interactions.
- Editor: interaction input and output controls also act as graph connection handles.
- Editor: dropping a source connection on empty canvas creates a linked child interaction at the drop position.
- Editor: dropping a target connection on empty canvas creates a source interaction linked to the target at the drop position.
- Editor: selecting an interaction without a trigger shows a controlled error state instead of a blank page.
- Editor: a trigger can accept several input interactions.
- Editor: trigger markers are visible on linked edges and on root interactions.
- Editor: vertical and horizontal trigger links use matching source and target
  sides so output arrows meet interactions with the correct orientation.
- Playwright: moving an interaction across its trigger reverses the output
  arrow's final horizontal direction and keeps it aligned with the target side.
- Editor/Reader: when an interaction is selected, the test action starts the
  reader from that interaction.
- Editor: selecting a linked trigger marker opens the trigger editor for that trigger.
- Editor: selecting a root trigger marker opens root trigger conditions without mixing them into interaction content editing.
- Editor: the inspector is hidden until an interaction or trigger is selected, and closing it or clicking the canvas background clears the selection.
- Editor: selecting a trigger marker visibly highlights that marker.
- Editor: deleting a trigger input link removes its edge and a later interaction
  move must not restore it from stale API data.
- Editor: deleting a trigger link and then creating another link must not restore the deleted link from stale API data.
- Editor: deleting one trigger input link removes only that input and keeps the
  trigger as a root trigger when no inputs remain.
- Editor/API: deleting the last trigger of an interaction turns it into a root
  trigger.
- Editor: interaction and trigger deletion can be cancelled from their
  confirmation prompt.
- Editor: creating a new canvas connection creates a dedicated trigger and does not mutate existing linked triggers.
- Editor: a connection to an interaction with an extendable trigger asks whether
  to add the source to that trigger or create a separate trigger.
- Editor: creating a connection or OR variant uses one trigger request rather
  than a dependent POST followed by PATCH.
- Editor: when connecting to an interaction with existing triggers, the author can choose whether to add the source as an input of an existing trigger or create a new trigger.
- Editor: dropping a connection on an existing trigger marker adds the source as
  another input of that trigger.
- Editor: dropping a connection on the empty interaction input handle creates a
  new trigger for that output interaction.
- Editor: adding a source to an existing trigger keeps the trigger conditions shared by all of its inputs.
- Editor/Reader: several triggers between the same interactions represent OR
  condition groups, show as one grouped route in the editor, and expose their
  OR variants in the trigger inspector.
- Editor: adding an OR condition group from the trigger inspector creates a new
  trigger with the same inputs behind the grouped visual route.
- Editor: the trigger inspector can delete one OR condition group or every OR
  group behind the selected visual route.
- Editor: deleting every OR group behind one visual route does not delete
  triggers that use a different input set for the same output interaction.
- Editor: root triggers cannot create OR condition groups because they are not
  linked visual routes.
- Editor: deleting a grouped visual trigger input link removes that input from
  every OR trigger variant behind the grouped route.
- Editor graph mapping: OR trigger variants are grouped only when they share the
  exact same input set, regardless of input order.
- Reader engine: an inputless trigger without conditions is available only at
  story start.
- Reader engine: an inputless trigger with conditions can become available during
  reading.
- Editor: deleting an interaction removes triggers that output to it.
- Editor: deleting an interaction removes it from trigger inputs and turns orphaned triggers into root triggers.
- Reader engine: an interaction without input is available at startup.
- Reader engine: an interaction with input is only available after the source interaction.
- Reader engine: visited / not visited conditions filter choices correctly.
- Editor/API: item definitions are created once at story level and can be edited.
- Editor/API: adding the same item definition several times to one character
  creates separate owned instances with distinct ids.
- API: a character cannot receive an item definition from another story.
- Editor/API: an interaction obtains or loses one exact item instance and
  rejects duplicate or cross-story item effects.
- Reader: repeated obtain/lose effects are idempotent, update the displayed
  inventory, and survive progress replay.
- Simulation: the editor test action opens Simulation Mode instead of the player
  reader.
- Simulation: interactions reachable by trigger input logic are listed,
  condition-blocked interactions are dimmed, and selecting one forces it for the
  current simulation journey.
- Simulation: condition-blocked interactions explain the first failed visited /
  not visited condition.
- Editor/reader: insert conditional body text for an outgoing interaction,
  preserve but hide it after disconnection, and show it only when its target
  trigger is available.
- Simulation: conditional body text remains visible when unavailable, is dimmed
  with a reason, and every option exposes its conditions on hover.
- Simulation: authors can step back to the previous interaction in the current
  simulation journey.
- Simulation: authors can edit the current interaction title and content inline
  without opening the graph inspector.
- Simulation: authors can add a root option before selecting any interaction,
  edit the new option title immediately, and see the action below existing
  options.
- Simulation: authors can add an option from the current interaction, edit the
  new option title immediately, and open that option from the simulation choices.
- Simulation: authors can add an option from a newly created option even if the
  parent option has no stored canvas position yet.
- Simulation: root and output options created from simulation receive graph
  positions compatible with returning to the Story Canvas.
- Character inspector: editing character fields, assigning reusable stats and
  items, updating stat values, unknown item definitions, and empty definition
  lists remain covered directly at the component boundary.
- Item definition inspector: local name and description edits persist on blur.
- Web API client: reusable stat definition creation and updates keep their
  expected HTTP methods, paths, and JSON bodies.
- Shared reader: interaction durations advance deterministic story-local time on
  every visit, including across dates and leap days.
- Shared reader: exact dates and inclusive ranges are alternatives, weekday and
  calendar filters combine, slot ends are exclusive, and reversed slots cross
  midnight.
- API/editor: story start date/time and non-negative integer interaction
  durations persist.
- API/editor: one trigger condition stores several dates, date ranges, weekdays,
  and time slots, while invalid dates, ranges, and equal slot bounds are rejected.
- Reader/simulation: the current story time is visible and temporal choices are
  evaluated after the selected interaction's duration.
- Shared/API: reader progress keeps repeated journey visits and derives current
  interaction, unique visits, date/time, location, and stats from replay.
- API/PostgreSQL: reader and Simulation Mode autosaves plus named manual saves
  round-trip independently per user and story, validate interaction/item
  references, and cascade with their owners.
- API authorization: any authenticated story reader can manage their manual
  saves, while Simulation Mode autosave access requires effective edit
  permission.
- Reader/Simulation: normal navigation resumes and serializes only the current
  mode's autosave, exposes save failures, and restart deletes only that autosave.
- Reader/Simulation: load either autosave or a named manual save into either
  authorized mode, replay it against the current story, then continue in the
  current mode's autosave without overwriting the loaded source slot.
- Item stats: a definition assigns reusable initial stats, two instances evolve
  independently, interaction effects target one exact instance/stat pair, and
  reader progress deterministically reconstructs their values.
- API/editor: reject foreign, unassigned, and duplicate item-stat references;
  persist definition assignments and interaction effects through reloads.
- Items: obtain any reusable definition without a character assignment, retain
  multiple runtime copies with their target character owner, lose one copy from
  that character, and evaluate owned/not-owned trigger conditions from replayed
  inventory.
- Character assignments: removing a stat or item updates the character and
  cleans effects or trigger conditions that reference the removed assignment.
- Reader layout: select the unique playable character before starting, render
  its stats and inventory on the left, and render encountered NPCs on the right.
- Simulation: hide outgoing options whose matching route fails a location
  condition while retaining other unavailable options for forced testing.
- Editor navigation: filter every context list with one search field, count
  title/body matches per interaction, and cycle through matching graph cards.
- Context references: cycle through interactions that reference a selected
  location, character, stat, or item; dim unrelated cards for location and
  character focus; retain graph zoom down to 5%.
- Item-instance migration: preserve the historical removal migration, then
  restore the constrained `owner_location_id` root placement with a new
  forward-only migration.
- Location item ownership: accept same-story location placement payloads,
  project complete location-rooted subtrees, and expose their tree in the
  location inspector.
- Item relationships: nest an exact instance under another with a typed relation
  and optional slot, reject self/ancestor cycles, reject deletion of a non-empty
  container, and transfer a complete subtree between characters without
  deleting ids or exact-effect references.

## Operations Regression Tests

- Deployment smoke checks require the public web marker, API liveness, and
  database/schema readiness, and refuse insecure non-local URLs.

- A PostgreSQL backup is written through a partial path and accepted only after
  `pg_restore --list` validates the archive.
- Backup and restore commands pass credentials through PostgreSQL environment
  variables rather than command arguments.
- Restoration requires a separate restore URL and an exact target database
  confirmation, and refuses PostgreSQL administrative databases.
- PostgreSQL CI restores a custom-format archive into a temporary database and
  compares migration, story, interaction, trigger, and user row counts with the
  source database.

## Playwright Functional Tests

Component and domain regressions supporting these flows also cover:

- WCAG A/AA Axe checks on the Story library, Story-creation and import dialogs,
  loaded editor, loaded reader, and reader-save dialog, without disabling
  individual accessibility rules;
- creation, import, connection, rich-text, and reader-save dialog focus
  containment and Escape dismissal, with restoration to the exact opening
  control when the workflow has one;
- Story creation and import remaining visible when Escape is pressed while
  their deliberately non-cancellable request is still pending;
- a failed initial reader load showing an actionable error and recovering on
  retry without remounting the route;
- character- or location-rooted and nested authored items retaining their definition, root
  owner, relationships, and initial item-stat values during replay;
- story listing performing one summary query without assembling complete story
  graphs.
- interaction bodies above 64,000 characters being rejected at the API boundary;
- raw HTTP request bodies above 128 KiB returning the stable
  `PAYLOAD_TOO_LARGE` error envelope;
- rich-text authoring showing character usage, a near-limit warning, and an
  over-limit save warning;
- the 61st story mutation in one minute being throttled while story reads remain
  available.
- pending or failed editor saves registering a browser-unload guard and asking
  for confirmation before internal link navigation, then removing both guards
  when saving completes.

- Reader: resume a saved journey and persist the next selected interaction.
- Editor: update the story-local starting date/time and an interaction duration.
- Editor: open a story, select an interaction, rename its title, and verify that the canvas and inspector stay visible.
- Editor: move an interaction and verify that title and content remain visible after saving.
- Editor: edit root trigger path conditions from the root trigger marker.
- Editor: create one reusable item definition and give a character two separate
  owned instances of it.
- Editor: create a root interaction and verify that it appears on the canvas.
- Editor: create a child interaction from the selected interaction, then verify the trigger input link and absence of overlap with other outputs.
- Editor: configure several inputs on the same trigger and verify that graph links share the trigger marker.
- Editor: click a trigger marker, edit its conditions, close the editor, and
  verify that the marker remains attached to the same trigger.
- Editor: delete an interaction and verify that invalid trigger links are removed from the canvas.
- Reader: open a story, choose a starting interaction, and verify the following choices.
- Reader: restart resets history and choices to the initial state.

## Current Priority

1. Title editing stability.
2. Interaction movement stability.
3. Automatic output placement.
4. Triggers with several inputs.
5. Connection UX for choosing existing trigger inputs or new triggers.
6. Contextual inputless triggers.
7. OR condition groups through several triggers between the same interactions.
8. Trigger editing from graph markers.
9. Precise trigger link creation and deletion.
10. Direct graph creation from connection gestures.
11. Trigger deletion and stale-save stability.
12. Trigger cleanup when deleting interactions.
13. Reader non-regression.

- Stat replay prorates positive and negative hourly definition changes over
  interaction durations and applies them before explicit stat effects.

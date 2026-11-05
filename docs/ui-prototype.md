# Paralleax UI prototype

## Purpose and boundary

The prototype is a local UX test space for Paralleax's current product surfaces. It uses
fictional scenarios and client-side state only. It does not require authentication, call the
API, or save changes to Stories. It is not a second editor or a source of production behavior.

Production code and its tests define implemented behavior. The prototype imitates only the
interactions needed to explore presentation and navigation; the narrative engine, persistence,
permissions, collaboration, and runtime evaluation remain out of scope.

## Initial gap audit — 2026-11-05

The audit compared the prototype with `dev` at `cb5908ce9e75abac4b60469c9887f15a355ca5a9`,
including current-scope, design-system, reader, trigger, editor, and quality documentation; the
web's shared styles and design-system catalogue; the Story library, editor, inspectors, graph,
comments, and player; and their focused component and Playwright tests. Production code and tests
were treated as the behavior source of truth where documents were stale or incomplete.

| Feature or component                | Production behavior                                                                                                                                                                                                                                             | Prototype before this update                                                                                                                                                                    | Gap                                                                                                                     | Priority | Proposed synchronization                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Library cards                       | Story summaries expose capability-aware actions; cards should favor a clear open action. No play duration is inferred from Interaction count.                                                                                                                   | Static cards draw abstract graph covers and foreground Interaction/Character counts; actions and delete are inert.                                                                              | Visual and action hierarchy diverged; structure count looked reader-facing; no duration yet.                            | P1       | Remove decorative covers and prominent structural counts; use one clear open action, accessible local actions, and a visible delete confirmation. Keep duration absent.                    |
| Authentication                      | Standalone login and registration routes keep the global language/navigation and recovery/verification states. A modal remains an exploration only.                                                                                                             | Standalone local form, but a large graph showcase dominates desktop; recovery action is inert.                                                                                                  | Excess visual weight and incomplete local flow.                                                                         | P1       | Keep standalone routes and clean shared header; remove the showcase; make local recovery/navigation state reachable without implying a modal or making API calls.                          |
| Graph and triggers                  | React Flow projects Interactions and visible root/linked Trigger markers. One Trigger owns AND conditions grouped by OR; multiple inputs share that Trigger. Probability, timers, selections, context actions, decorations, and keyboard paths are represented. | Small static graph; connecting two Interactions creates a new marker, but connecting to an existing marker is rejected. Trigger copy incorrectly describes each OR group as a separate Trigger. | Main graph paths and Trigger semantics are incomplete or misleading.                                                    | P1       | Make add/connect/select simulated actions coherent; preserve one Trigger across OR groups and multiple sources; show concise timing/probability cues and representative selection actions. |
| Groups and context                  | The left navigation contains searchable Interactions, nested Groups, Characters, Locations, Variables, and Items. Groups are organizational only and have no reader semantics.                                                                                  | Characters, Locations, Stats, and Items are static lists; Groups and hierarchical organization are absent.                                                                                      | Missing current organization model and entity-to-graph navigation.                                                      | P1       | Add a small nested Group tree and selection/highlight behavior to representative scenarios, alongside local entity selection.                                                              |
| Inspector                           | Interaction content, Context and timing, and Effects are separate; Context and timing and Effects start collapsed. Trigger conditions edit from the selected marker. Selection and comments share the inspector surface.                                        | One very long static form opens every disclosure; effects and media actions are decorative; no comment surface.                                                                                 | Density, action-state, and selection behavior diverge.                                                                  | P1       | Keep secondary sections folded; make local selection, close, and disclosure actions work; show a local review-thread panel on the inspector surface.                                       |
| Content authoring                   | Tiptap is the only content authoring mode. Empty content shows **Add content**; existing content stays readable/editable and reveals the contextual toolbar on focus. Conditional blocks and references have structured editor affordances.                     | Static textarea is always present; no empty-content action, focused toolbar, conditional block, or reference affordance.                                                                        | The editor does not resemble the current Tiptap journey and could imply ordinary textarea editing.                      | P1       | Simulate the empty/add, focused-toolbar, conditional-frame, and reference journeys locally. Do not show source/code mode.                                                                  |
| Reader and Simulation               | The Reader omits the technical Interaction title and choice-condition diagnostics. Simulation shares the Player presentation and adds author diagnostics, unavailable choices, force, and authored edit actions.                                                | Only a Simulation view exists; the Interaction title, condition text, stats, inventory, and diagnostic log always appear.                                                                       | Reader and author tools are not distinguished; choice diagnostics leak into the player presentation.                    | P1       | Share one responsive Player shell with explicit Reader and Simulation modes. Hide technical diagnostics in Reader; retain conditional and forced-unavailable scenarios in Simulation.      |
| Demo scenarios and reset            | Production Stories are real and persistent; the prototype must use representative fictional data and be safely resettable.                                                                                                                                      | The library has four static card labels, but every card opens the same graph; graph/player state has no reset beyond Simulation restart.                                                        | Cards do not represent distinct scenarios; state reset coverage is partial.                                             | P1       | Provide linear, branching, stateful, and multi-Group scenarios backed by separate fixtures; expose a reset-to-fixtures action.                                                             |
| Design tokens and shared primitives | Semantic colors, type, form density, buttons, focus, and surfaces are centralized in `styles.css` and `formFields.css`. Prototype-local tokens are outside the older system decision.                                                                           | Both prototype stylesheets define a parallel `--pp-*` palette, local form/button systems, and Stylelint exemptions for colors.                                                                  | The explicit task supersedes that historical prototype exception; the current implementation can drift from production. | P1       | Use production tokens and shared form/action classes; remove color-specific prototype lint exemptions and keep only scoped layout/presentation CSS.                                        |
| Responsive layout and verification  | Reader/Simulation share responsive workspace behavior; the editor is desktop-first. Tests cover graph, library, editor, reader, and design-system states.                                                                                                       | Prototype tests cover portal navigation and a few library/design-system details; no browser-render comparison exists.                                                                           | Core prototype behavior and narrow/intermediate rendering lack evidence.                                                | P1       | Add focused interaction and responsive browser coverage, then inspect desktop and intermediate browser renders. Record only what was actually inspected.                                   |

### Synchronization decisions

- Keep the prototype separate from real API, account, Story, and reader-progress state.
- Use fixtures to represent current capabilities, not to recreate production domain operations.
- Reuse production tokens, field classes, and action variants wherever those simple primitives fit.
- Keep the historical Figma prototype as an exploration reference; it is not a current specification.
- Do not implement the proposed narrative source/code mode, a sign-in modal, new semantic annotations, or an estimated play duration.

## Access and local run

Routes:

- Story library: `http://localhost:5173/prototype/paralleax/stories`
- Sign in: `http://localhost:5173/prototype/paralleax/login`
- Registration: `http://localhost:5173/prototype/paralleax/register`
- Story editor and graph: `http://localhost:5173/prototype/paralleax`
- Design-system reference: `http://localhost:5173/prototype/paralleax/design-system`

From the repository root, start only the web workspace:

```sh
npm run dev -w @paralleax/web
```

## Current prototype contract

The prototype is reachable without a session. It uses fictional, in-memory fixtures and local
React state. Refreshing returns the scenario to its initial state; the explicit reset action also
restores the fixture set and sidebar defaults. No prototype action invokes `api`, browser storage,
or the Story persistence layer.

### Fictional scenarios

| Scenario          | Focus                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| A Quiet Line      | Mostly linear Interaction sequence with a root Trigger.                             |
| Harbor Signals    | Several branches and a shared Trigger with more than one input.                     |
| The Archive Below | Typed values, OR condition groups, effects, probability, and timer cues.            |
| Ashfall           | Multiple nested Groups, several Characters and Locations, and cross-Group branches. |

### Simulated journeys

- Navigate between the library, login, registration, editor, and design reference.
- Search/filter/sort the fictional library, create a local Story card, delete it after confirmation,
  and open any one of the four scenario fixtures.
- Select an Interaction, Trigger, Group, Character, Location, Stat, or Item; close/reopen the
  inspector; select multiple graph elements and use the local group action.
- Add an Interaction, connect it to a new Trigger or an existing Trigger, add/remove AND
  conditions and OR groups, and inspect probability/timer cues. A new input connected to an
  existing Trigger updates that Trigger's source list and input count in the local Inspector.
- Open **Add content** for an empty Interaction, edit existing prose, and try the simulated
  contextual toolbar, conditional frame, and reference controls.
- Open local review comments anchored to an Interaction or a text sample.
- Switch between Reader and Simulation. Reader choices omit technical condition summaries;
  Simulation exposes diagnostic state, unavailable choices, and the force control.
- Reset the demo to its original fixture data.

### Intentional differences from production

- Graph mutation, grouping, content editing, Reader progression, and review comments are local
  demonstrations. They do not run the Paralleax engine and do not enforce every production
  validation rule.
- Tiptap's toolbar and structured blocks are represented with lightweight local controls. There
  is no author-facing source mode, code editor, or new content grammar.
- Authentication never submits credentials. Registration, sign-in, and password recovery are
  local presentation states only.
- The Reader/Simulation controls exercise a short sample journey; they are not a Reader save,
  runtime checkpoint, or production Simulation session.
- Production-only behavior such as permissions, realtime collaboration, comments persistence,
  history, import, save recovery, and database-backed state is not represented.
- Comments stand in for the implemented anchored review-thread system. Free-standing semantic
  annotations are not a current production feature and are not introduced here.

## Remaining exploration questions

- Which graph information belongs on an Interaction card before authors need the Inspector?
- How should the Groups tree and context lists share limited horizontal space on a medium viewport?
- Which Trigger cues help authors compare probability and timer behavior without making the canvas
  noisy?
- Which review-thread affordances are discoverable from graph selection and selected prose?
- Which scenario is the best starting point for first-time author tests?

## Verification record

- `npm test` passed: operations (64), shared (222), API (372), and web (695). The API suite skipped
  27 tests by its existing configuration.
- `npm run lint`, `npm run typecheck`, and `npm run build` passed, including bundle budget checks.
- The focused Playwright suite passed (3 tests) in Chromium. It covers local routes, Trigger
  source updates, Groups, comments, Reader/Simulation, empty content/reset, no `/api` requests,
  and graph-node fit without horizontal overflow at both checked sizes.
- Inspected library and editor screenshots at 1440 × 960 and the editor at 1024 × 768. The cards
  have no decorative covers or story metrics; the graph and inspector remain within the viewport.

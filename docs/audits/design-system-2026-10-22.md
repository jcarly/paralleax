# Design System Audit — 2026-10-22

## Snapshot and scope

This is a historical record of the Paralleax design-system audit performed on
branch `dev` at commit `9f3f19531c4cdd5f2f10c5efcb4ff45b254c0e62`. Findings below
describe that revision, even when later work resolves one. Resolution links belong
in the backlog; do not rewrite this snapshot to make a finding disappear.

The audit covered CSS foundations and feature styles, design-system documentation
and catalogue, reusable React components, editor and inspectors, the React Flow
graph, reader and Simulation Mode, test coverage, and the current CI/toolchain.
The work was read-only: no tracked repository files were changed during the audit.

## Method and limits

- Read `docs/vision.md`, `docs/current-scope.md`, `docs/domain-model.md`,
  `docs/domain-invariants.md`, `docs/architecture.md`, `docs/reader-semantics.md`,
  `docs/triggers.md`, relevant accepted ADRs, `docs/ai-workflow.md`, the design and
  UX documents, roadmap/backlog, package configuration, CI and owning source/tests.
- Inspected branch, commit, working tree and diffs; the audited tree was clean.
- Inventoried selectors, CSS declarations, custom-property references, reusable
  components, their call sites, and existing tests. Counts are static counts, not
  unique colors or a measure of visual severity.
- Ran the focused web Vitest suites for the catalogue, modal keyboard helper,
  entity-name input, image field and graph trigger node/edge: 15 tests passed.
- Ran Playwright `accessibility.spec.ts` and `layout.scrolling.spec.ts`: 10 tests
  passed. Accessibility uses axe WCAG A/AA tags.
- Reproduced selected defects in a local browser against mocked API routes: root
  trigger rotation changed on hover; the reader save overlay sat below the app
  header; tooltip Escape did not dismiss it; rich-text removal presentation
  differed between editor and direct Simulation route; and the simulation badge
  had no resolved accent-soft token.
- No backend data or persisted story was changed. No full build, full test suite,
  production browser matrix, screen-reader session, real device test, forced-color
  session, or human visual approval was performed. The probes do not establish
  every possible route or browser combination.

### Static CSS measurements and toolchain

At the audited revision, the 14 CSS files totalled approximately 11,257 lines,
1,760 rules and 6,455 declarations, with about 560 raw color declarations and 55
`!important` declarations. Excluding the two exploratory prototype stylesheets,
the 12 production CSS files accounted for about 7,600 lines, 254 raw color
declarations and 22 `!important` declarations. `ProductPages.css` contained 99
raw colors and `storySimulation.css` 96; together these were about 77% of the
production raw-color declarations. These are declaration counts, not unique color
values, and do not count named colors as raw hex/rgb/hsl values.

The web app used React 19, React Flow 12.11, dnd-kit 6.3, plain CSS, Node 24 and
ESLint 10.7. There was no Stylelint dependency or JSX accessibility lint plugin.
The evaluated `jsx-a11y` package peer range stopped at ESLint 9, so installing it
without a compatible release would conflict with the existing toolchain. CI
already runs lint, formatting, typecheck, coverage, build, bundle checks, e2e and
real-stack acceptance. Web coverage thresholds were 80% lines/statements/functions
and 90% branches; do not add whole-suite thresholds or blind CSS linting based on
this audit alone.

Production stylesheet ownership and notable rules at the snapshot:

- `apps/web/src/styles.css` defines about 40 root color/elevation properties but
  no spacing/type/z-index scale. Its global button hover moves all buttons by
  `-1px`; focus uses a translucent halo. `.secondary` has a blue literal; `.ghost`
  follows `.danger` and can reset its fill. Tooltip and app-header rules are also
  global.
- `apps/web/src/pages/ProductPages.css` is about 2,553 lines, with 99 raw color
  declarations and 13 `!important`s. It defines product tokens only below
  `.product-page`, plus header, modal and catalogue styles.
- `apps/web/src/features/story-player/storySimulation.css` is about 1,031 lines,
  with 96 raw color declarations. It contains broad player/reader rules, tiny
  prose/helper sizes, and a reference to undefined `--color-surface-muted`.
- `apps/web/src/features/story-player/storyPlayer.css` defines reader cards at
  16px radius and 2.5rem padding; final cascade from simulation CSS reduced both
  to zero in the normal reader.
- `apps/web/src/features/story-editor/editor.css` owns canvas layout, dialogs and
  DND surfaces; its dialog backdrop layer was 20. `inspector-controls.css` had
  duplicated condition/effect picker and tooltip blocks, and 12px field labels
  from which inputs inherited their font size.
- `apps/web/src/features/story-editor/graph/storyGraph.css` owns graph geometry,
  trigger rotation, negative-z decorations and graph removal controls. Its marker
  focus/hover rules did not neutralize the global transform.
- `apps/web/src/responsive.css` moves panels to overlays at narrow widths without
  moving the graph; preserve this behavior.
- Stylesheet load order in `apps/web/src/main.tsx`, `StoryEditor.tsx` and feature
  imports is part of the cascade and must be checked when moving rules.

Static undefined-property references included `--color-text-muted`, `--border`,
`--surface-soft`, `--muted`, `--color-surface-muted`, `--product-forest`,
`--product-serif`, `--product-line-strong` and `--product-surface` (the last had a
white fallback). `--choice-timer-ratio` and `--choice-timer-duration` were
intentionally supplied dynamically by React and are not undefined-token defects.
Story-authored decoration colors are data and must not be forced into UI tokens.

## Implementation inventory at the audited revision

This inventory records actual reusable controls and interaction families, not a
claim that each is already a canonical design-system component.

| Area                   | Components / variants / states observed                                                                                                                                                              | Main files                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base and product shell | Native buttons styled as primary, secondary, danger and ghost; disabled, hover and focus-visible; product primary/secondary/ghost actions; product header, account action, language switcher, badges | `apps/web/src/styles.css`, `apps/web/src/pages/ProductPages.css`                                                                                                                                                             |
| Product pages          | Auth, story library/cards, admin user management, account action dialog, settings, import, empty/loading/error states                                                                                | `apps/web/src/pages/AuthPage.tsx`, `StoryList.tsx`, `AdminUsersPage.tsx`, `AccountDialog.tsx`, `apps/web/src/pages/ProductPages.css`, `apps/web/src/features/story-import/StoryImportDialog.tsx`                             |
| Canvas actions         | Tool buttons, icon action, context menu actions, removal row button                                                                                                                                  | `apps/web/src/features/story-editor/StoryCanvasToolbar.tsx`, `ContextMenu.tsx`, `RemoveRowButton.tsx`, `apps/web/src/features/story-editor/editor.css`                                                                       |
| Graph                  | Interaction node, root Trigger marker, linked Trigger marker, Trigger edge, selection/hover/focus, link-delete control, creation handles, decorations and comment pins                               | `apps/web/src/features/story-editor/graph/InteractionNode.tsx`, `TriggerNode.tsx`, `TriggerEdge.tsx`, `GraphDecorationNode.tsx`, `CommentPinNode.tsx`, `storyGraph.css`                                                      |
| Inspector fields       | Entity name input (editing/saving/error), category field, typed stat value (number/boolean/string), help tooltip, image URL field/dialog, variable picker, expression editor                         | `apps/web/src/components/EntityNameInput.tsx`, `CategoryField.tsx`, `StatValueField.tsx`, `FieldHelpTooltip.tsx`, `ImageUrlField.tsx`, `ImageUrlDialog.tsx`, `VariablePicker.tsx`, `ExpressionEditor.tsx`                    |
| Rich text              | RichTextEditor and read-only RichTextContent; interaction-link, stat-value and conditional-text tokens; edit/remove/drag/selected states; shared link, variable and condition dialogs                | `apps/web/src/components/RichTextEditor.tsx`, `RichTextContent.tsx`, `richTextEditorTokens.ts`, `RichTextEditorDialog.tsx`, `RichTextInteractionLinkDialog.tsx`, `RichTextVariableDialog.tsx`, `RichTextConditionDialog.tsx` |
| Conditions and effects | Trigger condition fields and add-condition control; OR group and AND-condition rows; effect rows and add-effect control; read/edit presentation                                                      | `apps/web/src/features/story-editor/inspectors/TriggerConditionFields.tsx`, `AddConditionControl.tsx`, `InteractionEffectFields.tsx`, `AddEffectControl.tsx`, `inspector-controls.css`                                       |
| Inspector shells       | Interaction, Trigger, character, location, item definition, stat definition and selection inspectors; comments and history panels                                                                    | `apps/web/src/features/story-editor/inspectors/`, `apps/web/src/features/comments/`, `apps/web/src/features/story-editor/StoryHistoryPanel.tsx`                                                                              |
| Lists and groups       | Context entity rows, comment badges, categorized context list; nested searchable Groups tree, drop zones, drag overlay and keyboard operations                                                       | `apps/web/src/features/story-editor/StoryContextList.tsx`, `StoryGroupsPanel.tsx`, `StoryGroupRow.tsx`, `GroupDropZone.tsx`, `editor.css`                                                                                    |
| Reader and simulation  | Story player, reader choices, timer bar, save dialog, simulation editing controls, save feedback; normal reader and editor-only Simulation Mode                                                      | `apps/web/src/pages/StoryPlayer.tsx`, `apps/web/src/features/story-player/ChoiceTimerBar.tsx`, `ReaderSaveDialog.tsx`, `storyPlayer.css`, `storySimulation.css`                                                              |
| Review/comments        | Discussion card variants (rail/post-it), draft, pin, global panel, contextual rail, inspector field/slot anchors                                                                                     | `apps/web/src/features/comments/CommentDiscussionCard.tsx`, `CommentDraftCard.tsx`, `CommentPinNode.tsx`, `StoryCommentsPanel.tsx`, `ContextualCommentsRail.tsx`, `InspectorCommentField.tsx`, `InspectorCommentSlot.tsx`    |
| Design catalogue       | Hand-written palette swatches, typography examples, component state examples and graph marker illustration; not wired as a live rendering of all production components                               | `apps/web/src/pages/DesignSystemPage.tsx`, `apps/web/src/pages/ProductPages.css`; reachable prototype catalogue is separately implemented in `ParalleaxPrototypePages.tsx`                                                   |

## Findings D1–D16

The `D` identifiers are stable audit references. The corresponding backlog task is
the durable work queue; its resolution field must be updated with the correcting
commit hash when the work lands.

| ID  | Finding and evidence at `9f3f195`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Backlog reference / expected resolution trace                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D1  | **Modal layering and isolation.** `apps/web/src/features/story-editor/editor.css` placed the shared reader save backdrop at `z-index: 20`, below the authenticated header at `z-index: 30` in `apps/web/src/pages/ProductPages.css`; `storySimulation.css` supplied the dialog styles. Browser hit-testing at the header showed the account button above the backdrop and clickable. The existing modal key handler traps Tab at the dialog edges, but an in-flow overlay remains vulnerable to unrelated stacking contexts.                                                                                                                                                                                                                                                                                                 | `DS-01`; record the fixing commit in the task.                                                            |
| D2  | **Global hover changes graph marker geometry.** `apps/web/src/styles.css` translated every button by `-1px` on hover. Root and linked Trigger markers rotate by `45deg` in `apps/web/src/features/story-editor/graph/storyGraph.css`; browser computed transform changed from the rotation matrix at rest to a translation matrix on hover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `DS-02`; include graph regression commit in the task trace.                                               |
| D3  | **Rich-text remove controls depend on graph CSS.** Token controls emitted `trigger-link-delete` in `apps/web/src/components/richTextEditorTokens.ts` and `RichTextEditor.tsx`; placement, danger color, shape, opacity and sizing were owned by `.trigger-link-delete` in `storyGraph.css`. In direct Simulation navigation the class existed without the graph stylesheet, yielding static green default-button styling; editor navigation loaded graph CSS and yielded the intended absolute red control. The same coupling affected conditional-text removal.                                                                                                                                                                                                                                                             | `DS-03`; record component/CSS regression commit in the task.                                              |
| D4  | **Product tokens escape their scope.** Product palette custom properties were scoped to `.product-page` in `apps/web/src/pages/ProductPages.css`; the accent badge is used by Simulation Mode in `apps/web/src/pages/StoryPlayer.tsx` outside that scope. `storySettings.css` also referenced `--product-*` without a `.product-page` ancestor. The accent-soft lookup was empty in the browser.                                                                                                                                                                                                                                                                                                                                                                                                                             | `DS-04`; record the semantic-token correction commit in the task.                                         |
| D5  | **Reader and Simulation styles leak across modes.** `apps/web/src/features/story-player/storySimulation.css` contains broad `.player-page`, `.player-card`, choice and reader selectors, loaded alongside `storyPlayer.css`. Computed normal-reader card styling at the audited revision was radius `0` and padding `0`, overriding the base reader card radius and padding from `storyPlayer.css`. The simulation stylesheet also references `--color-surface-muted`, absent from the shared root tokens.                                                                                                                                                                                                                                                                                                                   | `DS-05`; preserve the audited visual result while separating ownership.                                   |
| D6  | **Tooltip Escape behavior is incomplete.** `FieldHelpTooltip` in `apps/web/src/components/FieldHelpTooltip.tsx` showed content on focus but its visible state remained after Escape.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `DS-06`; link the focused keyboard regression and fix commit.                                             |
| D7  | **Tooltip hover content is not reachable.** The tooltip styling in `apps/web/src/styles.css` used `pointer-events: none`; moving the pointer from its trigger into the tooltip dismisses it. Existing trigger mouse-leave behavior also prevents interacting with the content. Keyboard focus reveals it, but does not compensate for pointer users.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `DS-06`; acceptance must cover hover and keyboard focus without hover-only essential instructions.        |
| D8  | **Contrast and focus contrast need targeted correction.** Static contrast calculations found white on the trigger amber `#b78335` at about 3.33:1 for small text, place green `#5faf72` on white at about 2.67:1, placeholder `#a6aaa2` on white at about 2.36:1, simulation help `#8d806a` on `#fffaf0` at about 3.72:1, and the translucent focus halo at about 1.4:1 on white. Muted `#666b63` on white measured about 5.46:1 and primary green `#2f6250` with white about 7.04:1. Disabled controls and non-text indicators need their applicable criteria evaluated separately.                                                                                                                                                                                                                                         | `DS-07`; human-approved semantic colors and WCAG checks before broad palette edits.                       |
| D9  | **Typography is inconsistent and relies on local fallbacks.** Root text uses a Geist/system stack in `styles.css`; `.product-page` switches to Inter/system in `ProductPages.css`; reader prose uses Georgia in `storySimulation.css`. No Geist/Inter/Newsreader font asset or `@font-face` was found in the web app, so exact faces depend on user-installed fonts. Inspector labels are `.78rem` (12.48px) and inputs inherit that size; catalog claims do not consistently match rendered styles.                                                                                                                                                                                                                                                                                                                         | `DS-08`; defer type-family/scale choice to human review; keep current control sizes until approved.       |
| D10 | **The design catalogue is not a reliable source of truth.** `DesignSystemPage.tsx` is not the route served at `/prototype/paralleax/design-system` (that is `PrototypeDesignSystem` in `ParalleaxPrototypePages.tsx`). The non-prototype page duplicates literal swatch names/hex values and manually describes states. Typography labels claim 48/24/14px examples while CSS renders a shared 1.1rem paragraph and 2rem heading. The error example does not demonstrate `aria-invalid` or error association, and the trigger illustration is filled while the text describes an outline. Its test checks headings/marker/link, not parity with production.                                                                                                                                                                  | `DS-11`; update only after component/token migrations create approved sources.                            |
| D11 | **Design documentation is partly stale or contradictory.** `docs/design-system.md` describes blue selection while production uses green primary tokens; it presents future character/place/group colors that already exist; its 8-point spacing direction differs from actual 4px and rem values; Lucide is preferred but production uses hand-drawn SVG/glyphs and no Lucide dependency. `docs/ui-direction.md` calls the graph the source of truth, contrary to domain invariants. `docs/story-canvas.md` describes OR-condition creation as another Trigger, contrary to ADR-025 and current Trigger condition groups. `docs/design-principles.md` still labels implemented characters/places/variables/Groups as post-MVP. Keep historical statements where appropriate; reconcile only through approved semantic edits. | `DS-09`; update documentation alongside approved implementation decisions; no history deletion.           |
| D12 | **Repeated CSS patterns have drift risk.** Identical or near-identical blocks were found: comment status dot in `comments.css` and `editor.css`; `sr-only` in `FeedbackButton.css` and `ProductPages.css`; editor location header, Trigger variant header and effect header; root/linked marker selected state; inspector cancel/delete rows; condition/effect picker and header rows; and duplicated tooltip blocks in `inspector-controls.css`. Some are legitimate feature variants, so consolidate only when semantics and lifecycle match.                                                                                                                                                                                                                                                                              | `DS-10`; consolidate during owner-specific component migration, not as a global formatting pass.          |
| D13 | **CSS ownership and cascade are difficult to reason about.** Twelve production CSS files (excluding prototype styles) total about 7,600 lines; root imports establish ordering across shared, editor, inspector, comments, reader and simulation styles. The earlier split deliberately preserved cascade order, but global reader selectors, generic button selectors and cross-feature class names still create hidden dependencies. Production pages and feature styles both carry repeated direct colors.                                                                                                                                                                                                                                                                                                                | `DS-10`; extend the existing stylesheet split incrementally with explicit owners and import-order checks. |
| D14 | **Some state rules conflict or encode meaning inconsistently.** Global action states overlap: `.danger` followed by `.ghost` can neutralize a ghost-danger combination; secondary uses literal blue `#c9d9ff` despite the green primary system; generic hover changes geometry; and badge/accent styles expect product-scope variables. These are specific cascade inconsistencies, not approval to redesign all action colors.                                                                                                                                                                                                                                                                                                                                                                                              | `DS-01` for direct P0 causes; remaining state consistency maps to `DS-12`.                                |
| D15 | **Accessibility and interaction coverage is incomplete outside current happy paths.** Existing axe coverage and scrolling tests passed, but the catalogue did not verify production state parity; no complete keyboard/focus audit covers every authoring, import, save, access and comment dialog. Small graph controls are 18–20px before canvas zoom; their conformance cannot be inferred without evaluating spacing/equivalent-target exceptions and actual zoom/use. Contrast/focus concerns are recorded in D8.                                                                                                                                                                                                                                                                                                       | `DS-07`, `DS-14`, and existing backlog keyboard audit; do not duplicate that existing task.               |
| D16 | **Graph-specific behavior must remain outside generic UI abstractions.** React Flow nodes and edges are projections; marker rotation, node/edge hit areas, handles, `nodrag`/`nopan`, selection transforms, negative-z decoration layers, drag/drop thresholds, keyboard alternatives, and responsive fixed geometry are coupled to graph interactions. Global selectors and generic button behavior can silently break these interactions. Existing tests cover graph geometry, trigger paths, DND and performance, but the audit did not run the full browser matrix or manually validate zoom/device behavior.                                                                                                                                                                                                            | `DS-13`, `DS-14`; acceptance preserves existing React Flow projection, DND behavior and latency budgets.  |

## Accessibility and contrast details

The audit distinguished text contrast, non-text/focus contrast, disabled states and
target size rather than applying one threshold to every element. The calculations
above are screening evidence, not a conformance verdict for every component state.
Important gaps are keyboard dismissal and hover persistence for tooltips (D6–D7),
modal stacking/isolation (D1), focus indication (D8), and missing manual coverage
for all dialog families (D15). The existing automated axe suite passed its tested
routes; it does not prove keyboard usability, zoom behavior, screen-reader
announcements, forced colors, or every runtime state.

## Documentation alignment and product boundaries

Use `docs/domain-invariants.md`, accepted ADRs, and current-scope docs for product
semantics. In particular:

- Graph data remains a projection; React Flow cannot become canonical story state.
- Trigger ownership and alternative reachability stay as specified in domain
  invariants. OR groups do not create a parallel Trigger concept (ADR-025).
- Reader state remains distinct from authored state; the same deterministic
  journey must keep its existing result.
- The reader and Simulation Mode share narrative runtime semantics but may have
  different authoring controls. CSS separation must not alter choice
  availability, save behavior, timers or simulation mutation behavior.
- The design-system catalogue is a reference surface, not a new interaction
  workflow or a reason to change the product palette without review.

## Minimal target architecture

1. **Shared semantic CSS tokens:** keep plain CSS custom properties in the common
   root layer for surfaces, text, borders, primary/action/focus states, concept
   colors, typography, spacing, radii, motion and named overlay layers. Preserve
   semantically distinct tokens even when their current values match. Feature
   aliases may point to shared tokens during migration; avoid a second palette.
2. **Generic UI layer:** add only small controls with truly shared presentation
   and behavior (button/action variants, icon action, field presentation,
   dialog/tooltip shell). Keep native element semantics, labels, validation and
   focus ownership at the right layer. Extend existing controls before creating
   parallel components.
3. **Business components:** retain `EntityNameInput`, `VariablePicker`, condition
   and effect controls, item tree, comments, rich-text tokens, reader choices and
   inspector sections as feature components. Do not create a universal inspector,
   card or selector that conflates different lifecycles.
4. **Feature CSS ownership:** keep graph, editor, inspector, reader, Simulation
   Mode, comments and product pages beside their owner. Separate common reader
   presentation from simulation-only authoring, preserving the audited appearance
   until a visual choice is approved.
5. **Reference catalogue:** render real production tokens/components and their
   states. Keep examples non-mutating and make it explicit when a separate
   prototype remains exploratory.

## React Flow, drag/drop and inspector constraints

- Preserve the canonical Story and all current shared mutations; graph nodes and
  edges remain a projection.
- Keep interaction card width at about 210px, minimum height about 116px, marker
  dimensions (root about 18px, linked about 20px), rotation, attachment points,
  routing and selected/hover states unless a separately approved visual change
  says otherwise.
- Preserve handles, edge hitboxes, `nodrag`/`nopan`, pointer-event boundaries,
  decoration stacking and node geometry. Do not let a generic transform, focus
  ring or button style override graph transforms.
- Preserve current dnd-kit sensors: mouse activation distance 5px; touch delay
  250ms and tolerance 8px; group hover expansion at 650ms; body-portaled drag
  overlay; keyboard commands, cancellation and accessible alternatives.
- Keep inspector header/actions visible while inspector content scrolls
  independently. Narrow-screen overlays must not compress or shift the graph.
- Maintain current graph-size and ELK performance baselines; keep React Flow out
  of the initial reader/product bundle.

## Automatic checks and test strategy

Use the existing ESLint/TypeScript/CI setup and add Stylelint only as a focused
CSS quality tool when its version supports the repository's Node 24 toolchain.
Avoid blanket bans that flag legitimate graph geometry, authored colors, fallback
declarations or dynamic runtime properties.

- **Stylelint, staged by migrated files:** invalid colors, unknown CSS properties
  and units/functions, duplicate declarations except intentional adjacent
  fallbacks, duplicate custom-property definitions, then unknown custom
  properties with explicit reference files and narrow exemptions for CSS
  variables supplied at runtime (for example timer ratios). Restrict raw-color
  checks to migrated UI declarations; allow authored graph decoration colors and
  illustration data.
- **ESLint:** retain current hook/type rules. Add narrow restricted-import rules
  so generic UI does not depend on feature/domain/React Flow modules. Consider
  AST checks for inline color literals only after token ownership is established.
  Do not add `jsx-a11y` until a release compatible with ESLint 10 is available;
  the currently evaluated package peer range excluded ESLint 10.
- **Behavior tests:** modal backdrop hit-testing, Tab/Shift+Tab/Escape and focus
  restoration; marker computed geometry at rest/hover/focus/selection plus
  React Flow connection/selection/drag interaction; rich-text edit/remove/selection
  and serialization on editor, direct reader and direct Simulation routes; token
  resolution on story settings and simulation badges.
- **Accessibility:** extend existing axe routes for dialog/tooltip states and
  retain a manual keyboard, screen-reader, zoom and forced-color review for
  controls that automated checks cannot judge.
- **Visual regression:** use a few deterministic Playwright fixtures for graph,
  inspector and reader once styles are migrated; do not snapshot every
  nondeterministic story or treat pixel drift as automatic failure.
- **Preserve CI gates:** lint, format, typecheck, coverage, build, bundle budgets,
  current web e2e and real-stack acceptance remain authoritative. Verify affected
  graph DND/geometry/performance tests after graph style changes.

## Incremental migration plan and acceptance

Priority ordering follows the audit's reproducible P0 defects and existing
roadmap/backlog priorities. No global redesign is implied.

| Phase                | Scope                                                                                                                                                                                   | Main risk                                                                 | Verification and acceptance                                                                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — D1–D4           | Fix modal layer/isolation, generic hover transform, rich-text control CSS ownership and out-of-scope product tokens.                                                                    | Focus/backdrop behavior, React Flow geometry, direct-route style loading. | Reproduction tests fail before/fix passes; background header cannot receive pointer or keyboard interaction; focus remains/restores; marker transforms stable; token controls look/function identically across routes; all out-of-scope product vars resolve. |
| P1 — D5–D9, D11, D13 | Resolve reader/simulation cascade, tooltip keyboard/pointer behavior, contrast and documentation discrepancies; establish common token aliases and migrate base actions/fields/dialogs. | Visual drift and accidental semantic color changes.                       | Human visual approval for colors/type; reader and Simulation behavior unchanged; WCAG checks on supported states; narrow component and route tests pass.                                                                                                      |
| P1 — D10, D12        | Rebuild the catalogue around actual components; consolidate only repeated styles with shared meaning and lifecycle.                                                                     | Catalogue becoming a second implementation; over-generalization.          | Catalogue examples render production components/tokens; all shown states link to owning files; no duplicated state logic; feature tests remain.                                                                                                               |
| P2 — D14–D16         | Remaining state consistency, complete accessibility review, graph/inspector visual regression and staged lint automation.                                                               | False positives and graph/editor regressions.                             | Explicit ruleset exceptions; keyboard/screen-reader/zoom checks documented; React Flow geometry, DND, bundle budgets and performance remain within baseline.                                                                                                  |

Human approval is still needed for primary/accent colors, filled versus outlined
Trigger markers, danger action emphasis, UI font and reader serif, density after
the existing 12px/14px control convention, hit-area enlargement at graph zoom,
post-it/simulation badge palette, and catalogue/prototype visibility. Until
approved, migration should preserve current authored appearance and focus on
mechanical reuse or reproducible defects.

## Backlog and resolution trace

Every D finding maps to at least one task below
`docs/code-quality-backlog.md`: `DS-01` (D1, D14 direct causes), `DS-02` (D2),
`DS-03` (D3), `DS-04` (D4), `DS-05` (D5), `DS-06` (D6, D7), `DS-07` (D8, D15),
`DS-08` (D9), `DS-09` (D11), `DS-10` (D12, D13, D16), `DS-11` (D10), `DS-12`
(D14), `DS-13` (D16), and `DS-14` (D15, D16). The existing manual keyboard/focus
audit also covers D15. Each task carries a resolution commit field. Replace `TBD`
with the commit hash when each accepted change lands; retain this audit snapshot
unchanged.

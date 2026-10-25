# Library Reuse Audit — 2026-10-25

## Purpose and limits

This audit looks for places where maintained libraries could reduce custom
technical code without adding another narrative model, weakening persistence, or
moving the current product sequence. It is based on the current branch, the
workspace manifests and installed dependency tree, the implementation and tests,
the current-scope and architecture documents, relevant ADRs, the backlog, and the
roadmap. Upstream package metadata and documentation were checked on 2026-10-25.

This was a read-only code review. No application code, dependencies, schema, or
migrations changed. No tests, benchmark, browser prototype, or install command
was run. Code paths and existing test files below are inspection evidence, not
verification performed during this audit. No size, speed, or lines-removed gain
is claimed before a prototype measures it.

## Summary

The strongest candidates are small, isolated evaluations rather than a new
framework layer. The existing rich-text migration initiative remains the largest
potential simplification, and it already has a detailed compatibility plan in
the [roadmap](../roadmap.md#deferred-cross-cutting-initiative-rich-text-editor-migration).
It remains P2 and unscheduled. Guided author sessions, valuable-project safety,
and the current delivery queue keep their existing priority.

The five best opportunities, in recommended evaluation order, are:

1. **Pilot Knip and confirm whether the web Zod dependency is unused.** ESLint,
   Stylelint, and dependency-cruiser already cover other quality checks. The
   source scan found `zod` in `apps/web/package.json` but no source import. Knip
   can test unused dependencies, exports, and files across the npm workspaces.
2. **Prototype one Radix Dialog integration.** The shared modal implementation
   already centralizes its behavior, but still maintains custom focus trapping,
   modal stacking, inert background handling, scroll locking, and focus restore.
   Compare one representative dialog before considering wider reuse.
3. **Measure OpenAPI coverage before generating types.** Nest Swagger is already
   installed, but API metadata is sparse. First make the existing contract
   complete enough to evaluate generated types on a small endpoint set.
4. **Continue the existing Tiptap compatibility prototype.** It could replace
   much of the hand-maintained editing surface, but has the largest persisted
   content and authoring risk. Keep it inside the already documented Phase 1.
5. **Keep one parser-library prototype conditional on importer growth.** Compare
   Chevrotain, Peggy, and the current parser on one real grammar only after a
   concrete feature expansion or recurring parser defect justifies it.

The first low-cost probes are Knip and a single Radix dialog. They remain backlog
work and do not supersede author validation. The OpenAPI probe must begin with
schema completeness. Tiptap and parser work keep their existing gates.

## Current architecture and implementation evidence

### Dependencies and quality tooling

The installed dependency tree matches the npm workspaces: React 19, React Flow,
ELK, dnd-kit, DOMPurify, Zod, NestJS Swagger, `pg`, the QSP converter, ESLint,
Stylelint, and dependency-cruiser are present. React Flow, ELK, and dnd-kit have
direct editor uses. DOMPurify and `sanitize-html` serve different browser and API
boundaries. The shared package remains framework-independent and contains the
deterministic narrative rules. No candidate library in the source note is
installed, except that the project already has Zod and NestJS Swagger.

The root scripts already run ESLint, Stylelint, dependency-cruiser, formatting,
typecheck, tests, coverage, bundle checks, and builds. ESLint's complexity and
typed-safety baselines and the other quality-tooling costs are documented in
[ADR-039](../decisions/ADR-039-automated-architecture-guardrails.md). Knip would
fill a different gap by checking unused files, exports, and dependencies; it
should not reproduce existing boundary or lint checks.

The `zod` direct dependency is a **candidate for removal, not yet a confirmed
cleanup**: a repository source search found the package declaration but no import
or API use. A static scan can miss dynamic entry points or configuration. Confirm
it with Knip and the package's actual build/test entrypoints before removing it.

### Rich text

`RichTextEditor.tsx` currently edits sanitized HTML through `contentEditable`,
direct DOM changes, browser selections, and `document.execCommand()`. It also
supports stable stat, item, interaction-link, and conditional-text markers. The
API sanitizer and browser renderer have separate allowlists. Existing code and
tests already extracted token serialization and selection handling; conditional
editing actions remain in the backlog.

The proposed replacement must preserve `Interaction.body` HTML, structured
`conditionalTextBlocks`, stable ids, older sanitized markup, reader projection,
Simulation Mode, imports, comments, history, and the current save path. Tiptap's
editor core is MIT-licensed and currently releases frequently, but its UI
Components documentation says React 19 support is still being upgraded and that
those components work best with React 18. Use the OSS editor core only in the
prototype; do not assume the separate UI Components are compatible with this
React 19 application. Lexical remains an alternate only if the documented
Tiptap prototype demonstrates a structural limitation.

### Generic interface behaviors

The project has a shared [`ModalPortal`](../../apps/web/src/components/ModalPortal.tsx)
and shared dialog keyboard and isolation helpers. That is useful existing reuse,
so a primitive library should replace this cohesive behavior only if it removes
enough custom lifecycle code to justify itself. The current code maintains modal
stack order, restoration of `inert` and body overflow, focus entry and restore,
Tab wrapping, Escape, and tooltip placement inside modal portals.

[`ContextMenu`](../../apps/web/src/components/ContextMenu.tsx) implements portal
placement, dismissal, focus restore, and arrow/Home/End keyboard movement.
[`FieldHelpTooltip`](../../apps/web/src/components/FieldHelpTooltip.tsx) computes
its own position and manages hover, focus, delayed close, Escape, resize, and
scroll. These are real platform behaviors, but a migration can still add
integration and styling work. Radix Dialog is the best limited comparison because
its primitive already handles the modal lifecycle and keeps styling under local
control. Do not migrate all menus, tooltips, and dialogs together. Floating UI by
itself would address placement but would leave most dismissal and focus behavior
to maintain. The source scan found no shared generic Popover component; keep the
existing variable picker and other content-specific overlays attached to their
authoring workflows unless a separate usability problem justifies a primitive.

The [design-system rules](../design-system.md) and the
[2026-10-22 design-system audit](design-system-2026-10-22.md) already define the
current tokens, component patterns, and outstanding validation. The older audit
is a historical snapshot, so any prototype should compare against current
components and CSS instead of reviving a resolved finding or visual proposal.

### Server state and forms

The web API wrapper in [`api.ts`](../../apps/web/src/api.ts) centralizes JSON
requests, stable error parsing, session-expiry notification, and cancellable
binary import upload with progress. Editor persistence also protects local
drafts, optimistic mutations, revision freshness, failed saves, and remote Story
updates. Reader and Simulation loading use revision-consistent pages and targeted
runtime slices under [ADR-027](../decisions/ADR-027-paginated-story-read-projections.md).
Those behaviors have domain and workflow semantics that a query cache does not
replace.

The recent StoryPlayer extraction has already separated runtime loading and
refresh, paged slices, Reader session state, progress persistence, navigation,
and presentation under `apps/web/src/features/story-player/`. The backlog keeps
the remaining extraction P1 but starts after author observation; it does not call
for a rewrite. A query library would need to preserve those load keys, obsolete
response guards, save queues, and realtime refresh policy, so no evidence
currently makes that additional state layer cheaper.

No measured duplicate-request, stale-cache, or invalidation defect currently
supports adding TanStack Query. If a specific loader becomes demonstrably
duplicated, compare a narrow loader extraction or cache boundary against the
existing revision and mutation policies before adding a cache.

Forms are mostly focused authoring controls and custom product workflows, not a
single conventional form layer. The browser does not currently import Zod even
though the web manifest declares it. React Hook Form plus Zod would add a new
state/validation approach without a confirmed user problem; the existing
backlog candidate stays conditional on evidence from a complex form or author
session.

Zustand is also not recommended. Editor selection/gesture state, persisted Story
drafts, Reader runtime, and server responses have different ownership and
lifecycle rules. A new global store would need to preserve those boundaries and
could create another copy of canonical Story state. The inspected feature hooks
and local React state show no specific cross-screen synchronization defect that
requires it; use a focused reducer or hook when a local state transition becomes
hard to follow.

### API contracts and PostgreSQL

[`main.ts`](../../apps/api/src/main.ts) creates a Swagger document only outside
production. The API contract metadata found in source is concentrated in the
health controller; the stories and auth DTOs use class-transformer and
class-validator but do not currently provide `@ApiProperty` schema metadata.
The web API wrapper manually maps endpoints, while most narrative input and
response types already come from `@paralleax/shared`. This makes OpenAPI coverage
the prerequisite; it does not establish that a full generated HTTP client would
remove much code.

The API uses PostgreSQL's `pg` driver with parameterized SQL and explicit row
interfaces such as `StoryRow`, `InteractionRow`, `TriggerRow`, and the paginated
editor projection rows. These interfaces are handwritten, so `pg.query<Row>`
does not prove that each selected column agrees with the database. However, the
repository also owns access checks, transactions, locks, relational assembly,
and revisioned persistence. Kysely would require a broad query rewrite and is
not justified under the task's no-rewrite constraint.

PgTyped can generate query parameter and result types from a live PostgreSQL
schema and can read queries in TypeScript, but its documented setup adds code
generation and a runtime package; the current `@pgtyped/runtime` npm page lists
2.4.2, last published two years before this audit. That maintenance signal and
the need to make a migration-built database available to code generation in
developer/CI workflows outweigh an unmeasured gain for now. Keep the current
parameterized `pg` queries and row interfaces; reconsider typed SQL tooling only
if query/schema drift produces a concrete defect.

### Graphs, parsers, search, and collaboration

ELK is already installed and used for deterministic graph layout. Graphology
would be a temporary structural projection for component, cycle, or path
diagnostics. It cannot decide reader reachability, which depends on Paralleax
conditions and replayed state. The existing backlog already records this
candidate and its semantic boundary; no second graph model is recommended.

QSP and ChoiceScript importers use custom parsing stages, source-positioned
diagnostics, compatibility reporting, and tests. The QSP parser also runs in a
cancellable worker. `packages/shared/src/expressions/index.ts` has a focused
expression parser. Chevrotain or Peggy could help only with a grammar that is
actually growing; neither replaces foreign-engine semantics, import mapping,
diagnostics, source coordinates, cancellation, or canonical Story validation.
The existing Chevrotain backlog item should compare a parser library with the
current grammar and keep the current implementation if it is simpler.

Story library search is already a server-side, paginated SQL `ILIKE` over story
titles. Fuse.js would require a concrete fuzzy or multi-field search requirement
and must not move this work to loading all Stories into the browser.

Live collaboration currently sends authorized Story invalidations and reloads
canonical state under [ADR-020](../decisions/ADR-020-live-story-collaboration.md).
Yjs would add a concurrent-text editing/offline merge model that the current
product does not expose. [ADR-034](../decisions/ADR-034-collaborative-offline-authoring.md)
keeps that work as future direction and requires its persistence, authorization,
history, and conflict behavior to be decided. Yjs is not an implementation
shortcut for the current invalidation workflow.

## Candidate status

The versions below are upstream latest stable versions surfaced by the official
project or npm package pages when checked on 2026-10-25. They are research
baselines, not versions to pin. Recheck versions and peer/runtime requirements if
an experiment is later scheduled.

| Candidate | Upstream check | Compatibility and recommendation |
| --- | --- | --- |
| Tiptap editor core | `@tiptap/react` **3.32.0**, MIT. Recent 3.x releases; React/Vite installation and extension docs are current. | React core is a plausible React 19 prototype. The separate Tiptap UI Components docs warn that React 19 support is still being upgraded. Continue only the existing HTML/token/condition compatibility phase; do not add Cloud or collaboration packages. |
| Radix Primitives | `radix-ui` **1.8.1**, MIT. Official release notes include Dialog, Tooltip, Context Menu, and React 19 fixes in 2026. | React 19 is in the supported ecosystem. Prototype one Dialog with the current design tokens and focus behavior; measure bundle and custom lifecycle code before deciding. |
| Knip | **6.42.1**, ISC. Releases and docs are active; Knip v6 requires Node.js 20.19 or later and supports npm workspaces. | The repo targets Node 24 and uses npm workspaces, so the documented environment fits. Pilot as development-only analysis with explicit handling for dynamic entries and false positives. |
| OpenAPI TypeScript | **7.13.0**, MIT. Supports OpenAPI 3.0/3.1 and emits runtime-free TypeScript types. | Node 24 and TypeScript 5.9 fit the documented generation model. First complete and inspect the Nest schema; try only generated types for endpoints with duplicated request/response declarations. |
| Chevrotain | **13.2.0**, Apache-2.0. The upstream repository and npm page show active releases and bundled types. | It builds grammars in JavaScript/TypeScript without a generated-parser step, but adds several runtime packages. Check the exact Node engine, ESM/bundle impact, and Apache notice requirements during any prototype. Keep the parser task conditional. |
| Peggy, parser comparison only | **5.1.1**, MIT. Current npm release; official docs support build-time generation and Node 14+ generated parsers. | A generated parser can keep the generator development-only, but generated code and build inputs become maintenance surfaces. Compare only on the same small grammar as Chevrotain and the existing parser. |
| `openapi-fetch`, not retained | **0.17.0**, MIT; npm showed no release in the preceding eight months. | Its typed transport would overlap with the existing request wrapper's error mapping, session-expiry event, cancellation, and upload-progress XHR. Use no new transport unless a separate experiment proves those behaviors can be preserved with less code. |
| PgTyped, not retained | `@pgtyped/cli` **2.4.3**, MIT; it requires `@pgtyped/runtime`, whose official npm page lists **2.4.2** and a publish date two years before this audit. | The runtime freshness signal and live-DB generation setup are not compelling beside existing row types and verified `pg` integration tests. Recheck only if SQL/type drift becomes a concrete defect. |

## Libraries to defer or reject for the current scope

| Candidate | Decision |
| --- | --- |
| Lexical | Do not run a parallel editor migration. Compare it only if the existing Tiptap compatibility prototype proves a structural limitation. |
| TanStack Query | Do not add a cache without a measured stale-request, duplicate-load, or invalidation problem. Preserve revision-consistent pages, local drafts, optimistic recovery, and Story history. |
| React Hook Form + Zod | Do not adopt as a broad form layer without an observed validation or draft problem. First confirm/remove the currently unimported direct Zod dependency. |
| Zustand | Do not add a global store when the editor, reader, authored Story, and server data have different lifecycles and no current cross-screen state defect is documented. |
| Kysely | Do not rewrite the existing parameterized PostgreSQL queries solely to gain a typed query builder. |
| PgTyped | Defer because its required runtime package is stale and code generation adds live-schema setup to local/CI workflows. |
| openapi-fetch | Do not replace the current request transport until the typed wrapper preserves error normalization, session expiry, cancellation, and binary upload progress with less custom code. Type-only OpenAPI generation can be evaluated separately. |
| Yjs and related collaboration providers | Do not add until concurrent text edits or durable offline work has a defined user workflow, storage, history, and authorization contract. |
| Graphology | Keep the existing backlog item conditional on structural diagnostics. It cannot replace deterministic narrative reachability in `packages/shared`. |
| Fuse.js | Do not add while server-side title search with pagination meets the current library requirement. |
| Floating UI | Do not add as a second generic behavior layer for one tooltip or menu. Radix is the narrower Dialog prototype; reconsider positioning separately only if a reproduced need remains. |
| Chevrotain / Peggy | Do not replace tested parsers now. Keep one conditional comparison for a concrete grammar expansion or defect and preserve the option to keep the current code. |

Official references:

- [Tiptap React package](https://www.npmjs.com/package/@tiptap/react),
  [React integration](https://tiptap.dev/docs/editor/getting-started/install/react),
  and [React 19 note for UI Components](https://tiptap.dev/docs/ui-components/getting-started/overview).
- [Radix package](https://www.npmjs.com/package/radix-ui),
  [Dialog documentation](https://www.radix-ui.com/primitives/docs/components/dialog),
  and [release notes](https://www.radix-ui.com/primitives/docs/overview/releases).
- [Knip npm package](https://www.npmjs.com/package/knip),
  [requirements](https://knip.dev/overview/getting-started), and
  [workspace support](https://knip.dev/features/monorepos-and-workspaces).
- [openapi-typescript npm package](https://www.npmjs.com/package/openapi-typescript)
  and [documentation](https://openapi-ts.dev/).
- [Chevrotain npm package](https://www.npmjs.com/package/chevrotain) and
  [documentation](https://chevrotain.io/docs/).
- [Peggy npm package](https://www.npmjs.com/package/peggy) and
  [documentation](https://peggyjs.org/documentation.html).
- [PgTyped CLI](https://www.npmjs.com/package/@pgtyped/cli) and
  [runtime package](https://www.npmjs.com/package/@pgtyped/runtime).
- [openapi-fetch package](https://www.npmjs.com/package/openapi-fetch).

## Backlog and roadmap decisions

The [code-quality backlog](../code-quality-backlog.md#library-reuse-audit-follow-ups-2026-10-25)
now contains four bounded evaluations and one conditional parser prototype. The
Tiptap compatibility plan and the Graphology, form, parser, search, and
collaboration candidates were already represented; they are reused and refined
rather than duplicated.

The roadmap did not change. None of these exploratory library evaluations
changes the order of the current author validation, data safety, and product
delivery work. Tiptap remains deferred P2; no ADR changes or conflicts were
identified. The proposals keep the existing domain, persistence, and React Flow
boundaries.

## ADR and invariant review

- **ADR-002 / ADR-003:** no stack or engine ownership change is proposed;
  `packages/shared` remains independent from React, React Flow, NestJS, browser
  APIs, and PostgreSQL.
- **ADR-004:** React Flow remains a projection. Graphology would only analyze a
  temporary projection; it must not decide narrative availability.
- **ADR-020 / ADR-034:** current SSE invalidation remains distinct from future
  collaborative text merge and durable offline edits. No collaboration provider
  is selected.
- **ADR-027 / ADR-040:** generic query caching must not bypass revision checks,
  paginated runtime slices, or the accepted checkpoint behavior.
- **ADR-039:** Knip is complementary to existing source-boundary, lint, and style
  checks; it is not a reason to widen the current guardrail baselines.

No contradiction with an accepted ADR was found. The main constraints are already
consistent across the current scope, roadmap, ADRs, and domain invariants.

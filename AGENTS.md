# AGENTS.md

## Purpose

Paralleax is an editor and runtime engine for complex interactive scenarios.
Agents must preserve the product model, engine independence, and authoring reliability.

## Read before modifying code

Read the files relevant to the task, starting with:

1. `docs/vision.md`
2. `docs/current-scope.md`
3. `docs/domain-model.md`
4. `docs/domain-invariants.md`
5. `docs/architecture.md`
6. `docs/reader-semantics.md` when reader/runtime behavior is involved
7. `docs/triggers.md` when graph or trigger behavior is involved
8. the relevant ADRs in `docs/decisions/`
9. `docs/ai-workflow.md`

Do not rely on an old roadmap entry when current implementation or current-scope documentation says otherwise.

## Sources of truth

When documents disagree, use this precedence:

1. Explicit current task requirements.
2. `docs/domain-invariants.md`.
3. Accepted ADRs.
4. `docs/current-scope.md`.
5. Current tests describing intentional behavior.
6. `docs/domain-model.md` and semantic documentation.
7. `docs/architecture.md`.
8. Roadmap and historical documentation.

Surface material conflicts under the clarification and product decisions rule
below before implementing the disputed decision. Source precedence does not remove
this duty or authorize silently choosing a new product rule.

## Architectural boundaries

### Concise interface copy

- Keep default interface copy and repeated explanations concise. Prefer a clear,
  readable label or rule over a persistent explanatory paragraph.
- Put optional detail in an accessible tooltip or infobulle on hover and keyboard
  focus. Essential meaning and actions must remain available without hover.
- Use progressive disclosure for controls: show the readable authored value by
  default and expose editing controls when the user asks to edit it.

### `packages/shared`

Owns framework-independent domain concepts and deterministic behavior shared across
the editor, API, reader, tests, imports, and future exporters.

It MUST NOT depend on React, React Flow, NestJS, browser APIs, PostgreSQL, or HTTP.

### `apps/api`

Owns HTTP boundaries, authentication/authorization, validation, application
orchestration, transactions, migrations, and persistence.

Do not duplicate narrative rules here when they belong in `packages/shared`.

### `apps/web`

Owns rendering, browser behavior, React state, React Flow projection, selection,
gestures, inspectors, and optimistic client persistence.

React Flow is a projection of the Paralleax model. Never change domain semantics
merely to simplify graph rendering.

## Domain invariants

Preserve all rules in `docs/domain-invariants.md`.

In particular:

- a Trigger has exactly one output Interaction: the Interaction that owns it;
- one Trigger may have multiple input Interactions;
- input Interactions on one Trigger are alternative reachability sources;
- multiple Triggers may target the same Interaction and represent alternative condition variants;
- authored story state must remain distinct from reader/runtime state;
- reader results must be deterministic from authored story + ordered journey;
- graph data is a projection, never the canonical story format;
- IDs referenced by story entities must belong to the same Story unless an explicit future design says otherwise;
- persistence schema changes happen only through migrations.

## Change discipline

### Start-of-task checklist

1. Assess model suitability before substantial investigation; report a material
   mismatch in the opening update (see model recommendation below).
2. Inspect the working tree and relevant diffs before editing; identify existing
   work to preserve.
3. Read the relevant docs and closest implementation, including current scope and
   relevant roadmap entries; assess alignment, reuse opportunities, and priority.
4. State a short implementation contract: goal, non-goals, observable behavior,
   affected layers/files, invariants, acceptance scenarios, and compatibility or
   migration constraints. Use the template in `docs/ai-workflow.md` as needed.
5. Resolve open product choices and concrete objections with the user under the
   rule below; distinguish confirmed requirements from assumptions.
6. For significant editor interaction changes, validate a concrete user journey or
   lightweight mockup before building the full implementation.

### Clarification and product decisions

The user wants active questioning and reasoned disagreement about implementation
and task priority, even for otherwise fully specified requests.

- Ask focused questions about unresolved workflows, domain semantics, UI behavior,
  edge cases, scope, and acceptance criteria. A general feature request or a
  plausible interpretation does not settle these choices. For groups, for example,
  clarify eligible contents, nesting, membership, ordering, moves, and deletion.
- Challenge concrete concerns such as duplication, complexity, maintenance cost,
  weak user value, missing prerequisites, or premature scope. Explain tradeoffs and
  recommend an alternative, including narrowing or deferring work. Identify any
  documented priority displaced; do not silently reorder tasks or expand scope.
- For conflicts with the roadmap or documentation, cite the relevant file/section,
  explain consequences, and ask whether to change direction, adjust, or defer.
  Respect source precedence and identify stale roadmap entries.
- Clarification is also mandatory before choosing a parallel model, table, API,
  workflow, or UI concept over extending an existing one, unless already decided
  by the user. Explain the semantic or lifecycle distinction (see reuse below).
- Present concrete options and a recommendation in small, coherent question
  batches. Wait for answers before implementing unresolved or disputed decisions;
  read-only investigation and independent settled work may continue. Silence is
  not agreement. Follow up if a material ambiguity remains.
- Validate significant editor interactions through a journey or mockup that shows
  the main action, resulting state, and relevant edge cases. Reuse existing UI
  patterns and wait for feedback on unresolved interactions before extending the
  implementation across layers; do not invent a separate prototyping workflow.
- Incorporate answers and follow the informed decision within authorized scope.
  Do not invent objections, repeat answered questions, or reopen settled choices
  without new evidence. Mechanical changes, documented bug fixes, and fully
  specified tasks need no clarification round when no material choice or conflict
  remains; this exception does not authorize inventing feature requirements.

### Interface writing and typography

- Keep interface copy concise; put optional precision in tooltips or infobulles.
- Avoid the em dash (—) in most interface copy. Use `->` for directional or
  ownership relationships and a simple hyphen for short separators.
- Use 12 px for compact authoring labels and secondary hints, and 14 px for
  field values and ordinary compact controls. This is not a global cap: reader
  prose and prominent headings keep context-appropriate sizes.
- Keep related condition fields in one consistent vertical layout with uniform
  gaps; concise condition rules wrap instead of truncating.

### Model recommendation

Prefer the least costly available model and reasoning effort likely to meet the
quality bar. Consider ambiguity, context size, affected layers, verification, and
domain/security/migration risks, including the cost of mistakes and rework.

If the current selection is a material mismatch, recommend a specific alternative
and effort in the opening update with a short reason, whether cheaper or stronger.
Use current official guidance and known client availability; keep the check
proportionate. If the active model or effort is unknown, say so and make the
recommendation conditional. Do not invent access, prices, savings, or fixed rankings.

A recommendation does not switch the conversation's model. Without a supported
switching control, direct the user to the client model control; do not claim a
switch, change configuration, or launch another agent/session to simulate one.
For substantial work with a material mismatch, give the user a chance to choose
before costly execution. Reassess only when complexity or risk materially changes.

### Preserve existing work

Keep edits, formatting, staging, and commits limited to the task. Preserve unrelated
local changes, including changes in a file the task also touches. Do not reset,
overwrite, discard, or stash others' work without explicit authorization. Avoid
global cleanup or formatting; target touched content. Before staging or committing,
inspect the diff and select only relevant files or hunks rather than staging the
whole working tree. Ask if overlapping changes cannot be safely reconciled.

### Reuse-first principle

Reuse and extend existing code by default, in the frontend, backend, shared domain,
API, and persistence layers. Before creating a new component, class, function,
service, table, endpoint, model, style, or workflow:

1. Search for the closest existing implementation and inspect its callers, tests,
   styling, and extension points.
2. Prefer adapting that implementation to support the additional case when the
   concepts share semantics and lifecycle. A similar parallel implementation adds
   avoidable code, tests, migrations, and long-term maintenance.
3. In the frontend, reuse existing components, controls, list patterns, classes,
   tokens, spacing, markers, and interaction states. Use a prop, variant, modifier
   class, or small wrapper when only presentation or a limited behavior differs.
4. In backend and shared code, extend existing domain operations, types, services,
   repositories, validators, and persistence models when they represent the same
   concept. Extract focused shared helpers, sub-functions, composed collaborators,
   or a base/derived class where appropriate when only part of the logic differs.
5. Keep extended code cohesive. If supporting another case would overload an
   existing function or class, separate the common logic from the genuinely
   different logic instead of duplicating the complete implementation.
6. A parallel abstraction requires materially different semantics, invariants,
   ownership, or lifecycle. Resolve that choice under the clarification rule above
   and record the reason in the appropriate documentation.

### Existing libraries and SDKs

Before implementing a general-purpose capability or protocol from scratch, search
the installed dependencies, the repository's existing integrations, and
maintained compatible libraries or official SDKs. Prefer a mature, well-scoped
library when it already provides the required behavior, particularly for security,
authentication, email, storage, file formats, and network protocols.

Check compatibility with the supported Node/browser targets, TypeScript support,
license, maintenance/security posture, operational configuration, and bundle
impact before adding it. Do not add a wrapper or a parallel implementation when
the library's normal interface can be used directly. If the project deliberately
does not use an available library, record the concrete reason in the relevant
documentation or ADR.

### During implementation

- Prefer a narrow change over opportunistic refactoring.
- Keep code, tests, UI copy, and technical documentation in English.
- Do not introduce new domain concepts as incidental implementation details.
- Avoid adding more responsibilities to known large orchestration files when a focused module is reasonable.
- Preserve backwards compatibility for persisted stories and reader progress unless the task explicitly includes a migration.
- If new evidence changes scope, cost, dependencies, or priority materially (for
  example, a small fix now needs a migration, new abstraction, or refactor), explain
  the discovery and alternatives promptly. Revisit the contract with the user
  before pursuing the expanded work; do not silently absorb it into the task.

### Decisions and completion

- Keep agreed behavior and acceptance scenarios in the implementation contract.
  Record durable decisions where they belong: product/semantic docs for behavior,
  the roadmap for agreed priority changes, and an ADR for architectural decisions.
  Include the rationale and relevant consequences; do not leave important decisions
  only in chat or silently rewrite documentation to justify an implementation.
  Use existing documents; a new decision log or parallel workflow is unnecessary.
- Resolve durable architectural decisions in an ADR before implementing them.
- Add or update tests for every behavior change.
- Update semantic documentation when behavior changes.
- Update `CHANGELOG.md` for notable user-visible or architectural changes.
- Run the narrowest relevant verification, then the broader suite appropriate to the change.

## Verification matrix

- Domain rule: shared unit tests + typecheck.
- API endpoint/application behavior: API tests + relevant shared tests.
- PostgreSQL behavior: PostgreSQL integration/migration tests.
- React component/helper: web unit/component tests.
- Critical editor or reader flow: Playwright.
- Cross-layer change: typecheck + affected unit/integration tests + build.
- Documentation-only change: no full test suite unless semantics changed.

Format task-owned content only. Before merging a substantial feature, prefer:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:e2e -w @paralleax/web
npm run coverage
npm run build
```

## Large-file rule

Treat these as orchestration hotspots, not default homes for new logic:

- `packages/shared/src/index.ts`
- `apps/api/src/stories/stories.service.ts`
- `apps/web/src/hooks/useStoryEditorPersistence.ts`

When adding a coherent new responsibility, prefer extracting a focused module and
re-exporting it rather than extending these files indefinitely.

Suggested shared direction:

```text
packages/shared/src/
  model/
  reader/
  triggers/
  interactions/
  items/
  stats/
  time/
  graph/
  import-export/
  index.ts
```

Suggested API direction:

```text
apps/api/src/stories/
  application/
  persistence/
  validation/
  dto/
```

Suggested web direction:

```text
apps/web/src/features/story-editor/
  graph/
  persistence/
  selection/
  inspectors/
  simulation/
```

Do not perform this reorganization as one massive refactor. Extract incrementally
when touching a responsibility.

## Imports and external story systems

Imports such as Girl Life or Lilith's Throne are adapters, not specifications for
the Paralleax core.

An importer may translate foreign concepts into Paralleax concepts. It must not
silently change Paralleax domain semantics to reproduce one source engine.

Prefer a staged pipeline:

```text
source parser
  -> source-neutral intermediate representation
  -> compatibility/gap report
  -> Paralleax mapping
  -> validation
  -> import
```

Keep source-specific code outside the narrative engine.

## Prohibited agent behavior

Do not:

- rewrite large areas merely for style;
- change domain semantics without updating tests and docs;
- bypass repository ownership checks;
- mutate the database schema outside migrations;
- put canonical story state into React Flow nodes/edges;
- introduce AI-generated runtime behavior into the core engine without an explicit product decision;
- add a feature because it appears in the roadmap if the current task does not require it;
- resolve documentation contradictions by silently deleting history.

## Completion report

At the end of a coding task, report:

1. What changed.
2. Why.
3. Tests/verification run.
4. Documentation or ADR updates.
5. Known limitations or follow-up work.

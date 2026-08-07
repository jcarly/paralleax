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

If a contradiction remains material, do not silently choose a new product rule. Report it and make the smallest safe change.

## Architectural boundaries

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

Before coding:

1. State the behavior being changed.
2. Identify affected layer(s): domain, API, web, persistence, documentation.
3. Identify relevant invariants and regression tests.
4. Prefer a narrow change over opportunistic refactoring.

While coding:

- Keep code, tests, UI copy, and technical documentation in English.
- Do not introduce new domain concepts as incidental implementation details.
- Avoid adding more responsibilities to known large orchestration files when a focused module is reasonable.
- Reuse shared domain operations instead of reimplementing them in API or web.
- Preserve backwards compatibility for persisted stories and reader progress unless the task explicitly includes a migration.

After coding:

- Add or update tests for every behavior change.
- Update semantic documentation when behavior changes.
- Add an ADR when a durable architectural decision changes.
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

Before merging a substantial feature, prefer:

```bash
npm run lint
npm run format
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

## Agent task contract

Every implementation task should define:

- Goal
- Non-goals
- Product behavior
- Relevant invariants
- Expected files/layers
- Acceptance tests
- Migration/compatibility constraints

If these are absent, infer them from the repository and keep the scope minimal.

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

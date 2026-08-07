# AI Development Workflow

## Goal

Use AI agents as implementation accelerators without allowing individual agents to
redefine Paralleax architecture or product semantics.

## Recommended loop

### 1. Architecture/product pass

Use the reasoning agent to turn a feature idea into a short implementation contract:

- user-facing goal;
- domain behavior;
- invariants;
- non-goals;
- affected layers;
- migration needs;
- acceptance tests.

For ambiguous domain changes, create or update an ADR before implementation.

### 2. Implementation pass

Give one coding agent one coherent vertical slice.

Good examples:

- add one new TriggerCondition type end-to-end;
- add one item transfer operation end-to-end;
- extract reader calendar helpers from the shared monolith without behavior change;
- implement one editor navigation behavior with its component and Playwright test.

Avoid requests such as "improve the story engine" or "refactor the editor".

### 3. Review pass

A separate review pass checks:

- invariant violations;
- duplicated domain logic across layers;
- migration safety;
- stale-response/optimistic-update regressions;
- ownership/security regressions;
- reader determinism;
- missing tests/docs;
- accidental scope growth.

### 4. Verification pass

Run the repository's real verification commands. The agent must distinguish
"tests I wrote" from "tests that actually ran successfully".

### 5. Merge decision

Merge only when behavior, tests, docs, and migration compatibility agree.

## Branch model

Prefer one branch per coherent task:

```text
feat/condition-item-instance
fix/editor-stale-trigger-merge
refactor/shared-reader-calendar
docs/scope-sync
```

An agent should not combine unrelated cleanup into a feature branch.

## Issue/task template

```markdown
## Goal
What outcome should exist after this change?

## Product behavior
Describe observable behavior.

## Non-goals
What should explicitly remain unchanged?

## Invariants
Which domain rules must remain true?

## Layers
- [ ] shared domain
- [ ] API
- [ ] persistence/migration
- [ ] web/editor
- [ ] reader
- [ ] docs

## Acceptance tests
Concrete scenarios that prove the feature.

## Compatibility
Persisted stories / reader progress / API compatibility constraints.

## References
Relevant docs, ADRs, issues, or imports.
```

## Multi-agent usage

Parallel agents are safe when their write scopes do not overlap strongly.

Good parallel split:

- Agent A: domain model + shared tests.
- Agent B: UI prototype against an agreed temporary interface.
- Agent C: documentation/ADR review.

Poor parallel split:

- two agents editing `packages/shared/src/index.ts`;
- two agents changing trigger semantics independently;
- API and web agents inventing different payloads before agreeing the contract.

For a cross-layer feature, serial execution is often safer:

```text
domain contract -> API/persistence -> web -> E2E review
```

## Import workflow

Do not begin an external-story import with direct SQL generation.

Use:

```text
1. source inventory
2. source parser
3. intermediate representation
4. unsupported-feature report
5. Paralleax mapping
6. validation
7. persistence/import
8. representative reader tests
```

This makes imports useful as architecture stress tests without coupling the engine
to one external game's model.

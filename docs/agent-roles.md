# Recommended AI Roles

These are task roles, not permanent autonomous services.

## 1. Architect / Product Reasoner

Owns clarification of behavior before code.

Best for:
- domain-model changes;
- deciding whether a concept belongs in core or import adapter;
- ADRs;
- sequencing migrations;
- reviewing architectural consistency.

Should not:
- make broad code edits merely because it identified cleanup opportunities.

## 2. Domain Engine Agent

Primary scope:
- `packages/shared`.

Best for:
- reader semantics;
- conditions;
- effects;
- time;
- item/stat behavior;
- deterministic state reconstruction;
- pure import mapping.

Required checks:
- no framework dependency;
- deterministic tests;
- domain invariants.

## 3. API / Persistence Agent

Primary scope:
- `apps/api`.

Best for:
- NestJS endpoints;
- DTO validation;
- ownership;
- transactions;
- relational mapping;
- migrations;
- reader-progress persistence.

Required checks:
- same-story references;
- creator scoping;
- forward-only migration;
- stable error envelope;
- PostgreSQL integration tests.

## 4. Editor Agent

Primary scope:
- `apps/web`.

Best for:
- React Flow projection;
- selection/navigation;
- inspectors;
- optimistic persistence;
- authoring ergonomics.

Required checks:
- graph remains a projection;
- stale responses cannot restore deleted state;
- domain rules are not duplicated in UI;
- critical flows receive Playwright coverage.

## 5. Reader / Simulation Agent

Can span shared + web, but should start from shared semantics.

Best for:
- availability;
- diagnostics;
- timeline replay;
- simulation controls;
- reader state visualization.

## 6. Import Adapter Agent

Primary scope:
- importer-specific packages/folders.

Best for:
- Girl Life / Lilith's Throne source analysis;
- source-neutral intermediate representation;
- mapping reports;
- unsupported-feature inventories;
- fixture generation.

Must not redefine Paralleax core solely for source parity.

## 7. Reviewer

Read-mostly role.

Checks:
- architecture boundary violations;
- missing migrations;
- missing regression coverage;
- documentation drift;
- giant-file growth;
- accidental behavior changes;
- security/ownership regressions.

A reviewer should be a different pass/model/context from the implementing agent
for important changes.

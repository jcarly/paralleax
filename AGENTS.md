# AGENTS

Read before any modification:

- docs/vision.md
- docs/mvp.md
- docs/architecture.md
- docs/domain-model.md
- docs/design-principles.md

## Goal

Create an editor and engine for interactive scenarios.

## MVP

Only Story, Interaction, Trigger, and Reader.
Do not implement characters, places, variables, or AI before the MVP is validated.

## Stack

React, NestJS, TypeScript.

## Project Memory

Use these files as the persistent memory for project preferences and decisions:

- `AGENTS.md`: collaboration rules and recurring project preferences for coding agents.
- `docs/decisions/`: architecture decision records.
- `docs/test-scenarios.md`: important regression scenarios that must stay covered.
- `CHANGELOG.md`: notable implementation, test, and documentation changes.

## Working Agreements

- Keep code, UI copy, tests, and documentation in English.
- Add or update tests for every behavior change.
- Update documentation when implementation semantics change.
- Update `CHANGELOG.md` for every user-visible, architectural, testing, or documentation change.
- Before changing reader or trigger behavior, update or consult `docs/reader-semantics.md`, `docs/triggers.md`, and `docs/domain-invariants.md`.
- Keep trigger logic aligned with the MVP model: a trigger belongs to exactly one output interaction and may have several input interactions.
- Keep linked trigger editing on graph edges; keep interaction editing focused on interaction content and root trigger behavior.
- Run relevant verification before finishing a change: typecheck, unit/component tests, Playwright when editor flows change, coverage when test breadth changes, and build.

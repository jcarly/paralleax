# Girl Life Import Gap Analysis

## Scope and Source

This analysis compares Paralleax with the Girl Life source repository at
<https://gitlab.com/kevinsmartstfg/girl-life>, revision
`a800ea3c9cb992d6fa148ae7b5d2938f7cf772fc`, inspected on 2026-07-26.

Girl Life is a large QSP project: the inspected revision contains 1,429 QSRC
location files and roughly 46 MB of QSRC source. A QSP "location" can combine
rendered prose, actions, conditional branches, state mutation, reusable
procedures, menus, and navigation. It therefore does not map one-to-one to a
Paralleax location or interaction.

The source repository did not expose a project-wide content license in its root.
Some bundled tools have their own licenses, but those do not grant permission to
redistribute the game's prose or media. The repository also contains explicit
sexual material, including material framed around school-age characters. The
provided SQL intentionally copies none of that prose, media, or explicit
content. Its characters are adults and its text is an original, non-explicit
compatibility prototype.

## What the Prototype Preserves

The SQL prototype represents concepts that fit the current Paralleax model:

- several starting directions: city work, adult education, or a village visit;
- locations and a small cast;
- reusable stat definitions with character-owned initial values;
- reusable item definitions and character-owned item instances;
- interaction choices and converging paths;
- numeric stat effects;
- trigger conditions based on numeric values;
- a small example of a trigger requiring two previously visited interactions;
- alternative routes toward a balanced-life outcome.

This is enough to exercise the current editor and reader, but not enough to
reproduce Girl Life as a simulation.

## Current Platform Constraints Relevant to This Import

The current `main` branch is credible for demos, a closed alpha, and small
stories, but several existing implementation choices become blockers for a
Girl Life-scale import.

### Migration Safety

Paralleax currently runs migrations from repository operations, so a user
request may initiate schema migration. Historical normalization migrations also
delete existing story data. Before any production import:

- move migration execution into an explicit deployment or administrative job;
- consolidate the baseline for new installations or replace destructive steps
  with forward-only data-preserving migrations;
- verify the expected schema version before importing;
- back up PostgreSQL immediately before migration and import;
- automate an upgrade test that inserts representative legacy data, runs every
  migration, and verifies rows plus foreign keys;
- perform and document a restoration test.

The provided SQL is therefore a development prototype, not a production import
procedure.

### Full-Graph Reads and Mutations

The story list and mutation workflow still assemble large portions of a complete
story graph. A mutation can lock the story, load and clone the graph, calculate
differences, persist them, and reload the graph. This is robust for small
stories, but work grows with story size and the story-level lock serializes
otherwise independent edits.

Before importing thousands of interactions:

- introduce a lightweight `StorySummary` projection for story lists;
- separate graph summaries from full interaction details;
- add targeted update commands for text, positions, locations, and stat values;
- reserve full-graph mutation for structural operations;
- add entity revisions and optimistic conflict detection before collaboration.

### Bulk Persistence

The current writer performs several inserts sequentially and contains order
lookups that can become quadratic for large arrays. A real importer needs:

- precomputed identifier-to-order maps;
- batched inserts or PostgreSQL `COPY`;
- one explicit import transaction with progress reporting;
- validation before committing;
- practical limits on story and request size;
- import benchmarks using thousands of interactions;
- resumable or safely restartable import behavior.

### Operations and Recovery

Large imports should not be enabled before Paralleax has:

- health and readiness checks;
- structured logs, request/import identifiers, and stable error codes;
- staging and a production migration pipeline;
- automatic backups with tested restoration;
- an import audit report and rollback procedure;
- quotas and abuse protection;
- immutable published versions separate from editable drafts.

## Missing Domain Capabilities

### Persistent Play Sessions

Paralleax currently rebuilds a transient journey in the reader. A full import
needs persisted saves containing:

- game clock and calendar;
- current location;
- visited and completed events;
- character stat values;
- inventories and item-instance state;
- relationship state;
- quest state;
- scheduled events and cooldowns;
- deterministic random state where reproducibility matters;
- save version and migration metadata.

### General Typed Variables

Girl Life relies on many scalar and indexed QSP variables. Paralleax needs typed
story definitions and session values for:

- numbers, booleans, strings, enums, and dates;
- collections and keyed records;
- constrained ranges and default values;
- author-facing names separate from stable identifiers;
- typed conditions and effects;
- migration and cleanup behavior when a definition changes.

A generic unvalidated JSON variable bag would make imported behavior difficult
to edit and unsafe to execute.

### Time, Scheduling, and Recurrence

A full simulation needs:

- date, weekday, hour, and minute;
- action duration effects;
- opening hours and schedules;
- recurring daily, weekly, monthly, and seasonal events;
- delayed events, cooldowns, and deadlines;
- time-based trigger conditions;
- automatic hourly and daily maintenance effects.

### Richer Conditions and Effects

The current visited, location, character-presence, and numeric-stat rules are
not sufficient. Additional typed rules are needed for:

- variable comparison and collection membership;
- possession, quantity, and absence of items;
- relationship thresholds;
- time windows and schedules;
- random probability and weighted selection;
- mutually exclusive routes and event priorities;
- reusable predicates and compound boolean expressions;
- quantity-aware item transfer, consume, equip, and modify effects (exact item
  instance obtain/lose effects are implemented);
- movement, money transfer, time advancement, and quest updates;
- conditional effects and reusable effect sequences.

### Inventory, Equipment, and Economy

Current item instances only identify their definition and owner. A full import
needs:

- stack quantities;
- item categories, tags, prices, and vendors;
- containers and transfers;
- consumable behavior;
- equipment slots and outfit rules;
- per-instance durability, quality, and customization;
- shops, buying, selling, and service transactions;
- currency as a first-class or consistently typed resource.

ADR-013 now defines the target for these gaps: one recursive item-instance graph
with character/location roots and typed relationships. The gap remains
unimplemented until the compatibility migration, subtree moves, relationship
conditions/effects, and reader snapshot upgrade are complete.

### Character and Relationship Simulation

Characters need more than presence in an interaction:

- relationship definitions and directional values;
- character schedules and current locations;
- traits, roles, groups, and availability;
- per-character memory and event flags;
- conversations with reusable topics;
- party or companion membership;
- generated display names and player-selected identity fields.

### Reusable Procedures and Parameters

QSRC locations are also used as callable procedures. Avoid duplicating their
logic across interactions by adding:

- reusable authored actions or procedures;
- typed parameters and return values;
- local variables;
- reusable menus and dialogue fragments;
- explicit control-flow limits and recursion protection.

### Dynamic Text and Presentation

Girl Life renders conditional HTML-like text and media. Equivalent support
would require:

- safe text templates with typed interpolation;
- conditional paragraphs and pluralization;
- reusable content fragments;
- image, audio, and video assets with licensing metadata;
- galleries and character portraits;
- safe rich-text sanitization;
- responsive reader layouts beyond one interaction body.

### Action and Navigation Semantics

QSP actions can mutate state and navigate in one block. Paralleax would need:

- action labels distinct from destination interaction titles;
- multiple actions leading to the same interaction;
- actions that do not navigate;
- automatic interactions and redirects;
- modal menus and return-to-previous-location behavior;
- explicit endings, failure states, and repeatable ambient actions;
- priority rules when many actions are simultaneously available.

### World Topology

Current locations are labels attached to interactions. A simulation needs:

- location adjacency and travel routes;
- travel time and cost;
- indoor/outdoor and parent/child location hierarchy;
- restricted access and opening conditions;
- a stable current-world location independent of the current narrative node.

### Quests, Journal, and Objectives

A full implementation needs typed:

- quest definitions;
- stages and stage transitions;
- objectives and optional objectives;
- completion and failure conditions;
- journal entries and discovered information;
- UI for tracking progress without exposing internal identifiers.

### Randomness and Simulation Loops

Girl Life uses random events and periodic state changes. Paralleax needs:

- seeded random selection;
- weighted event pools;
- probability conditions;
- encounter cooldowns;
- mutually exclusive random events;
- background simulation ticks;
- protections against automatic-event loops.

### Modding and Import Tooling

A sustainable importer needs:

- a QSRC parser rather than regular-expression extraction;
- a control-flow graph that distinguishes calls, actions, and navigation;
- symbol tables for scalar and indexed variables;
- source spans and diagnostics for unsupported statements;
- stable source-to-Paralleax identifiers;
- incremental re-import and conflict handling;
- an extension/plugin boundary for unsupported mechanics;
- import reports with converted, approximated, skipped, and unsafe content;
- license and attribution metadata for every imported asset and text source.

## Editor and Operational Gaps

- A graph with thousands of interactions needs grouping, filtering, search,
  virtualization, and partial loading.
- Authors need bulk editing and definition management.
- Imported identifiers and source locations should be inspectable but hidden
  from normal readers.
- Validation must detect unreachable content, missing definitions, automatic
  loops, contradictory conditions, and invalid schedules.
- PostgreSQL imports should have a supported CLI/API path instead of requiring
  direct database access.
- Large stories need performance budgets and representative load tests.

## Recommended Implementation Order

1. Make migrations data-preserving, explicit, backed up, and restoration-tested.
2. Add lightweight story projections, targeted mutations, and bulk import
   persistence.
3. Add operational visibility, staging, import rollback, and published versions.
4. Implement persisted play sessions and typed variables.
5. Add time, typed conditions/effects, and explicit action semantics.
6. Add inventory quantities, economy, relationships, and character schedules.
7. Add quests, reusable procedures, dynamic text, and media.
8. Add seeded randomness and background event scheduling.
9. Make the editor scale to large stories.
10. Build a licensed, safety-aware QSRC parser and incremental importer.

Only after these foundations exist would a broad mechanical conversion be
maintainable. Reusing Girl Life prose or media would additionally require clear
permission from its rights holders and a content-safety review.

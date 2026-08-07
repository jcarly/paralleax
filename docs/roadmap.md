# Roadmap

This roadmap describes future and incremental work while preserving implemented
milestones where that history is useful.

For the authoritative implemented baseline, see [Current scope](current-scope.md).
The original narrative-core milestone is documented in [MVP](mvp.md).

## Current Direction

Near-term priorities are:

- production robustness and operational readiness;
- scalable authoring and graph navigation;
- explicit story revisions and conflict handling before collaborative editing;
- continued typed world-state expansion without a universal unvalidated variable bag;
- import/export foundations and compatibility tooling;
- progressive decomposition of large orchestration files as features touch them.

## V0.1 - Narrative Core — Implemented

- Story, Interaction, Trigger, and Reader.
- Graph editor.
- Interaction editing and movement without data loss.
- Trigger inputs, contextual triggers, OR variants, and cleanup.
- Visible save-state and deletion protections.
- PostgreSQL persistence.
- API, web, Playwright, and coverage tests.

## V0.2 - Persistence, Robustness, and Authoring Scale — In Progress

Implemented foundations include PostgreSQL migrations, health/readiness, stable
API errors, lightweight story summaries, targeted mutation persistence,
lazy-loaded route chunks, atomic trigger creation, large-story stress tests,
batched complete-story persistence, editor save protections, Story Canvas and
Simulation Mode foundations, and authenticated reader progress.

Remaining work includes:

- automated backups and verified restoration;
- staging, metrics, error reporting, and rollback;
- measured latency and payload budgets for large creator accounts;
- further targeted persistence commands;
- continued profiling before graph-performance changes;
- stable JSON/public import-export;
- Story Canvas and focus-mode refinement;
- stronger empty-state and keyboard guidance;
- whole-graph auto-layout with undo;
- broader interface internationalization;
- design-system and accessibility consolidation.

## V0.3 - Users, Permissions, Review, and Collaboration — Partial Foundation

Implemented:

- local user accounts;
- cookie sessions;
- creator-only story ownership.

Next:

- story revisions and explicit conflicts;
- editor merge/retry semantics;
- centralized access policy;
- account recovery and external identity;
- private/unlisted/public visibility;
- delegated rights;
- suggestions and review;
- event-log history;
- real-time collaboration only after conflict semantics are reliable.

## Publication Readiness

Before public publishing:

- separate mutable drafts from immutable published versions;
- validate stories before publication;
- add stable public reader URLs;
- define visibility;
- separate simulation tools from public reading;
- define reporting, moderation, ownership, and content licensing.

See [Production readiness](production-readiness.md).

## V0.4 - Typed World State — Partially Implemented

Implemented:

- locations and current-location conditions;
- characters, casts, and presence conditions;
- numeric character stats, effects, and comparisons;
- item definitions and exact item instances;
- deterministic inventory replay;
- recursive item-instance persistence and authoring;
- character/location roots and cycle-safe transfers;
- deterministic story-local time, durations, and scheduled trigger conditions.

Future increments:

- typed stable attributes, resources, skills, flags, traits, and temporary statuses;
- broader world-state conditions and effects;
- location reference-resolution UX;
- additional persisted runtime world state;
- playable points of view and directional relationships;
- neutral grouping for quests/chapters/arcs;
- author annotations;
- graph filters/focal points;
- explicit final interactions and story completion;
- equipment, possession conditions, tags, quantities, consumables, durability,
  modifiers, shops/economy, and advanced clothing semantics.

## V0.5 - Timing, Automatic Choices, and Probability — Partial Foundation

Implemented:

- interaction durations;
- calendar-based trigger availability.

Future:

- real-time choice countdowns;
- delayed automatic choices;
- appearance probability;
- probabilistic automatic choices.

## V0.6 - Import / Export Compatibility

Imports must remain adapters rather than specifications for the Paralleax core.

Preferred pipeline:

```text
source inventory
  -> parser
  -> source-neutral intermediate representation
  -> compatibility / unsupported-feature report
  -> Paralleax mapping
  -> validation
  -> import
```

Priorities:

- source-neutral intermediate representation;
- validation and compatibility reports;
- stable internal import APIs;
- representative adapters for complex external story systems;
- stable public import/export only after internal compatibility requirements are understood.

## V1.0 - Publishing, Exports, and Integrations

Potential directions:

- embeddable reader;
- hosted publishing and story sharing;
- web app or executable exports;
- managed media support;
- Unity exploration;
- AI experiments;
- progressive loading for large stories when measured sizes justify it.

These are product directions, not commitments to one implementation order.

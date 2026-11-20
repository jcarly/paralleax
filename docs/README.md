# Documentation

This folder is the product and technical source of truth for Paralleax.

The documentation distinguishes five kinds of information:

- **Vision and positioning**: where the product is going, and for whom first.
- **Current scope**: what is implemented and supported today.
- **Roadmap**: what comes next, in which order.
- **Milestone detail and history**: milestone goals and exit criteria, earlier
  delivery queues and decisions.
- **Reference**: domain, semantics, architecture, operations.

When documents disagree, follow the precedence documented in the repository
[`AGENTS.md`](../AGENTS.md#sources-of-truth).

## Start here

Pick the path that matches what you want to do.

### I want to write a Story

1. [Author guide](author-guide.md) · [Guide de l'auteur](author-guide.fr.md):
   concepts and a first tutorial.
2. [User guide](user-guide.md): every editor control in detail.
3. [Glossary](glossary.md): terms and interface labels in EN/FR/IT.

### I want to understand the product

1. [Vision](vision.md)
2. [Positioning](positioning.md): audience hypothesis, competitors, product test.
3. [Current scope](current-scope.md): what exists today.
4. [Roadmap](roadmap.md): what comes next.
5. [Non-goals](non-goals.md)
6. [Business model](business-model.md)

### I want to contribute code

1. [Contributing](../CONTRIBUTING.md) and [`AGENTS.md`](../AGENTS.md)
2. [Domain model](domain-model.md) and [Domain invariants](domain-invariants.md)
3. [Reader semantics](reader-semantics.md) and [Trigger semantics](triggers.md)
4. [Architecture](architecture.md) and [AI architecture map](architecture-map-ai.md)
5. [ADR index](decisions/README.md)
6. [AI development workflow](ai-workflow.md) and [Agent roles](agent-roles.md)

### I want to deploy or operate Paralleax

1. [Production readiness](production-readiness.md)
2. [Private alpha deployment](operations/alpha-deployment.md)
3. [PostgreSQL backup and restore](operations/postgresql-backup-and-restore.md)
4. [PostHog contextual feedback](operations/posthog-feedback.md)
5. [Hosting and scale](hosting-and-scale.md)
6. [Alpha test notice template](alpha-test-notice.template.md)

## All pages

### Product

- [Vision](vision.md)
- [Positioning](positioning.md)
- [Current scope](current-scope.md)
- [Roadmap](roadmap.md)
- [Roadmap history and milestone detail](roadmap-history.md)
- [MVP](mvp.md) (historical)
- [Non-goals](non-goals.md)
- [Business model](business-model.md)
- [Open questions](open-questions.md)
- [Product discovery synthesis](product-discovery-synthesis.md)
- [Workbench product direction](workbench.md)

### Authors

- [Author guide](author-guide.md) · [Guide de l'auteur](author-guide.fr.md)
- [User guide](user-guide.md)
- [Glossary](glossary.md)
- [ChoiceScript import](choicescript-import.md)
- [QSP import](qsp-import.md)

### Domain and semantics

- [Domain model](domain-model.md)
- [Domain invariants](domain-invariants.md)
- [Reader semantics](reader-semantics.md)
- [Trigger semantics](triggers.md)
- [Simulation](simulation.md)
- [Annotations](annotations.md)
- [Interaction inclusion proposal](interaction-inclusion-proposal.md) (not accepted)

### Architecture and engineering

- [Architecture](architecture.md)
- [AI architecture map](architecture-map-ai.md)
- [ADR index](decisions/README.md)
- [UML diagrams](uml/README.md)
- [AI development workflow](ai-workflow.md)
- [Agent roles](agent-roles.md)
- [React best practices](react-best-practices.md)
- [Test scenarios](test-scenarios.md)
- [Code quality backlog](code-quality-backlog.md)
- [npm warning triage](npm-warning-triage.md)
- [Large QSP import lessons](large-qsp-import-lessons.md)
- [Meteor prototype refactor notes](../MIGRATION.md)

### Design and UX

- [Design principles](design-principles.md)
- [UX principles](ux-principles.md)
- [UI direction](ui-direction.md)
- [UI prototype](ui-prototype.md)
- [Design system](design-system.md)
- [Story Canvas](story-canvas.md)
- [Auto layout](auto-layout.md)
- [Navigation](navigation.md)
- [Authoring guide architecture](onboarding.md)
- [Mockups](mockups/README.md)

### Operations

- [Production readiness](production-readiness.md)
- [Hosting and scale](hosting-and-scale.md)
- [Private alpha deployment](operations/alpha-deployment.md)
- [PostgreSQL backup and restore](operations/postgresql-backup-and-restore.md)
- [PostHog contextual feedback](operations/posthog-feedback.md)
- [Alpha test notice template](alpha-test-notice.template.md)

### Audits (dated snapshots)

Audits record the state at a date. They are evidence, not current behaviour.

- [Design system, 2026-10-22](audits/design-system-2026-10-22.md)
- [Library reuse, 2026-10-25](audits/library-reuse-2026-10-25.md)
- [Quality gates, 2026-10-26](audits/2026-10-26-quality-gates.md)
- [Story persistence, 2026-11-03](audits/2026-11-03-story-persistence.md)
- [Graph editor, 2026-11-04](audits/2026-11-04-graph-editor.md)
- [Group validation, 2026-11-04](audits/2026-11-04-group-validation.md)
- [Reader replay, 2026-11-04](audits/2026-11-04-reader-replay.md)
- [Secondary debt, 2026-11-04](audits/2026-11-04-secondary-debt.md)
- [Shared engine, 2026-11-04](audits/2026-11-04-shared-engine.md)

- [Changelog](../CHANGELOG.md)

## Important rules

- `current-scope.md` is the authoritative summary of what exists today.
- `roadmap.md` decides the order of upcoming work. `roadmap-history.md` keeps
  milestone detail and earlier decisions; it does not decide priorities.
- `mvp.md` is historical and must not be used to remove or forbid already
  implemented post-MVP capabilities.
- Domain behaviour must remain aligned with `domain-invariants.md`,
  `reader-semantics.md`, accepted ADRs, and current tests.
- React Flow is a projection of the Story model, not a second canonical model.
- Author-facing pages must describe planned capabilities as planned.

## Planning sources

- [Roadmap](roadmap.md) orders upcoming work and records dated priority
  decisions.
- [Positioning](positioning.md) records the audience hypothesis and the decisions
  that audience requires.
- [Product discovery synthesis](product-discovery-synthesis.md) keeps
  anonymized product reflections. Identifiable source records stay in Drive,
  outside this public repository; priorities flow through the roadmap.
- [Large QSP import lessons](large-qsp-import-lessons.md) records source-neutral
  engineering reflections from large-corpus analysis.
- [Interaction inclusion proposal](interaction-inclusion-proposal.md) records an
  unaccepted native composition direction. The QSP adapter already maps a
  limited static, acyclic `GS` / `GOSUB` subset through ordinary interactions;
  native inclusion would address screen-composition behavior beyond that
  traversal approximation.
- [Production readiness](production-readiness.md) owns release and operational gates.
- [Code quality backlog](code-quality-backlog.md) owns implementation debt,
  measurements, dependency watches, and incremental maintainability work.

## Maintenance

- Update [the changelog](../CHANGELOG.md) for notable changes.
- Update [current scope](current-scope.md) when the implemented baseline changes materially.
- Update the [Author guide](author-guide.md) and its French version together when
  an author-facing workflow or label changes.
- Update this index when documentation pages are added, renamed, or moved.
- Record priority changes in the [Roadmap](roadmap.md); prefer marking old
  milestone items as implemented or historical in
  [roadmap-history.md](roadmap-history.md) rather than rewriting history.

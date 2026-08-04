# Documentation

This folder is the product and technical source of truth for the project.

## Recommended Reading Order

1. [Vision](vision.md): problem, product direction, inspirations, and target uses.
2. [MVP scope](mvp.md): strict scope of the current version.
3. [Domain model](domain-model.md): MVP model and target model.
4. [Glossary](glossary.md): shared vocabulary for product, code, tests, and UI copy.
5. [Domain invariants](domain-invariants.md): rules the model and editor projection must preserve.
6. [Reader semantics](reader-semantics.md): current execution rules for available interactions.
7. [Trigger semantics](triggers.md): trigger inputs, deletion behavior, and editing UX.
8. [User guide](user-guide.md): current authoring workflow.
9. [Architecture](architecture.md): technical organization of the monorepo.
10. [Design principles](design-principles.md): UX and technical principles.
11. [UX principles](ux-principles.md): product UX rules that keep views aligned.
12. [UI direction](ui-direction.md): target Story Canvas, filters, and inspector model.
13. [Story Canvas](story-canvas.md): current canvas UX rules and open tuning points.
14. [Auto layout](auto-layout.md): whole-graph reorganization direction.
15. [Navigation](navigation.md): model and story navigation direction.
16. [Simulation](simulation.md): author-facing test and debugging direction.
17. [Annotations](annotations.md): target authoring notes concept.
18. [Design system](design-system.md): visual identity and reusable UI rules to define.
19. [Mockups](mockups/README.md): static UX references for canvas and simulation design.
20. [Business model](business-model.md): open source core and platform philosophy.
21. [Hosting and scale](hosting-and-scale.md): durable deployment and growth principles.
22. [React best practices](react-best-practices.md): performance rules adapted to React, Vite, and React Flow.
23. [Non-goals](non-goals.md): boundaries that protect the product direction.
24. [Test scenarios](test-scenarios.md): test scenarios to maintain.
25. [Roadmap](roadmap.md): planned progression after the MVP.
26. [Open questions](open-questions.md): postponed product and architecture questions.
27. [Code quality backlog](code-quality-backlog.md): prioritized implementation debt from code reviews.
28. [Changelog](../CHANGELOG.md): notable implementation, test, and documentation changes.

## Documentation Map

```text
docs/
  README.md                 Documentation index
  vision.md                 Product intent and long-term direction
  mvp.md                    Current MVP boundaries
  domain-model.md           Domain model and target model
  glossary.md               Shared product and technical vocabulary
  domain-invariants.md      Domain and editor projection rules
  reader-semantics.md       Reader execution rules
  triggers.md               Trigger semantics and editor rules
  user-guide.md             Current authoring workflow
  architecture.md           Technical architecture
  design-principles.md      UX and engineering principles
  ux-principles.md          Product UX principles
  ui-direction.md           Target Story Canvas and filtering direction
  story-canvas.md           Current Story Canvas UX rules
  auto-layout.md            Whole-graph reorganization direction
  navigation.md             Model and story navigation direction
  simulation.md             Author-facing simulation direction
  annotations.md            Target authoring annotation concept
  design-system.md          Visual identity and reusable UI rules
  mockups/                  Static UX mockups
  business-model.md         Open source and platform philosophy
  hosting-and-scale.md      Deployment and scalability direction
  react-best-practices.md   React, Vite, and React Flow performance rules
  non-goals.md              Product boundaries and non-objectives
  test-scenarios.md         Regression scenarios
  roadmap.md                Product progression
  open-questions.md         Postponed product and architecture questions
  code-quality-backlog.md   Prioritized code-review follow-up work
  decisions/                Architecture decision records and ADR index
  uml/                      MVP and vision diagrams
../CHANGELOG.md             Change tracking and maintenance rules
```

## Decision Records

- [ADR index](decisions/README.md)
- [ADR-001 - Minimal MVP](decisions/ADR-001-minimal-mvp.md)
- [ADR-002 - React, NestJS, and TypeScript](decisions/ADR-002-stack.md)
- [ADR-003 - Engine First](decisions/ADR-003-engine-first.md)
- [ADR-004 - React Flow Boundary](decisions/ADR-004-react-flow-boundary.md)
- [ADR-005 - PostgreSQL Story Persistence](decisions/ADR-005-postgresql-story-persistence.md)
- [ADR-006 - Users, Sessions, and Story Ownership](decisions/ADR-006-users-and-sessions.md)

## Diagrams

- [UML overview](uml/README.md)

## Important Rule

The target model can be documented, but the code must stay limited to the MVP until it is validated.

## Maintenance

- Update [the changelog](../CHANGELOG.md) for every user-visible, architectural, testing, or documentation change.
- Update this index when documentation pages are added, renamed, or moved.
- Update [test scenarios](test-scenarios.md) when a new regression test captures important author-facing behavior.

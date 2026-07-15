# Documentation

This folder is the product and technical source of truth for the project.

## Recommended Reading Order

1. [Vision](vision.md): problem, product direction, inspirations, and target uses.
2. [MVP scope](mvp.md): strict scope of the current version.
3. [Domain model](domain-model.md): MVP model and target model.
4. [Glossary](glossary.md): shared vocabulary for product, code, tests, and UI copy.
5. [Domain invariants](domain-invariants.md): rules the model and editor projection must preserve.
6. [Trigger semantics](triggers.md): trigger inputs, deletion behavior, and editing UX.
7. [User guide](user-guide.md): current authoring workflow.
8. [Architecture](architecture.md): technical organization of the monorepo.
9. [Design principles](design-principles.md): UX and technical principles.
10. [Test scenarios](test-scenarios.md): test scenarios to maintain.
11. [Roadmap](roadmap.md): planned progression after the MVP.
12. [Open questions](open-questions.md): postponed product and architecture questions.
13. [Changelog](../CHANGELOG.md): notable implementation, test, and documentation changes.

## Documentation Map

```text
docs/
  README.md                 Documentation index
  vision.md                 Product intent and long-term direction
  mvp.md                    Current MVP boundaries
  domain-model.md           Business model and future model
  glossary.md               Shared product and technical vocabulary
  domain-invariants.md      Domain and editor projection rules
  triggers.md               Trigger semantics and editor rules
  user-guide.md             Current authoring workflow
  architecture.md           Technical architecture
  design-principles.md      UX and engineering principles
  test-scenarios.md         Regression scenarios
  roadmap.md                Product progression
  open-questions.md         Postponed product and architecture questions
  decisions/                Architecture decision records
  uml/                      MVP and vision diagrams
../CHANGELOG.md             Change tracking and maintenance rules
```

## Decision Records

- [ADR-001 - Minimal MVP](decisions/ADR-001-minimal-mvp.md)
- [ADR-002 - Stack](decisions/ADR-002-stack.md)
- [ADR-003 - Engine first](decisions/ADR-003-engine-first.md)

## Diagrams

- [UML overview](uml/README.md)

## Important Rule

The target model can be documented, but the code must stay limited to the MVP until it is validated.

## Maintenance

- Update [the changelog](../CHANGELOG.md) for every user-visible, architectural, testing, or documentation change.
- Update this index when documentation pages are added, renamed, or moved.
- Update [test scenarios](test-scenarios.md) when a new regression test captures important author-facing behavior.

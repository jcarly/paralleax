# Documentation

This folder is the product and technical source of truth for Paralleax.

The documentation distinguishes four kinds of information:

- **Vision**: where the product is going.
- **Current scope**: what is implemented and supported today.
- **Historical milestones**: what earlier MVP/version goals established.
- **Roadmap**: what is planned, incomplete, or intentionally deferred.

When documents disagree, follow the precedence documented in the repository
`AGENTS.md`.

## Recommended Reading Order

1. [Vision](vision.md)
2. [Current scope](current-scope.md)
3. [Domain model](domain-model.md)
4. [Glossary](glossary.md)
5. [Domain invariants](domain-invariants.md)
6. [Reader semantics](reader-semantics.md)
7. [Trigger semantics](triggers.md)
8. [Architecture](architecture.md)
9. [AI development workflow](ai-workflow.md)
10. [AI architecture map](architecture-map-ai.md)
11. [Agent roles](agent-roles.md)
12. [User guide](user-guide.md)
13. [Design principles](design-principles.md)
14. [UX principles](ux-principles.md)
15. [UI direction](ui-direction.md)
16. [Story Canvas](story-canvas.md)
17. [Auto layout](auto-layout.md)
18. [Navigation](navigation.md)
19. [Simulation](simulation.md)
20. [Annotations](annotations.md)
21. [Design system](design-system.md)
22. [Mockups](mockups/README.md)
23. [Business model](business-model.md)
24. [Hosting and scale](hosting-and-scale.md)
25. [Production readiness](production-readiness.md)
26. [React best practices](react-best-practices.md)
27. [Non-goals](non-goals.md)
28. [Test scenarios](test-scenarios.md)
29. [Roadmap](roadmap.md)
30. [MVP](mvp.md)
31. [Open questions](open-questions.md)
32. [Code quality backlog](code-quality-backlog.md)
33. [Changelog](../CHANGELOG.md)

## Important Rules

- `current-scope.md` is the authoritative summary of what exists today.
- `mvp.md` is historical and must not be used to remove or forbid already
  implemented post-MVP capabilities.
- `roadmap.md` contains future, incomplete, and incremental work.
- Domain behavior must remain aligned with `domain-invariants.md`,
  `reader-semantics.md`, accepted ADRs, and current tests.
- React Flow is a projection of the story model, not a second canonical model.

## Maintenance

- Update [the changelog](../CHANGELOG.md) for notable changes.
- Update [current scope](current-scope.md) when the implemented baseline changes materially.
- Update this index when documentation pages are added, renamed, or moved.
- Prefer marking old roadmap items as implemented or historical rather than
  rewriting history.

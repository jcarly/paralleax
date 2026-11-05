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
13. [Authoring guide architecture](onboarding.md)
14. [Design principles](design-principles.md)
15. [UX principles](ux-principles.md)
16. [UI direction](ui-direction.md)
17. [Story Canvas](story-canvas.md)
18. [Auto layout](auto-layout.md)
19. [Navigation](navigation.md)
20. [Simulation](simulation.md)
21. [Annotations](annotations.md)
22. [Design system](design-system.md)
23. [Design-system audit snapshot — 2026-10-22](audits/design-system-2026-10-22.md)
24. [Mockups](mockups/README.md)
25. [Business model](business-model.md)
26. [Hosting and scale](hosting-and-scale.md)
27. [Production readiness](production-readiness.md)
28. [Private alpha deployment](operations/alpha-deployment.md)
29. [Formbricks contextual feedback](operations/formbricks-feedback.md)
30. [Alpha test notice template](alpha-test-notice.template.md)
31. [React best practices](react-best-practices.md)
32. [Non-goals](non-goals.md)
33. [Test scenarios](test-scenarios.md)
34. [Roadmap](roadmap.md)
35. [MVP](mvp.md)
36. [Open questions](open-questions.md)
37. [Code quality backlog](code-quality-backlog.md)
38. [Changelog](../CHANGELOG.md)

## Important Rules

- `current-scope.md` is the authoritative summary of what exists today.
- `mvp.md` is historical and must not be used to remove or forbid already
  implemented post-MVP capabilities.
- `roadmap.md` contains future, incomplete, and incremental work.
- Domain behavior must remain aligned with `domain-invariants.md`,
  `reader-semantics.md`, accepted ADRs, and current tests.
- React Flow is a projection of the story model, not a second canonical model.

## Planning Sources

- [Roadmap](roadmap.md) orders user capabilities and durable product milestones.
- [Interaction inclusion proposal](interaction-inclusion-proposal.md) records an
  unaccepted native composition direction. The QSP adapter already maps a
  limited static, acyclic `GS` / `GOSUB` subset through ordinary interactions;
  native inclusion would address screen-composition behavior beyond that
  traversal approximation.
- [Production readiness](production-readiness.md) owns release and operational gates.
- [Code quality backlog](code-quality-backlog.md) owns implementation debt,
  measurements, dependency watches, and incremental maintainability work.
- Historical feedback queues remain in the roadmap for context, but completed
  entries are not an active delivery queue.

## Maintenance

- Update [the changelog](../CHANGELOG.md) for notable changes.
- Update [current scope](current-scope.md) when the implemented baseline changes materially.
- Update this index when documentation pages are added, renamed, or moved.
- Prefer marking old roadmap items as implemented or historical rather than
  rewriting history.

# Contributing

Thank you for your interest in Paralleax. The project is in a guided private
alpha and its priorities change quickly, so please open an issue before starting
substantial work.

**Licence:** no licence has been chosen yet (see
[Business model](docs/business-model.md)). Until a `LICENSE` file is added,
contributions cannot be accepted under clear terms; please discuss in an issue
first.

## Ways to help

- **Try it as an author** and report what blocked or slowed you down. Start from
  the [Author guide](docs/author-guide.md) and open an issue describing the task,
  what you expected, and what happened.
- **Improve the documentation**: typos, outdated statements, missing examples.
  [Current scope](docs/current-scope.md) is the reference for what exists.
- **Code**: bug fixes and items already agreed in the
  [Roadmap](docs/roadmap.md) or the
  [Code quality backlog](docs/code-quality-backlog.md).

## Before writing code

1. Read [AGENTS.md](AGENTS.md). It applies to human contributors as well as AI
   agents: source precedence, architectural boundaries, reuse-first rule,
   quality gates, and the completion report.
2. Read the documents relevant to your change, at least
   [Vision](docs/vision.md), [Current scope](docs/current-scope.md),
   [Domain model](docs/domain-model.md), and
   [Domain invariants](docs/domain-invariants.md).
3. Check the [ADRs](docs/decisions/README.md). A durable architectural decision
   needs an ADR before it is implemented.
4. If the change touches product behaviour, agree the expected behaviour in the
   issue first.

## Development setup

Requirements, installation, local URLs, environment variables, Docker, and the
test commands are in the [README](README.md#requirements).

## Branches, commits, and pull requests

- One feature or fix per branch.
- Use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Keep the change focused; do not reformat or refactor unrelated code.
- Every behaviour change needs tests. Update semantic documentation and
  `CHANGELOG.md` for notable changes, and `docs/current-scope.md` when the
  implemented baseline changes.
- Before opening a pull request, run at least:

  ```bash
  npm run lint
  npm run lint:architecture
  npm run typecheck
  npm run test
  ```

  and the Playwright suite for editor or reader flows. The full list is in
  [AGENTS.md → Verification matrix](AGENTS.md#verification-matrix).

- Never add a lint suppression or grow a quality baseline to make CI pass.
- Describe in the pull request what changed, why, how it was verified, and any
  known limitation.

## Documentation conventions

- Code, tests, UI copy, and technical documentation are in English. Author-facing
  guides may also exist in French (`*.fr.md`).
- Use the terms defined in the [Glossary](docs/glossary.md).
- Mark capabilities as implemented or planned; do not describe planned behaviour
  as if it existed.
- Add new pages to the [documentation index](docs/README.md).

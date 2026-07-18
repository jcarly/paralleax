# Paralleax

Paralleax is an editor and engine for interactive scenarios.

This repository contains the TypeScript refactor of the prototype, with a deliberately small MVP scope so the core product can be stabilized before advanced concepts are added.

## MVP Scope

The MVP only covers:

- `Story`: an interactive scenario.
- `Interaction`: a narrative block displayed in the editor and reader.
- `Trigger`: the rule that makes an interaction available from one or more input interactions.
- `Reader`: story execution through successive choices.

Characters, places, variables, AI, real-time collaboration, delegated permissions, and
player save persistence are intentionally out of scope until the MVP is
validated.

## Architecture

- `apps/web`: React + Vite + React Flow application.
- `apps/api`: NestJS API backed by PostgreSQL story persistence.
- `packages/shared`: shared MVP model, reader rules, story operations, trigger cleanup rules, merge rules, and graph placement helpers used by both the web app and API.
- `docs`: product, architecture, ADR, UML, and test scenario documentation.

The API persists authored stories in PostgreSQL. The MVP stores each story as a
domain JSON document so the database does not reshape trigger semantics before
the narrative core is stable.

## Documentation

Start with the documentation index: [docs/README.md](docs/README.md).

Recommended reading order:

1. [Vision](docs/vision.md): product intent and long-term direction.
2. [MVP scope](docs/mvp.md): what is intentionally included or excluded right now.
3. [Domain model](docs/domain-model.md): Story, Interaction, Trigger, Reader, and future concepts.
4. [Glossary](docs/glossary.md): shared vocabulary for product, code, tests, and UI copy.
5. [Domain invariants](docs/domain-invariants.md): rules the model and editor projection must preserve.
6. [Reader semantics](docs/reader-semantics.md): current execution rules for available interactions.
7. [Trigger semantics](docs/triggers.md): input rules, deletion behavior, and trigger editing UX.
8. [User guide](docs/user-guide.md): current authoring workflow.
9. [Architecture](docs/architecture.md): monorepo structure and runtime flow.
10. [Design principles](docs/design-principles.md): UX and technical principles.
11. [UI direction](docs/ui-direction.md): target Story Canvas, filters, and inspector model.
12. [Non-goals](docs/non-goals.md): product boundaries and non-objectives.
13. [Test scenarios](docs/test-scenarios.md): critical regression scenarios.
14. [Roadmap](docs/roadmap.md): planned progression after the MVP.
15. [Open questions](docs/open-questions.md): postponed product and architecture questions.
16. [Changelog](CHANGELOG.md): notable implementation, test, and documentation changes.

Supporting references:

- [ADR index](docs/decisions/README.md): architecture decision records.
- [UML diagrams](docs/uml/README.md): MVP and long-term model diagrams.
- [Meteor prototype refactor notes](MIGRATION.md): mapping from the original prototype to this refactor.
- [Project changelog](CHANGELOG.md): chronological implementation notes and maintenance rules.
- [Hosting and scale](docs/hosting-and-scale.md): durable deployment and growth principles.

## Requirements

- Node.js 24.x
- npm 12+

On PowerShell, use `npm.cmd` if `npm` is blocked by the Windows execution policy.

## Installation

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Local URLs:

- Web: http://localhost:5173
- API: http://localhost:3000/api

The API expects PostgreSQL. By default it uses:

```dotenv
DATABASE_URL=postgres://paralleax:paralleax@localhost:5432/paralleax
```

Stories created before accounts were introduced remain quarantined by default.
To assign them to a specific local account, set `LEGACY_STORY_OWNER_EMAIL` before
that account registers or signs in:

```dotenv
LEGACY_STORY_OWNER_EMAIL=author@example.com
```

Using Docker Compose is the easiest way to start the API, web app, and local
database together.

## Tests

Run all unit and component tests:

```bash
npm run test
```

Run one workspace only:

```bash
npm run test -w @paralleax/api
npm run test -w @paralleax/web
npm run test -w @paralleax/shared
```

Run the API integration tests against the Docker PostgreSQL service:

```powershell
docker compose exec -T -e POSTGRES_TEST_DATABASE_URL=postgres://paralleax:paralleax@db:5432/paralleax api npm run test:postgres -w @paralleax/api
```

These commands cover:

- Shared: Vitest tests for narrative rules, story operations, trigger cleanup, stale-response merge behavior, and graph placement helpers.
- API: Jest/Supertest tests for the NestJS endpoints.
- Web: Vitest/Testing Library tests for pages, components, and API calls.

## Playwright Functional Tests

Install Chromium once:

```bash
npm run playwright:install -w @paralleax/web
```

Run the functional scenarios:

```bash
npm run test:e2e -w @paralleax/web
```

Playwright automatically starts the `apps/web` Vite server during the tests.

## Test Coverage

```bash
npm run coverage
```

Generated HTML reports:

- `apps/api/coverage/index.html`
- `apps/web/coverage/index.html`
- `packages/shared/coverage/index.html`

Run one workspace only:

```bash
npm run coverage -w @paralleax/api
npm run coverage -w @paralleax/web
npm run coverage -w @paralleax/shared
```

## Typecheck and Build

```bash
npm run lint
npm run format
npm run typecheck
npm run build
```

Full verification before pushing:

```bash
npm run lint
npm run format
npm run typecheck
npm run test
npm run test:e2e -w @paralleax/web
npm run coverage
npm run build
```

## GitLab CI

CI is defined in `.gitlab-ci.yml`.

It runs on every commit pushed to GitLab and on merge requests. It executes:

- ESLint;
- Prettier format check;
- TypeScript typecheck;
- shared, API, and web coverage;
- full monorepo build;
- Playwright functional tests.

Coverage reports and the Playwright HTML report are kept as GitLab artifacts.

## Docker

The Docker setup pins the environment to Node.js 24 and starts a local
PostgreSQL database for persisted MVP stories.

In development, the repository is mounted inside the container. Source changes are picked up by Vite and Nest watch mode without rebuilding the Docker image.

Start the stack:

```bash
cp .env.example .env
docker compose up
```

On PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up
```

Then open http://localhost:5173. The API is exposed at http://localhost:3000/api.
PostgreSQL is exposed at `localhost:5432` and stores data in the
`postgres-data` Docker volume.

Useful commands:

```bash
npm run docker:up
npm run docker:logs
npm run docker:down
```

If dependencies change, restart the stack. Compose runs one shared `npm ci`
before starting the API and web services:

```bash
docker compose down
docker compose up
```

Container dependencies live in a dedicated `node-modules` volume. This keeps
Linux dependencies separate from the host and prevents the API and web services
from installing into the same directory concurrently.

Refresh everything from a clean container state:

```bash
docker compose down -v
docker compose up
```

If the machine is behind a proxy, fill `.env`:

```dotenv
HTTP_PROXY=http://proxy.example:8080
HTTPS_PROXY=http://proxy.example:8080
NO_PROXY=localhost,127.0.0.1,api,web
```

Credentials that may appear in proxy URLs must never be committed. The `.env` file is ignored by Git.

Docker does not bypass a proxy or firewall: the build must still be able to reach `registry.npmjs.org`.

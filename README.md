# Paralleax

Paralleax is an editor and runtime engine for complex interactive scenarios.

The project started from a deliberately small narrative MVP and has since expanded
into a broader authoring and execution platform with persisted world context,
reader state, simulation tools, and production-oriented foundations.

## Current Product Scope

The authoritative description of what is implemented today lives in
[Current scope](docs/current-scope.md).

The current baseline includes:

- Story authoring and PostgreSQL persistence.
- Interactions with rich content, graph positions, context, effects, and duration.
- Triggers with multiple input interactions and typed conditions.
- Reader execution and persisted authenticated reader progress.
- Deterministic story-local calendar time.
- Locations and characters.
- Reusable character stats and stat effects.
- Reusable item definitions and exact authored item instances.
- Recursive item-instance relationships rooted at characters or locations.
- React Flow graph authoring and simulation-oriented diagnostics.
- Authentication, sessions, creator ownership, migrations, health/readiness, and
  production-oriented API error handling.
- Unit, integration, PostgreSQL, component, and Playwright testing.

The original MVP remains documented as a historical milestone in
[MVP](docs/mvp.md). Future work belongs in the [Roadmap](docs/roadmap.md).

## Architecture

- `apps/web`: React + Vite + React Flow application.
- `apps/api`: NestJS API backed by PostgreSQL.
- `packages/shared`: framework-independent domain model, deterministic reader
  semantics, story operations, trigger rules, time/state logic, and graph helpers.
- `docs`: product, architecture, ADR, UX, testing, operations, and workflow documentation.

The API persists authored story state relationally in PostgreSQL. Reader progress
is persisted separately from authored state. React Flow is a projection of the
Paralleax model and is never the canonical story representation.

## Documentation

Start with the documentation index: [docs/README.md](docs/README.md).

Recommended reading order:

1. [Vision](docs/vision.md)
2. [Current scope](docs/current-scope.md)
3. [Domain model](docs/domain-model.md)
4. [Domain invariants](docs/domain-invariants.md)
5. [Reader semantics](docs/reader-semantics.md)
6. [Trigger semantics](docs/triggers.md)
7. [Architecture](docs/architecture.md)
8. [AI development workflow](docs/ai-workflow.md)
9. [User guide](docs/user-guide.md)
10. [Roadmap](docs/roadmap.md)
11. [MVP](docs/mvp.md)
12. [Changelog](CHANGELOG.md)

Supporting references:

- [Glossary](docs/glossary.md)
- [Design principles](docs/design-principles.md)
- [UX principles](docs/ux-principles.md)
- [UI direction](docs/ui-direction.md)
- [Story Canvas](docs/story-canvas.md)
- [Simulation](docs/simulation.md)
- [Non-goals](docs/non-goals.md)
- [Test scenarios](docs/test-scenarios.md)
- [Production readiness](docs/production-readiness.md)
- [Private alpha deployment](docs/operations/alpha-deployment.md)
- [ADR index](docs/decisions/README.md)
- [UML diagrams](docs/uml/README.md)
- [Hosting and scale](docs/hosting-and-scale.md)
- [Meteor prototype refactor notes](MIGRATION.md)

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
- API: http://localhost:3300/api

The API expects PostgreSQL. By default it uses:

```dotenv
DATABASE_URL=postgres://paralleax:paralleax@localhost:5432/paralleax
```

The API also validates `PORT`, `POSTGRES_SSL`, `POSTGRES_SSL_CA`, `CORS_ORIGIN`,
`REGISTRATION_MODE`, and `NODE_ENV` at startup. `DATABASE_URL`, `CORS_ORIGIN`,
and `REGISTRATION_MODE` must be explicit in production. OpenAPI documentation is
available at http://localhost:3300/api/docs outside production.

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
docker compose exec -T db createdb -U paralleax paralleax_test
$env:POSTGRES_TEST_DATABASE_URL='postgres://paralleax:paralleax@localhost:5432/paralleax_test'
npm run test:postgres -w @paralleax/api
```

Create `paralleax_test` only once; `createdb` reports that it already exists on
later runs. Never point `POSTGRES_TEST_DATABASE_URL` at the development database:
the migration suite deliberately rebuilds the tested `public` schema.

Run the opt-in large-story stress test against the same isolated database:

```powershell
$env:POSTGRES_TEST_DATABASE_URL='postgres://paralleax:paralleax@localhost:5432/paralleax_test'
$env:RUN_POSTGRES_STRESS_TESTS='true'
npm run test:stress:postgres -w @paralleax/api
```

## Playwright Functional Tests

Install Chromium once:

```bash
npm run playwright:install -w @paralleax/web
```

Run the functional scenarios:

```bash
npm run test:e2e -w @paralleax/web
```

## Test Coverage

```bash
npm run coverage
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

## Continuous Integration

GitHub Actions runs the following verification baseline on pushes and pull
requests, and can also be started manually:

- ESLint;
- Prettier format check;
- TypeScript typecheck;
- high-severity production dependency audit;
- shared, API, and web test/coverage suites;
- full monorepo build;
- Playwright functional tests;
- production Compose validation and API/web image builds.

Coverage and Playwright reports are retained as workflow artifacts for seven
days. PostgreSQL integration runs against PostgreSQL 17 and verifies backup
restoration with the matching version of `pg_dump`.

## Docker

The Docker setup pins the environment to Node.js 24 and starts a local
PostgreSQL database for persisted Paralleax stories and reader progress.

In development, the repository is mounted inside the container. Source changes
are picked up by Vite and Nest watch mode without rebuilding the Docker image.

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

Then open http://localhost:5173. The API is exposed at http://localhost:3300/api.
PostgreSQL is exposed at `localhost:5432` and stores data in the
`postgres-data` Docker volume.

## Private Alpha Deployment

The repository includes separate production targets for the API and web app,
plus a migration-first Compose topology connected to an external managed
PostgreSQL database:

```bash
docker build --target api --tag paralleax-api:local .
docker build --target web --tag paralleax-web:local .
docker compose --env-file .env.production -f compose.production.yaml up
```

Start from `.env.production.example`, but store real values in the deployment
provider's secret manager. Production account creation must explicitly use
`open`, `access-code`, or `closed`; `access-code` is recommended for a private
alpha.

After deployment, verify the public web path, API process, database connection,
and migration state:

```bash
npm run smoke:deployment -- https://alpha.example.com
```

Do not invite users until the provider-specific gates in the
[private alpha runbook](docs/operations/alpha-deployment.md) are complete.

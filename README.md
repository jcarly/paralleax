# Paralleax

Paralleax is a collaborative web tool for designing and testing interactive
narratives with rich world state: characters, locations, items, time, and typed
variables. Its deterministic engine can explain why a scene is or is not
available, and Stories can be read directly on the platform.

**Status: guided private alpha.** Use disposable test projects only. Do not rely
on Paralleax for valuable project data until the backup and restore gates in
[Production readiness](docs/production-readiness.md) are complete.

**Audience hypothesis being tested first:** game studios and visual-novel teams.
See [Positioning](docs/positioning.md).

## Where to start

- **Writing a Story:** [Author guide](docs/author-guide.md) ·
  [Guide de l'auteur (français)](docs/author-guide.fr.md)
- **Understanding the product:** [Vision](docs/vision.md) ·
  [Positioning](docs/positioning.md) · [Roadmap](docs/roadmap.md)
- **Contributing code or documentation:** [Contributing](CONTRIBUTING.md) ·
  [Documentation index](docs/README.md) · [AGENTS.md](AGENTS.md)

## What exists today

Labels: **Shipped** works in the current alpha. **Partial** works, but an
important part of the expected capability is missing (the summary says which).
**Experimental** works on a limited subset and reports what it cannot handle.
**Planned** is not implemented.
The authoritative detail is [Current scope](docs/current-scope.md).

| Area                            | Status       | Summary                                                                                                                         |
| ------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Story graph editor              | Shipped      | Interactions, Triggers, rich content, auto-layout, nested Groups, search, frames and text, durable undo/redo                    |
| World state                     | Shipped      | Typed variables and expressions, locations, characters, items with nested instances, story-local calendar                       |
| Availability rules              | Shipped      | Several inputs per Trigger, OR groups of AND conditions, seeded probability, timers                                             |
| Simulation Mode                 | Shipped      | Condition diagnostics, forced paths, Back, seeded replay, separate autosave, named saves                                        |
| Reader                          | Shipped      | Playable character, inventory, saved progress for signed-in readers                                                             |
| Review                          | Shipped      | Anchored comment threads with replies and resolution, live updates                                                              |
| Shared editing                  | Partial      | Live synchronisation: other editors' changes reload automatically on the same server. No text merge, presence, or offline queue |
| Access control                  | Shipped      | Accounts, per-Story visibility (private, unlisted, signed-in, public), reader and editor grants                                 |
| Interface languages             | Shipped      | English, French, Italian. Story content is not translated                                                                       |
| Imports                         | Experimental | Small ChoiceScript projects and a QSP subset, with compatibility reports                                                        |
| Story format, export            | Planned      | Next priority; engine integration to validate, see [Roadmap](docs/roadmap.md#next)                                              |
| Text source mode                | Planned      | Ink-inspired syntax proposed in [ADR-043](docs/decisions/ADR-043-ink-inspired-narrative-source.md)                              |
| `Why unavailable?` on the graph | Planned      | [Workbench](docs/workbench.md)                                                                                                  |
| Immutable publishing            | Planned      | V0.9, see [Roadmap history](docs/roadmap-history.md)                                                                            |

**Licence:** not yet chosen. Until a licence file is added, no reuse rights are
granted. See [Business model](docs/business-model.md).

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

The [documentation index](docs/README.md) lists every page and its purpose.
The original MVP is kept as a historical milestone in [MVP](docs/mvp.md).

## Requirements

- Node.js 26.x
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

- Web: http://127.0.0.1:5173
- API: http://localhost:3000/api

Contextual PostHog survey feedback is optional and disabled by default. Set
`VITE_POSTHOG_PROJECT_TOKEN` (public `phc_` token) and `VITE_POSTHOG_API_HOST`
before starting the web app to enable it. See the
[PostHog feedback runbook](docs/operations/posthog-feedback.md) for the survey
settings, deployment, CSP, and privacy boundary.

The API expects PostgreSQL. When running with `npm run dev`, its default URL is:

```dotenv
DATABASE_URL=postgres://paralleax:paralleax@localhost:5432/paralleax
```

Docker Compose uses `COMPOSE_DATABASE_URL` instead, defaulting to the Compose
database service at `db:5432`. Set it in `.env` only when the containers should
connect to a different PostgreSQL server.

The API also validates `PORT`, `POSTGRES_SSL`, `POSTGRES_SSL_CA`, `CORS_ORIGIN`,
`REGISTRATION_MODE`, `DEV_SKIP_EMAIL_VERIFICATION`, and `NODE_ENV` at startup.
`DATABASE_URL`, `CORS_ORIGIN`, and `REGISTRATION_MODE` must be explicit in
production. OpenAPI documentation is available at http://localhost:3300/api/docs
outside production.

`REGISTRATION_MODE` accepts `open` or `closed`. In local development, email
verification is skipped by default and registration creates a verified account
with an active session. Set `DEV_SKIP_EMAIL_VERIFICATION=false` to test the
emailed verification flow; this requires Brevo delivery to be configured. The
bypass is rejected outside `NODE_ENV=development`. The removed `access-code`
mode and `REGISTRATION_ACCESS_CODE` setting are rejected so stale deployments
fail visibly.

## Transactional email

The API uses Brevo's HTTPS API for transactional email. Set `BREVO_API_KEY` and
`EMAIL_FROM` together to enable delivery; `EMAIL_REPLY_TO` is optional. Use a
Brevo API key rather than an SMTP key. Email verification and password recovery
require `BREVO_API_KEY` and `EMAIL_FROM`; without them those account actions
return a stable unavailable response. Registration also requires delivery when
email verification is enabled. Keep the API key in deployment secrets rather
than source control.

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

Without `POSTGRES_TEST_DATABASE_URL`, `npm run test -w @paralleax/api` skips the
API e2e and PostgreSQL integration specs and still runs the HTTP boundary specs.
Run the API e2e and integration tests against the Docker PostgreSQL service:

```powershell
docker compose exec -T db createdb -U paralleax paralleax_test
$env:POSTGRES_TEST_DATABASE_URL='postgres://paralleax:paralleax@localhost:5432/paralleax_test'
npm run test:postgres -w @paralleax/api
```

Create `paralleax_test` only once; `createdb` reports that it already exists on
later runs. Never point `POSTGRES_TEST_DATABASE_URL` at the development database:
the suites deliberately rebuild the tested `public` schema and empty its tables,
and refuse a database whose name does not end with `_test`.

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

The Docker setup pins the environment to Node.js 26 and starts a local
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

Then open http://127.0.0.1:5173. The API is exposed at http://127.0.0.1:3300/api.
PostgreSQL is exposed at `127.0.0.1:5432` and stores data in the
`postgres-data` Docker volume.

## Creator Alpha Deployment

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
`open` or `closed`. Open registration still requires email verification before
the first session is issued.

For Railway, deploy the API and web targets as separate services and use the
service-specific config files in `deploy/`. The exact private-network variables
and setup order are documented in the
[Railway runbook](docs/operations/alpha-deployment.md#railway).

After deployment, verify the public web path, API process, database connection,
and migration state:

```bash
npm run smoke:deployment -- https://alpha.example.com
```

Do not enable registration until the provider-specific gates in the
[creator alpha runbook](docs/operations/alpha-deployment.md) are complete.

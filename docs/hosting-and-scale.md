# Hosting and Scale Direction

Project-wide production gates and their priority order are defined in
[Production readiness](production-readiness.md). Hosting choices do not make the
application production-ready unless the applicable data-safety, recovery,
security, observability, accessibility, and publication gates are satisfied.

Paralleax should optimize first for reliable operation and replaceable
components, not speculative hyperscale. Story graphs and text are expected to
remain modest compared with future media, change history, backups, public
traffic, and real-time collaboration.

## Initial Shape

The initial hosted shape can remain conventional:

- static hosting and CDN delivery for the React application;
- a stateless NestJS API that owns application and narrative rules;
- managed PostgreSQL for durable domain data and migrations;
- object storage only when media enters the product scope;
- provider monitoring and an error-reporting service before public production.

Redis, queues, workers, read replicas, and multiple API instances should be
introduced only when measured workloads require them. Supabase, Render,
Cloudflare, and comparable services are deployment candidates, not current
architecture dependencies or accepted vendor decisions.

## Ownership Boundaries

NestJS and `packages/shared` must remain owners of application and narrative
semantics. A managed database, authentication provider, object store, or
real-time service may supply infrastructure, but domain rules must not migrate
into vendor-specific client APIs. This keeps the application portable and limits
provider lock-in.

## Persistence Evolution

The current MVP entities are normalized into stories, interactions, triggers,
trigger inputs, and trigger conditions. This narrows write conflicts and prepares
object-level permissions, search, and history while the repository continues to
assemble the same domain `Story` for current clients.

Future memberships, change events, and assets should follow the same relational
direction. Flexible settings or type-specific parameters may use `jsonb` when
their shape is genuinely variable rather than merely undecided.

## Progressive Loading

Small stories can continue to load as one unit. For large stories, the API may
later separate:

- lightweight canvas summaries;
- details loaded for the active inspector object;
- the active object's narrative neighborhood;
- simulation data required for the current run.

Progressive loading must not create a second story model. Summaries and details
are projections of the same persisted entities and shared semantics.

## History and Collaboration

Change history may grow faster than current story state. The preferred future
direction is current state plus structured change events and periodic snapshots.
Text keystrokes should be debounced and grouped into meaningful author actions
rather than recorded as one event per character. Snapshot cadence, compaction,
retention, and suggestion preview rules remain post-MVP decisions.

## Operational Stages

- Local and private testing: Docker Compose, local PostgreSQL, deterministic demo
  data, and inexpensive managed previews when needed.
- Public beta: paid managed database and API capacity, backups with restoration
  testing, monitoring, error reporting, and separate test/production data.
- Measured growth: scale API instances, database capacity, caching, workers, and
  progressive loading independently according to observed bottlenecks.

Cost estimates and provider quotas change frequently. Funding plans should keep
an operational reserve for backups, email, monitoring, staging environments,
and temporary capacity, while current prices remain outside the durable product
documentation.

## Migration and Health Commands

Database migration is an explicit operation:

```bash
npm run migrate
```

The development Compose API service runs that command after PostgreSQL becomes
healthy and before starting the watched API process. A production deployment
must run the built equivalent before switching traffic:

```bash
npm run migrate:prod -w @paralleax/api
npm run start -w @paralleax/api
```

The provider-neutral production image runs the same built entry point directly,
and `compose.production.yaml` models the migration as a one-shot service that
must complete before API health can admit the web service. See the
[private-alpha deployment runbook](operations/alpha-deployment.md) for image,
secret, smoke, and rollback requirements.

Operational probes:

- `GET /api/health` verifies that the API process can answer HTTP;
- `GET /api/ready` verifies PostgreSQL connectivity and that the latest known
  migration is applied.

Readiness never modifies the schema. A `503` response must keep a new instance
out of service until the separate migration or database incident is resolved.

An upgraded installation with pre-account stories retains the disabled
`migration-user` owner so no content is lost. After identifying the intended
real account, an administrator may transfer those stories in a controlled
transaction:

```sql
BEGIN;
UPDATE stories
SET creator_user_id = 'real-user-id'
WHERE creator_user_id = 'migration-user';
DELETE FROM users
WHERE id = 'migration-user'
  AND NOT EXISTS (
    SELECT 1 FROM stories WHERE creator_user_id = 'migration-user'
  );
COMMIT;
```

Take and verify a backup before this ownership operation.

## Backup and Recovery

The portable backup and restore commands, safety checks, initial recovery
objectives, retention baseline, and drill procedure are defined in
[PostgreSQL Backup and Restore](operations/postgresql-backup-and-restore.md).
CI exercises a real archive restoration against PostgreSQL, but that does not
replace provider scheduling, off-host encrypted storage, alerting, or a recorded
staging restoration drill.

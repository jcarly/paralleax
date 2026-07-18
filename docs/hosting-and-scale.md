# Hosting and Scale Direction

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

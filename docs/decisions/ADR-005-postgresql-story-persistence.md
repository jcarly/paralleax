# ADR-005 - PostgreSQL Story Persistence

## Status

Accepted.

## Context

The MVP originally used in-memory API storage to validate Story, Interaction,
Trigger, and Reader behavior quickly. The editor now has enough behavior that
losing authored stories on API restart blocks realistic testing and manual use.

The project still must not add users, permissions, collaboration, variables,
characters, places, or player saves before the MVP narrative core is stable.

## Decision

Persist authored MVP stories in PostgreSQL.

For the first persistent implementation, store each story as one `jsonb` domain
document in a `stories` table with `id`, `created_at`, and `updated_at` columns.
Keep the API endpoint behavior and domain operations unchanged.

`StoriesRepository` owns PostgreSQL reads and writes, but not schema creation.
Schema creation and future schema evolution must go through explicit migrations.
`StoriesService` remains responsible for application behavior, and
`packages/shared` remains responsible for story operations, trigger cleanup
rules, reader semantics, merge behavior, and graph placement helpers.

Mutations of an existing story use one database transaction and acquire a row
lock with `SELECT ... FOR UPDATE` before applying domain changes. This preserves
the JSON document persistence unit while preventing concurrent requests from
overwriting changes based on the same stale snapshot.

## Consequences

- Authored stories survive API restarts.
- Docker Compose includes a local PostgreSQL service and volume.
- The MVP can keep evolving without introducing authentication or story
  permissions.
- The database does not define trigger semantics; the domain model remains the
  source of truth.
- Querying inside interactions or triggers is intentionally limited for now.
- Updates to the same story are serialized by PostgreSQL; different stories can
  still be updated independently.
- A normalized schema can be introduced later if reporting, search, permissions,
  collaboration, or migration needs justify it.
- Future schema changes must use explicit migrations instead of repository or
  service startup side effects.

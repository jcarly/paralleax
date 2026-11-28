# ADR-011: PostgreSQL Logical Recovery Baseline

## Status

Accepted

## Context

Explicit, data-preserving migrations still need a recovery path. A backup that
has never been restored is not sufficient evidence, and restoration into a
production database by default would create unacceptable operator risk.

## Decision

Use PostgreSQL custom-format logical archives as the portable baseline. Backup
creation validates the archive before publishing it. Restoration requires a
separate URL and exact database-name confirmation, and administrative databases
are refused.

The scheduled off-site copy runs in a dedicated, non-public cron container,
separate from the web and API services. It calls the existing
`npm run db:backup`, validates the custom archive with `pg_restore --list`,
encrypts it with `age` using a public recipient key, and uploads it to a private
S3-compatible bucket outside Railway. The matching private age identity remains
outside Railway. The container uses the official AWS CLI v2 for object storage
operations, keeping an S3 SDK out of the web and API dependency tree.

Daily keys use UTC dates; a second weekly key is written on Sundays. The job
downloads every newly written object and compares its size and SHA-256 before
retention or a success heartbeat. A retry on the same date overwrites the same
key. It keeps the newest 14 daily and 8 weekly keys and deletes older keys only
after the new object is verified. A Healthchecks-compatible external heartbeat
receives failures and success only after verification; its 30-hour grace period
also alerts when the scheduled job does not run. Local synthetic tests prove
the batch behavior, but provider setup and a real backup remain deployment
gates.

CI restores the integration database into a temporary database and compares
migration and core-table row counts. Hosted production must additionally use
provider-managed automated backups, off-host encrypted retention, alerting, and
recorded monthly restoration drills.

Migrations stay forward-only. Recovery from corrupting migrations uses a
verified restored database and connection cutover rather than down migrations.

## Consequences

- The repository can verify backup tooling without choosing a hosting provider.
- Operators need compatible `pg_dump` and `pg_restore` binaries. The commands
  enforce it: the client major must be at least the server major (a newer client
  against an older server is supported by PostgreSQL), otherwise they fail
  before any dump or restore. CI covers PostgreSQL 17 and 18 (PAR-19).
- The standalone image pins its PostgreSQL client major at build time and the
  existing `db:backup` compatibility check still compares that client with the
  running database before dumping. The configured Railway image tag is not
  evidence of the running SQL version; confirm it with read-only `SHOW`
  queries before scheduling the job.
- Backup secrets are runtime environment values and are kept out of process
  arguments and output. The batch redirects child output, logs generic failures,
  and removes its private temporary directory on completion, failure, or handled
  interruption. The cron service has no public port or persistent local volume.
- S3 uploads are verified by reading the encrypted object back. The bucket must
  be private, use TLS, and live outside the hosting provider. A provider-side
  lifecycle rule should abort incomplete multipart uploads; versioning or
  object-lock protection can be enabled when its retention semantics fit the
  14-daily/8-weekly deletion policy.
- Logical backups alone do not provide a tight RPO or point-in-time recovery.
- Production remains blocked until scheduling, monitoring, encryption, and a
  real restoration drill are configured in the selected environment.

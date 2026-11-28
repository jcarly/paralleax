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
The backup image pins AWS CLI 2.42.5 from the official AWS distribution. Debian
Bookworm's packaged AWS CLI 2.9.19 failed against the synthetic S3 endpoint:
its bundled Botocore did not accept a valid HTTP `100 Continue` response without
a reason phrase. The newer pinned client includes the upstream fix while keeping
the storage adapter on the CLI's supported S3 interface.

The job first checks that bucket versioning is enabled. It uploads each encrypted
archive to a unique UTC-date staging key and downloads it to compare size and
SHA-256. Only after that succeeds does it promote the same bytes to the
date-canonical daily key, and on Sundays to a weekly key, verifying each
promotion. Failed staging attempts never touch a verified canonical object.
Provider versioning preserves an earlier canonical version if a promotion is
interrupted or concurrent jobs overwrite the same date. Application-side
deletion is prohibited. A separate bucket administrator enables versioning and
configures provider lifecycle for 14 days of current daily objects, 56 days of
current weekly objects, one day for staging objects, matching noncurrent-version
periods, and one-day cleanup of incomplete multipart uploads.
Healthchecks uses a 24-hour schedule and six-hour grace, for a 30-hour total
since the last successful heartbeat.

The Railway batch identity may check bucket versioning and list, read, and write
the staging, daily, and weekly prefixes, but it cannot delete objects or
versions or change bucket versioning and lifecycle. Object Lock was considered
but is deferred for alpha: it adds
provider constraints and storage/legal holds beyond the protection supplied by
least-privilege credentials, versioning, and provider lifecycle. The recovery
administrator remains separate and can access prior versions or perform an
authorized purge. Retries can leave staging objects until one-day expiry and
additional canonical versions until their noncurrent lifecycle expiry; age-based
lifecycle is not an exact count-based retention mechanism. Provider
configuration, a real external backup, and an operational restore remain
deployment gates.

The original PAR-22 implementation proposal used date-only keys, same-day
overwrite, and application-side deletion. The 2026-11-28 review amendment
supersedes those details because upload-before-verification and compromised
Railway credentials could otherwise remove the last verified copy. No provider
resource is created by this decision.

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
  arguments and output. The batch uses structured safe error codes, discards
  child output, and has a four-hour maximum runtime. It sends TERM to the child
  process group, escalates to KILL after five seconds, waits for descendants,
  then removes its private temporary directory. `tini` reaps orphaned
  descendants. An interrupted run cannot report success. The cron service has
  no public port or persistent local volume.
- S3 uploads are verified by reading the encrypted object back. The bucket must
  be private, use TLS, and live outside the hosting provider. The batch has no
  deletion API and checks that versioning is enabled before any upload. It
  verifies a unique staging object before promotion to a canonical daily key
  and, on Sundays, a weekly key. Provider lifecycle expires staging after one
  day, daily objects after 14 days, and weekly objects after 56 days, with
  matching noncurrent-version periods. Current expiration creates delete
  markers in a versioned bucket, so noncurrent versions may remain recoverable
  for a further 1/14/56 days. Staging and overwritten versions add storage cost,
  and a valid privacy purge must remove all object versions through the separate
  recovery administrator. S3Mock exercises the versioning API in CI but does
  not enforce lifecycle.
- CI runs the actual backup image against synthetic PostgreSQL 18 and temporary
  `adobe/s3mock:5.2.3` storage, then downloads, decrypts, restores into a new
  database, and checks synthetic rows. S3Mock is Apache-2.0 and active, and
  supports the S3 upload, listing, download, and versioning APIs this flow uses;
  it does not enforce lifecycle. MinIO was not selected because its repository
  is archived. This is separate from PAR-23's real provider restore.
- Logical backups alone do not provide a tight RPO or point-in-time recovery.
- Production remains blocked until scheduling, monitoring, encryption, and a
  real restoration drill are configured in the selected environment.

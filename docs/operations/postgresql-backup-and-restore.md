# PostgreSQL Backup and Restore

Status: Required production runbook

Last reviewed: 2026-11-28

## Scope

Paralleax uses PostgreSQL custom-format logical backups. The repository provides
commands that keep database credentials out of process arguments, validate an
archive before accepting it, and require an explicit target confirmation before
restoration.

These commands are a recovery foundation, not a hosted backup service. Guided
usability sessions may use explicitly disposable test Stories in a controlled
test environment after the alpha notice and normal account, access, and privacy
safeguards are ready. Before authors rely on Paralleax to retain valuable user
projects, the chosen PostgreSQL provider must schedule and monitor backups in a
separate failure domain and the operator must complete a recorded restore drill.
Tell testers the intended lifetime of disposable project data; never describe it
as recoverable before those gates pass.

## Backup

Install PostgreSQL client tools whose major version is **at least** the server
major (production is configured for PostgreSQL 18, so use `postgresql-client-18`; confirm the running version with `SHOW server_version`). Before
dumping or restoring, the commands compare `pg_dump`/`pg_restore --version` with
the server's `SHOW server_version_num`. The client-version policy is conservative and does not by itself prove archive compatibility: `pg_restore --list` remains required and stop with
`pg_dump 17 is older than the PostgreSQL 18 server` if the client is older.
A newer client against an older server is accepted. The check prints versions
only, never connection details. Then set `BACKUP_DATABASE_URL` or `DATABASE_URL` and choose a new archive path:

```bash
npm run db:backup -- --output=backups/paralleax-2026-07-26T120000Z.dump
```

The command writes to a partial file, runs `pg_restore --list`, applies
owner-only file permissions where supported, and only then renames it to the
requested path. Existing archives are refused. `--overwrite` exists for
controlled automation but must not be used for timestamped retention sets.

Store archives encrypted outside the database host. Never commit them or place
them in a public CI artifact. Monitor the schedule, archive size, age, and
verification result.

## Scheduled encrypted off-site batch (PAR-22)

The repository includes a dedicated batch runner and
[`Dockerfile.postgres-backup`](../../Dockerfile.postgres-backup). It has no
public port and runs independently from the web and API services. The runner
calls `npm run db:backup`, runs `pg_restore --list` before encryption, encrypts
with `age`, uploads to S3-compatible object storage, then downloads each new
object and checks its size and SHA-256. It reports success to an external
Healthchecks-compatible monitor only after those checks and retention finish.
Subprocess output is discarded and failures are logged without connection
details. Temporary plaintext, ciphertext, and verification files use a private
temporary directory that is removed on success, failure, and handled
interruption.

This is a local implementation, not an operational backup service yet. No
Railway cron service, storage bucket, or external monitor has been created or
configured. A real backup and remote integrity check are still required before
PAR-22 can close. Confirm the running Railway PostgreSQL version with the two
read-only `SHOW` queries in the [version matrix](#version-matrix) before
scheduling the container; the current image tag alone does not prove that
version.

### Service and configuration

Run a dedicated Railway Cron service using the image built from
`Dockerfile.postgres-backup`, with no public domain, no attached volume, and a
daily UTC schedule such as `0 2 * * *`. Its PostgreSQL client major defaults to
18, matching the configured Railway image tag. The existing `db:backup`
compatibility guard still refuses a client older than the running database.
Only change the image build argument after confirming the server version.

Set the variables from the secret manager. The checked-in
[`postgres-backup.env.example`](postgres-backup.env.example) contains
placeholders only:

- `BACKUP_DATABASE_URL`: the private Railway PostgreSQL URL;
- `AGE_RECIPIENT`: an `age` public key; the corresponding private identity must
  remain outside Railway and be available during recovery;
- `S3_ENDPOINT`, `S3_BUCKET`, and `S3_REGION`: the external provider's S3 API;
- `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`: a dedicated credential
  limited to listing, reading, writing, and deleting objects in this bucket;
- `BACKUP_HEARTBEAT_URL`: the private URL of an external Healthchecks-compatible
  check. The runner calls its `/fail` path on a failure or stale/missing daily
  object and calls the base URL after verified success.

Keep the bucket private, require TLS, and block public access. Configure its
lifecycle to abort incomplete multipart uploads after one day. The runner
keeps the 14 newest daily objects under `daily/YYYY-MM-DD.dump.age` and the 8
newest weekly objects under `weekly/YYYY-MM-DD.dump.age`; it writes a weekly
copy on Sundays in UTC. Date keys make a same-day retry replace the same object.
The job deletes expired keys only after verifying the new encrypted objects.
Optional versioning or Object Lock must be checked against this deletion policy
and any recovery hold before enabling it.

Configure the external monitor for one successful check per day with a 30-hour
failure window. A failed run sends a failure ping; a run that never starts sends
no success ping, so the external monitor alerts even if Railway did not execute
the cron job. Keep the heartbeat URL private. CI uses synthetic data and never
receives the database URL, age key, S3 credentials, heartbeat URL, archive, or
backup object.

### Key rotation and external restore

Generate the `age` key pair on a trusted recovery workstation with `age-keygen`.
Put only its public recipient in the cron service. Keep the private identity in
an offline or separately managed recovery secret store, never in Railway, the
repository, or CI. When rotating recipients, keep each old private identity
until every backup encrypted to it has left both retention windows.

Download and decrypt an external object into a private temporary directory,
then follow the normal restore procedure below against a **new empty database**:

```bash
aws --endpoint-url "$S3_ENDPOINT" --region "$S3_REGION" s3 cp \
  "s3://$S3_BUCKET/daily/2026-11-28.dump.age" "$RESTORE_TMP/backup.dump.age"
age --decrypt --identity /secure/recovery/restore-key.txt \
  --output "$RESTORE_TMP/backup.dump" "$RESTORE_TMP/backup.dump.age"
RESTORE_DATABASE_URL=postgres://.../paralleax_restore \
  npm run db:restore -- \
  --input="$RESTORE_TMP/backup.dump" \
  --confirm-database=paralleax_restore
```

The real external restore and application-level recovery checks belong to
PAR-23. Do not mark PAR-22 complete after a merged PR or a synthetic test run.

## Restore

Restoration is destructive for the target database because objects absent from
the archive are removed. Restore into a new empty database first:

```bash
RESTORE_DATABASE_URL=postgres://.../paralleax_restore \
  npm run db:restore -- \
  --input=backups/paralleax-2026-07-26T120000Z.dump \
  --confirm-database=paralleax_restore
```

The restore command intentionally ignores `DATABASE_URL`. It requires
`RESTORE_DATABASE_URL`, refuses `postgres`, `template0`, and `template1`, checks
that the confirmation exactly matches the URL database, validates the archive,
then runs `pg_restore` with `--clean`, `--if-exists`, `--exit-on-error`,
`--no-owner`, and `--no-privileges`.

After restoration:

1. Run the API readiness check against the restored database.
2. Compare the latest migration, row counts, and a representative set of stories.
3. Exercise login, story listing, editor loading, and reader traversal.
4. Record the archive identifier, start/end time, result, and operator.
5. Delete the temporary restore only after the evidence has been retained.

## Version Matrix

| Environment          | Server                                                                                         | Client tools | Verified by                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| Railway production   | 18 configured (`postgres-ssl:18` image tag read 2026-11-23; running version not yet confirmed) | 18           | CI restore on 18, not run against production |
| CI and local Compose | 17                                                                                             | 17           | CI restore on 17                             |

Keep a restore archive's tools at or above the version that created it. Upgrade
`compose.yaml` to 18 separately: an existing local volume needs a data
migration, so it is deliberately left unchanged here.

## Initial Recovery Objectives

Until production traffic and cost constraints are measured, use these
conservative initial objectives:

- RPO: at most 24 hours of data loss, using daily full logical backups.
- RTO: restore service within 4 hours after the recovery decision.
- Retention: 14 daily and 8 weekly verified backups.
- Restore drill: at least monthly and before every migration with elevated data
  conversion risk.

These are minimum deployment gates, not promises to users. The production
provider decision must document point-in-time recovery, encryption, regional
failure behavior, deletion retention, and alerts. Tighter objectives require
provider-native continuous archiving rather than increasingly frequent logical
dumps.

## Migration and Rollback

Take and verify a backup immediately before production migrations. Application
rollback must not assume schema rollback: migrations are forward-only. If a
migration causes data corruption, stop writes, preserve logs, restore into a new
database, verify it, then switch the application connection through the
deployment secret manager.

Never test a restore for the first time during an incident.

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
with `age`, and requires S3 bucket versioning to be enabled before writing.
Each execution uploads to a unique staging key and downloads it to check size
and SHA-256. Only after that succeeds does it promote the archive to a canonical
daily key and, on Sundays, a weekly key, verifying each final object. Failed
staging attempts never overwrite a verified backup. Versioning preserves the
previous canonical version if a promotion or concurrent run replaces it. The
batch has no object deletion operation. Provider lifecycle rules perform
retention outside Railway. Structured logs contain event names and safe error
codes; subprocess output, connection details, keys, and object contents are
omitted. The process group has a four-hour maximum runtime, sends SIGTERM then
SIGKILL after five seconds, and is awaited before temporary plaintext,
ciphertext, and verification files are removed. The container uses `tini` to
reap orphaned descendants. An interrupted run never sends a success heartbeat.

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
  limited to checking bucket versioning, listing daily objects, reading
  objects, and writing under `staging/`, `daily/`, and `weekly/`. It must not
  have `DeleteObject`, `DeleteObjectVersion`, permission to change bucket
  versioning, or lifecycle permissions;
- `BACKUP_HEARTBEAT_URL`: the private URL of an external Healthchecks-compatible
  check. The runner calls its `/fail` path on a failure or stale/missing daily
  object and calls the base URL after verified success.

The bucket administrator, using credentials outside Railway, must enable
versioning and configure provider lifecycle rules before the first scheduled
run. Keep the bucket private, require TLS, and block public access. The
[`postgres-backup.iam-policy.example.json`](postgres-backup.iam-policy.example.json)
shows the minimal object permissions for the batch identity; provider-specific
syntax and bucket ARNs must be reviewed before use. The
[`postgres-backup.lifecycle.example.json`](postgres-backup.lifecycle.example.json)
shows the intended S3 lifecycle: staging objects expire after one day; current
daily objects after 14 days; current weekly objects after 56 days; and
noncurrent versions after those same periods. Incomplete multipart uploads
expire after one day. Check the provider's exact semantics before applying it.
In a versioned bucket, expiration can create a delete marker and the
noncurrent-version period starts after that transition. Replaced or expired
daily and weekly versions may remain recoverable for up to another 14 or 56
days, plus provider processing delay. This keeps one canonical daily key per
UTC date and one weekly key per Sunday, with age-based expiry; missed dates are
not backfilled. Staging attempts add temporary storage for up to a day.

The service credential can upload a corrupt object or overwrite a known key if
it is compromised, but it cannot delete current or prior versions or change
versioning and lifecycle settings. The batch checks that versioning is enabled
before uploading. Versioning preserves an overwritten object as a noncurrent
version until provider lifecycle removes it. Keep a separate
recovery/admin identity outside Railway for listing versions, retrieving an
older version, and handling an authorized purge. Monitor storage growth and
provider costs: each retry staging object, weekly copy, and retained noncurrent
version uses storage until lifecycle expiry. The one-day incomplete-upload rule
limits charges from abandoned multipart uploads.

Application deletion would let a compromised Railway credential erase every
backup immediately, so it is not used. Versioning plus provider lifecycle is
the alpha choice. Object Lock would add WORM protection against deletion even
with broader credentials, but requires provider support and a deliberate
retention lock; governance mode can be bypassed by a privileged identity, while
compliance mode cannot be shortened and can conflict with privacy deletion
requests. Object Lock also keeps data and incurs storage charges through the
locked period. No storage account, bucket, lifecycle rule, versioning setting,
or Object Lock policy is provisioned by this PR.

Configure the external monitor for a daily 24-hour schedule and six hours of
grace. Its effective timeout must be **30 hours total since the last success**,
not a 30-hour grace added after the 24-hour schedule. A failed run sends a
failure ping; a run that never starts or whose last success is stale alerts
after the same 30-hour total. If the monitor is unavailable, the batch exits
with `MONITOR_UNAVAILABLE`; configure Railway cron-job failure notifications
or another independent monitor because a monitor cannot alert about its own
outage. Keep the heartbeat URL private. CI uses synthetic data and never
receives production database details, a real age key, storage credentials,
heartbeat URL, archive, or backup object.

Before closing PAR-22, verify the monitor's failure notification with a test
check, confirm that an absent run alerts at 30 hours from the last success, and
confirm the independent Railway notification when the monitor endpoint is
unavailable. Also verify the configured check reports stale/missing data and a
recovered run. These checks need the selected provider accounts and are not
claimed by the local or CI tests.

The container integration test uses a disposable PostgreSQL 18 database, a
temporary S3Mock service, and a throwaway age identity. It runs dump, encryption,
upload, remote verification, download, decryption, and restore, then checks the
restored synthetic rows. S3Mock does not enforce lifecycle rules; CI proves the
object flow and versioning API only. Provider lifecycle and IAM configuration
remain operational validation. This synthetic test is separate from PAR-23,
which must restore an actual provider backup into a new provider database.

### Key rotation and external restore

Generate the `age` key pair on a trusted recovery workstation with `age-keygen`.
Put only its public recipient in the cron service. Keep the private identity in
an offline or separately managed recovery secret store, never in Railway, the
repository, or CI. When rotating recipients, keep each old private identity
until all current and noncurrent versions encrypted to it have expired or have
been purged through the separate recovery/admin workflow.

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

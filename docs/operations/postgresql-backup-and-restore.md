# PostgreSQL Backup and Restore

Status: Required production runbook

Last reviewed: 2026-07-26

## Scope

Paralleax uses PostgreSQL custom-format logical backups. The repository provides
commands that keep database credentials out of process arguments, validate an
archive before accepting it, and require an explicit target confirmation before
restoration.

These commands are a recovery foundation, not a hosted backup service. Before
real user data is accepted, the chosen PostgreSQL provider must schedule and
monitor backups in a separate failure domain.

## Backup

Install PostgreSQL client tools compatible with the server major version, then
set `BACKUP_DATABASE_URL` or `DATABASE_URL` and choose a new archive path:

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

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

CI restores the integration database into a temporary database and compares
migration and core-table row counts. Hosted production must additionally use
provider-managed automated backups, off-host encrypted retention, alerting, and
recorded monthly restoration drills.

Migrations stay forward-only. Recovery from corrupting migrations uses a
verified restored database and connection cutover rather than down migrations.

## Consequences

- The repository can verify backup tooling without choosing a hosting provider.
- Operators need compatible `pg_dump` and `pg_restore` binaries.
- Logical backups alone do not provide a tight RPO or point-in-time recovery.
- Production remains blocked until scheduling, monitoring, encryption, and a
  real restoration drill are configured in the selected environment.

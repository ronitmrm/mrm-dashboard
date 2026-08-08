# Performant schema upgrade rehearsal

Date: 2026-08-08  
Target: PostgreSQL 16, staging migration head `0038`

## Supported paths

The release supports exactly two schema starting points:

1. an empty database applying `0001` through `0043`;
2. a current staging database with immutable migrations `0001` through `0038` recorded, applying `0039` through `0043`.

Arbitrary partial historical heads are not release sources. They must first reach the supported staging head with the last-known-good staging artifact.

## Rehearsal result

Both supported paths pass on the repository's PostgreSQL 16 service. The upgrade rehearsal now stops the real migrator at `0038`, verifies all 38 names and SHA-256 checksums against a committed immutable manifest, inserts representative organization, Production Floor, machine, sales customer/enquiry, and recruitment candidate data, and then applies `0039` through `0043`.

The canonical before/after fingerprint is identical. The dashboard-source migration backfills the pre-existing machine exactly once with its source kind, group, entry type, and JSON payload intact. Fresh installation also reaches the expected schemas, tables, indexes, extensions, triggers, roles, and grants. No numbering collision exists: the performant sequence begins at `0039`, immediately after the published staging head.

## Migration facts

| Migration | Work                                                                                                      | Transaction and lock consequence                                                                                                                                                                  | Reversibility                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `0039`    | 16 B-tree/partial/include indexes across durable refresh, dashboard sources, files, and commercial queues | One migration transaction. Standard `CREATE INDEX` permits reads but blocks writes to each indexed table until commit.                                                                            | Additive. Keep indexes during application rollback.                                                                    |
| `0040`    | `pg_stat_statements` extension                                                                            | One migration transaction; requires provider support and sufficient migration-role privilege.                                                                                                     | Disposable observability state; keep extension during rollback.                                                        |
| `0041`    | Projection table, two indexes, set-based backfill, synchronization function, 33 triggers, analyze         | One atomic transaction. Backfill reads every qualifying canonical source row and writes one projection row per active source identity; trigger installation and standard indexes add table locks. | Canonical tables are not rewritten. Roll back readers/workers while retaining or rebuilding the disposable projection. |
| `0042`    | Two per-category projection indexes                                                                       | Standard index builds block projection writes until commit.                                                                                                                                       | Additive; retain on code rollback.                                                                                     |
| `0043`    | `pg_trgm`, three GIN search indexes, two operational indexes                                              | Standard B-tree/GIN builds block writes to catalog targets until commit; GIN build time, temporary space, and WAL scale with catalog text volume.                                                 | Additive; retain on code rollback.                                                                                     |

The migrator owns one session advisory lock for the complete run and a separate transaction for each migration. A failed migration rolls back its own schema, backfill, and migration-history insert; earlier committed migrations remain applied and rerunning resumes idempotently after checksum verification.

## Data-volume and cutover risks

- `0039`, `0042`, and `0043` use standard indexes. PostgreSQL documents that these lock out writes for the build duration. Production-like row counts, index sizes, WAL, temporary storage, replica lag, and blocked-writer duration must therefore be measured before choosing the cutover window. `CREATE INDEX CONCURRENTLY` would avoid write blocking but cannot run inside the current transaction boundary, so that alternative requires an explicit schema-contract change.
- `0041` is proportional to all qualifying source payload rows across 33 trigger-covered tables. Measure source counts and JSON bytes before rollout, require enough free storage for the projection plus indexes/WAL, and compare per-category source/projection counts after backfill.
- `pg_stat_statements` must already be preloaded and both extensions must be available to the migration role on the managed target. Provider preflight is a hard gate.
- There is no destructive down migration. Recovery is database-first compatibility plus application rollback; incorrect canonical writes require the separate recovery runbook.

PostgreSQL lock behavior was rechecked against the [PostgreSQL 16 `CREATE INDEX` documentation](https://www.postgresql.org/docs/16/sql-createindex.html) on 2026-08-08.

## Acceptance commands

```text
pnpm --dir packages/db exec vitest run src/schema-contract.test.ts --fileParallelism=false
pnpm --dir packages/db typecheck
pnpm --dir packages/db lint
```

Result: 18 schema-contract tests passed; typecheck and lint passed.

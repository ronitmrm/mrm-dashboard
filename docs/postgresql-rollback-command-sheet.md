# PostgreSQL local rollback command sheet

Rollback restores PostgreSQL evidence; it never writes back into Convex or the
Pricing SQLite archive.

## Trigger conditions

Rollback when any of these occurs during the acceptance window:

- an archive checksum differs
- source mappings, hashes, or required counts are short
- any validation has status `fail` or an unknown type remains open
- Better Auth cannot authorize the required local operators
- a critical commercial or manufacturing workflow fails
- the durable worker cannot commit or retry PostgreSQL state

## 1. Freeze and preserve evidence

Stop the web app and worker. Do not delete the failed database.

```bash
rtk docker exec mrm-dashboard-postgres-1 pg_dump -U mrmpl -d mrmpl -Fc -f /tmp/mrmpl-failed-cutover.dump
rtk docker cp mrm-dashboard-postgres-1:/tmp/mrmpl-failed-cutover.dump local-data/backups/mrmpl-failed-cutover.dump
rtk proxy sha256sum local-data/backups/mrmpl-failed-cutover.dump
```

## 2. Restore into a separate database

Resolve the exact backup path first. The commands below create only the named
verification database and leave `mrmpl` untouched.

```bash
export MIGRATION_ROLLBACK_BACKUP=/absolute/path/local-data/backups/mrmpl-pre-cutover.dump
rtk docker exec mrm-dashboard-postgres-1 createdb -U mrmpl mrmpl_rollback_verify
rtk docker cp "$MIGRATION_ROLLBACK_BACKUP" mrm-dashboard-postgres-1:/tmp/mrmpl-rollback.dump
rtk docker exec mrm-dashboard-postgres-1 pg_restore -U mrmpl -d mrmpl_rollback_verify --exit-on-error --no-owner /tmp/mrmpl-rollback.dump
```

If `mrmpl_rollback_verify` already exists, stop and choose a new explicit name;
do not drop a database whose origin is uncertain.

## 3. Verify the restored copy

```bash
rtk proxy env DATABASE_URL=postgres://mrmpl:mrmpl@localhost:5434/mrmpl_rollback_verify pnpm --silent --filter @workspace/migration fingerprint:database | rtk proxy jq '{databaseDigest, tableCount, rowCount}'
rtk docker exec mrm-dashboard-postgres-1 psql -U mrmpl -d mrmpl_rollback_verify -P pager=off -c "SELECT version, applied_at FROM migration.schema_migrations ORDER BY version;"
```

Compare the fingerprint with the value recorded immediately before cutover.
Do not redirect the app until the digest, table count, and row count match.

## 4. Resume against the restored database

Point only the local `DATABASE_URL` at `mrmpl_rollback_verify`, keep the failed
database intact, then run:

```bash
rtk pnpm runtime:worker:once
rtk pnpm runtime:worker:status
rtk pnpm dev
```

Smoke-test Better Auth, commercial order/quote history, the main dashboard, and
one planning/production path. Record the rollback reason, failed-run ID,
backup checksum, restored fingerprint, and acceptance owner before reopening
writes.

## 5. Recovery posture

- Redis never needs restoration; it is rebuilt from PostgreSQL.
- Source ZIPs remain immutable and cannot be a rollback write target.
- Keep the failed database and failed-cutover dump until the cause is resolved.
- Any later database rename or deletion requires a separate verified maintenance
  action and explicit approval.

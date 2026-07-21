# PostgreSQL local cutover command sheet

Use this sheet only during an announced write freeze. PostgreSQL is the
authority after cutover; do not restart a legacy application or import into a
source archive.

## 1. Fix the inputs

Set explicit absolute paths. Never use a wildcard for source archives.

```bash
export MIGRATION_PRICING_ARCHIVE=/absolute/path/pricing-sqlite-export-20260718-203337.zip
export MIGRATION_CONVEX_ARCHIVE=/absolute/path/mrm-dashboard-convex-brilliant-spider-229-2026-07-18.zip
export MIGRATION_DATABASE_URL=postgres://mrmpl:mrmpl@localhost:5434/mrmpl
```

Verify the expected immutable artifacts:

```bash
rtk proxy sha256sum "$MIGRATION_PRICING_ARCHIVE" "$MIGRATION_CONVEX_ARCHIVE"
```

Expected SHA-256 values:

- Pricing: `40e6d256dc1279b343951c3024efb0470663e0cf4d546537318c888b25bd190b`
- Convex: `e31158f68b082af720c9d36816ce967de181c1132f1f8867f5e642dc068409d3`

Stop the web app and durable worker. Confirm no operator is writing before
continuing.

## 2. Back up the current PostgreSQL database

```bash
rtk mkdir -p local-data/backups
rtk docker exec mrm-dashboard-postgres-1 pg_dump -U mrmpl -d mrmpl -Fc -f /tmp/mrmpl-pre-cutover.dump
rtk docker cp mrm-dashboard-postgres-1:/tmp/mrmpl-pre-cutover.dump local-data/backups/mrmpl-pre-cutover.dump
rtk proxy sha256sum local-data/backups/mrmpl-pre-cutover.dump
```

Record the checksum and byte size in the acceptance report before importing.

## 3. Start and verify the local services

```bash
rtk pnpm install --frozen-lockfile
rtk pnpm local:up
rtk docker ps
```

Both `mrm-dashboard-postgres-1` and `mrm-dashboard-redis-1` must report healthy.

## 4. Inspect and migrate both archives

```bash
rtk proxy pnpm --filter @workspace/migration inspect:artifacts "$MIGRATION_PRICING_ARCHIVE" "$MIGRATION_CONVEX_ARCHIVE"
rtk proxy env DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm --filter @workspace/migration rehearse:convex "$MIGRATION_PRICING_ARCHIVE" "$MIGRATION_CONVEX_ARCHIVE" local-cutover local-operator 0021 MRMPL "MRM Private Limited" v1
```

The run must end `complete` with:

- 628 Pricing rows, mappings, and matching hashes across 41 canonical tables
- 13,751 Convex canonical rows, mappings, and matching hashes
- zero unknown entry types
- zero failed validation results
- three visible Pricing relationship warnings

## 5. Verify PostgreSQL state

```bash
rtk docker exec mrm-dashboard-postgres-1 psql -U mrmpl -d mrmpl -P pager=off -c "SELECT source_system, count(*) AS mappings FROM migration.source_id_map GROUP BY source_system ORDER BY source_system; SELECT count(*) AS failures FROM migration.validation_results WHERE status = 'fail'; SELECT count(*) AS unknown_open FROM migration.unknown_entry_types WHERE status = 'open';"
rtk proxy env DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm --silent --filter @workspace/migration fingerprint:database | rtk proxy jq '{databaseDigest, tableCount, rowCount}'
```

Do not proceed if mappings are short, a validation failed, or an unknown type
is open.

## 6. Build derived state and accept the application

```bash
rtk pnpm runtime:worker:once
rtk pnpm runtime:worker:status
rtk proxy env PORT=3001 DATABASE_URL="$MIGRATION_DATABASE_URL" REDIS_URL=redis://localhost:6380 BETTER_AUTH_URL=http://localhost:3001 NEXT_PUBLIC_APP_URL=http://localhost:3001 pnpm --filter web start
```

Supply `BETTER_AUTH_SECRET` through `apps/web/.env.local`, not shell history.
Verify sign-in, commercial pricing/order history, dashboard read-model version,
planning, production, quality, maintenance, and 390px layout. If any critical
workflow fails, stop the app and follow the rollback sheet.

## 7. Resume local operation

Start the continuous worker and web app in separate terminals only after the
acceptance owner records approval:

```bash
rtk pnpm runtime:worker
rtk pnpm dev
```

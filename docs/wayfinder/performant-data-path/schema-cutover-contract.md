# Performant schema cutover contract

Date: 2026-08-08  
Target: staging; production requires separate approval

## Final history

Published migrations `0001` through `0038` remain byte-for-byte immutable and are pinned by `packages/db/migrations/published-checksums.json`. The performant additions keep their current final numbers:

1. `0039_query_performance_foundation.sql`
2. `0040_query_observability.sql`
3. `0041_dashboard_source_projection.sql`
4. `0042_dashboard_source_category_indexes.sql`
5. `0043_commercial_search_indexes.sql`

No file is renumbered, squashed, or edited after it reaches staging. Any later correction is a new forward migration.

## Promotion units and order

The migrator's `through` boundary makes three independently verifiable schema units:

1. apply through `0040`; verify hot-path indexes, extension availability, migration history, and old-artifact compatibility;
2. apply through `0042`; verify projection backfill, all synchronization triggers, source/category counts, indexes, fingerprint parity, and old-artifact compatibility;
3. apply through `0043`; verify trigram/operational indexes, plans, search parity, and old-artifact compatibility.

Only then may the corresponding code unit be promoted. The old artifact remains the serving artifact during each schema unit. Web and worker code never lead schema.

## Write and worker boundary

Each schema unit runs in an announced staging maintenance window:

1. stop new canonical writes, stop/drain the refresh worker, and wait for in-flight transactions;
2. record database fingerprint, migration history, queue/outbox state, connection inventory, and restore point;
3. apply the unit with the migration role, one active migrator, a bounded lock wait, and an operator-visible statement deadline;
4. verify the unit before reopening writes or advancing code.

The write freeze is mandatory. Standard indexes block target-table writers, and the `0041` backfill precedes trigger creation inside its transaction; permitting a concurrent write in that interval could leave an unprojected row. Reads may remain available only if their traffic cannot consume the migration connection headroom or prevent the measured lock deadline.

## Transaction and backfill contract

The migrator holds one session advisory lock for the run and one transaction per migration. History insertion commits with its migration. Failure rolls back the current migration completely; previously committed migrations remain and a rerun resumes after checksum verification.

`0041` is a single transactional, set-based backfill. It never updates canonical domain rows. Before reopening writes, verification must prove:

- one projection row per qualifying active source identity and no duplicate primary key;
- per organization, source kind, source group, entry type, and Production Floor counts match the canonical source queries;
- payload and changed-at samples match the source rows;
- all 33 synchronization triggers exist and are enabled;
- all projection indexes are valid and analyzed;
- insert, update, reversal/inactivation, and delete probes synchronize in the same transaction.

If production-like volume cannot complete inside the accepted lock, WAL, storage, and replica-lag envelope, do not extend the window ad hoc. Redesign the unpublished migrations as a separately resumable backfill and/or non-transactional concurrent-index phase, then repeat Ticket 2. `CREATE INDEX CONCURRENTLY` is not mixed into the present per-file transaction contract.

## Compatibility window

All five migrations are additive. The `0038` artifact must pass against schema `0043`; the candidate artifact must pass against its required schema head. No relation, column, constraint value, grant, event, or queue field consumed by the old artifact is removed or renamed.

The additive schema remains after application rollback and through at least the full observation/recovery window. Cleanup, narrowing, or removal requires a later migration after every old web/worker artifact is impossible to route and a separate parity review is complete.

## Recovery

- Before a migration commits: rollback the current transaction and keep the last-good artifact.
- After schema commit but before candidate canonical writes: keep the additive schema and restore the last-good web/worker artifact.
- Projection mismatch with canonical tables intact: stop candidate readers/worker, retain canonical tables, repair or rebuild the disposable projection on an isolated target, and repeat fingerprint/backfill gates.
- Incorrect canonical writes: freeze writes and use the approved Neon PITR/custom-dump recovery runbook; schema rollback is not a substitute.

There are no destructive down migrations. A database restore requires explicit operator approval and verification on a named recovery target before traffic is rerouted.

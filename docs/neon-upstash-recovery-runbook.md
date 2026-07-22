# Neon and Upstash recovery runbook

Date: 2026-07-22  
Accepted Neon history window: six hours

## Non-negotiable authority rules

1. PostgreSQL is canonical; Redis is not a recovery source.
2. Never route to a stale local PostgreSQL database after any hosted write.
3. Never restore a provider target until the exact target, timestamp, branch
   count, and business impact are approved.
4. Preserve the pre-restore branch and verify the recovered target before
   reopening writes.
5. The six-hour Neon history window is a hard operational ceiling. Use the
   checksum-verified custom dump when the required point is outside it.

## Rollback decision

### Before hosted writes

Revert the reviewed deployment variables or deployment artifact. Verify the
target has no writes beyond the frozen fingerprint. No reverse data movement
is required.

### After non-authoritative staging writes

Stop web and worker writes, preserve the Neon staging branch, classify the
writes, and choose either an isolated PITR target or the verified custom dump.
Do not copy data into immutable source archives and do not point the app at the
old local volume.

### After authoritative hosted writes

Environment rollback alone is forbidden. Stop writes, select a safe timestamp
with Time Travel/read-only inspection, obtain explicit business approval, run
PITR or custom restore, fingerprint the result, run auth/business/worker smoke
tests, and only then reopen.

## PITR procedure

1. Count branches. Require two free slots and remain below the ten-branch cap.
2. Record the target's current fingerprint, migration head, queue state, and a
   UTC timestamp chosen within the six-hour history window.
3. Perform the restore only on the named verification target.
4. Use Neon's preserve option so the pre-restore state becomes a backup branch.
5. Verify the expected marker/write is absent and canonical baseline remains.
6. Reverse from the preserved backup and verify the marker/write returns.
7. Retain redacted evidence and do not delete branches unless the user directs
   cleanup after review.

The 2026-07-22 drill used `staging-pitr-verification`, preserved
`staging-pitr-pre-restore`, restored to `2026-07-22T05:46:41.326Z` in 3.3
seconds, and reversed in 3.1 seconds. The post-timestamp marker disappeared on
restore and returned on reversal. `staging` and `production` were untouched.

Neon CLI syntax is documented in
[branches](https://neon.com/docs/cli/branches); do not paste provider IDs into
the repository.

## Custom dump recovery

Use the latest checksum-verified PostgreSQL 16 custom dump. Bootstrap reviewed
roles first, restore with `--no-owner --no-tablespaces`, validate constraints
and triggers, apply/verify all numbered migrations, then run the exact
per-table fingerprint query. Do not accept counts without hashes and privilege
checks.

## Empty Redis recovery

No Redis backup is required.

1. Stop or isolate publishers if diagnosing an incident.
2. Flush/recreate only the named staging Redis target.
3. Confirm Better Auth session/capability reads and canonical PostgreSQL writes
   continue while Redis is empty.
4. Queue a dashboard refresh in PostgreSQL.
5. Run the bounded worker and allow the PostgreSQL outbox to publish.
6. Confirm the dashboard version key is recreated monotonically, pending and
   retrying outbox counts are zero, and no auth data was written to Redis.

The live drill began with zero keys. A session read returned HTTP 200, the
worker processed one refresh, published two events without retry, recreated one
version key at version 4, and finished with no failed/pending work or pool
waiters.

An optional Upstash provider-backup restore is a separate destructive action
and requires separate approval. It is never part of application recovery.

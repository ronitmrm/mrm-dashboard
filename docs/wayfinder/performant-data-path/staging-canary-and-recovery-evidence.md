# Staging canary and recovery evidence

Date: 2026-08-09  
Scope: performant data-path candidate  
Staging completion: **blocked — managed canary not executed**

This record is fail-closed. It retains completed repository, local PostgreSQL,
and UI evidence, but it does not claim a managed deployment, canary window, or
recovery drill. No Neon, Upstash, Vercel, hosted-worker, or production resource
was changed while preparing it.

## Immutable candidate

| Evidence                         | Retained value                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime source commit            | `8684d227b0e72205aa5101204fc5f0cce9451489`                                                             |
| Behavior fingerprint             | `a9d2cf5c7e6fe55f493bdb79977d0f3ab7f93c08897ffb91e091825d9dcf29ec`                                     |
| Staging-comparable baseline      | `35bcd9b4f05238e6085a85614309bc0f94311dc665b59ab46f3faa0425ffdc3c`                                     |
| Schema head                      | `0044_dashboard_source_floor_coverage.sql`                                                             |
| Published-schema checksum digest | `2f8025e2d9f64658ffbca64141d1ff9a1ec10d27435e217b75fad461b2550c08`                                     |
| Envelope contract                | [`config/managed-staging.json`](../../../config/managed-staging.json)                                  |
| Fail-closed recorder             | [`managed-staging-envelope.ts`](../../../packages/migration/src/managed-staging-envelope.ts)           |
| Recorder contract tests          | [`managed-staging-envelope.test.ts`](../../../packages/migration/src/managed-staging-envelope.test.ts) |

The source commit is the last runtime commit. This documentation commit does not
change the web, worker, database, behavior oracle, or benchmark implementation.
The recorder recomputes the schema head/checksum digest, requires the candidate
behavior fingerprint, and rejects different promoted web or worker digests.

## Completed acceptance evidence

The complete Boundary H gate ran serially against real local PostgreSQL:

| Gate                       | Result                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Migration                  | 10 files passed, 31 tests passed; 3 files/4 environment-scoped tests skipped by their explicit suite guards                     |
| Database                   | 28 files, 212 tests passed                                                                                                      |
| Runtime                    | 12 files, 32 tests passed                                                                                                       |
| Web                        | 52 files, 245 tests passed                                                                                                      |
| Lint                       | Passed; four pre-existing web warnings retained                                                                                 |
| Typecheck                  | Passed                                                                                                                          |
| Production build           | Passed; the existing Next.js NFT trace warning retained                                                                         |
| Behavior parity            | Candidate digest and immutable staging-comparable digest both passed twice against canonical PostgreSQL fixture                 |
| Recruitment order          | Exact Candidate/workbook command order, ordinals, source IDs, one-statement audit, rollback, and 1/100 statement budgets passed |
| Commercial coverage/export | Cap + 1, pagination, server search, exhaustive multi-batch export, and route tests passed                                       |

Supporting retained tests include the
[behavior-parity oracle](../../../packages/migration/src/behavior-parity-oracle.integration.test.ts),
[recruitment bulk integration suite](../../../packages/db/src/recruitment-bulk.integration.test.ts),
[commercial search plan suite](../../../packages/db/src/commercial-search-indexes.integration.test.ts),
[commercial export route suite](../../../apps/web/app/commercial/commercial-export-routes.test.ts),
[refresh listener integration suite](../../../packages/runtime/src/postgres-refresh-listener.integration.test.ts),
and dashboard delivery tests under [`apps/web/lib`](../../../apps/web/lib).

On 2026-08-09, authenticated browser acceptance covered dashboard initial,
stale, error, retry, recovery, partial coverage, floor isolation, focus/live
region, and hidden-tab polling states. It also covered commercial truncated and
complete states, repository search, selector preservation, Customer/Product
pagination, keyboard focus, narrow viewport behavior, and export route
responses. The user accepted both requested UI review boundaries. No
unsolicited status copy or pills were introduced; the rejected Conventional
partial-data sentence remains absent.

A post-gate local worker status read reported version 19, zero pending/running/
failed refresh jobs, zero pending/retrying outbox rows, and zero pool waiters.
This is diagnostic local evidence only and cannot satisfy a managed-staging
observation window.

## Managed rollout gates

Every row below must link to retained operator evidence before this record can
change to `passed`.

| Required gate                    | Status  | Required retained evidence                                                                                                                         |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redacted environment inventory   | Pending | SHA-256 inventory hash for scoped server-only variable names/presence; no values                                                                   |
| Web preview artifact             | Pending | Hashed preview deployment ID plus immutable candidate digest                                                                                       |
| Continuous worker artifact/owner | Pending | Hashed artifact ID, application-operations owner, host class, retained log drain, health/readiness                                                 |
| Direct listener topology         | Pending | Redacted proof of direct TLS listener URL class, successful `LISTEN`, reconciliation, and readiness                                                |
| Database canary target           | Pending | Isolated branch hash, source fingerprint, 1-compute-unit setting, PostgreSQL 16, schema head/checksums                                             |
| Controlled envelope              | Pending | Recorder output with 5 warmups, 30 samples, 4 clients, p50/p95/p99/max, statements, rows, packets, plans, blocks, WAL, freshness, and zero waiters |
| Coverage and exports             | Pending | Complete scope-manifest hash, cap + 1/search-before-limit evidence, canonical/export fingerprint equality, page ceilings                           |
| Preview promotion                | Pending | Promoted web and worker digests equal the tested candidate digests; no rebuild                                                                     |
| Canary observation window        | Pending | Start/end timestamps and retained deployment, database, worker, queue/outbox, Redis, and error views                                               |
| Redis-empty recovery             | Pending | PostgreSQL canonical reads/writes remain correct; acceleration rebuilt from PostgreSQL/outbox                                                      |
| Listener-loss recovery           | Pending | Disconnect/retry/listening transitions, durable work recovered within the 30-second safety sweep, zero lost work                                   |
| Last-good rollback identifiers   | Pending | Hashed web deployment, worker artifact, database branch/restore point, environment inventory, and verification record                              |
| End-of-window health             | Pending | Zero pending/running/failed/retrying work, zero pool waiters, required connection headroom, accepted fingerprint                                   |

Managed recording must use a secure, untracked input and a new output path:

```sh
pnpm staging:record-envelope -- \
  --input /secure/path/managed-staging-raw.json \
  --output /secure/path/managed-staging-accepted.json \
  --redacted
```

The command refuses missing fields, unknown top-level fields, unredacted
artifacts, threshold failures, schema/fingerprint drift, and an existing output
file. Its accepted record contains no URLs, hostnames, provider IDs,
credentials, or user/business identifiers.

## Recovery authorization

No rollback or restore was performed. The recovery matrix and destructive-action
approvals remain governed by the
[rollout and recovery contract](./rollout-recovery-contract.md),
[staging runbook](../../neon-upstash-staging-runbook.md), and
[recovery runbook](../../neon-upstash-recovery-runbook.md).

Until every pending row is replaced by linked retained evidence, this document
does not authorize staging completion or production promotion.

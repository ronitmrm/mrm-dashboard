# Performant data-path rollout and recovery contract

Date: 2026-08-08  
Scope: staging only; production promotion requires separate business approval

## Invariants

1. PostgreSQL remains canonical. Redis and PostgreSQL notifications are disposable acceleration and wake-up hints.
2. Published migrations are never edited or reversed in place. Migrations `0039` through `0043` are additive and remain compatible with the prior application artifact.
3. Shadow writes run only against an isolated database branch or restored copy. Live requests are never dual-written.
4. A code rollback cannot undo canonical writes or environment changes. Any recovery after authoritative writes follows the Neon recovery runbook.
5. Web and worker artifacts are promoted independently. Prove the candidate worker with readiness and one-shot reconciliation, then stop and drain its predecessor before starting the candidate as the sole continuous consumer.
6. No notification phase is enabled until a continuously running worker owns a direct TLS PostgreSQL listener connection. The pooled Neon worker URL remains valid for ordinary queries but not for `LISTEN`.

Vercel hosts the web artifact. The continuous worker runs as a separate, application-operations-owned service in the database region, with bounded restart backoff, deploy draining, health/readiness probes, one pooled query URL, and one server-only direct listener URL. The host and owner must be recorded in `config/managed-staging.json` before the worker phase can advance.

Liveness is process-local and readiness uses the last completed listener registration/reconciliation and safety-sweep result; neither probe may issue a PostgreSQL statement. The normal 30-second sweep supplies queue/outbox health telemetry so monitoring cannot push idle worker traffic above four statements per minute.

## Rollout units

Each unit is built, tested, observed, and recoverable independently:

1. Query-performance indexes and observability (`0039`, `0040`).
2. Dashboard source projection and category indexes (`0041`, `0042`), including backfill and fingerprint verification.
3. Durable refresh worker and dashboard read/delivery path.
4. Request-scoped authorization reads.
5. Commercial bounded reads and batched graphs (`0043` plus repository changes).
6. Recruitment bulk commands and exported domain policy.

Do not combine two units into one promotion merely because their commits share a pull request.

## Promotion sequence

For every unit:

1. Record the source commit, migration head, redacted environment-variable inventory, canonical database fingerprint, queue/outbox status, and current deployment identifier.
2. Create two database branches from the same fingerprint. Run the last-known-good artifact against one and the candidate artifact against the other.
3. Compare normalized behavioral fingerprints. For reads, also compare statement, row, packet, and plan budgets. For writes, run the canonical workflow only on the isolated branches and compare final state plus audit evidence.
4. Build the exact candidate artifact once. Test that web artifact as a Vercel preview and that worker artifact by immutable digest in one-shot mode; do not rebuild during promotion.
5. Apply the additive schema unit before promoting code that reads it. Verify migration checksums, projection coverage, indexes, triggers, grants, and the upgrade-path fingerprint.
6. Promote the tested artifact to staging. Limit stateful smoke tests to approved staging operators and reversible fixtures.
7. Observe one complete acceptance window. Advance only when behavior, budgets, authorization freshness, queue lag, and error thresholds remain green.

Vercel promotion re-points the alias to the tested artifact. Its instant rollback does not restore environment variables, so the redacted environment inventory is a separate gate before promotion and after rollback ([Vercel rollback](https://vercel.com/docs/instant-rollback)).

## Mixed-version rules

- Database-first deployment is mandatory. Old web and worker code must continue operating after every additive migration.
- No phase may rename or drop a relation, column, status, event type, queue field, or audit field consumed by the prior artifact.
- During Vercel overlap, old and new web functions may both serve requests. Both must preserve the same canonical write contract.
- Run at most one worker generation as the active continuous consumer. Prove the candidate with a one-shot reconciliation, stop and drain the predecessor, then start the candidate continuously. On failure, stop the candidate before restarting the predecessor.
- Projection rows may be newer than an old application artifact because the old artifact ignores them. A new artifact may not be promoted until projection backfill and trigger coverage are complete.

## Observability gates

Use the thresholds in `config/managed-staging.json`. Stop advancement when any of these occurs:

- one failed refresh job or retrying outbox row;
- oldest pending refresh job or outbox row exceeds 300 seconds;
- any web or worker pool waiter appears;
- connection headroom falls below 30 percent;
- five Redis fallbacks occur within five minutes;
- a behavioral fingerprint, authorization result, query budget, coverage notice, or ordered audit-event sequence differs from the accepted baseline.

A lost PostgreSQL listener does not lose work. Reconnect, commit `LISTEN`, reconcile the durable queue, and retain the 30-second safety sweep. Until the direct listener topology exists, the sweep remains the only enabled PostgreSQL wake-up mechanism.

### Required telemetry surfaces

| Surface                  | Required evidence                                                                                                                                                                                        | Collection path                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `performance.operation`  | subsystem/operation, artifact commit, request ID, statements, rows, PostgreSQL bytes, HTTP bytes, duration, pool waiters, and coverage                                                                   | Structured web/worker JSON; Vercel logs for web and the worker host's retained log drain            |
| `worker.sweep`           | listener state, last reconnect/reconciliation, pending/running/failed jobs, oldest pending seconds, pending/retrying outbox, oldest outbox seconds, last version, cycle outcome, and worker pool waiters | Emitted once per minute from the two normal safety sweeps; no extra status query                    |
| `worker.listener`        | connecting/listening/retrying, disconnect category, retry count, and reconciliation result                                                                                                               | Structured worker JSON on every transition                                                          |
| `redis.acceleration`     | commands, outbox failures, rate-limit fallbacks, and provider errors by category                                                                                                                         | Structured process counters plus Upstash usage/error metrics; Redis keys or values are never logged |
| `authorization.request`  | request-scoped session/grant read counts, outcome category, and duration                                                                                                                                 | Structured Vercel log/span without user identifiers or grants                                       |
| `deployment.gate`        | artifact digest/deployment ID, schema head/checksums, redacted environment inventory hash, fingerprint ID, and pass/fail reason                                                                          | Retained promotion record owned by application operations                                           |
| PostgreSQL control plane | connection use/headroom, SQL latency/rows/temp blocks, locks, and migration errors                                                                                                                       | Neon monitoring plus `pg_stat_statements`; isolated benchmark adds JSON plans                       |

Every record includes timestamp, environment, artifact commit, subsystem, and correlation/command ID where applicable. Field names and event names are stable release contracts. In-memory counters alone are insufficient because Vercel instances and workers restart; their snapshots must be emitted to the named retained log surface.

Alerts use the thresholds already listed in `config/managed-staging.json`. The promotion record links the exact saved queries/log views used to prove each gate. Missing telemetry, a non-retained worker log stream, or a health probe that adds PostgreSQL polling blocks promotion.

## Human acceptance gates

Automated seams run before human testing. The candidate cannot advance past preview until the user accepts:

- Dashboard initial load, floor switch, stale/reconnecting state, refresh progress/failure, recovery, and partial-coverage presentation, including keyboard and screen-reader status behavior;
- every new commercial bounded-result notice and server-backed truncated selector/search path.

The implementation slice supplies exact seed/setup, URL, account/capability, actions, and expected result for each scenario. No human database inspection is required. A failed scenario returns the unit to implementation; it is never waived by green query tests.

## Recovery matrix

| Failure                                          | Immediate action                                                      | Recovery                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Preview/build failure                            | Do not promote                                                        | Fix and build a new artifact                                                             |
| Code regression before canonical writes          | Keep schema; restore last-good web/worker artifacts                   | Verify environment inventory, auth, queues, budgets, then reopen                         |
| Candidate worker failure                         | Stop candidate; keep durable jobs                                     | Restart last-good worker and reconcile PostgreSQL queue/outbox                           |
| Projection mismatch with canonical tables intact | Roll back dashboard readers; stop candidate worker                    | Preserve evidence, rebuild projection on an isolated target, re-run fingerprints         |
| Listener loss                                    | Continue bounded safety sweeps                                        | Reconnect direct session, re-register, reconcile durable jobs                            |
| Redis loss                                       | Keep PostgreSQL writes and reads available                            | Fail open where allowed; rebuild Redis from PostgreSQL/outbox                            |
| Migration or trigger failure before promotion    | Keep web on last-good artifact; freeze writes if triggers affect them | Restore or branch from the recorded pre-migration point; never edit published migrations |
| Any incorrect canonical write                    | Freeze web and worker writes                                          | Follow the Neon PITR/custom-dump runbook with explicit business approval                 |

Neon instant restore affects every database on the restored branch and is limited by the configured history window. Preserve the pre-restore state and verify on a named recovery target before routing writes ([Neon instant restore](https://neon.com/docs/introduction/branch-restore)).

## Rollback completion gate

Rollback is complete only when the deployment and environment inventories match the chosen last-good state; authentication and authorization pass; canonical fingerprints are accepted; pending, retrying, and failed refresh/outbox counts are healthy; Redis can be empty; and the affected subsystem's behavioral plus performance seams pass.

Operational commands and destructive-action approvals remain governed by [the staging runbook](../../neon-upstash-staging-runbook.md) and [the recovery runbook](../../neon-upstash-recovery-runbook.md).

## Preconditions still missing in the current tree

- A continuously running worker host and direct listener URL are not configured; notifications remain disabled and safety sweeping remains authoritative.
- Worker listener/reconciliation telemetry and the retained worker log surface do not exist. Current Redis counters are process-local and exposed only through an on-demand status query.
- Dashboard delivery/coverage UI and its human acceptance script are not implemented.
- Commercial per-section coverage, server-backed candidate search, repository Customer pagination, exhaustive export routes, and shared ECN decision graph are not implemented.
- Recruitment bulk commands lack the 100-input server cap and durable command ID/ordinal audit evidence.

These are promotion blockers, not reasons to weaken the rollout contract or evidence that the corresponding decision tickets are unresolved.

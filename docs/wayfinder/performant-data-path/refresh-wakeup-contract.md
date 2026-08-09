# Durable refresh wake-up contract

Date: 2026-08-08  
Authority: PostgreSQL refresh queue; notifications are hints

## Commit contract

Every canonical transaction that can change the dashboard:

1. inserts or coalesces the organization/`dashboard` durable refresh job;
2. inserts the canonical outbox evidence required by that workflow;
3. calls `pg_notify` on the fixed `mrm_dashboard_refresh` channel with only the organization ID and queue key;
4. commits all three effects together.

Notification emission is folded into the durable queue statement or another already-budgeted statement. It cannot introduce N+1 traffic. PostgreSQL delivers the hint only after commit; rollback exposes no job, outbox event, notification, or canonical write. Multiple identical hints in one transaction may coalesce and any number of duplicate hints are valid.

The payload is versioned, below 1 KiB, and contains no business data:

```text
{"v":1,"organizationId":"<uuid>","queueKey":"dashboard"}
```

Malformed, unknown-version, or unknown-queue payloads trigger a general durable reconciliation, not work derived from the payload.

## Listener state machine

One initial staging worker replica owns:

- the existing bounded pooled query connection pool;
- one separate `WORKER_LISTENER_DATABASE_URL` direct TLS session using the worker role;
- one continuously running process outside request-serving Vercel Functions.

The listener moves through these states:

```text
disconnected -> connecting -> listening -> reconciling -> ready
      ^             |             |             |          |
      +-------------+-------------+-------------+----------+
                    bounded backoff after error/end
```

Startup and every reconnect follow the PostgreSQL race-safe order:

1. create a fresh `pg.Client` from the direct URL;
2. register `error`, `end`, and `notification` handlers idempotently;
3. connect and commit `LISTEN mrm_dashboard_refresh`;
4. reconcile/drain eligible durable refresh jobs and publishable outbox rows;
5. enter `ready` and wait for hints or the safety timer.

No prior client, registration, or in-memory hint survives reconnect. `error` and `end` collapse into one reconnect attempt. Backoff starts at 250 ms, doubles with ±20% jitter, caps at 30 seconds, and resets only after `LISTEN` plus reconciliation succeeds. Shutdown stops timers, drains the active batch, issues `UNLISTEN`, closes the listener, then closes the query pool.

## Coalescing and work execution

The process stores only a transient set of hinted organization IDs. It schedules at most one active drain per worker and coalesces hints arriving during that drain. A hint never identifies a job as authoritative; the worker claims eligible rows using the durable queue's ordering and `FOR UPDATE SKIP LOCKED`, then drains until no eligible work remains or its bounded batch/yield limit is reached.

If multiple replicas are later approved, every replica may receive the same hint; durable row locking prevents duplicate claims and idempotency keys prevent duplicate derived effects. Replica count remains a connection-capacity and thundering-herd decision, not a correctness mechanism.

## Safety sweep and idle budget

A monotonic 30-second timer runs whether the listener is healthy or disconnected. Each idle sweep uses exactly two autocommit probes:

1. one statement checks whether an eligible refresh job exists;
2. one statement checks whether a publishable/retrying outbox row exists.

Only a positive probe enters the full transactional drain. Therefore two sweeps use no more than four idle PostgreSQL statements per minute. The timer does not drift from repeated hints and does not run overlapping sweeps. Listener loss may add at most one sweep interval before discovery; it cannot lose work.

## Failure behavior

- Notification lost/coalesced/duplicated: durable reconciliation determines the work.
- Listener disconnect/failover/suspension: query-pool safety sweeps continue where possible; the direct client reconnects, re-registers, and reconciles.
- Worker restart: startup order reconciles jobs before waiting.
- Query database unavailable: no work is acknowledged; both drains and sweeps retry with bounded error backoff.
- Redis unavailable: outbox rows retry, canonical refresh/version state remains committed, and state reads continue from PostgreSQL.
- Poison job: bounded attempts and durable failed status remain observable; unrelated jobs continue after the batch yields.

## Observability and readiness

Readiness is false until the listener has committed `LISTEN` and completed its first reconciliation. Health may remain true during bounded reconnect backoff if the process and safety sweep are running. Emit listener state/age, reconnect attempts/reason, last notification, notification-to-claim latency, coalesced hint count, last sweep/result, sweep-recovered jobs, oldest job/outbox age, failed/retrying rows, pool waiters, connection headroom, and `pg_notification_queue_usage()`.

Promotion is blocked until the continuous host and owner are recorded, the direct URL rejects `-pooler`, and the intended query-pool plus listener topology retains at least 30% measured connection headroom.

## Acceptance gates

- commit produces exactly one durable/coalesced job and an eventual hint; rollback produces none;
- duplicate and same-transaction-coalesced hints yield one business effect;
- a hint arriving before/while reconciliation cannot be lost;
- dropped hint, listener disconnect, worker restart, Neon restart/suspension, and failover recover through durable reconciliation;
- direct URL accepted, pooled listener URL rejected, TLS verified;
- healthy and disconnected idle operation stays at or below four sweep statements/minute;
- p95/p99 claim and publication freshness budgets from Ticket 3 pass;
- shutdown/drain and two-replica `SKIP LOCKED` behavior are deterministic.

## Known implementation deltas

The current candidate has no PostgreSQL listener or notifier, no listener-specific direct URL, and defaults to one-second polling. Its idle batch opens refresh and outbox transactions every cycle, exceeding the four-statement/minute contract. These are release blockers for the refresh wake-up implementation slice.

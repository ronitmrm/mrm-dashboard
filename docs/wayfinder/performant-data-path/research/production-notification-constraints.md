# Production notification constraints

Research date: 2026-08-08

Repository snapshot inspected: `b9480ba113011e3c996b4804c836072608760474`

## Answer

PostgreSQL `LISTEN`/`NOTIFY` is suitable only as a disposable wake-up hint over
the durable refresh-job table. A listener needs its own direct, TLS-verified
PostgreSQL session in a continuously running worker. The current repository
does not provide that session, its direct URL, or its production host.

Session loss is normal: PostgreSQL clears registrations when a session ends;
Neon suspension and compute failover can close sessions; and `pg` reports idle
disconnects through client events. Recovery must create a new client, commit
`LISTEN`, reconcile durable work, and retain a periodic safety sweep.

## Source verification ledger

All external sources below are first-party and were retrieved on 2026-08-08.

| Surface                       | Primary source                                                                                | Version or freshness                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| PostgreSQL listener semantics | [`LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html)                           | PostgreSQL 18.4 current docs                         |
| PostgreSQL delivery semantics | [`NOTIFY`](https://www.postgresql.org/docs/current/sql-notify.html)                           | PostgreSQL 18.4 current docs                         |
| Neon pooled versus direct     | [Choosing a connection method](https://neon.com/docs/connect/choose-connection)               | live Neon docs                                       |
| Neon PgBouncer limits         | [Connection pooling](https://neon.com/docs/connect/connection-pooling)                        | live Neon docs                                       |
| Neon suspension               | [Compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)                     | live Neon docs                                       |
| Neon failover                 | [High availability](https://neon.com/docs/introduction/high-availability)                     | live Neon docs                                       |
| `pg` disconnect events        | [`pg.Client` API](https://node-postgres.com/apis/client)                                      | live node-postgres docs; repository pins `pg` 8.22.0 |
| Vercel invocation lifetime    | [Function maximum duration](https://vercel.com/docs/functions/configuring-functions/duration) | updated 2026-07-01                                   |

## Confirmed repository facts

- PostgreSQL 16+ is authoritative. Web writes enqueue durable refresh work in
  the canonical transaction, while the worker owns read-model jobs. Redis is
  disposable acceleration, not work authority
  ([ADR-0005](../../../adr/0005-unified-postgresql-foundation.md),
  [ADR-0006](../../../adr/0006-better-auth-redis-runtime.md)).
- The only recorded managed topology is non-authoritative Neon staging. Its
  declared bounds are 0.25–1 compute units, provider-default suspension,
  worker-role connection limit `4`, worker runtime pool maximum `2`, and 30%
  minimum connection headroom
  ([managed staging contract](../../../../config/managed-staging.json)).
- The managed launcher asks Neon for pooled web and worker URLs and a direct
  migration URL. Runtime validation allows the worker URL to be pooled, and
  there is no listener-specific direct URL
  ([managed launcher](../../../../scripts/dev-managed.mjs),
  [PostgreSQL runtime](../../../../packages/db/src/postgres-runtime.ts),
  [worker runtime](../../../../packages/runtime/src/managed-runtime.ts)).
- No application code issues `LISTEN`, `NOTIFY`, or `pg_notify` at the inspected
  snapshot. The continuous worker polls every 1 second by default, while the
  managed contract requires a 30-second safety sweep and no more than four idle
  sweep statements per minute
  ([worker command](../../../../packages/runtime/src/commands/run-worker.ts),
  [web environment example](../../../../apps/web/.env.example),
  [managed staging contract](../../../../config/managed-staging.json)).
- No hosted continuous-worker platform is selected. Source-controlled Vercel
  web deployment and a separate continuous-worker owner remain delivery gates
  ([staging runbook](../../../neon-upstash-staging-runbook.md),
  [final staging acceptance](../../../neon-upstash-final-acceptance-2026-07-22.md)).

## Confirmed PostgreSQL semantics

- `LISTEN` registers only the current database session; PostgreSQL clears the
  registration when that session ends. `LISTEN` takes effect at commit.
- Race-safe startup order is: commit `LISTEN`, inspect canonical state in a new
  transaction, then depend on later notifications. Initial notifications may
  duplicate state already observed.
- A `NOTIFY` inside a transaction is delivered only if that transaction
  commits. Rollback emits nothing. Identical channel/payload notifications in
  one transaction may be folded together, so notification count cannot define
  work.
- Notifications are delivered only between transactions. A listener should
  not hold a long transaction because delivery is deferred and notification
  queue cleanup can be blocked.
- Payloads are shorter than 8,000 bytes under default configuration. PostgreSQL
  recommends storing larger information in a table and sending its key.
  `pg_notification_queue_usage()` exposes queue occupancy.

These claims are directly specified by PostgreSQL's
[`LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html) and
[`NOTIFY`](https://www.postgresql.org/docs/current/sql-notify.html) references.

## Confirmed Neon constraints

- Neon pooled endpoints contain `-pooler` and use PgBouncer transaction mode.
  Neon explicitly lists `LISTEN`/`NOTIFY` as unsupported on pooled connections.
  A stable listener therefore requires a direct endpoint
  ([connection selection](https://neon.com/docs/connect/choose-connection),
  [pooling](https://neon.com/docs/connect/connection-pooling)).
- A direct listener consumes a persistent PostgreSQL connection bounded by
  `max_connections` and any SQL role connection limit. One listener plus the
  repository's two-client worker pool exposes up to three concurrent
  application-side worker connections. Against the declared role limit of
  four, that is only 25% nominal headroom; actual direct and PgBouncer backend
  use must be measured before treating this as production capacity.
- Neon documents scale-to-zero after a period without active queries. When a
  compute suspends, inactive connections close; session state including
  `LISTEN`/`NOTIFY` registrations is lost. A later connection activates the
  compute ([compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)).
- Neon compute recovery preserves the connection string but can interrupt
  availability for seconds to minutes depending on failure class. Neon
  explicitly requires applications to handle brief disconnections and
  reconnect. Session-specific state does not survive failover
  ([high availability](https://neon.com/docs/introduction/high-availability)).

## Confirmed `pg` and Vercel constraints

- The repository pins `pg` 8.22.0. Its `Client` API documents that a long-lived
  idle client will eventually disconnect because of network partitions,
  backend crashes, failovers, and similar events. It emits `error` for idle
  connection failures and emits `end` once on disconnect; notifications arrive
  through the `notification` event
  ([runtime package](../../../../packages/runtime/package.json),
  [`pg.Client` API](https://node-postgres.com/apis/client)).
- The API does not document automatic restoration of `LISTEN` registrations.
  Therefore reconnect, re-registration, and durable reconciliation remain
  application responsibilities. Handling both `error` and `end` must be
  idempotent; the primary docs do not promise their ordering for every failure.
- Vercel terminates a Function when its configured maximum duration expires.
  Current documented limits are finite even with the 30-minute extended-duration
  beta. A request-serving Function therefore cannot own an indefinite listener
  ([Vercel duration](https://vercel.com/docs/functions/configuring-functions/duration)).
  This is a platform-contract inference, not evidence that production is
  deployed on Vercel.

## Unknown production facts

The following are not established by staging credentials, repository linkage,
or the provider docs:

- production PostgreSQL provider, project, branch, region, plan, compute size,
  scale-to-zero setting, and direct-endpoint policy;
- whether a passive `LISTEN` registration affects Neon's inactivity timer in
  the chosen plan; verify suspension behavior instead of assuming it;
- production worker role limits, effective PgBouncer backend use, intended
  replica count, and measured connection headroom;
- continuous-worker host, process lifetime, restart policy, deploy draining,
  health checks, region, and outbound TCP policy;
- whether ordinary worker queries stay pooled while a distinct direct URL owns
  the listener;
- observed reconnect behavior across maintenance, failover, suspension, and
  network interruption for the selected database/host pair;
- alert ownership and thresholds for listener health and connection headroom.

These are cutover inputs. Staging topology is not production evidence.

## Constraints for the implementation decision

1. Keep the durable refresh queue as the sole work authority. Notification loss
   may add latency but cannot lose work.
2. Give each intended worker replica one direct, TLS-verified, worker-role
   listener URL. Reject a `-pooler` listener endpoint at startup. Keep migration
   credentials separate.
3. Emit `pg_notify` in the same transaction that inserts durable refresh work.
   Use only a bounded routing key in the payload and tolerate coalescing and
   duplicates.
4. On startup and every reconnect: create a fresh client, commit `LISTEN`, drain
   or inspect durable jobs, then wait. Preserve the 30-second safety sweep.
5. Treat `error` and `end` as one reconnect trigger with bounded exponential
   backoff and jitter. Re-register exactly once per new session.
6. Keep the dedicated listener outside transactions while idle and outside
   request-serving Vercel Functions or any other bounded-lifetime runtime.
7. Budget one direct session per replica plus query-pool demand against role and
   provider limits and the 30% headroom requirement.
8. Observe connected state, reconnects, notification-to-claim latency,
   sweep-recovered work, oldest durable job, pool waiting, and
   `pg_notification_queue_usage()`.

## Required production-like evidence

- Direct listener URL accepted; `-pooler` listener URL rejected.
- A canonical commit produces durable work and a wake-up; rollback produces
  neither. Duplicate/coalesced notifications do not duplicate business effects.
- Listener disconnect, compute restart/suspension, and worker restart each
  recover by re-registering and reconciling durable jobs.
- Deliberately lost notification is recovered by the 30-second sweep within the
  freshness budget and the idle path stays within four sweep statements/minute.
- Intended replica count stays within measured connection limits and 30%
  headroom.
- Recycling web Functions does not affect listener ownership if Vercel remains
  the web host.

Until the unknown production facts and evidence gates are resolved, this
research constrains the architecture but does not authorize production
notification deployment.

# Production notification constraints

Research date: 2026-08-07

## Answer

The repository does **not** establish a production database or hosted-worker topology. It establishes only a non-authoritative Neon staging topology; production promotion is unperformed and the continuous worker host is still a delivery gate.

The notification design is nevertheless constrained: a PostgreSQL `LISTEN` consumer needs a dedicated, direct TLS connection owned by a continuously running worker. It cannot use the existing Neon pooled worker URL. Notifications must remain disposable wake-up hints over the durable refresh-job table, with reconnect, re-registration, state reconciliation, and periodic polling covering every lost-session case.

## Confirmed repository facts

- PostgreSQL 16+ is the canonical datastore. Web writes enqueue durable refresh work transactionally, and the worker owns read-model jobs. PostgreSQL remains authoritative; Redis is disposable acceleration ([ADR-0005](../../../adr/0005-unified-postgresql-foundation.md), [ADR-0006](../../../adr/0006-better-auth-redis-runtime.md)).
- The only managed topology recorded here is **staging**, on Neon in a `us-east` region class. It is explicitly non-authoritative, and production promotion requires separate approval ([managed staging contract](../../../../config/managed-staging.json)).
- Staging declares 0.25–1 compute units, provider-default suspension, worker role connection limit `4`, worker runtime pool maximum `2`, and minimum connection headroom `30%` ([managed staging contract](../../../../config/managed-staging.json)).
- The managed launcher currently gives both web and worker provider-pooled Neon URLs. Migration alone is forced to a direct URL ([staging runbook](../../../neon-upstash-staging-runbook.md)). Runtime validation likewise permits either a direct or pooled worker endpoint, while bounding the worker pool at `2` by default ([PostgreSQL runtime](../../../../packages/db/src/postgres-runtime.ts), [worker runtime](../../../../packages/runtime/src/managed-runtime.ts)).
- No hosted continuous-worker platform or accountable runtime owner has been selected. A source-controlled Vercel web deployment and a separately selected continuous-worker host remain open delivery gates ([final staging acceptance](../../../neon-upstash-final-acceptance-2026-07-22.md)). No committed Vercel, Railway, Render, Fly, container, or CI deployment descriptor currently resolves that gap.

## Confirmed PostgreSQL and provider constraints

### Session and endpoint

- `LISTEN` is session-scoped; registrations disappear when the session ends. Neon explicitly requires a **direct** connection for `LISTEN`/`NOTIFY`; its pooled endpoint uses PgBouncer transaction mode and does not support those session features ([PostgreSQL `LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html), [Neon connection selection](https://neon.com/docs/connect/choose-connection), [Neon pooling](https://neon.com/docs/connect/connection-pooling)).
- Therefore the existing `WORKER_DATABASE_URL` produced by the staging launcher is unsuitable for the listener. Planning must either add a separately named direct listener URL using the worker role or deliberately move the worker to a direct endpoint. Credentials must remain distinct from the migration role.
- Every worker replica that listens consumes a persistent direct session. Replica count, ordinary query-pool demand, provider backend pooling, role limits, and the repository's 30% headroom threshold must be budgeted together. Conservatively, one listener plus the current two-client worker pool exposes three application-side worker connections; against the locally declared limit of four, that leaves only 25% headroom. Actual PgBouncer-to-backend usage must be measured before using that arithmetic as a production capacity claim.

### Delivery semantics

- `LISTEN` takes effect only at commit. PostgreSQL's race-safe startup order is: commit `LISTEN`, inspect canonical database state in a new transaction, then rely on later notifications. Initial notifications may duplicate state already observed ([PostgreSQL `LISTEN`](https://www.postgresql.org/docs/current/sql-listen.html)).
- A notification sent inside the canonical write transaction is delivered only if that transaction commits. Identical channel/payload notifications within one transaction may be folded together, so the durable job table—not event count—must define work ([PostgreSQL `NOTIFY`](https://www.postgresql.org/docs/current/sql-notify.html)).
- Payloads are under 8,000 bytes by default. They should contain only a bounded lookup key such as organization ID; canonical work and state remain in tables. A long transaction in a listening session can prevent notification-queue cleanup, so the dedicated listener must remain outside long transactions. Queue usage is observable with `pg_notification_queue_usage()` ([PostgreSQL `NOTIFY`](https://www.postgresql.org/docs/current/sql-notify.html)).

### Disconnects, suspension, and hosting

- Neon may suspend an inactive compute under its scale-to-zero policy. Suspension closes sessions and loses `LISTEN` registrations; connecting again activates the compute. The provider docs do not establish whether a bare idle listener prevents this project's configured suspension, so that behavior requires an environment test rather than an assumption ([Neon compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle)).
- The `pg` client documents that long-lived clients eventually disconnect because of network partitions, backend crashes, failovers, and similar events, exposing `error` and `end` events ([node-postgres Client API](https://node-postgres.com/apis/client)). The listener must reconnect with bounded backoff and jitter, commit `LISTEN` again, reconcile durable jobs, and resume waiting.
- A Vercel Function is terminated after its configured maximum duration. Therefore, if Vercel remains the web host, placing the persistent listener inside a web function would not provide continuous ownership; this is an inference from Vercel's runtime contract, not evidence that production is deployed there ([Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)).

## Unknown production facts

These cannot be inferred from staging credentials, local CLI linkage, or Vercel-oriented repository guidance:

- production PostgreSQL provider, project, branch, region, plan, compute size, and scale-to-zero policy;
- production direct-endpoint availability and the worker role's effective direct/PgBouncer connection limits;
- continuous-worker hosting platform, process lifetime, replica count, restart policy, health checks, deploy draining, region, and outbound TCP policy;
- whether worker queries remain pooled while the listener uses a separate direct URL;
- provider maintenance/failover behavior actually observed by this client and hosting pair;
- production alert ownership and thresholds for listener health and connection headroom.

These are cutover inputs. The staging topology must not be relabeled as production evidence.

## Constraints to carry into the wake-up decision

1. Keep the durable refresh queue as the sole work authority; notification loss may increase latency but cannot lose work.
2. Run one listener per intended worker replica on a direct, TLS-verified worker-role URL. Reject a `-pooler` listener endpoint during startup validation.
3. Keep the listener out of request-serving Vercel Functions and other bounded-lifetime runtimes. Select a continuously running worker host before cutover.
4. On startup or reconnection: connect, commit `LISTEN`, inspect/drain durable jobs, then wait. Continue a bounded periodic sweep even while notifications appear healthy.
5. Emit `pg_notify` in the same transaction that inserts refresh work. Treat its payload as a bounded routing hint and tolerate coalescing and duplicates.
6. Reconnect on `error`/`end` with bounded exponential backoff plus jitter. Re-register and reconcile after every new session; never assume session state survived failover or suspension.
7. Budget the dedicated direct session per replica against role/provider limits and the 30% headroom policy. Measure direct and pooled backend usage on the chosen production topology.
8. Observe listener connected state, reconnect count, notification-to-claim latency, periodic-sweep recoveries, durable-job age, worker pool waiting, and `pg_notification_queue_usage()`.

## Required production-like evidence

- Direct listener URL accepted; pooled URL rejected.
- Notification received only after the canonical transaction commits; rollback produces no wake-up and no durable job.
- Listener disconnect, Neon compute restart/suspension, and worker restart each recover through re-registration plus durable reconciliation.
- Deliberately dropped notifications are recovered by the periodic sweep without duplicate business effects.
- Intended replica count stays within measured connection limits and headroom.
- If web remains on Vercel, terminating/recycling web instances has no effect on listener ownership.

Until the unknown production facts are resolved, this research supports the architectural constraints but does not authorize a production notification deployment.

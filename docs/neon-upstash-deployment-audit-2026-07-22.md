# Neon and Upstash deployment migration audit

Date: 2026-07-22  
Scope: read-only audit of moving the MRMPL runtime from the repository's local
Docker PostgreSQL 16 and Redis 7 services to Neon Postgres and Upstash Redis.

No provider resource was created, changed, deleted, or restored during this
audit. Provider identifiers, connection strings, tokens, account addresses,
and credentials are intentionally omitted.

## Executive conclusion

The application is architecturally suitable for managed Postgres and a
disposable managed Redis, but it is not ready to switch environment variables
yet.

PostgreSQL remains the canonical authority, Better Auth stores users and
sessions in PostgreSQL, the refresh worker commits read models and outbox state
before attempting Redis, and Redis loss is already designed to fail open. Those
are the right invariants.

The blocking gaps are operational and connection-lifecycle gaps:

1. The inspected Neon target is empty. It has no MRMPL tables or canonical
   schemas, no application roles, no restored data, and no reconciliation
   evidence.
2. The Neon default branch is not protected, its observed history window is
   only six hours, and its compute has Neon pooling disabled. These settings
   require an explicit staging/production decision before cutover.
3. The inspected Upstash account has no Redis database. Region, plan, budget,
   eviction, backup, and runtime compatibility cannot yet be verified against a
   real target.
4. Production code contains 31 non-test `pg.Pool` creation sites. Nineteen
   database repositories create their own unbounded pool, and many web
   operations construct and close one or more repository pools per request.
   This can multiply connections per warm deployment instance and prevents one
   enforceable connection budget.
5. The web, worker, migration, and reporting responsibilities are not separated
   by credentials or environment variables. The checked-in migrations define
   four least-privilege `NOLOGIN` group roles, but no login roles are provisioned
   or granted membership.
6. The deployed application has no committed provider preflight, data-transfer
   command sheet, managed restore drill, hosted-worker contract, or redacted
   provider observability gate.
7. The local database observed during this audit has applied migrations only
   through `0026`, while the working tree contains migrations through `0028`.
   A transfer from the current local database would omit the last two schema
   changes unless it is migrated first.

The safe path is therefore: harden the connection and secret contract, prepare
isolated provider targets, rehearse a checksum-verified transfer, prove hosted
staging with Redis unavailable, perform restore/rollback drills, and only then
remove Docker from the deployed runtime path. Local Docker remains a supported
developer/test fixture.

## Evidence inspected

### Repository and local runtime

- The root scripts start `docker-compose.postgres.yml`, then run the migration
  verifier. The compose file exposes PostgreSQL on local port 5434 and Redis on
  local port 6380, with named volumes for both services.
- PostgreSQL uses `postgres:16-alpine`. Redis uses `redis:7-alpine` with AOF
  enabled. Both were healthy at audit time.
- The local application database fingerprint at audit time was:

  | Evidence                             |                                                     Observed value |
  | ------------------------------------ | -----------------------------------------------------------------: |
  | Tables                               |                                                                144 |
  | Rows                                 |                                                            164,154 |
  | Database digest                      | `532680b2c9bbc45b1bfb075bcd1cad17771950e7270afccc75a56db348e7bb64` |
  | Applied migrations                   |                                                                 26 |
  | Latest applied migration             |                                   `0026_design_dossier_parity.sql` |
  | Latest migration in the working tree |               `0028_commercial_reporting_and_catalog_fidelity.sql` |
  | Validation failures                  |                                                                  0 |
  | Open unknown source types            |                                                                  0 |

- `pgcrypto` is installed locally. All four MRMPL group roles exist locally,
  but none can log in and no `mrmpl_*` login role exists.
- Better Auth has canonical users, active session evidence, and cookie session
  caching disabled. Those rows must move with PostgreSQL; changing providers
  does not authorize recreating or discarding identity data.
- The durable refresh queues and outbox were clear at audit time and the latest
  dashboard read-model version was 3.
- Existing local backup evidence proves a custom-format dump can be restored
  and fingerprinted exactly. The current cutover and rollback command sheets
  are Docker-specific and cannot be reused unchanged for Neon.
- Local attachment bytes are outside PostgreSQL. Their existing checksum backup
  and restore procedure remains a separate cutover dependency; Neon does not
  migrate those bytes.

### Redacted provider inspection

Neon MCP access succeeded. Exactly one project was visible. Its inspected
default root branch was named `production`; identifiers and links are redacted.

| Neon property          | Redacted observation                           | Audit consequence                                                |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| PostgreSQL version     | 16                                             | Matches the local major version.                                 |
| Canonical tables       | 0                                              | No schema or data migration has occurred.                        |
| Compute                | One read/write compute, idle                   | Sufficient for preflight only; load fit is unproved.             |
| Autoscaling bounds     | 0.25 to 2 CU                                   | Must be load-tested against MRMPL concurrency.                   |
| Neon pooler            | Disabled                                       | No pooled endpoint can be assumed in deployment configuration.   |
| Pooler mode if enabled | Transaction                                    | Session-level features require a direct endpoint.                |
| Suspend timeout        | Disabled in the observed compute configuration | Cost/cold-start policy needs an explicit owner decision.         |
| Branch protection      | Disabled                                       | Must be enabled or explicitly accepted before authoritative use. |
| History retention      | 21,600 seconds (6 hours)                       | Too short to assume a multi-day rollback window.                 |

Upstash MCP access and the configured CLI both succeeded, but both returned zero
Redis databases. There is therefore no remote Upstash database on which to
verify region, TLS endpoint, plan limits, eviction, daily backup, command usage,
latency, or keyspace.

## Detailed findings

### 1. PostgreSQL connection ownership and limits

The database package generally exposes repository factories that accept a
connection string and allocate an internal `pg.Pool`. The default node-postgres
pool maximum is not overridden in those repositories. The web layer frequently
creates repositories for an individual page, action, or route and closes them
after the operation. Some routes create two repositories and therefore two
pools for one request. Better Auth separately holds a module-level Drizzle pool,
and the worker holds another long-lived pool.

This was reasonable for a single local server but is unsafe as an implicit
managed deployment policy. Connection capacity becomes:

`warm instances × repositories touched per request × driver pool maximum`,

before the long-running worker, migration tools, test processes, and operator
connections are counted.

Required correction:

- Introduce one explicit PostgreSQL runtime configuration seam.
- Let repositories accept a shared pool/client boundary rather than each
  silently allocating capacity.
- On Vercel Fluid, create a small module-scope node-postgres pool and register it
  with `attachDatabasePool`; benchmark direct TCP as the official Neon guidance
  recommends.
- Give the worker its own bounded long-lived pool.
- Give migration, dump, restore, and administrative commands a direct TLS URL;
  do not use a PgBouncer URL for `pg_dump` or the session-scoped migration lock.
- Set connection timeout, idle timeout, statement timeout/application name where
  appropriate, error listeners, and redacted lifecycle metrics.
- Enforce a connection budget derived from the selected Neon compute's
  `max_connections`, leaving headroom for migrations and operators.

Neon documents PgBouncer transaction pooling, its limits, and session feature
restrictions in [Connection pooling](https://neon.com/docs/connect/connection-pooling).
Its current Vercel guidance recommends standard TCP and a reusable pool under
Fluid compute in [Connecting to Neon from Vercel](https://neon.com/docs/guides/vercel-connection-methods).

### 2. TLS and endpoint separation

The current constructors pass only `connectionString`; there is no explicit
production TLS or endpoint-class validation. A Neon connection string normally
encodes required TLS, but the application should reject a deployed URL that is
local, plaintext, missing its expected role, or accidentally uses the migration
credential.

Define at least these server-only responsibilities:

- web/Better Auth URL using a dedicated login member of `mrmpl_web`;
- worker URL using a dedicated login member of `mrmpl_worker`;
- migration/admin direct URL using a short-lived privileged login member of
  `mrmpl_migration` or the target owner;
- reporting URL, only if reporting is deployed, using a login member of
  `mrmpl_reporting`;
- test URL bound to an isolated Neon branch/database, never the authoritative
  target.

No connection string or provider token may be `NEXT_PUBLIC_*`, committed,
printed by CI, copied into ticket text, or recorded in `migration.json`.

### 3. Migrations, roles, ownership, and extensions

The numbered migration runner is checksummed and advisory-locked, which is a
strong deployment seam. It deliberately uses one connection and a session-level
advisory lock, so it must use a direct endpoint. It creates `pgcrypto` and four
least-privilege `NOLOGIN` group roles.

Gaps:

- PostgreSQL login roles and their group memberships are not provisioned.
- `pg_dump` does not migrate global roles, and Neon does not support
  `pg_dumpall`; the roles must be bootstrapped explicitly before ACL-bearing
  restores or grants are applied.
- Default privileges apply for the migration owner that ran the statement.
  All later schema migrations must use the same owner/migration identity or
  explicitly repeat the correct grants.
- A full restore with source ownership statements can conflict with Neon's
  ownership model. Neon recommends an unpooled connection and describes
  `--no-owner`, ownership behavior, test migrations, and atomic restore options
  in [Migrate data from Postgres](https://neon.com/docs/import/migrate-from-postgres).
- The empty Neon target has not proved `pgcrypto`, migrations through `0028`,
  triggers, functions, constraints, indexes, or grants.

The rehearsal must compare schema objects and privileges, not only row counts.

### 4. Data transfer and reconciliation

Redis data must not be copied. It is disposable acceleration and should begin
empty. The PostgreSQL transfer must preserve all canonical tables, Better Auth
rows, source mappings, validation evidence, read models, jobs, outbox history,
audit events, and migration checksums.

Required staged transfer:

1. Apply every checked-in migration to the local source and rerun the complete
   acceptance suite.
2. Stop web and worker writes; record the cutover watermark.
3. Create a custom-format dump using PostgreSQL 16-or-newer client tools.
4. Record dump checksum, source database fingerprint, table count, row count,
   migration checksums, validation counts, and queue/outbox state.
5. Restore through a direct TLS Neon URL to an isolated staging target with
   explicitly bootstrapped roles and reviewed ownership/ACL flags.
6. Apply or verify all numbered migrations on Neon.
7. Fingerprint Neon and compare every table digest to the frozen source.
8. Verify Better Auth, capabilities, one commercial write, dashboard read,
   refresh job, outbox retry, and audit actor attribution.
9. Repeat the entire rehearsal before the authoritative switch.

The current source is small enough for dump/restore, but measured rehearsal
duration—not row count intuition—must establish the maintenance window.

### 5. Better Auth

Better Auth uses the Drizzle PostgreSQL adapter and the canonical identity
schema. PostgreSQL is authoritative for sessions and capability checks; cookie
session caching is disabled. Redis is used only by a custom rate-limit storage
adapter, which deliberately fails open on Redis errors.

This is compatible with the managed-provider architecture if:

- identity rows move in the exact PostgreSQL transfer;
- the same deployment secret remains available through the cutover, is never
  placed in migration artifacts, and is rotated only through a separate session
  invalidation plan;
- the public Better Auth and application URLs match the hosted staging domain;
- sign-in, session reuse, ban/revocation, capability allow/deny, and admin
  provisioning are accepted against Neon;
- no production fallback silently points to localhost when Redis variables are
  absent.

### 6. Redis client and API assumptions

The existing runtime uses node-redis over TCP. It creates a new client for each
rate-limit operation and each outbox event, disables reconnect, allows only 250
ms to connect, and closes immediately. The commands used are `INCR`, `EXPIRE`,
`TTL`, `EVAL`, `SET`, `GET`, and `PUBLISH`.

Upstash supports the current Lua and Pub/Sub command families according to its
[Redis compatibility list](https://upstash.com/docs/redis/overall/compatibility).
It requires TLS for Redis-protocol clients and recommends its connectionless
HTTP SDK for highly concurrent serverless workloads in
[Connect your client](https://upstash.com/docs/redis/howto/connect-client).

Required correction:

- Use `@upstash/redis` with server-only REST URL/token for one-shot web and
  worker commands.
- Preserve the existing key namespace.
- Make the rate-limit increment/expiry operation atomic so an interrupted first
  increment cannot leave a key without a TTL.
- Preserve fail-open auth behavior and durable PostgreSQL outbox retry behavior.
- Retain idempotent monotonic dashboard-version Lua behavior and publication.
- Add injectable adapters so Redis-unavailable tests do not require provider
  credentials.
- Record only redacted command outcome, latency, retry, and outbox-lag metrics.

The Upstash TypeScript SDK is an HTTP/REST client designed for serverless
environments ([Connect with `@upstash/redis`](https://upstash.com/docs/redis/howto/connect-with-upstash-redis))
and directly supports `PUBLISH` ([SDK command reference](https://upstash.com/docs/redis/sdks/ts/commands/pubsub/publish)).

### 7. Upstash target configuration

No target exists, so all of these are open decisions:

- region colocated as closely as possible with the hosted web runtime and Neon;
- plan, request/bandwidth limits, and budget alerts;
- TLS/REST credentials and rotation ownership;
- eviction enabled or disabled;
- daily backup policy;
- auto-upgrade policy;
- observed command latency and throughput.

Because Redis is explicitly disposable, eviction may be enabled only after the
test suite proves that loss of every key preserves authorization and business
correctness. Upstash notes that enabling eviction can remove keys from durable
storage, while disabled eviction rejects writes at the size limit
([Eviction](https://upstash.com/docs/redis/features/eviction)). Either outcome
must remain fail-open for auth rate limiting and retryable for the outbox.

Upstash persistence does not change the MRMPL authority decision
([Durable storage](https://upstash.com/docs/redis/features/durability)). Redis
backups are optional operational convenience, never the rollback authority.
Provider restore deletes the target's existing Redis data, so no restore may be
run during implementation without separate approval
([Backup/restore](https://upstash.com/docs/redis/features/backup)).

### 8. Worker and outbox behavior

The worker correctly claims PostgreSQL jobs with `FOR UPDATE SKIP LOCKED`,
builds the read model in a repeatable-read transaction, commits the model and
outbox first, then attempts Redis. Redis failure clears the claim and schedules
the outbox row for retry; it does not undo the canonical model.

Open deployment concerns:

- The worker is a continuous CLI process; no hosted worker runtime is committed.
- The worker pool is unbounded and shares the generic database URL.
- One Redis client/TLS handshake per outbox row is inefficient remotely.
- Retry delay is a fixed one second with no jitter or upper bound.
- Status is printed as JSON but no managed alert reads it.
- `PUBLISH` currently has no production subscriber in this repository. Delivery
  still marks the outbox published after the monotonic version key and publish
  call succeed, so future consumers—not current correctness—benefit from it.

This migration should make the existing worker runnable against managed
services and prove a bounded once-run. Selecting or provisioning a new worker
hosting platform is outside scope unless separately approved.

### 9. Deployment and secrets

The only committed app environment template defines generic `DATABASE_URL` and
`REDIS_URL`. The local root environment observed during the audit contains a
`NEON_CONNECTION_STRING` key, but the application does not read that name. No
committed CI workflow, Vercel project configuration, provider preflight, or
secret rotation runbook was found. The ignored Neon context file is linked, but
it is not an application secret-distribution mechanism.

The staging deployment needs a redacted env contract and validation command
that reports only presence, endpoint class, role class, and TLS—not values.
Preview/test deployments must never inherit production database credentials.

### 10. Backup, PITR, and rollback

Neon instant restore can restore only root branches and is limited by the
configured history window. It creates a backup branch that can be used to undo
the restore; details and limitations are in
[Instant restore](https://neon.com/docs/introduction/branch-restore). The
observed six-hour window is not enough to promise a longer rollback interval.

Rollback must distinguish three states:

- **Before hosted writes:** switch deployment variables back to local/read-only
  routing; no reverse data movement is needed.
- **After hosted staging writes but before authority:** preserve the Neon branch
  as evidence, export its changes if needed, and reset/recreate staging from the
  frozen source. Never write back into immutable archives.
- **After authoritative hosted writes:** an environment-variable rollback to
  local PostgreSQL would lose writes. Use Neon PITR or a verified custom dump
  only with explicit business approval of the target timestamp, then fingerprint
  and smoke-test before reopening.

Redis rollback is always flush/recreate/repoint and allow PostgreSQL-driven
repopulation. Restoring Redis is not required for business recovery.

### 11. Observability

The existing worker status seam is useful but incomplete. Before delivery,
staging must expose or periodically record:

- Neon active/idle/waiting client connections, database connections, compute
  use, storage, query latency/errors, and connection saturation;
- application pool totals/idle/waiting per runtime and sanitized connection
  errors;
- refresh pending/running/failed count and age;
- unpublished/retrying outbox count, oldest age, and latest error category;
- Upstash command count, bandwidth, latency, keyspace, errors, and plan/budget
  headroom;
- auth rate-limit fallback count;
- database fingerprint and migration checksum evidence at cutover gates.

Neon exposes its pool and platform monitoring surfaces in
[Connection pooling](https://neon.com/docs/connect/connection-pooling) and
[Metrics and logs](https://neon.com/docs/reference/metrics-logs). Upstash's
provider metrics are documented in
[Metrics and charts](https://upstash.com/docs/redis/howto/metrics-and-charts).

## Risk register

| Severity | Risk                                                             | Required mitigation                                                                                         |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Critical | Empty Neon target is accidentally treated as migrated.           | Fail deployment preflight unless canonical schemas, migrations, fingerprint, and acceptance evidence match. |
| Critical | Local source is dumped before migrations `0027` and `0028`.      | Migrate and fingerprint the frozen source before every transfer.                                            |
| Critical | One generic privileged URL reaches web and worker.               | Separate login roles, URLs, and secret scopes; test denied operations.                                      |
| High     | Repository-per-request pools exhaust Neon connections.           | Shared bounded pools, one connection budget, hosted load test, pool metrics.                                |
| High     | Dump/restore or migration uses PgBouncer.                        | Direct TLS migration URL and endpoint-class validation.                                                     |
| High     | Better Auth sessions or secret are lost during cutover.          | Transfer identity tables, preserve secret, run session/revocation acceptance.                               |
| High     | No Upstash database exists.                                      | Provision isolated target and record redacted settings before env cutover.                                  |
| High     | Remote Redis latency makes every auth request slow or fail open. | Connectionless SDK, colocated region, atomic command, latency/fallback metrics.                             |
| High     | Neon rollback promise exceeds the six-hour history window.       | Increase/accept retention and maintain verified custom dumps.                                               |
| High     | Hosted worker is absent, so read models/outbox stop advancing.   | Define runner ownership and prove scheduled/continuous execution before delivery.                           |
| Medium   | Redis publish is delivered to no current subscriber.             | Keep it non-authoritative; verify outbox/version behavior and document consumer ownership.                  |
| Medium   | Upstash eviction or quota rejects writes.                        | Choose policy explicitly; alert on headroom; preserve fail-open/retry behavior.                             |
| Medium   | Role grants drift after later migrations.                        | Same migration owner and automated privilege/schema contract checks.                                        |
| Medium   | Attachment metadata moves but bytes do not.                      | Run existing filesystem backup/restore/reconciliation beside database cutover.                              |

## Verification seams and gate decisions

Use one top-level deployment acceptance seam, backed by existing lower seams:

1. **Provider preflight:** redacted Neon/Upstash configuration, TLS, role class,
   target isolation, retention, limits, and backups.
2. **Schema and data:** numbered migration checksum check plus the existing
   database fingerprint, table/row counts, source mapping hashes, validation
   results, extensions, roles, grants, triggers, and indexes.
3. **Application:** production build, Better Auth session/capability tests,
   commercial and operational integration tests, a hosted commercial write,
   dashboard read-model update, and actor-linked audit evidence.
4. **Failure:** Upstash unavailable from process start and mid-run, worker
   restart with unpublished outbox, Neon connection pressure, and a failed
   migration/restore rehearsal.
5. **Recovery:** Neon PITR/custom-dump restoration to an isolated verification
   target, exact fingerprint comparison, and redis-empty recovery.

Go to hosted staging only when all five pass. Roll back on any checksum,
fingerprint, role, auth, critical workflow, queue, or restore failure. Do not
promote staging to production in this spec; promotion requires a separate
business approval after the delivered gates are recorded.

## Audit disposition

The implementation can proceed on an isolated `staging` code branch, but remote
cutover is blocked until:

- a non-authoritative Neon staging target is identified or created;
- the target is protected/configured to the accepted retention and compute
  policy;
- login-role ownership and secret distribution are approved;
- an Upstash staging database exists;
- the worker runner is identified; and
- the two unapplied local migrations are applied before the first data dump.

These are implementation gates, not reasons to redesign the canonical data
model.

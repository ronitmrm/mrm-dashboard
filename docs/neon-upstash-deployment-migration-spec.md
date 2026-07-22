# Neon Postgres and Upstash Redis deployment migration

Date: 2026-07-22  
Status: ready-for-agent  
Source audit: [Neon and Upstash deployment migration audit](./neon-upstash-deployment-audit-2026-07-22.md)

## Problem Statement

MRMPL's unified application is functionally delivered against local Docker
PostgreSQL 16 and Redis 7, but a hosted staging runtime cannot yet use Neon and
Upstash safely. The available Neon target is empty and not protected, no Upstash
Redis database exists, application database connections do not have one bounded
lifecycle or role-separated credentials, and the current cutover/rollback
evidence is local-Docker-specific.

Simply replacing `DATABASE_URL` and `REDIS_URL` would risk connection
exhaustion, an incomplete schema, privilege escalation, lost Better Auth
sessions, a stalled refresh worker, unverifiable data drift, and a rollback
window shorter than operators expect.

The business needs a hosted staging deployment whose PostgreSQL data and logic
are exactly reconcilable to the frozen local source, whose Redis remains
disposable, whose credentials are least-privilege and non-public, and whose
failure and restore behavior are proved before any production promotion.

## Solution

Build a staged, evidence-driven deployment path to Neon Postgres and Upstash
Redis.

The application will use shared, bounded PostgreSQL pools with separate web,
worker, migration, and optional reporting identities. Migration and data-copy
commands will use direct TLS Neon connections; the Vercel Fluid web runtime and
the long-running worker will reuse small node-postgres pools with explicit
lifecycle handling. Better Auth will continue to store users and sessions in
PostgreSQL with cookie caching disabled.

Redis access will move to the connectionless `@upstash/redis` SDK using
server-only REST credentials. Rate limiting will remain fail-open and become
atomic. Dashboard version publication will remain monotonic and the PostgreSQL
outbox will remain the retry authority. No local Redis keys will be transferred.

An isolated Neon staging target and Upstash staging database will be prepared,
then the local source will be migrated through the last checked-in migration,
frozen, dumped, restored, fingerprinted, and accepted through hosted business
flows. Provider preflight, observability, custom-dump restore, Neon PITR, an
empty-Redis recovery, and rollback will be rehearsed. Local Docker remains a
developer/test fixture and is removed only from the deployed runtime dependency
chain.

The highest test seam is one hosted deployment acceptance command/report that
combines provider preflight, migration checksums, database fingerprints, Better
Auth and business-flow acceptance, worker/outbox evidence, Redis-loss behavior,
and restore verification. This consolidates existing repository seams rather
than introducing separate uncoordinated test systems.

## User Stories

1. As an MRMPL operator, I want the hosted staging application to use Neon
   Postgres, so that the business database does not depend on a developer's
   local Docker container.
2. As an MRMPL operator, I want the hosted staging application to use Upstash
   Redis, so that optional acceleration and invalidation are available without
   a local Redis container.
3. As an application user, I want my Better Auth session to survive the database
   provider cutover, so that migration does not force an unexplained identity
   reset.
4. As an administrator, I want PostgreSQL capability grants and deny overrides
   to remain authoritative, so that Upstash availability cannot expand access.
5. As a commercial user, I want enquiries, quotes, orders, revisions, reports,
   and attachments metadata to match the frozen local database, so that hosted
   staging is a faithful deployment of the delivered logic migration.
6. As a production user, I want planning, shop-floor, quality, maintenance,
   workforce, and dashboard reads to keep their PostgreSQL transaction rules, so
   that managed hosting does not change business behavior.
7. As a security owner, I want web, worker, migration, and reporting processes
   to have different database credentials, so that a compromised runtime has
   only the privileges it needs.
8. As a security owner, I want every remote database and Redis credential to be
   server-only, encrypted by the deployment platform, and absent from logs and
   repository history, so that the migration does not expose secrets.
9. As a database operator, I want migration and restore commands to use a direct
   TLS Neon endpoint, so that PgBouncer transaction pooling cannot break dumps,
   restores, or session advisory locks.
10. As a deployment operator, I want the web runtime to reuse one bounded pool
    per warm instance, so that repository composition cannot multiply hidden
    connection pools.
11. As a worker operator, I want a separate bounded long-lived database pool, so
    that refresh processing has predictable capacity and does not compete with
    web requests under one implicit budget.
12. As a deployment operator, I want a redacted provider preflight, so that I
    can verify target, branch, TLS, role class, extensions, retention, limits,
    and backup policy without printing credentials or resource identifiers.
13. As a migration operator, I want every checked-in migration applied before a
    dump, so that the hosted schema cannot lag the deployed code.
14. As a migration operator, I want a custom-format dump checksum and a
    deterministic per-table fingerprint, so that I can prove the restored Neon
    database exactly matches the frozen source.
15. As a migration operator, I want roles, grants, triggers, functions,
    constraints, indexes, and extensions reconciled as well as rows, so that a
    superficially complete restore cannot hide an operational defect.
16. As an identity owner, I want Better Auth users, accounts, sessions, and
    verifications included in PostgreSQL reconciliation, so that authentication
    is part of the migration contract.
17. As a runtime owner, I want Redis to start empty and rebuild from PostgreSQL,
    so that local cache state never becomes a migration prerequisite.
18. As an application user, I want login and canonical writes to work when
    Upstash is unavailable, so that a cache outage cannot reject business work
    or invalidate an otherwise valid session.
19. As a security owner, I want rate-limit increments and expiry to be atomic,
    so that an interrupted remote request cannot create a non-expiring block.
20. As a worker operator, I want failed Upstash publication to remain visible in
    the PostgreSQL outbox and retry later, so that invalidation failure is
    observable and does not corrupt a committed read model.
21. As an operations owner, I want Neon connection, compute, storage, query,
    worker, outbox, and Upstash usage/latency signals, so that capacity and
    failure are visible before users report them.
22. As a finance owner, I want explicit Neon compute bounds and Upstash plan and
    budget limits, so that staging cannot create an unbounded provider bill.
23. As a recovery operator, I want a verified custom-dump restore and Neon
    point-in-time restore procedure, so that rollback is based on measured
    evidence rather than a provider checkbox.
24. As a recovery operator, I want an empty-Upstash recovery procedure, so that
    Redis can be recreated or repointed without restoring canonical business
    state.
25. As an attachment owner, I want the existing filesystem backup and metadata
    reconciliation to run beside database cutover, so that migrated metadata
    does not point at missing bytes.
26. As a release owner, I want hosted staging writes to stay non-authoritative
    until every acceptance and recovery gate passes, so that local operation can
    continue safely during rehearsal.
27. As a release owner, I want a clear rollback trigger list and cutover
    watermark, so that the team knows when to stop and what evidence to preserve.
28. As a future agent, I want each deployment event recorded with a redacted
    result and verification evidence in the migration ledger, so that the work
    is traceable without leaking provider data.
29. As a developer, I want local Docker services to remain available for local
    tests, so that managed staging does not make ordinary development depend on
    remote paid resources.
30. As a business approver, I want production promotion explicitly outside this
    delivery, so that successful hosted staging does not silently authorize an
    authoritative production switch.

## Implementation Decisions

### Audit baseline

- Treat the 2026-07-22 audit observations as a time-stamped baseline, not a
  permanent provider truth. Provider preflight must reread live state before
  every rehearsal and cutover.
- The existing Neon project may be used only after an isolated staging target is
  selected and all required settings are explicitly accepted. An empty default
  branch is not migration evidence.
- An Upstash staging database must be provisioned because none exists.
- The local source must first apply the two checked-in migrations that were not
  present in the audited database.

### PostgreSQL connection contract

- Preserve node-postgres and Drizzle; do not change the domain repository or
  transaction model to an HTTP-only database API.
- Centralize pool creation and configuration. Repositories receive a shared
  pool/client boundary and do not independently allocate hidden capacity.
- The hosted Vercel Fluid web runtime owns one small module-scope pool per warm
  instance and registers it with the platform database-pool lifecycle hook.
- The refresh worker owns a separate bounded pool and closes it only during
  process shutdown.
- Migration, dump, restore, schema comparison, and administrative tasks use a
  direct TLS endpoint. Runtime endpoint selection is validated and reported only
  as `direct` or `pooled`, never as a URL.
- Explicitly configure pool maximum, connection timeout, idle timeout,
  application name, error handling, and safe metrics. The selected values must
  fit the live compute's connection capacity with operator/migration headroom.
- Keep transaction-scoped advisory locks unchanged. Keep the migration runner's
  session advisory lock on a direct connection.

### Roles and secrets

- Retain the four existing `NOLOGIN` group roles as the privilege contract.
- Provision separate login identities for web, worker, migration, and optional
  reporting use, then grant only their corresponding group role.
- The web identity cannot write migration history. The worker can mutate only
  its durable derived/outbox state and required reads. Reporting is read-only.
- The migration identity is short-lived or separately rotated and is never
  supplied to the web or worker deployment.
- Use separate server-only environment values for web, worker, migration,
  reporting, and isolated test databases. Redis uses Upstash REST URL and token.
- Environment validation fails closed in hosted mode for missing values,
  localhost hosts, plaintext endpoints, wrong endpoint class, or credential-role
  mismatch. Local development retains explicit local defaults only when the
  runtime is identified as local.
- Provider IDs, connection strings, tokens, passwords, account addresses,
  Better Auth secrets, and attachment paths never enter logs, docs, tickets,
  build output, or the migration ledger.

### Neon target

- Use PostgreSQL 16 for parity with the local source.
- Use an isolated non-authoritative staging branch/database. Protect the branch
  before it can become authoritative.
- Decide and record compute bounds, scale-to-zero/cold-start policy, connection
  budget, and history-window retention before data transfer.
- Verify `pgcrypto`, every canonical schema, all numbered migrations, triggers,
  functions, constraints, indexes, roles, grants, and default privileges.
- Run all later migrations with the same target owner/migration identity so
  default privileges do not drift.
- Use current official Neon guidance for endpoint choice, dump/restore,
  ownership, and point-in-time recovery.

### Upstash target and adapter

- Use `@upstash/redis` over HTTPS/REST for web and worker one-shot commands.
- Preserve the existing auth, dashboard-version, and invalidation key/channel
  namespace.
- Implement the auth counter and first-expiry operation atomically, with bounded
  request timeout and fail-open result on provider failure.
- Preserve the monotonic dashboard-version script and publish invalidations only
  after PostgreSQL commits.
- A Redis failure leaves the PostgreSQL outbox unpublished/retryable. Redis never
  owns sessions, permissions, business locks, read models, or jobs.
- Choose an Upstash region near the deployed web/worker and Neon target. Record
  plan, request/bandwidth headroom, budget alert, TLS, auto-upgrade, eviction,
  and backup policy in redacted form.
- Redis begins empty. No local AOF or Redis keys are imported.

### Data migration and reconciliation

- Use a rehearsed maintenance-window dump/restore, not dual writes.
- Freeze web and worker writes, apply all local migrations, record a watermark,
  and take a PostgreSQL custom-format dump with current PostgreSQL client tools.
- Use direct TLS connections for Neon dump/restore operations. Do not use a
  pooled endpoint.
- Bootstrap global roles before restoring ACL-bearing objects, or use a reviewed
  restore mode that deliberately omits ownership/ACLs and reapplies the checked
  privilege contract afterward. The chosen method must be tested twice.
- Prefer an atomic restore where supported and always restore into an empty,
  isolated target.
- Record dump checksum, elapsed time, source/target database fingerprints,
  table/row counts, migration checksums, source mapping hashes, validation
  counts, identity counts, queue/outbox state, and schema/privilege comparison.
- A mismatch blocks deployment. Never edit the target to force a fingerprint to
  match; fix the repeatable migration/transfer path.
- Run the existing local-file backup, restore, and metadata reconciliation as a
  parallel prerequisite when hosted staging needs attachment bytes.

### Hosted staging cutover

- Deploy from the `staging` Git branch through the repository's source-controlled
  deployment path. Do not mutate a live deployment as the source of truth.
- Inject staging-only secrets through the deployment platform. Preview/test
  environments cannot inherit production credentials.
- Run a bounded worker invocation before the web smoke test and establish who
  owns the continuous/scheduled worker runner. Provisioning a new worker hosting
  platform requires separate approval.
- Accept Better Auth sign-in and session reuse, capability revocation, a
  commercial write, a planning/operational write, dashboard refresh, outbox
  publication/retry, audit actor attribution, exports, attachments, desktop,
  and 390px rendering.
- Repeat critical acceptance with Upstash unreachable. PostgreSQL-backed auth,
  canonical writes, and newest read model must still work.
- Hosted staging stays non-authoritative and local operation remains available
  until the recovery drill and final delivery gate pass.

### Backup and rollback

- Keep two recovery mechanisms: a checksum-verified custom PostgreSQL dump and
  Neon point-in-time recovery within an explicitly accepted history window.
- Prove restore into an isolated verification target and compare the exact
  database fingerprint before considering backups usable.
- Use Time Travel/read-only inspection to choose a PITR timestamp. Preserve the
  pre-restore backup branch Neon creates.
- Before hosted writes, rollback is deployment-variable reversion. After hosted
  writes, do not point users at the stale local database. Preserve evidence and
  use PITR/custom restore only with explicit business acceptance of the
  timestamp and possible write loss.
- Redis rollback is recreate, flush, or repoint to an empty database. Upstash
  backup restore is optional and destructive to target keys, so it is never
  required for application recovery.
- Trigger rollback on artifact/checksum mismatch, schema or fingerprint drift,
  privilege failure, Better Auth failure, critical workflow failure, stalled
  worker/outbox, connection saturation, or failed restore verification.

### Observability and ledger

- Record Neon connection saturation, active/idle/waiting pools, compute/storage,
  query failures/latency, and history/backup status.
- Record worker job/outbox counts and lag, sanitized failure classes, last model
  version, auth rate-limit fallback count, and application pool metrics.
- Record Upstash command count, bandwidth, latency, keyspace, error rate, and
  plan/budget headroom.
- Add one redacted event to the migration ledger for each ticket transition and
  each rehearsal/cutover gate. Events include task ID, timestamp, actor category,
  action, result, evidence paths/digests, and rollback decision—never provider
  identifiers or secrets.

### Dependency graph and phases

```text
NU-01 Runtime connection and secret contract
  -> NU-02 Neon staging foundation and least privilege
    -> NU-03 Upstash adapter and staging database
      -> NU-04 Deterministic local-to-Neon rehearsal
        -> NU-05 Hosted staging application and worker cutover
          -> NU-06 Backup, PITR, observability, and rollback drill
            -> NU-07 Final deployment acceptance and local-container independence
```

The tickets are intentionally linear. This avoids remote configuration racing
ahead of code-enforced security and prevents hosted staging acceptance before
data reconciliation.

### Definition of delivered

The migration is delivered when all of the following are true:

- The `staging` code branch contains the complete implementation and passes all
  repository quality gates.
- Hosted staging web and worker processes use role-separated Neon PostgreSQL 16
  connections with bounded, observable pool lifecycles and required TLS.
- Hosted staging uses an Upstash database through the connectionless SDK; no
  deployed process requires local Redis or Docker.
- Neon contains every migration through the repository head, `pgcrypto`, all
  canonical schemas/objects, exact privileges, and an exact frozen-source
  database fingerprint.
- Better Auth sessions/capabilities and representative business flows pass
  against Neon.
- Redis-loss acceptance passes and PostgreSQL remains authoritative.
- Refresh jobs and outbox retry/publication advance from the hosted worker.
- A checksum-verified custom restore and a Neon PITR/rollback drill are recorded
  against isolated targets; Redis-empty recovery is recorded.
- Provider settings, limits, budgets, alerts, and retention have named owners
  and redacted evidence.
- Attachment bytes required by staging have passed the independent backup and
  metadata reconciliation gate.
- Every ticket and provider event is reflected in `migration.json` without
  secrets or resource identifiers.
- No production promotion has occurred; that remains a separate approval.

## Testing Decisions

- Test externally visible behavior and durable state, not whether a particular
  provider SDK method was called.
- Prefer the single hosted deployment acceptance seam. It should invoke existing
  repository tests and evidence tools and produce one redacted Markdown/JSON
  report.
- Keep pure configuration tests for local versus hosted env validation,
  endpoint class, role separation, TLS enforcement, and secret redaction.
- Keep PostgreSQL integration tests for shared pool reuse, transaction behavior,
  migration advisory locking on direct endpoints, role denial/allowance, Better
  Auth identity/session persistence, and worker claims.
- Reuse the existing database fingerprint as the authoritative data seam. Add
  schema-object and privilege comparison rather than building a second row
  reconciliation engine.
- Keep Redis adapter contract tests for atomic rate limiting, monotonic version
  writes, publication, timeouts, malformed credentials, and fail-open behavior.
- Reuse worker tests for PostgreSQL-first commit and outbox retry; add remote
  adapter behavior without requiring live provider credentials in unit tests.
- Run live provider smoke tests only against isolated staging resources and
  guard them behind explicit environment presence.
- Run the complete serial workspace test suite, lint, typecheck, and production
  build before every hosted rehearsal.
- Run browser acceptance at desktop and 390px for sign-in, commercial, dashboard,
  planning/operational, and access-administration flows.
- Run hosted acceptance twice: normal Upstash and Upstash unreachable from
  process start. Canonical behavior must match; only rate-limit/invalidation
  acceleration may degrade.
- Run a connection-pressure test that proves aggregate client connections stay
  below the accepted Neon budget and that pool waiters return to zero.
- Run two complete dump/restore rehearsals with matching per-table fingerprints
  and measured duration before the final staging cutover.
- Run restore verification without deleting or overwriting the source or
  authoritative target.

## Out of Scope

- Promoting hosted staging to authoritative production.
- Migrating to Neon Auth, the Neon Data API, Neon Functions, or Neon Object
  Storage.
- Replacing PostgreSQL repositories or Drizzle with another ORM or transport.
- Building cross-database dual writes.
- Importing local Redis AOF files or keys into Upstash.
- Making Redis authoritative for sessions, authorization, jobs, read models,
  locks, or business data.
- Selecting or provisioning a new continuous worker hosting platform without a
  separate approval.
- Moving local attachment bytes to a new object-storage provider.
- Destroying local Docker volumes, immutable source archives, failed rehearsal
  databases, Neon branches, or Upstash databases.
- Rotating the Better Auth secret as part of provider migration.
- Retuning business queries unrelated to a measured managed-provider regression.

## Further Notes

- Current Neon connection guidance favors standard TCP with a reusable pool for
  Vercel Fluid, while PgBouncer remains useful for high client concurrency. The
  deployment must benchmark and document its exact choice rather than infer it
  from a connection-string hostname.
- Neon explicitly advises using unpooled connections for `pg_dump` and describes
  ownership limitations and `--no-owner` behavior in its migration guide.
- Upstash requires TLS for Redis-protocol clients and recommends its REST SDK
  for serverless traffic. Its durable storage and backup features do not alter
  the application's decision that Redis is disposable.
- The audit's provider observations are redacted and time-bound. The
  implementation agent must rerun live read-only preflight before acting.
- The ticket set is published locally under
  `.scratch/neon-upstash-deployment/issues/` in dependency order. It is not
  mirrored to GitHub issues.

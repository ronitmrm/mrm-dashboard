# Neon and Upstash staging runbook

Date: 2026-07-22  
Authority: non-production staging only

PostgreSQL is canonical. Redis is disposable acceleration. Nothing in this
runbook authorizes production promotion, deletion of canonical PostgreSQL
state, or committing a credential.

## Current target contract

- Git branch: `staging`.
- Neon branch: `staging`; database: `neondb`; PostgreSQL major: 16.
- Business data lives in bounded schemas such as `identity`, `commercial`,
  `manufacturing`, `derived`, `audit`, and `migration`, not `public`.
- Upstash database: `mrmpl-staging-acceleration`; free hard-capped plan;
  eviction disabled; no Redis backup required.
- Neon history window accepted for this stage: six hours.
- Neon branch protection is unavailable on the current plan. This is an
  accepted staging limitation, not a production-ready setting.
- The project permits at most ten Neon branches. Count branches before every
  create/restore. Keep at least two slots free for a restore target and the
  backup branch Neon preserves.

Provider resource IDs, endpoint hostnames, connection strings, passwords, and
tokens must not appear in Git, logs, tickets, or `migration.json`.

## Prerequisites

1. Install Node 20.9 through 24 and pnpm 10.
2. Authenticate `neonctl` and `upstash` locally.
3. Link the checkout to the intended Neon project without committing `.neon`.
4. Confirm the Upstash account contains exactly one staging database with the
   expected name.
5. Run the redacted resolver before starting application processes.

```bash
pnpm dev:managed:check
pnpm provider:preflight -- --redacted --service neon
pnpm provider:preflight -- --redacted --service upstash
```

The preflight reports presence, endpoint class, TLS, policy, and role class;
it never prints values. Missing environment values appear as `present: false`
when the command is run outside a managed application process.

## Start and test locally against managed services

```bash
pnpm dev:managed
```

Open `http://localhost:3001`. This starts the Next.js application and the
durable worker against Neon and Upstash. It does not start Docker. The first
request may take several seconds while Neon resumes its compute.

Useful narrower commands are:

```bash
pnpm dev:managed:web
pnpm runtime:worker:managed:once
pnpm runtime:worker:managed:status
```

The launcher obtains pooled URLs for the `mrmpl_staging_web` and
`mrmpl_staging_worker` login roles and Upstash REST credentials from the CLIs.
The credentials exist only in child-process environments. The database package
uses bounded native `pg` TCP pools for both managed URLs and local Docker.
Managed web and worker URLs remain provider-pooled, interactive transactions
remain supported, and the launcher requests `sslmode=verify-full`. See Neon's
[connection method guide](https://neon.com/docs/connect/choose-connection).

No provider credential needs to be copied into an env file for this launcher.
To keep local auth sessions stable across restarts or override the target names,
export only these non-provider settings in the shell before running it:

```bash
export BETTER_AUTH_SECRET='<random value with at least 32 characters>'
export MRM_NEON_BRANCH='staging'
export MRM_NEON_DATABASE='neondb'
export MRM_UPSTASH_DATABASE='mrmpl-staging-acceleration'
```

## Required smoke flow

1. Confirm `pnpm dev:managed:check` succeeds with credentials omitted.
2. Start `pnpm dev:managed`.
3. Confirm `/api/auth/get-session` responds without a database error.
4. Sign in with the retained staging Better Auth account.
5. Exercise one read and one reversible staging write through the UI.
6. Run a dashboard refresh and confirm the worker returns no pending or failed
   jobs, no unpublished outbox rows, and no pool waiters.
7. Confirm the Upstash dashboard version is monotonic.
8. Stop the process with Ctrl-C and confirm port 3001 is released.

The live implementation smoke on 2026-07-22 returned HTTP 200 for the session
route, processed one refresh, published two outbox events, and rebuilt Redis
version 4 with a one-connection worker pool.

## Role and connection boundaries

| Responsibility      | Login role suffix | Endpoint | Pool maximum | Forbidden capability                        |
| ------------------- | ----------------- | -------- | -----------: | ------------------------------------------- |
| Web and Better Auth | `web`             | pooled   |            2 | migrations and role administration          |
| Durable worker      | `worker`          | pooled   |            2 | business-schema DDL and role administration |
| Migrations/restore  | `migration`       | direct   |            1 | web runtime use                             |
| Reporting           | `reporting`       | pooled   |            2 | canonical writes                            |

The provider roles have connection limits of 8, 4, 1, and 2 respectively.
All roles are SQL-native login roles with only their matching no-login group
membership. None has `CREATEDB`, `CREATEROLE`, replication, or
`neon_superuser` membership.

## Data transfer commands

Use PostgreSQL 16-or-newer tools, a custom-format dump, `--no-owner`, and
`--no-tablespaces`. A migration/restore connection must be direct and require
TLS. The repository can emit migration, transfer-constraint, and exact
fingerprint SQL:

```bash
pnpm migration:database:migrate
pnpm migration:database:transfer-constraints -- --mode=suspend --truncate-target
pnpm migration:database:transfer-constraints -- --mode=resume
pnpm migration:database:emit-fingerprint-verification
```

`--truncate-target` is an explicit destructive opt-in and is permitted only on
an empty, named, non-authoritative restore target. Follow Neon's current
[Postgres migration guidance](https://neon.com/docs/import/migrate-from-postgres).

## Branch capacity and cleanup

Before branch creation:

```bash
pnpm dlx neonctl branches list
```

Retain `production`, `staging`, two successful rehearsal branches, and any
active restore evidence. On 2026-07-22 five superseded failed rehearsal
branches were deleted at the user's direction before PITR targets were
created. The post-drill count is seven. Do not create another restore drill
without first confirming that the resulting target plus backup remain below
ten branches.

## Failure modes

- A TCP timeout does not authorize weakening TLS. Managed runtime pools allow
  30 seconds for compute cold start and use native `pg`, as recommended for
  persistent Node processes. Check local routing to the Neon endpoint on port
  5432 before changing application settings.
- The continuous worker logs a redacted `poll-error` category and retries with
  bounded exponential backoff instead of terminating the web launcher. A
  one-shot `runtime:worker:managed:status` command still exits nonzero when the
  provider is unreachable, so it remains useful as a readiness probe.
- Upstash failure is fail-open for auth rate limiting and retryable for outbox
  publication. PostgreSQL writes remain committed.
- A migration URL containing `-pooler` is rejected.
- A managed URL targeting localhost, a non-Neon host, plaintext transport, or
  the wrong responsibility role is rejected before use.
- Do not route back to local PostgreSQL after hosted writes. Follow the
  recovery runbook instead.

## Deployment gate

A source-controlled Vercel deployment and hosted continuous-worker owner are
still required before hosted staging is declared delivered. Do not set live
environment variables through a dashboard-only edit; merge reviewed source,
set scoped server-only secrets, deploy from `staging`, and record the deployment
evidence without URLs or provider IDs.

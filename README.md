# MRMPL Dashboard

Unified local MRMPL application for pricing, production, planning, quality,
maintenance, attendance, and training workflows.

The application uses Next.js 16, PostgreSQL 16, Redis 7, and Better Auth.
PostgreSQL is the sole writable business datastore. Redis is disposable
acceleration for invalidation and rate limiting; losing Redis cannot lose a
canonical write or dashboard read model.

## Project layout

- `apps/web` — Next.js application and Better Auth HTTP boundary
- `packages/ui` — shared shadcn/ui design system (`radix-luma`)
- `packages/db` — typed PostgreSQL schema, repositories, and unchanged domain logic
- `packages/runtime` — durable read-model worker and Redis delivery
- `packages/migration` — read-only loaders and deterministic migration rehearsals
- `migration.json` — ticket and implementation ledger

## Local setup

The complete setup guide covers both local Docker and managed Neon + Upstash
development: [`SETUP.md`](SETUP.md).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm local:up
```

Local service defaults are:

- application PostgreSQL: `postgres://mrmpl:mrmpl@localhost:5434/mrmpl`
- test PostgreSQL: `postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test`
- Redis: `redis://localhost:6380`
- web application: `http://localhost:3001`

Set `BETTER_AUTH_SECRET` to a local value with at least 32 characters. Seed the
first administrator with `pnpm auth:seed-admin -- --email <address>`; the
password prompt is hidden.

Start the worker and web application in separate terminals:

```bash
pnpm runtime:worker
pnpm dev
```

Stop PostgreSQL and Redis without deleting their named volumes with
`pnpm services:down`.

## Managed staging from local development

The managed launcher resolves credentials from the authenticated Neon and
Upstash CLIs, keeps them in process memory, and targets the populated Neon
`staging` branch plus the disposable Upstash staging database. It does not
start or depend on the local PostgreSQL and Redis containers.

```bash
pnpm dev:managed:check
pnpm dev:managed
```

Open `http://localhost:3001`. The second command runs both Next.js and the
durable worker. Use `pnpm dev:managed:web` for the web process only, or the
managed worker once/status commands for operator checks:

```bash
pnpm runtime:worker:managed:once
pnpm runtime:worker:managed:status
```

See [`docs/neon-upstash-staging-runbook.md`](docs/neon-upstash-staging-runbook.md)
for prerequisites, role boundaries, branch-capacity rules, and failure modes.

## Runtime commands

```bash
pnpm local:up
pnpm runtime:worker
pnpm runtime:worker:once
pnpm runtime:worker:status
pnpm --filter @workspace/migration fingerprint:database
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`runtime:worker:status` reports durable PostgreSQL queue, retry, lag, outbox,
and read-model state. Redis publication happens only after PostgreSQL commits.

## Data migration

The earlier Convex export and Pricing SQLite archive are migration inputs, not
runtime databases. Only `packages/migration` may open or interpret those source
artifacts. The web, database, and worker packages do not import Convex or a
SQLite driver.

Rehearsal commands are intentionally explicit and read source artifacts without
modifying them:

```bash
pnpm --filter @workspace/migration inspect:artifacts -- <artifact paths>
pnpm --filter @workspace/migration rehearse:foundation -- <arguments>
pnpm --filter @workspace/migration rehearse:pricing -- <arguments>
pnpm --filter @workspace/migration rehearse:convex -- <arguments>
```

The complete mapping, reconciliation, cutover, and rollback contract is in
`docs/postgresql-migration-spec.md`.

## Local file storage

PostgreSQL stores canonical file metadata, checksums, ownership, and entity
links. New retained enquiry drawings use UploadThing and require the server-only
`UPLOADTHING_TOKEN`. Historical local attachment bytes remain readable below
`LOCAL_FILE_STORAGE_PATH`, which must remain outside version control; new
enquiry drawing writes do not create local bytes.

The checksum-verified backup and empty-root restore commands are documented in
[`docs/local-file-storage-backup-restore.md`](docs/local-file-storage-backup-restore.md).

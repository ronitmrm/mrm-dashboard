# Development setup

The dashboard supports two development topologies:

- local PostgreSQL 16 and Redis 7 containers managed by Docker Compose;
- the deployed Neon `staging` branch and Upstash staging Redis database.

Both topologies run the Next.js application at
[`http://localhost:3001`](http://localhost:3001). PostgreSQL is authoritative;
Redis is disposable acceleration state.

## Prerequisites

- Node.js 20.19 through 24
- pnpm 10 (`corepack enable` if `pnpm` is unavailable)
- Docker Engine with Docker Compose for the local-container topology
- Neon and Upstash accounts plus their CLIs for the managed topology

Install the workspace dependencies and create the untracked environment file:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Generate one stable Better Auth secret and place it in
`apps/web/.env.local`:

```bash
openssl rand -base64 32
```

Use that output as `BETTER_AUTH_SECRET`. Keep the same secret between restarts
and never commit `.env.local`.

## Option A: local Docker services

Set these values in `apps/web/.env.local`:

```dotenv
DATABASE_URL=postgres://mrmpl:mrmpl@localhost:5434/mrmpl
TEST_DATABASE_URL=postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test
REDIS_URL=redis://localhost:6380
LOCAL_FILE_STORAGE_PATH=/absolute/path/to/mrm-dashboard/local-data
BETTER_AUTH_SECRET=replace-with-the-generated-secret
BETTER_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Leave `MRM_MANAGED_RUNTIME`, the role-specific managed database URLs, and the
Upstash REST variables empty.

Start PostgreSQL and Redis. This waits for both containers, applies current
database migrations, and verifies connectivity:

```bash
pnpm local:up
```

Load the local environment into the current shell, then seed the first
administrator. The password is read from a hidden terminal prompt and is not
placed in shell history:

```bash
set -a
source apps/web/.env.local
set +a
pnpm auth:seed-admin -- --email admin@example.com --name "System Administrator"
```

The seed command is deliberately bootstrap-only: it refuses to run unless the
database contains zero users. Run it once per fresh database. For non-interactive
automation, pipe the secret and add `--password-stdin`; do not pass a password as
a command-line argument.

Start the worker and web process in separate terminals. Load `.env.local` in
each terminal first:

```bash
set -a
source apps/web/.env.local
set +a
pnpm runtime:worker
```

```bash
set -a
source apps/web/.env.local
set +a
pnpm dev
```

Open [`http://localhost:3001`](http://localhost:3001) and sign in with the
administrator credentials.

Useful local commands:

```bash
pnpm runtime:worker:status
pnpm services:logs
pnpm services:down
```

`pnpm services:down` stops the containers without deleting their named volumes.

## Option B: Neon and Upstash

The managed launcher obtains short-lived Neon connection strings and Upstash
REST credentials from authenticated CLIs. It does not write provider
credentials to `.env.local`.

Authenticate and link this checkout to the existing Neon project:

```bash
pnpm dlx neonctl auth
pnpm dlx neonctl link
upstash login
```

Neon's current CLI is invoked as `neon`; `neonctl` remains an alias. See the
[Neon CLI installation and authentication guide](https://neon.com/docs/cli/install)
and [CLI reference](https://neon.com/docs/cli). Upstash login uses a Developer
API key; the application itself uses the Redis REST URL and token described by
the [Upstash Redis TypeScript guide](https://upstash.com/docs/redis/sdks/ts/getstarted).

The existing managed resources must include:

- Neon branch `staging`, database `neondb`, and login roles
  `mrmpl_staging_web`, `mrmpl_staging_worker`, and
  `mrmpl_staging_migration`;
- Upstash Redis database `mrmpl-staging-acceleration`.

Do not create a Neon branch for routine startup. The account has a hard limit
of 10 branches; inspect existing branches and remove obsolete disposable
branches before intentionally creating another one. Never delete `staging` or
the production/default branch as cleanup.

Load the stable auth secret and public URLs from `.env.local` into the shell:

```bash
set -a
source apps/web/.env.local
set +a
```

The managed launcher overrides local database and Redis values with the
selected provider credentials. Optional selectors are:

```bash
export MRM_NEON_BRANCH=staging
export MRM_NEON_DATABASE=neondb
export MRM_UPSTASH_DATABASE=mrmpl-staging-acceleration
```

Check provider resolution without starting a server:

```bash
pnpm dev:managed:check
```

For a fresh managed database with zero users, seed the administrator:

```bash
pnpm auth:seed-admin:managed -- --email admin@example.com --name "System Administrator"
```

Then start Next.js and the durable worker together:

```bash
pnpm dev:managed
```

Other managed commands:

```bash
pnpm dev:managed:web
pnpm runtime:worker:managed:once
pnpm runtime:worker:managed:status
```

Press `Ctrl-C` in the launcher terminal to stop all child processes.

## Verification and troubleshooting

After either topology is running:

1. Sign in at [`http://localhost:3001`](http://localhost:3001).
2. Open a commercial dashboard page and perform a harmless read.
3. Run `pnpm runtime:worker:status` for local services or
   `pnpm runtime:worker:managed:status` for managed services.
4. Run `pnpm test`, `pnpm typecheck`, and `pnpm lint` before committing code.

If managed Neon connections time out on port 443 or 5432, verify that the local
network, VPN, and firewall permit outbound traffic to the Neon endpoint. The
launcher cannot repair a blocked network route. If CLI preflight fails, rerun
the relevant login command and confirm that the linked Neon project and named
Upstash database are visible.

Provider role boundaries, recovery, branch-capacity rules, and failure modes
are documented in
[`docs/neon-upstash-staging-runbook.md`](docs/neon-upstash-staging-runbook.md).

# Local Self-Hosted Convex

Use this workflow while developing locally to avoid spending database I/O on the shared cloud Convex deployment.

The Docker Compose file is based on the official Convex self-hosted Docker setup. It starts:

- Convex backend: `http://127.0.0.1:3210`
- Convex HTTP actions/site proxy: `http://127.0.0.1:3211`
- Convex dashboard: `http://localhost:6791`

## Prerequisites

- Docker Desktop or a compatible `docker compose` runtime.
- `pnpm install` already completed.

## Start Convex Locally

From the repo root:

```bash
pnpm convex:local:up
```

Generate the admin key:

```bash
pnpm convex:local:admin-key
```

Copy `apps/web/.env.example` to `apps/web/.env.local` and set the local values:

```env
CONVEX_DEPLOYMENT=
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=<admin key from docker>
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
CONVEX_SITE_URL=http://127.0.0.1:3211
NEXT_PUBLIC_CONVEX_SITE_URL=http://127.0.0.1:3211
```

Do not commit `apps/web/.env.local`.

## Configure Convex Auth

This app uses Convex Auth with the password provider. Convex's self-hosted docs require manual auth setup.

Generate signing keys:

```bash
pnpm convex:auth:keys
```

Set the printed values on the local self-hosted backend:

```bash
pnpm --filter web exec convex env set JWT_PRIVATE_KEY "<printed JWT_PRIVATE_KEY>"
pnpm --filter web exec convex env set JWKS '<printed JWKS>'
pnpm --filter web exec convex env set SITE_URL http://localhost:3001
```

The `convex env set` commands use `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` from `apps/web/.env.local`.

## Push Functions And Run The App

Push the current Convex functions/schema to the local backend once:

```bash
pnpm convex:local:push
```

Then run the normal monorepo dev command:

```bash
pnpm dev
```

With the local env file above, both Next.js and `convex dev` point at the self-hosted backend. Use `pnpm dev:web` and `pnpm dev:convex:local` in separate terminals if you want separate logs.

## Import Workbook Data

Dry-run first:

```bash
pnpm import:workbook:dry-run -- --workbook /path/to/Advanced_Employee_Performance_System.xlsx
```

Then import into the selected local backend:

```bash
pnpm import:workbook -- --workbook /path/to/Advanced_Employee_Performance_System.xlsx
```

Before applying imports, confirm `apps/web/.env.local` points at `http://127.0.0.1:3210`, not a cloud Convex deployment.

## Stop Local Convex

```bash
pnpm convex:local:down
```

The database is kept in the Docker Compose `data` volume, so stopping containers does not clear local data.

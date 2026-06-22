# MRMPL Dashboard

Next.js + Convex dashboard for MRMPL production, attendance, training, planning, routing, and shop-floor metrics.

The UI lives in `apps/web`, shared shadcn/ui components live in `packages/ui`, and Convex backend functions live in `apps/web/convex`.

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

Fill `apps/web/.env.local` with the Convex deployment values.

Required variables:

- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_SITE_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`

## Development

```bash
pnpm dev
```

This runs the web app and Convex dev task together through Turborepo's TUI.

Useful focused commands:

```bash
pnpm dev:web
pnpm dev:convex
pnpm lint
pnpm typecheck
pnpm --filter web test
pnpm build
```

## Data

The dashboard reads from Convex at runtime. Workbook files are treated as local import inputs and are intentionally ignored by git.

To inspect a workbook without writing to Convex:

```bash
pnpm import:workbook:dry-run -- --workbook /path/to/Advanced_Employee_Performance_System.xlsx
```

To import workbook data into the shared dev Convex deployment:

```bash
pnpm import:workbook -- --workbook /path/to/Advanced_Employee_Performance_System.xlsx
```

The importer uses `npx convex import --replace`, so verify the selected Convex deployment before running it. This project intentionally uses the shared dev Convex deployment for both local development and the Vercel-hosted dashboard.

## Vercel Dev-Backed Deployment

Set Vercel's root directory to `apps/web` and use this build command:

```bash
pnpm build
```

Required Vercel environment variables:

- `NEXT_PUBLIC_CONVEX_URL`: shared dev Convex cloud URL, for example `https://your-dev-deployment.convex.cloud`.
- `NEXT_PUBLIC_CONVEX_SITE_URL`: shared dev Convex site URL, for example `https://your-dev-deployment.convex.site`.
- `CONVEX_SITE_URL`: same shared dev Convex site URL, kept aligned with the Convex Auth issuer.

Do not set `CONVEX_DEPLOY_KEY` in Vercel. Do not run `npx convex deploy` from Vercel for this app. The hosted site should read and write the already-seeded shared dev Convex deployment.

Before deploying a code change that modifies `apps/web/convex`, run `pnpm dev:convex` or `npx convex dev --once` locally so the shared dev backend has the latest schema and functions.

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

To import workbook data into Convex, use the same script with `pnpm import:workbook` after confirming the target deployment and auth/import path.

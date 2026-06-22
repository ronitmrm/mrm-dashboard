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

To import workbook data into the local/dev Convex deployment:

```bash
pnpm import:workbook -- --workbook /path/to/Advanced_Employee_Performance_System.xlsx
```

To import workbook data into the default production Convex deployment:

```bash
pnpm import:workbook -- --prod --workbook /path/to/Advanced_Employee_Performance_System.xlsx
```

Use `--deployment <deployment>` instead of `--prod` when targeting a named staging or preview deployment. The importer uses `npx convex import --replace`, so verify the target before running it.

## Vercel

Set Vercel's root directory to `apps/web` and use this build command:

```bash
npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL --cmd 'pnpm build'
```

Required Vercel production environment variables:

- `CONVEX_DEPLOY_KEY`: production deploy key generated from the Convex dashboard.
- `NEXT_PUBLIC_CONVEX_URL`: production Convex cloud URL, for example `https://your-prod-deployment.convex.cloud`.
- `NEXT_PUBLIC_CONVEX_SITE_URL`: production Convex site URL, for example `https://your-prod-deployment.convex.site`.
- `CONVEX_SITE_URL`: same production Convex site URL, kept aligned with the Convex Auth issuer.

Convex Auth secrets are set on the Convex production deployment, not in Vercel:

- `JWT_PRIVATE_KEY`
- `JWKS`

After the first production Convex deploy, run `npx @convex-dev/auth --prod` from `apps/web` or set those variables with `npx convex env set --prod --from-file <file> --force`.

Do not set a dev `CONVEX_DEPLOYMENT` value in Vercel production. Vercel should target production through `CONVEX_DEPLOY_KEY`.

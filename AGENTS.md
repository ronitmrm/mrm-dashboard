# Agent Rules: MRMPL Dashboard

This repo is meant to be iterated on by non-technical users through AI agents. Keep changes boring, traceable, and easy to verify.

## Project Shape

- Package manager: `pnpm`.
- App: `apps/web` using Next.js, TypeScript, React, and Convex.
- Shared UI package: `packages/ui`.
- Convex backend: `apps/web/convex`.
- Runtime data source: Convex. Excel workbooks are local import inputs only.

## Non-Negotiables

- Do not route to, embed, restore, or depend on the deprecated static legacy dashboard.
- Do not add a Python server or sidecar backend to serve dashboard data.
- Do not commit `.env*`, workbook files, local exports, build output, or generated agent metadata.
- Do not use fake/sample dashboard data unless it is isolated in a test.
- Do not edit `apps/web/convex/_generated`; regenerate it with Convex tooling when needed.

## Data And Convex

- Dashboard reads should go through Convex queries/mutations in `apps/web/convex/dashboard.ts`.
- The main UI should use Convex React hooks directly where practical, not local fake state.
- Keep company workbook data shared unless a feature explicitly needs user-owned rows.
- Vercel intentionally points at the shared seeded dev Convex deployment; do not introduce a production Convex deployment unless explicitly requested.
- Vercel deploys the Next.js frontend only. If any file under `apps/web/convex` changes, run `npx convex dev --once` or `pnpm dev:convex` locally before treating the Vercel site as current, otherwise deployed mutations/queries may call stale Convex backend code.
- Run workbook imports as dry runs first:
  `pnpm import:workbook:dry-run -- --workbook /path/to/file.xlsx`
- Confirm the target deployment before any write/import command.

## Design System

- Use the configured shadcn preset/style: `b2pl3ZuLI` / `radix-luma`.
- App globals must import `@workspace/ui/globals.css`.
- Shared shadcn primitives belong in `packages/ui/src/components`.
- App-specific dashboard views belong in `apps/web/components`.
- Use `@workspace/ui` primitives and `lucide-react` icons before custom UI.
- Keep the MRMPL logo asset at `apps/web/public/mrm-green.svg`.
- Preserve light/dark mode, responsive layouts, and browser-persisted workbook filters.
- Keep dashboard UI data-dense and operational; avoid marketing-page patterns.

## Code Rules

- Normalize dashboard payload changes in `apps/web/lib/dashboard-view-model.ts` before changing layout components.
- Keep analysis/business logic in `apps/web/lib/legacy-dashboard-analysis.ts` and `apps/web/lib/dashboard-domain.ts`.
- Keep API compatibility routes under `apps/web/app/api/[...path]/route.ts` honest: no fake success responses.
- For Next.js behavior, check local Next docs or current package behavior before relying on old conventions.
- Prefer existing package boundaries over adding new abstractions.

## Environment

- Copy `apps/web/.env.example` to `apps/web/.env.local`.
- Required env vars:
  - `CONVEX_DEPLOYMENT`
  - `NEXT_PUBLIC_CONVEX_URL`
  - `CONVEX_SITE_URL`
  - `NEXT_PUBLIC_CONVEX_SITE_URL`
- For Vercel, use the same shared dev Convex URLs and build with `pnpm build`; do not set `CONVEX_DEPLOY_KEY`.
- If Convex generated files are missing after clone, run Convex codegen/dev before building.

## Agent Working Memory

Use `./memory/` as the persistent working memory vault for local coding agents.

Before starting any non-trivial task:
- Read `./memory/README.md` or `./memory/index.md` if present.
- Check for task-relevant notes in `./memory/`.
- Treat memory as helpful context, not truth; verify important claims against the codebase.

When you learn something that future agents should know, update the memory vault. Store durable context such as:
- architecture notes
- domain rules
- decisions and tradeoffs
- known pitfalls
- debugging findings
- task handoffs
- recurring commands or workflows
- open questions

Keep memory files concise, human-readable Markdown. Prefer updating an existing relevant note over creating scattered new files. Include dates and code references when useful.

Do not store secrets, credentials, private keys, tokens, large command outputs, build artifacts, or temporary scratch notes in memory.

## Verification

Before handing off code changes, run:

```bash
pnpm lint
pnpm typecheck
pnpm --filter web test
pnpm build
```

For UI changes, also smoke-test `pnpm dev` in a browser when possible.
Always kill dev server/s after testing, unless the user specifies to have them up and running.

## Git Discipline

- Check `git status --short` before and after every change set.
- Commit every completed change set with a clear, specific message.
- Never commit secrets, `.env.local`, workbook files, generated caches, or ignored files.
- After every 3 local commits, push upstream to `main`:
  `git push origin main`
- Reset the push counter after a successful push.
- If commit or push fails, stop and report the exact failure instead of continuing silently.

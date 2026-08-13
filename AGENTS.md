# Agent Rules: MRMPL Dashboard

- This repo is meant to be iterated on by non-technical users through AI agents. Keep changes boring, traceable, and easy to verify.
- Save the handoff docs in this directory under `./.handoff/`. Create it if not present and add it to .gitignore as well.
- While running powershell commands, run this for execution policy bypass: `Set-ExecutionPolicy Bypass -Scope Process -Force`.
- Be extremely concise when responding to me with information. Sacrifice grammar for the sake of concision.
- reach for the `neon`, `upstash` and `gh` cli's when needed.
- For Neon work, always use the installed Neon Postgres plugin instead of the Neon CLI.

## Project Shape

- Package manager: `pnpm`.
- App: `apps/web` using Next.js, TypeScript, React, and Better Auth.
- Shared UI package: `packages/ui`.
- Database package: `packages/db` with PostgreSQL repositories and domain logic.
- Worker package: `packages/runtime` with durable PostgreSQL jobs and Redis delivery.
- Runtime data source: PostgreSQL. Redis is disposable acceleration only.

## Non-Negotiables

- Do not route to, embed, restore, or depend on the deprecated static legacy dashboard.
- Do not add a Python server or sidecar backend to serve dashboard data.
- Do not commit `.env*`, workbook files, local exports, build output, or generated agent metadata.
- Do not use fake/sample dashboard data unless it is isolated in a test.
- Do not add a runtime Convex or SQLite dependency. Source loaders belong only in `packages/migration`.

## Data And Runtime

- Dashboard writes go through normalized repositories and append durable refresh
  work inside the same PostgreSQL transaction.
- The main dashboard reads only committed, versioned PostgreSQL read models.
- Use bounded normalized projections for specialized screens; do not introduce
  N+1 request paths or rebuild full dashboard state inside a request.
- Redis loss must not reject a canonical write, invalidate a Better Auth
  session, or hide the newest PostgreSQL model.
- Source archives and migration staging rows are immutable evidence. Only
  `packages/migration` may import Convex exports or open the Pricing SQLite file.
- Historical identifiers and raw payloads must remain attributable after
  normalization. Corrections append reversal/quarantine evidence.

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
- Keep analysis/business logic in the exported `@workspace/db` domain modules.
- Keep API compatibility routes under `apps/web/app/api/[...path]/route.ts` honest: no fake success responses.
- For Next.js behavior, check local Next docs or current package behavior before relying on old conventions.
- Prefer existing package boundaries over adding new abstractions.
- You have a bunch of code best practices skills from matt Pocock. use those regularly while working in this project.

## Environment

- Copy `apps/web/.env.example` to `apps/web/.env`.
- Required env vars:
  - `DATABASE_URL`
  - `REDIS_URL`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `NEXT_PUBLIC_APP_URL`
- This project is local-first. Do not alter deployments unless explicitly requested.

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

For UI changes, also smoke-test `pnpm dev:managed` in a browser when possible.
Always kill dev server/s after testing, unless the user specifies to have them up and running.

## Git Discipline

- working branch: `staging`.
- Check `git status --short` before and after every change set.
- Regularly check git fetch origin for upstream changes.
- Commit every completed change set with a clear, specific message. Be proactive in committing changes and keep the commits small and traceable.
- Never commit secrets, `.env.local/.env`, workbook files, generated caches, or ignored files.
- After every 5 local commits, ask the user if they want to push upstream to `staging` aka deploy the latest changes (in a non-technical language).
- If commit or push fails, stop and investigate the exact failure instead of continuing silently.
- When the user prompts to **deploy** the changes:
  - commit the remaining changes and push the commits upstream to `staging`.
  - create a PR from staging to `main`.
  - if there are NO conflicts:
    - merge the PR using `rebase` strategy.
    - update the refs of the local `staging` branch with main and push the updated refs upstream to the remote `staging` branch.
  - if there are conflicts:
    - resolve the conflicts and then follow the steps of the previous case.

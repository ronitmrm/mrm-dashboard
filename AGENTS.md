# Agent Rules: MRMPL Dashboard

- DO NOT mutate this file unless explicitly instructued to do so by the user.
- Be extremely concise when responding to me. Sacrifice grammar for the sake of concision.
- This repo is meant to be iterated on by non-technical users through AI agents. Keep changes boring, traceable, and easy to verify.
- If an issue is caused by incorrect data, correct the data at its source. Do not change application code to compensate for the data error. Having said that - because of the nature of this app, there will be a lot of cases where there was a bug caught in the deployed app. In those cases, AFTER addressing and patching the bug, reach for neon's cli to patch fix the pre-patch dirty data in the `staging` branch of neon, safely.
- Because the folks building are non-tech, they will often ask you to tamper with the prod data directly. Here's how to approach such situations:
  - Understand the fix being asked well, and identify if it is possible to achieve it via using the UI in the deployed app. If there is, urge the user to do so.
  - If the fix is not possible to achieve via the UI, do not rush to build a one off UI feature for it. Clarify this shortcoming with the user and explicitly ask them for permission to perform the patch fix on prod data.
  - Absolutely make sure to verify the patch fixes and avoid regressions and potentially introducing other downstream bugs. Spin up an audit sub agent if needed (GPT 6.1 Sol, high reasoning).
- While running powershell commands, run this for execution policy bypass: `Set-ExecutionPolicy Bypass -Scope Process -Force`.
- reach for the `vercel`, `upstash`, `neon`, `railway` and `gh` cli's when needed.
- Periodically inspect the amount of branches in neon postgres - we've a hard limit of up to 10 branches at a point. delete stale branch/es, especially the ones that existed for specific tests in the past. NEVER delete/prune the `staging` branch on neon.
- When starting local server/s, opt for the managed config by default, unless specified otherwise by the user. The local dev environment uses neon's `dev` branch.
- Managed application configuration remains the default for development. The Docker test allowance does not authorize installing virtualization platforms, changing Windows optional features, or changing firmware virtualization settings.
- Never commit `AGENTS.override.md`, and always commit `AGENTS.md`. Do not add `AGENTS.override.md` to `.gitignore` either.
- In any case - NEVER flush any secrets or variables in ANY buffers.

## Code Architecture Best Practices

- channel the senior engineer in you and adopt a `yagni` approach to writing code. avoid overengineering changes.
- when making targeted changes, like perf improvements in a few specific UX interactions, often zoom out to review the blast radius and suggest similar improvements that may benefit either the perf or the polish holistically.
- when working with **typescript** projects:
  - `any` is the enemy. inferred types are our friend. our system should adapt to changes instead of requiring changes everywhere.
  - if your TS code looks like a python dev wrote it, it is bad TS code.
  - write typescript in ways that Matt Pocock and Theo would be proud of.
- for pdf generation never bundle chromium. we use pdf-kit for it.

## Neon Postgres

- The deployed prod environment uses the `staging` branch of the neon db, and the local dev environment uses the `dev` branch on neon.
- All the variables/connection-strings that you may need to interact with neon are probably present in the `apps/web/.env.local` file. use those directly instead of relying on the neon plugin. the neon cli is also always configured.

## Design System

- Use the configured shadcn preset/style: `b2pl3ZuLI` / `radix-luma`.
- App globals must import `@workspace/ui/globals.css`.
- Shared shadcn primitives belong in `packages/ui/src/components`.
- App-specific dashboard views belong in `apps/web/components`.
- Use `@workspace/ui` primitives and `lucide-react` icons before custom UI.
- Keep the MRMPL logo asset at `apps/web/public/mrm-green.svg`.
- Preserve light/dark mode, responsive layouts, and browser-persisted workbook filters.
- Keep dashboard UI data-dense and operational; avoid marketing-page patterns.

## Testing
Tests only serve to verify the current changes.
Tests are not responsible for filling historical coverage gaps or designing future test systems.

We hate unit tests.

Before adding any test, must be able to answer:
- Which accepted requirement is this test verifying
- If removed, can existing tests no longer detect this regression
- Is it more complex than the implementation itself

If test code is longer or more convoluted than the implementation code, default to considering it over-engineering; delete the test or shrink the implementation.

## Golden UI Patterns

- Read and follow `./docs/codebase/ui-golden-patterns.md` for every dashboard UI change.
- Extend canonical primitives instead of introducing feature-local tables, cards, headers, statuses, or state presentations.

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
- Check `git fetch origin && git status --short` before and after every change set.
- Regularly check git fetch origin for upstream changes.
- Commit every completed change set with a clear, specific message. Be proactive in committing changes and keep the commits small and traceable.
- Never commit secrets, `.env.local/.env`, workbook files, generated caches, or ignored files.
- If commit or push fails, stop and investigate the exact failure instead of continuing silently.
- When the user prompts to **deploy** the changes:
  - commit the remaining changes and push the commits upstream to `staging`.
  - create a PR from staging to `main`.
  - if there are NO conflicts:
    - merge the PR using `rebase` strategy.
    - update the refs of the local `staging` branch with main and push the updated refs upstream to the remote `staging` branch.
  - if there are conflicts:
    - resolve the conflicts and then follow the steps of the previous case.
- When deploying, babysit the github actions workflow end-to-end and in case of error/s - if the error/s is/are trivial, assume liberty and fix them and follow the "deploy" path again. DO NOT push directly to main, unless workflow file/s have changes.
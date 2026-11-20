# Agent Rules: MRMPL Dashboard

DO NOT mutate this file unless explicitly instructued to do so by the user.
Be extremely concise when responding to me. Sacrifice grammar for the sake of concision.
Keep changes boring, traceable, and easy to verify.
While running powershell commands, run this for execution policy bypass: `Set-ExecutionPolicy Bypass -Scope Process -Force`.
Never commit `AGENTS.override.md` or `CLAUDE.local.md`, and always commit `AGENTS.md` and `CLAUDE.md`.
In any case - NEVER flush any secrets or variables in ANY buffers.
Chances are that the users are using T3 Code for building the app. If that is the case, utilize the tools it makes available to better enrich your context and get things done efficiently.
When the user asks you to start a dev server, start it using a script so you're not bound to a command runtime limit, by T3 Code's environment for example.
Be proactive in making commits.

## Code Architecture Best Practices

Channel the senior engineer in you and adopt a `yagni` approach to writing code. avoid overengineering changes.
When making targeted changes, like perf improvements in a few specific UX interactions, often zoom out to review the blast radius and suggest similar improvements that may benefit either the perf or the polish holistically.
When working with **typescript** projects:
  - `any` is the enemy. inferred types are our friend. our system should adapt to changes instead of requiring changes everywhere.
  - if your TS code looks like a python dev wrote it, it is bad TS code.
  - write typescript in ways that Matt Pocock and Theo would be proud of.
For pdf generation never bundle chromium. we use pdf-kit for it.

## Production Server and Deployment Procedure

The project has migrated to a local deployment on a server PC. There is no CI/CD workflows anymore for automatic deployment when merged into `main`.
There is an AI agent on the server PC that governs the deployment releases and periodic health checks.

When to deploy?
Whenever the user prompts you to. Simple as that.

How to deploy?
Start by updating the local refs and fast-forward newer commits onto the working branch before proceeding.
Once the working branch is up to date with remote, open a PR to `main`.
Resolve any merge conflicts that occur, and then have the PR landed in `main` using the default strategy.
Once the PR has merged successfully, use T3 Code's tools to locate the server PC (`DESKTOP-RGA59F8 WSL`) and then fire off an Opus 5.5 (high) thread in the `/home/mrmdev/Code/mrm` asking it to have the latest release deployed.
No need to babysit it. The server PC has the T3 Code tools to revert back to you when it has completed the deployment.
Only when the server PC's agent claims the successful deployment, shall the user be updated.

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
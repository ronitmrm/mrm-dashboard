<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## MRMPL UI Rules

- Package manager: `pnpm`.
- The shadcn preset is `b2pl3ZuLI`; app globals must import `@workspace/ui/globals.css`.
- Put shared shadcn primitives in `packages/ui/src/components`; app-specific dashboard code belongs in `apps/web/components`.
- Do not reintroduce shadcn demo data or generated sample dashboards. The live dashboard reads `/api/dashboard`.
- Normalize backend response changes in `apps/web/lib/dashboard-view-model.ts` before touching layout components.
- Before handing off UI changes, run:
  - `./node_modules/.bin/tsc --noEmit` in `apps/web`
  - `./node_modules/.bin/eslint` in `apps/web`
  - `./node_modules/.bin/tsc --noEmit` in `packages/ui`
  - `./node_modules/.bin/eslint` in `packages/ui`
  - `./node_modules/.bin/next build --webpack` in `apps/web`

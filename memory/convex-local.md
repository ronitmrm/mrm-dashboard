# Local Self-Hosted Convex

Date: 2026-06-27

The repo now has a local self-hosted Convex development path to avoid spending database I/O on the shared cloud deployment during routine development.

Key files:

- `docker-compose.convex.yml` starts the Convex backend, site proxy, and dashboard.
- `docs/local-convex.md` documents setup, auth env, function push, workbook import, and shutdown.
- `apps/web/.env.example` includes `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY` placeholders.
- `apps/web/lib/convex-env.ts` intentionally requires explicit `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL`; do not reintroduce hardcoded cloud fallbacks.

Caveats:

- This app uses Convex Auth with password auth. For self-hosted Convex, generate `JWT_PRIVATE_KEY`/`JWKS` with `pnpm convex:auth:keys`, then set them with `convex env set` against the local backend.
- Do not print generated auth keys in agent transcripts unless the user explicitly asks and understands they are secrets.
- Docker was not installed in the shell when this note was written, so container startup was not verified here.

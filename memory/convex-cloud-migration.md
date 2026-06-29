# Convex Cloud Migration

Date: 2026-06-29

The project was migrated to the new Convex cloud deployment:

- Deployment: `dev:brilliant-spider-229`
- Cloud URL: `https://brilliant-spider-229.convex.cloud`
- Site URL: `https://brilliant-spider-229.convex.site`
- Dashboard shown by CLI: `ankit-khattar-35b19:mrm-dashboard:dev/ankit-khattar`

Data was restored from:

- `backups/convex/convex-current-20260629-104113.zip`

Convex Auth:

- The app uses Convex Auth password auth via `apps/web/convex/auth.ts`.
- `JWT_PRIVATE_KEY` and `JWKS` were generated with `pnpm convex:auth:keys` and set on `brilliant-spider-229` with `pnpm convex env set`.
- A read-only inline query verified `JWT_PRIVATE_KEY`, `JWKS`, and `CONVEX_SITE_URL` are present on the deployment.
- Avoid `pnpm convex env list` in agent transcripts because it prints secret values. Prefer setting values via stdin and verifying with boolean-only inline queries.

Useful commands:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
pnpm convex dev --once --typecheck disable --tail-logs disable
pnpm convex run --deployment brilliant-spider-229 --inline-query "return { hasJwtPrivateKey: Boolean(process.env.JWT_PRIVATE_KEY), hasJwks: Boolean(process.env.JWKS), hasConvexSiteUrl: Boolean(process.env.CONVEX_SITE_URL) };"
```

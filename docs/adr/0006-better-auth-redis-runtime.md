# Better Auth, Authorization, and Redis Runtime

Date: 2026-07-18

Status: Accepted

## Context

Legacy Convex Auth data and Pricing SQLite users are disposable and are
explicitly excluded from migration. The unified application still needs fresh
authentication, granular operational authorization, revocation, rate limiting,
and inexpensive cache invalidation.

Better Auth supports a generated Drizzle schema, PostgreSQL-backed sessions,
cookie session caching, and secondary storage. Redis is useful for short-lived
state, but machine locks, quote supersession, audit, jobs, and permissions must
not become dependent on a disposable cache.

References:

- [Better Auth database and secondary storage](https://www.better-auth.com/docs/concepts/database)
- [Better Auth Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle)
- [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management)
- [Better Auth Next.js integration](https://www.better-auth.com/docs/integrations/next)

## Decision

- Better Auth owns fresh `identity.users`, `identity.accounts`,
  `identity.sessions`, and `identity.verifications` tables in PostgreSQL.
- The Better Auth Drizzle schema is generated from the pinned configuration
  and committed through the same numbered SQL migration history as the MRMPL
  schemas.
- No Convex Auth table, SQLite `app_users`, `app_user_permissions`, or
  `app_sessions` row enters working staging or canonical PostgreSQL.
- The Better Auth Admin plugin may manage user lifecycle and its own coarse
  administrator role. MRMPL owns operational roles, capability keys, grants,
  overrides, and authorization audit.
- Every protected Server Component, Server Action, and Route Handler validates
  the Better Auth session and MRMPL capability at the server boundary. Proxy
  checks are navigation optimization only.
- PostgreSQL is authoritative for sessions and revocation. Better Auth cookie
  session caching is disabled for the initial release.
- Redis is optional, disposable acceleration for auth rate limits,
  application caches, permission-cache entries, and invalidation fan-out. The
  initial application must remain correct when Redis is empty or unavailable.
- Redis does not own machine locks, quote supersession, durable jobs, audit
  records, refresh watermarks, or user-role assignments.
- Canonical writes insert a PostgreSQL outbox event in the same transaction.
  A worker publishes invalidations or warms Redis after commit. Consumers and
  jobs use idempotency keys.
- The first administrator is created only by an explicit one-time command.
  Public self-registration is disabled for the initial release.

## Consequences

- Logging out, banning a user, or changing a capability takes effect from the
  authoritative PostgreSQL check without waiting for a cookie cache expiry.
- Redis loss may increase database load but cannot change a business result or
  preserve access that PostgreSQL has revoked.
- If cookie caching is enabled later, its maximum staleness and revocation
  trade-off require a separate ADR amendment.
- Better Auth schema changes are generated and reviewed; production request
  startup never auto-migrates the database.

## Verification

- Tests prove that legacy auth source tables are deny-listed before staging.
- Authorization tests use server-facing capability checks rather than client
  visibility alone.
- A Redis-unavailable test proves that authoritative session and capability
  decisions still work.
- Outbox retry tests prove that duplicate delivery does not duplicate derived
  state.

---
title: Decide the Authorization Freshness Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by: []
---

## Question

What revocation-freshness guarantee applies, may cookie caching ever be enabled, which operations require authoritative checks, and does ADR-0006 need amendment?

## Resolution

Adopt the [authorization freshness contract](../authorization-freshness-contract.md). Every session, ban, role, capability, and override change takes effect on the next server request across instances. PostgreSQL remains authoritative; Redis loss cannot change the answer.

Cookie caching remains disabled and ADR-0006 does not need amendment. The only deduplication allowed is within one request: at most one session read and one complete-grant read. Every protected Server Component, Server Action, and Route Handler—including reads, writes, administration, files, exports/history, APIs, and event streams—performs its server-boundary check.

## Evidence

- The current Better Auth configuration sets `session.cookieCache.enabled` to `false`.
- The authorization boundary uses request-scoped React caching for one session and one complete grant set; the repository loads all grants in one statement.
- Existing tests cover revoked-session rejection on the next request, one-statement complete-grant loading, Redis fail-open rate limiting, access administration, and narrow commercial capabilities.
- The final acceptance gate still requires explicit same-request deduplication, cross-instance revocation, Redis-loss authorization, and protected-boundary inventory tests.

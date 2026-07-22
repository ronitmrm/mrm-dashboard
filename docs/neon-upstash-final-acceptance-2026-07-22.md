# Neon and Upstash migration acceptance

Date: 2026-07-22  
Overall status: implementation and managed local staging accepted; hosted
deployment remains gated

## Accepted

- The pricing/business-logic migration specification through LM-09 is
  implemented and its prior full repository gates passed.
- The deployment audit, migration specification, and eight sequential ticket
  documents are present.
- The Git implementation branch is `staging` and tracks `origin/staging`.
- Managed PostgreSQL uses separate least-privilege web, worker, migration, and
  reporting roles with bounded connection limits and redacted validation.
- Managed and local-Docker pools use bounded native `pg` TCP connections;
  managed web and worker roles continue to use Neon-pooled endpoints.
- Upstash uses the connectionless TypeScript SDK, atomic Lua rate limiting,
  monotonic dashboard versions, fail-open auth behavior, and retryable
  PostgreSQL outbox publication.
- Two transfer rehearsals matched 144 tables, 164,156 rows, and the exact source
  digest with zero mismatches. Staging matched the same fingerprint immediately
  after promotion.
- `pnpm dev:managed` starts local Next.js and the worker against deployed Neon
  and Upstash without Docker or persisted credentials.
- A managed session request returned HTTP 200; the worker used one connection
  with no waiters.
- PITR restore and reversal succeeded only on disposable branches while the
  project remained below the ten-branch limit.
- Empty Redis recovered from PostgreSQL/outbox state without auth failure or
  canonical data loss.
- Final repository gates passed: 73 database, 14 runtime, 12 migration, and 154
  web tests; workspace typecheck and lint; and the complete Next.js 16.2.6
  production build. The existing file-route NFT trace warning remains
  non-blocking.

## Current live staging policy

- Non-authoritative only; production promotion was not performed.
- Six-hour Neon history window plus checksum-verified custom dumps.
- Branch protection unavailable on the current Neon plan.
- Upstash free hard cap, eviction disabled, no Redis backup.
- Application Operations owns pool, worker/outbox, Redis fallback, and provider
  headroom alerts.
- Seven Neon branches exist after cleanup and recovery evidence creation.
- Continuous worker connection timeouts are redacted and retried with bounded
  backoff; they no longer terminate the managed web development process.

## Remaining delivery gates

1. User review of the uncommitted source changes, followed by intentional
   commits using the repository's required commit format.
2. Source-controlled Vercel deployment from `staging`; no dashboard-only code
   or environment drift.
3. Server-only Vercel environment variables for Better Auth, Neon web access,
   and Upstash REST access, with production values excluded.
4. A selected continuous worker hosting platform and accountable runtime owner.
5. Hosted browser acceptance for sign-in, capability allow/deny, a commercial
   write/read/export, audit attribution, responsive routes, and Upstash-offline
   behavior.
6. Hosted connection/capacity observations under representative concurrency.

Until these gates pass, NU-05, NU-06, and NU-08 cannot be called complete and
the migration as a whole remains `in_progress`. This is not authorization to
promote `production`.

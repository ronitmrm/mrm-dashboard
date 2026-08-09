---
title: Establish Production Notification Constraints
label: wayfinder:research
mode: AFK
status: resolved
claim: codex
blocked_by: []
research_asset: ../research/production-notification-constraints.md
---

## Question

What production PostgreSQL provider, pooling mode, connection limits, failover behavior, and deployment topology constrain a persistent `LISTEN` session?

## Resolution

Adopt the constraints in the refreshed [production notification research](../research/production-notification-constraints.md). The repository establishes only non-authoritative Neon staging, not production. A listener requires one dedicated, direct TLS PostgreSQL session per worker replica, a worker-role credential distinct from migration, and a continuously running host outside Vercel Functions. Ordinary worker queries may remain pooled.

Session loss is expected across network failure, Neon suspension, and failover. Every new session must commit `LISTEN`, reconcile the durable queue, then wait; `error`/`end` handling, duplicate hints, and the 30-second sweep make recovery idempotent. Notifications remain bounded routing hints emitted with durable work in the canonical transaction.

Current staging capacity does not pass: two pooled worker clients plus one direct listener against a role limit of four leave 25% nominal headroom, below the 30% contract. Worker host, direct URL, effective backend use, replica count, suspension behavior, and measured reconnects remain hard cutover inputs rather than inferred production facts.

## Evidence

- PostgreSQL specifies commit-scoped registration/delivery, possible same-transaction coalescing, session-scoped listeners, bounded payloads, and queue-usage observability.
- Neon explicitly excludes `LISTEN`/`NOTIFY` from pooled transaction-mode endpoints and documents disconnections during suspension/failover.
- `pg` documents idle-client `error`, `end`, and `notification` events but no automatic session-state restoration.
- Current Vercel Function durations are finite, so they cannot own an indefinite listener.
- Repository inspection confirms there is no listener URL or `LISTEN`/`NOTIFY` code and the current one-second polling default violates the chosen safety-sweep budget.

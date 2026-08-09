---
title: Define the Refresh Wake-up Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Establish Production Notification Constraints
  - Set the Performance Acceptance Envelope
---

## Question

How should transactional notifications, reconnects, coalescing, safety sweeps, queue authority, and listener failure interact?

## Resolution

Adopt the [durable refresh wake-up contract](../refresh-wakeup-contract.md). The canonical transaction coalesces durable work and emits a bounded `mrm_dashboard_refresh` routing hint. The worker's direct TLS listener commits `LISTEN`, reconciles durable refresh/outbox rows, then waits; every reconnect repeats that order.

Duplicate, coalesced, malformed, and lost notifications never define work. One 30-second non-overlapping safety timer uses two idle probes per sweep, meeting the four-statement/minute budget. Initial staging uses one continuously hosted replica with a pooled query path plus a distinct direct listener URL and at least 30% measured connection headroom.

## Evidence

- Ticket 5 establishes PostgreSQL, Neon, `pg`, Vercel lifetime, session-loss, direct-endpoint, and capacity constraints.
- Ticket 3 fixes notification-to-claim, publication, sweep, and idle-statement budgets.
- Existing durable worker tests prove transactional claims, retries, outbox idempotency, Redis fail-open behavior, and restart-safe PostgreSQL authority.
- Current missing listener/notifier code, direct URL, one-second polling, and excessive idle transaction statements are recorded as implementation blockers.

---
title: Preserve Business Behavior While Adopting the Performant Data Path
label: wayfinder:map
status: open
tracker: local-markdown
---

## Destination

A decision-complete migration route for bringing the performant PostgreSQL access, projection, invalidation, worker, authorization, commercial, and recruitment practices into staging without changing established business behavior.

The final resolution identifies independently reviewable implementation slices, their dependency order, acceptance gates, rollout strategy, and recovery path.

## Notes

Canonical source: [performance migration specification](../../specs/performant-data-path-migration.md).

This map is planning-only. Production implementation does not occur inside its decision tickets.

Open tickets live in `tickets/`. Their front matter records type, claim, and blocking relationships because this PR uses the local-Markdown tracker instead of an external issue tracker.

Standing constraints:

- The staging tree is the destination.
- The performant snapshot is an architectural reference, not the source of business truth.
- Existing Production Floor, quality, planning, commercial, and recruitment behavior remains intact.
- Published migrations `0032` through `0038` are immutable.
- PostgreSQL-backed queues remain durable authorities; notifications are wake-up hints.
- Operational views may be bounded only with explicit coverage. Exports and complete history remain complete.
- Tests assert externally observable behavior at the highest practical seam.
- ADR-0006 governs authorization until explicitly amended.

Relevant skills: `code-review`, `codebase-design`, `research`, `prototype`, `grilling`, and `domain-modeling`.

## Decisions so far

- Staging behavior at migration start is the business oracle. Acceptance uses a production-like, real-PostgreSQL workflow-and-worker fingerprint; normalization is limited to volatile values and approved performance metadata.
- Supported schema starts are empty PostgreSQL and the immutable staging head at `0038`. Both reach `0043`; standard index locks and set-based projection backfill require production-like volume gates before cutover.
- Performance acceptance uses fixed statement/packet/plan/polling/freshness ceilings and p95/p99 measurements from a controlled 1-compute-unit staging benchmark; laptop timings remain diagnostic only.
- Authorization changes take effect on the next server request across instances. Cookie caching remains disabled; only one session and one complete-grant read may be deduplicated inside a request.
- Schema cutover promotes additive units through `0040`, `0042`, and `0043` under a write/worker freeze. Old code remains compatible; application rollback retains the schema and destructive down migrations are forbidden.
- PostgreSQL notifications require a direct TLS worker session on a continuously running host; pooled Neon endpoints and Vercel Functions cannot own the listener. Durable jobs remain authoritative, and current staging connection headroom must be corrected before cutover.
- Dashboard refresh atomically publishes one organization version containing three isolated floor snapshots from bounded canonical sources; delivery returns one floor, coverage is per-category/per-floor, and prior-state reads are restricted to six machine-plan fields.
- Refresh wake-up uses commit-scoped `mrm_dashboard_refresh` hints over the durable queue. A direct-session listener always reconciles after `LISTEN`; a 30-second two-probe sweep limits idle traffic to four statements/minute.
- Dashboard delivery retains same-floor content through hints/reconnects, distinguishes stale/refresh/error/coverage states, refetches canonically on reconnect, clears state on floor change, and uses a 60-second visible-tab safety refresh.
- Commercial operational roots are bounded at repositories with section-specific coverage; Customer/Product pages remain 15/25 rows, Sales summaries/candidates use explicit 50-row caps, related rows stay complete for returned roots, and exports/history remain exhaustive.
- Recruitment bulk commands use bounded set-based reads, writes, and audits behind one exported domain-policy interface while preserving transaction and lifecycle behavior.
- Rollout proceeds schema-first by independently promotable subsystem, with isolated shadows, tested-artifact promotion, durable-queue recovery, and no automatic code-only rollback after incorrect canonical writes.

## Not yet specified

- Exact telemetry surfaces, exposed after performance and rollout contracts are chosen.

## Out of scope

- New business workflows or changed domain rules.
- Rewriting published migration history or resetting production data.
- Replacing PostgreSQL, Redis, or the durable refresh queue.
- Unrelated UI redesign or platform modernization.
- Performing the migration inside this Wayfinder map.

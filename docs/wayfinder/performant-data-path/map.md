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

---
title: Set the Performance Acceptance Envelope
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by: []
---

## Question

What packet-size, statement-count, latency, temporary-write, polling, and freshness budgets determine whether the migration succeeds?

The performant snapshot benchmarks are evidence, not automatically universal thresholds.

## Resolution

Adopt the [performance acceptance envelope](../performance-acceptance-envelope.md) and its machine-readable thresholds in `config/managed-staging.json`.

The envelope fixes statement, row, packet, p95 latency, plan-spill, polling, and p95/p99 freshness budgets. It preserves the reference statement counts and 1 KiB unchanged-dashboard target, but gives environment-sensitive latency its own controlled 1-compute-unit staging benchmark rather than treating laptop timings as universal.

## Evidence

- Existing real-PostgreSQL tests already enforce one-statement dashboard-source reads, 1 KiB unchanged responses, commercial statement ceilings, and constant-growth recruitment bulk operations.
- The accepted reference measurements anchor 100 ms dashboard-source and 25 ms contains-search p95 budgets with explicit operating margin.
- PostgreSQL 16 `pg_stat_statements` exposes execution time, rows, and temporary blocks; the benchmark combines those counters with client-boundary bytes and JSON execution plans.
- Cold starts and provider scaling are reported separately, preventing infrastructure wake-up time from hiding query regressions or making warm-query gates flaky.

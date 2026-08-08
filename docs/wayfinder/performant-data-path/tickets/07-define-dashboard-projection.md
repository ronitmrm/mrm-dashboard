---
title: Define the Dashboard Projection Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Lock the Behavior-Parity Oracle
  - Choose the Schema Cutover Contract
  - Set the Performance Acceptance Envelope
---

## Question

What source categories, Production Floor and organization boundaries, coverage guarantees, limits, version semantics, refresh transaction, and previous-state requirements define the canonical projection?

## Resolution

Adopt the [canonical dashboard projection contract](../dashboard-projection-contract.md). One organization-scoped version atomically publishes all three Production Floor snapshots from one bounded source statement, while delivery extracts only the server-authorized floor.

The contract fixes every source/output category and current limit, requires per-category and per-floor returned/available/limit/truncated coverage, preserves correction and planning-continuity behavior, and restricts prior-state reads to six machine-plan fields. Version, watermark, model, outbox, and successful job completion publish in one repeatable-read transaction.

## Evidence

- Ticket 1 fixes the behavior and ordering oracle; Ticket 3 fixes source/query/packet budgets; Ticket 6 fixes projection migration/backfill and cutover.
- Existing projection/read-model tests prove a one-statement source read, floor isolation, category visibility, transactional trigger maintenance, versioned state, and known-version payload omission.
- Current source budgets and physical-group limits are recorded without inventing new business caps.
- Two implementation blockers are explicit: per-category floor coverage is incomplete, and the previous-state query still transfers the complete prior model.

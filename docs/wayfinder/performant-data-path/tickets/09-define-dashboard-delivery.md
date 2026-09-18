---
title: Define the Dashboard Delivery Contract
label: wayfinder:prototype
mode: HITL
status: resolved
claim: codex
blocked_by:
  - Define the Dashboard Projection Contract
  - Define the Refresh Wake-up Contract
  - Lock the Behavior-Parity Oracle
---

## Question

What externally visible state machine governs initial loads, unchanged versions, changed versions, stale indicators, bounded safety refreshes, and errors?

Prototype only the contract and state transitions, not production code.

## Resolution

Adopt the [dashboard delivery contract](../dashboard-delivery-contract.md). Payload freshness, canonical request, durable refresh, coverage, and visibility are independent state dimensions. Unchanged responses retain same-floor payload, floor changes clear it, visible dashboards revalidate every 60 seconds, and hidden dashboards schedule no periodic requests.

Existing content remains visible during checking, refresh, and retryable errors. Initial failure without content is blocking. Initial, stale, or overdue state reads immediately when visible, one-second polling exists only during a known active refresh, and partial coverage is a distinct visible state.

## Prototype evidence

- Throwaway branch `prototype/dashboard-delivery-state`, commit `f47be17`, contains the terminal state-machine prototype; no prototype code remains on this branch.
- The prototype exercised initial load, hints, unchanged state, disconnect, safety recovery, request failure, reconnect, partial coverage, and floor switch. Its SSE-specific connection transitions are historical and were removed from the production contract on 2026-09-18.
- The contract records automated reducer/route/browser scenarios. Final visual/accessibility acceptance remains HITL and is deferred until the implementation reaches that gate.

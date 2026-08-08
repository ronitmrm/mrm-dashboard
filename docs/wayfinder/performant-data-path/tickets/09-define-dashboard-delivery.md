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

What externally visible state machine governs initial loads, unchanged versions, changed versions, Server-Sent Event reconnects, stale indicators, safety refreshes, and errors?

Prototype only the contract and state transitions, not production code.

## Resolution

Adopt the [dashboard delivery contract](../dashboard-delivery-contract.md). Connection, payload freshness, canonical request, durable refresh, coverage, and visibility are independent state dimensions. SSE events only request canonical state; unchanged responses retain same-floor payload; floor changes clear it; reconnect always refetches before stale state can settle.

Existing content remains visible during reconnect, refresh, and retryable errors. Initial failure without content is blocking. Safety refresh runs every 60 seconds only while visible, one-second polling exists only during a known active refresh, and partial coverage is a distinct visible state.

## Prototype evidence

- Throwaway branch `prototype/dashboard-delivery-state`, commit `f47be17`, contains the terminal state-machine prototype; no prototype code remains on this branch.
- Exercising initial load, hints, unchanged state, disconnect, safety recovery, request failure, reconnect, partial coverage, and floor switch found and corrected the missing reconnect refetch transition.
- The contract records automated reducer/route/browser scenarios. Final visual/accessibility acceptance remains HITL and is deferred until the implementation reaches that gate.

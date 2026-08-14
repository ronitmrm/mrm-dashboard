---
title: Define the Commercial Bounded-Read Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Lock the Behavior-Parity Oracle
  - Set the Performance Acceptance Envelope
---

## Question

Which commercial collections are bounded, what caps and search semantics apply, how is incomplete coverage presented, and which export and history paths remain exhaustive?

## Resolution

Adopt the [commercial bounded-read contract](../commercial-bounded-read-contract.md). Operational roots use repository-enforced 200-row caps except the 50-row sent-quote summary and 50-per-item Sales candidates. Customer and Product navigation retain 15- and 25-row pages. Related rows remain complete for returned roots, while selected detail, export, and explicit history paths remain reachable to completeness through stable batches/pages.

Search and filters execute before the cap, limited results use unique business ordering, and every truncated section receives specific coverage metadata and a visible notice. Sales candidate batching preserves match/recency order and offers server-side search beyond its cap. The contract records current implementation blockers rather than treating existing silent truncation or missing export routes as accepted behavior.

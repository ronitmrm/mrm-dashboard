---
title: Lock the Behavior-Parity Oracle
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by: []
---

## Question

Which observable workflows, outputs, ordering rules, permissions, audit effects, and failure semantics form the canonical parity contract, and which performance-visible changes are explicitly allowed?

The resolution must name the highest testing seam and its required scenarios.

## Resolution

Adopt the [behavior-parity contract](../behavior-parity-contract.md). Staging behavior at migration start is the oracle. The highest seam is a production-like, real-PostgreSQL behavioral contract that drives public application/repository workflows and a worker cycle from one fixed canonical dataset, then compares narrowly normalized fingerprints.

The contract fixes required Production Floor, dashboard, refresh, authorization, commercial, recruitment, audit, ordering, atomicity, and failure scenarios. The only allowed visible changes are payload omission for unchanged dashboard versions, faster live delivery, explicit bounded-result coverage, required connection/stale indicators, and volatile performance metadata within the later acceptance envelope.

## Evidence

- The migration specification's 46 user stories and testing decisions are represented by named scenarios and comparison rules.
- Existing integration seams cover dashboard read models/planning, Production Floor writes, quality/workforce, authorization, commercial workflows/revisions, recruitment bulk/interviews, durable refresh, API delivery, workbooks, and pagination.
- Silent truncation, changed ordering, missing audit evidence, cross-floor leakage, stale authorization, and partial writes are explicitly parity failures.

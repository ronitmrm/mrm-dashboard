---
title: Cut the Canonical Implementation Sequence
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Choose the Rollout and Recovery Contract
---

## Question

What are the independently reviewable implementation slices, exact dependency order, per-slice acceptance evidence, and commit and review boundaries?

## Resolution

Adopt the [canonical implementation sequence](../implementation-sequence.md). It defines eight review boundaries and 26 green commits from oracle/schema reconciliation through projection, listener, delivery, authorization, commercial, recruitment, integrated benchmark, staging canary, and recovery evidence.

The current PR's early implementation commits are candidate history, not acceptance evidence. Known projection, polling/reconnect, Sales ordering/coverage, export, ECN, and recruitment audit/cap gaps receive explicit follow-up commits. Toolchain-only commits require separate review. Dashboard and commercial presentation boundaries stop for exact user-run UI acceptance; all other boundaries advance on their named automated gates.

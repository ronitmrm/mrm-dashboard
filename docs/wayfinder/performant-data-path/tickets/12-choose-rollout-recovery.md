---
title: Choose the Rollout and Recovery Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Choose the Schema Cutover Contract
  - Define the Dashboard Delivery Contract
  - Decide the Authorization Freshness Contract
  - Define the Commercial Bounded-Read Contract
  - Define the Recruitment Bulk-Operation Contract
---

## Question

What shadowing, canary, observability, rollback, listener-loss, Redis-loss, and mixed-version deployment strategy makes rollout safe?

## Resolution

Adopt the [staged rollout and recovery contract](../rollout-recovery-contract.md): schema-first additive migrations, isolated shadow databases, one tested artifact per subsystem, preview-then-promote staging canaries, independent web/worker promotion, and explicit observation windows.

Application rollback leaves additive migrations in place and separately verifies environment variables because Vercel rollback does not restore them. Canonical-write failures freeze writes and use the existing Neon PITR/custom-dump runbook. Redis loss never triggers database rollback. Listener loss falls back to the durable queue and 30-second sweep; notification rollout remains gated on a continuously running worker with a direct TLS PostgreSQL session.

Observability uses named structured web/worker events, retained Vercel/worker logs, Neon plus `pg_stat_statements`, Upstash metrics, and a retained deployment-gate record. Health probes add no PostgreSQL traffic. Dashboard delivery and new commercial coverage/search presentation require explicit human preview acceptance before promotion.

## Evidence

- Existing recovery drills prove preserved-branch PITR reversal and empty-Redis recovery.
- Runtime tests pass 16/16 for worker retry, durable queue/outbox behavior, Redis fail-open behavior, and managed worker identity.
- Ticket 11's existing 43-test seam is prior evidence; its new ordered-audit/input-cap cases and the commercial, dashboard, authorization, migration, and production-like fingerprint gates must pass before their corresponding promotion unit.
- Current provider constraints were rechecked against Neon instant-restore and Vercel instant-rollback documentation on 2026-08-08.

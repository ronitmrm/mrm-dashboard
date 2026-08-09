---
title: Choose the Schema Cutover Contract
label: wayfinder:grilling
status: resolved
claim: codex
blocked_by:
  - Rehearse Supported Schema Upgrade Paths
---

## Question

What final migration numbering, deployment order, backfill strategy, compatibility window, transaction boundary, and rollback contract safely introduce the performant schema?

## Resolution

Adopt the [schema cutover contract](../schema-cutover-contract.md). Keep final numbering `0039`–`0043` and preserve `0001`–`0038` by committed checksum. Promote through `0040`, `0042`, and `0043` as separately verified database-first units before their corresponding code.

Each migration remains one transaction under the session advisory lock. Staging canonical writes and the worker are frozen/drained during each unit because standard indexes block writers and `0041` installs triggers after its set-based backfill. Old and candidate artifacts must both pass against the additive schema. Application rollback keeps the schema; no destructive down migration is authorized.

## Evidence

- Ticket 2 proves empty and representative `0038` paths reach `0043`, retain canonical fingerprints and published checksums, and backfill the projection.
- `migrateDatabase({ through })` supports the three explicit schema verification boundaries.
- PostgreSQL 16 documents standard index write blocking and the incompatibility between `CREATE INDEX CONCURRENTLY` and a transaction block.
- The contract turns production-like lock duration, WAL, storage, replica lag, trigger coverage, and per-category backfill counts into hard pre-reopen gates.

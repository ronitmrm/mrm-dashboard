---
title: Rehearse Supported Schema Upgrade Paths
label: wayfinder:task
mode: AFK
status: resolved
claim: codex
blocked_by: []
---

## Question

What facts emerge when fresh installation and every supported upgrade path through staging migration `0038` are rehearsed using the proposed performant migration sequence?

The resolution records collisions, backfills, locking behavior, reversibility, and data-volume risks.

## Resolution

Adopt the facts and gates in the [schema upgrade rehearsal](../schema-upgrade-rehearsal.md). Supported sources are an empty database and the current staging head at immutable migration `0038`; both reach `0043` on PostgreSQL 16.

There is no numbering collision. The representative `0038` rehearsal preserves all published names/checksums and the canonical business fingerprint, and backfills the expected projection row. Migrations remain additive and independently transactional, but standard index builds in `0039`, `0041`, `0042`, and `0043` block writes to their target tables. Production-like lock duration, storage, WAL, and projection-volume measurement is therefore a hard cutover gate.

## Evidence

- `published-checksums.json` fixes the immutable `0001`–`0038` history.
- `schema-contract.test.ts` now exercises the actual migrator through `0038`, seeds representative canonical data, upgrades through `0043`, compares fingerprints/history, and verifies projection backfill.
- The PostgreSQL 16 rehearsal passes 18/18 schema-contract tests; database typecheck and lint pass.
- PostgreSQL 16 documentation confirms that standard index builds permit reads but block writes until completion.

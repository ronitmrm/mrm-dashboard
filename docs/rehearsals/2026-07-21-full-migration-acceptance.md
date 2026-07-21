# Full migration acceptance — 2026-07-21

## Scope

Local acceptance of the unified PostgreSQL 16, Redis 7, Better Auth, Pricing,
and MRMPL operations migration through MIG-17.

Source artifacts:

| Source | SHA-256 |
| --- | --- |
| `pricing-sqlite-export-20260718-203337.zip` | `40e6d256dc1279b343951c3024efb0470663e0cf4d546537318c888b25bd190b` |
| `mrm-dashboard-convex-brilliant-spider-229-2026-07-18.zip` | `e31158f68b082af720c9d36816ce967de181c1132f1f8867f5e642dc068409d3` |

## Rehearsal result

The first full rehearsal exposed two final-schema compatibility defects: the
archived quality transformer omitted the later required `check_key` and
`session_key` columns, and a reconciled run remained in `reconciling`. Regression
tests were added before the fixes. The transformer now uses the same
newest-canonical and `|legacy|<source_id>` collision policy as the normalized
schema and marks a successful run `complete` with `completed_at`.

Two consecutive post-fix runs completed:

| Metric | Run `8a8a2554` | Run `d8cf8a63` |
| --- | ---: | ---: |
| Source/target hashes | 14,379 | 14,379 |
| Matching hashes | 14,379 | 14,379 |
| Aggregate digest | `6cd0fa2ae0280e768c97fbfb168279b5` | `6cd0fa2ae0280e768c97fbfb168279b5` |
| Validation passes | 72 | 72 |
| Validation warnings | 1 | 1 |
| Validation failures | 0 | 0 |

Both runs also produced:

- Pricing: 628 source rows, mappings, transformed rows, and hash matches across
  all 41 canonical tables; zero file conflicts
- Convex: 13,751 canonical source rows, mappings, and hash matches; one
  archive-only summary; 205 resolved corrections; zero orphan corrections;
  69 provenance-visible quarantined rows; zero unknown types
- Known exception: three Pricing relationship conflicts remain a visible
  warning and were not rewritten or hidden

The populated main database independently reports 13,751 Convex mappings, 628
Pricing mappings, zero failed validations, and zero open unknown types.

## Backup and restore proof

The continuous worker and web app were stopped before backup.

- custom-format main database dump: 13,660,547 bytes
- dump SHA-256: `bf47235291cd2dae170850d0dedc2438612c0b1f0257a8c52808c8f3c7a92edb`
- restored database: `mrmpl_restore_verify`
- tables fingerprinted: 143
- exact rows fingerprinted: 149,093
- original fingerprint: `d1aae279ed2da03936f857e75497cf6b36f006a1c46ba469ed9dc33820d1de9f`
- restored fingerprint: `d1aae279ed2da03936f857e75497cf6b36f006a1c46ba469ed9dc33820d1de9f`

Every table digest, aggregate digest, table count, and row count matched.

## Application acceptance

- Workspace typecheck and lint passed.
- The final post-rehearsal gate passed 35 database, 12 migration, 4 runtime,
  and 129 web tests (180 total), plus workspace typecheck and lint.
- The Next.js 16 production build compiled every route without Convex runtime
  packages or environment variables.
- A production-build Better Auth session loaded PostgreSQL dashboard read-model
  version 3 with `ready` status and 100 work orders.
- The commercial shell loaded migrated customers and the approved
  `PO-BROWSER-260721-1`, including its matched `BROWSER-001` line and preserved
  USD 1.2356 PO/system price.
- Hourly quality and setup-checklist routes rendered through their Better Auth
  and PostgreSQL boundaries.
- The commercial register and main dashboard had no browser errors or document
  overflow at 390px.
- Redis-loss acceptance was completed in MIG-15: the authenticated dashboard
  remained HTTP 200 on the same PostgreSQL model while Redis was stopped.

## Operational documents

- Cutover: `docs/postgresql-cutover-command-sheet.md`
- Rollback: `docs/postgresql-rollback-command-sheet.md`
- Migration contract: `docs/postgresql-migration-spec.md`
- Ticket/change ledger: `migration.json`

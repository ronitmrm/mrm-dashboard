# Convex static schema audit

Date: 2026-07-18

The source-only audit is documented in
`docs/convex-static-schema-data-flow-audit.md`. No Convex CLI, deployment,
server, or runtime was used.

Durable findings:

- The application defines 14 Convex tables and 22 explicit indexes in
  `apps/web/convex/schema.ts`, in addition to external Convex Auth tables.
- Ten tables hold typed operational or planner/workflow records.
- Most domain entities live in `dataEntries` as
  `entryType + optional key + payload:any`; business keys and relationships
  are not database-enforced.
- `corrections` is an append-only polymorphic reversal overlay. Correct live
  state must be reconstructed rather than copied naively.
- The main dashboard reads serialized derived state from
  `dashboardSnapshotChunks`. A refresh scans 12 canonical tables, applies
  corrections and entry-type filtering, runs legacy analysis, and replaces
  the chunks.
- The snapshot allow-list and analysis consumers have drifted. Inventory every
  distinct production `entryType` before designing the relational target.
- Current operational writes deliberately use global ownership
  (`ownerId: undefined`); auth exists, but application RBAC does not.
- `productionEntries` and `dataEntries/software_raw` are competing production
  sources. Snapshot analysis uses `software_raw` exclusively if any such rows
  exist.
- Static inspection cannot establish row volumes, payload-shape drift,
  duplicate keys, orphan corrections, source overlap, or actual concurrency.
  Those require a separately authorized data export or deployment inspection.

Do not model snapshot chunks as PostgreSQL source tables. The PostgreSQL spec
must decide canonical relational entities, event/correction semantics,
production-source consolidation, transactional boundaries, read models, auth,
and subscription replacement.

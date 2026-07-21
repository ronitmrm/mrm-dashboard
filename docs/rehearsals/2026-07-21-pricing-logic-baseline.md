# Pricing logic baseline rehearsal

Date: 2026-07-21
Ticket: `LM-00`
Source: immutable `pricing-sqlite-export-20260718-203337.zip`

## Artifact identity

- ZIP SHA-256: `40e6d256dc1279b343951c3024efb0470663e0cf4d546537318c888b25bd190b`
- SQLite SHA-256: `cda45d16fcd50908b94b84e2958c30cd32c33e28c5f0b0ea80d78f414fc43cb3`
- The archive was extracted into a temporary directory. Neither the ZIP nor SQLite file was modified.
- The source audit ran from an isolated Python virtual environment and opened the extracted database read-only in practice; no source-repository database path was created.

## Source workflow audit

- Checks run: 57
- Findings: 0 critical, 0 warning, 0 informational
- Transactional status snapshots: no enquiry-item, Design, quote, PO/PI, follow-up, bulk-revision, or ECN status rows in this particular SQLite export
- Source check identifier note: `PACKAGE-010` is assigned to two different checks in the source script. The parity manifest preserves both with distinct target IDs.

The empty transactional snapshots mean the archive cannot decide the documented active-price and ambiguous-PO contradictions. Under the migration specification's source precedence and the user's no-functional-change requirement, current executable Pricing behavior is authoritative:

1. Nonblank customer-code prices supersede by customer plus normalized customer code.
2. PO matching uses the source's deterministic ranked active-quote selection.

The known customer-code and historical-snapshot anomalies remain visible migration evidence and are not silently repaired by the logic port.

## Target oracle accounting

- 45 executable source regression test cases plus the canonical costing/formula boundary map to 46 `PR-*` target IDs.
- All 57 source workflow checks map to unique `WF-*` target IDs.
- Fifteen output families have frozen content type, disposition, filename, sheet/document, and source-route metadata.
- Exact executable behavior is implemented in the phase named by each oracle; a static source-text match never satisfies the final acceptance gate.

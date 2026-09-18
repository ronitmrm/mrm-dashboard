# Quality Control and Rejection Register (2026-09-18)

Canonical behavior: `../glossary/rejections.md`.

- `/quality-control` finds Job Cards by unit, part and Job Card text; first100
  matches with an explicit refinement notice. Unit ownership uses the canonical
  `derived.dashboard_production_floor_code` function for both lookup and save.
- Migration0156 stores additional rejection events in `quality.rejection_entries`.
  Stage and quantities are validated server-side and constrained in SQL. Master
  labels are resolved in the organization on save and snapshotted. Request UUIDs
  prevent a retried submission creating a second event.
- `/iso-document/rejections` queries additional QC entries, active session
  rejection events and non-session production entries for the selected date
  range/unit. Session-linked production summaries are excluded. Legacy multi-slot
  rejections reuse `rejectionEntriesFromRow`; cumulative opening balances are excluded.
- Session event date uses IST recorded date; legacy rows retain production date;
  QC rows retain the entered date. Session kg uses saved piece weight; missing
  historical kg remains null. Table-filter callbacks calculate matching totals.
- `quality.control.read/write` and `quality.rejection_register.read` are separate
  assignable permissions, initially granted to administrators. No production
  output, planning counters or session quantity is changed by an additional QC entry.
- Migrations are additive; apply before deploying the new readers. Local testing
  does not apply them to the shared Neon staging/production branch.

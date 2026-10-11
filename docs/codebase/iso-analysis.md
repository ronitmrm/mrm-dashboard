# PEST and SWOT analysis implementation

Domain contract: [ISO Document](../glossary/iso-documents.md).

- `packages/db/src/iso-analysis-domain.ts` owns fields, categories, date
  validation and lifecycle transitions. It is safe to import in client forms.
- `packages/db/src/iso-analysis.ts` owns organization-scoped records,
  eligible staff assignments, state changes and existing `audit.events`
  snapshots. Mutation transactions lock the record and check its version.
- Migration `0211_iso_analysis_actions.sql` creates
  `document_control.analysis_records`, registers capabilities and imports
  the 13 supplied 2026 workbook rows with source provenance and import history.
  Migration `0212_iso_analysis_effectiveness.sql` adds risk/opportunity
  assessment, impact, priority, expected outcome and QA effectiveness findings,
  and removes untouched review deadlines inferred from sample monthly cadence.
  Historical source completion is retained but cannot pass the actual-completion
  and evidence guards. Unassessed fields require human assessment before completion.
- `apps/web/lib/iso-document/analysis-server.ts` derives access from the
  authenticated session and authoritative grants. The repository filters
  every read, dossier and export to all-record permissions or item ownership.
  Only manage permission can edit assignments; only verify permission can
  issue QA decisions. Client flags control presentation only.
- `/iso-document/analysis/pest` and `/iso-document/analysis/swot` share
  the operational register. Each item opens an editable dossier with work,
  QA decisions, before/after history and original workbook values.
  Assigned staff can reach their items through the ISO sidebar without a
  global read grant.
- `analysis/workbook.ts` imports the original merged workbook layouts and
  retains filename, hash, sheet, row and source columns. The organization,
  analysis kind, year, sheet and row identify a repeated source row. Import
  skips existing rows instead of resetting work. Correct existing items
  through the audited edit form; use New Item for additional actions.
- The `[kind]/export.xlsx` route uses the same authorized records. An
  `item` query also exports its history. Evidence is a link or record
  location; files stay in their existing document/record system.

No worker, new document publishing lifecycle or background reminder is involved.

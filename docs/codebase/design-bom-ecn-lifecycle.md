# Design BOM, Drawing, and ECN lifecycle contract

## Public seams

Repository commands are authoritative; UI state is advisory.

- Initial Design: save structured draft -> complete structured BOM -> complete
  required drawings -> release revision `00`.
- Released dossier: read-only Product Portfolio detail.
- Later Design: ECN draft -> authorized Design decision -> release or return to
  Design.
- Cost impact: released Design -> Product Parameter Costing -> Customer Product
  Parameter Costing -> close ECN.
- Files: authenticated viewer -> inline preview -> explicit original download.

## Quote customer drawings

`DesignTaskEditor` owns a separate Customer Drawings tab. The existing design
save action uploads multiple files under independent `customer_drawing_<uuid>`
purposes; `saveDesign` validates selected file IDs against available attachments
owned by the same task and saves `source_payload.customerDrawingFileIds` in its
transaction. Draft saves preserve that selection when the field is omitted.

`quote-drawings.ts` resolves explicit selections first, otherwise the latest
approved portfolio drawing. It never substitutes an older revision when the
latest approved file is unavailable. An unavailable explicit selection is
omitted without substituting another drawing. Quote issuance captures file IDs
per part in `quotation_versions.lines_snapshot`; historical reads use those IDs.
Legacy quote backfills deliberately do not resolve current drawings.

Sales quote actions and quotation history link to the customer drawing list.
List and file routes require quote read access and enforce the originating
salesperson scope. Downloads recheck availability and do not require Design
access. Working files are never implicitly exposed to Sales.

## Statuses

Initial Design uses `In Progress`, `Drawings Pending`, and `Design Complete`.
ECN uses `Pending Design`, `Pending Design Approval`, `Pending Product Costing`,
`Pending Customer Costing`, and `Completed`. A rejected decision is retained as
evidence and returns the active ECN to `Pending Design`.

Product Design and Drawing revisions use `Draft`, `Released`, `Superseded`, or
`Rejected`. Only a `Released` row can be current.

A Legacy Drawing Baseline is inserted as a non-current `Draft` with Required
drawing metadata and no file. Drawing History labels it `Pending Drawing
Upload`. Attaching the UID-matched file promotes that same row to current
`Released` and aligns the current Product Design/BOM revision to its stored
revision number; its revision and effective date never change during upload.

## Database invariants

- A Product has at most one current released Product Design revision.
- A Product/part has at most one current released Drawing revision.
- Revision numbers are monotonically increasing per Product. Drawing display
  revisions are two digits (`00`, `01`, ...).
- Released/Superseded revision evidence is immutable.
- Pricing writes never change the dossier's selected processes.
- A process price can change only when that process is selected in the current
  released dossier.
- An authorized Design decision is required before an ECN draft is published.
- A cost-impacting ECN cannot close until Product and all affected Customer
  costing work is complete.

## Authorization

- Design users may create/save drafts and submit them for review.
- Engineering approval/rejection requires the narrow ECN approval capability.
  It may be assigned directly to a staff account or inherited from an occupied
  Approved Post through Access Administration. Department and designation names
  never grant authority.
- Rejection requires remarks.
- Portfolio, Drawing History, attachment preview, and download remain
  authenticated reads.

## Migration and backfill

- Seed revision `00` from each existing controlled Product and current canonical
  BOM without rewriting either source.
- Seed selected processes once from existing Design dossier fields. Only legacy
  rows without a canonical selection may use positive process prices for this
  one-time backfill.
- Stage one provisional Drawing row per released Product from the approved
  legacy register, including Products with no matched file yet. Attach and
  release only an unambiguous UID-matched file. Keep unmatched legacy evidence
  available and report it; do not invent links.
- Existing open ECNs remain in their current stage. An ECN still in
  `Pending Design` adopts HOD review on its next submission. Already published
  ECN evidence is not rewritten.
- Backfills are idempotent and never delete or overwrite historical files.

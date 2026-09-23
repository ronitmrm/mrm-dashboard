# ISO Document

ISO Document is the authoritative control area for MRMPL documents across MRM
and the other operational software. MRM owns document creation, approval,
release, revision history, master indexing and audit history. Another system may
hold generated operational records, but it never becomes the document master.

## Master Document List

One row represents one controlled document or format, including every individual
SOP. Generated transactions and completed records do not create more document
rows. The current row represents the latest released revision; opening it shows
the document dossier, retained revisions, workflow transactions, monitoring
configuration and links to records in MRM, another approved system or a physical
location. Inactive documents remain in the list as `Not In Use`.

The official Master Document List contains released documents. Unreleased first
drafts appear in Pending Documents. A revision in progress does not replace or
hide the current release. All signed-in users may view index metadata; document
content may have a narrower access policy.

The index records document number, name, type, department, responsible role,
record location, current revision, last revision date, document review cycle,
data or record frequency, data retention and use status. The table supports
Excel-style per-column filters, natural sorting, browser-persisted filters and an
Excel export. SOP and other type registers are filtered views of this master;
they are not aggregate document rows.

## Lifecycle and ownership

- Quality Assurance HOD creates and revises documents, manages control metadata,
  submits drafts and performs final release.
- The responsible Department Manager approves or rejects documents for their
  own department. Rejection returns the revision to Draft with remarks.
- Final release is a separate Quality Assurance action. It takes effect
  immediately and its date is the revision date.
- Revision states are `Draft`, `Pending Approval`, `Approved`, `Released` and
  `Superseded`. A released revision is immutable.
- Initial release is revision `00`; later revisions are `01`, `02`, and so on.
  The letter `R` is never displayed.
- New permanent document numbers are organization-wide, sequential and
  immutable: `MRM-QA-###`. Existing numbers are preserved. Related variants may
  use `MRM-QA-###-##`. Numbers are assigned only by final release and are never
  reused or manually changed.
- Every later revision requires a change reason. All released and superseded
  revisions remain available permanently.
- The audit trail is append-only and records each create, edit, submit,
  approve, reject, release, revision, status, ownership, department and record
  location change with actor, timestamp, remarks and before/after state. Normal
  viewing is not audited.

Documents may use MRM structured templates or a controlled file upload,
depending on type. Primary types are SOP/Procedure, Policy/Manual, Work
Instruction, Form/Format, Plan, Register/List, Checklist, Technical Document,
External Document and Other Controlled Document.

## Reviews, records and monitoring

Document Review Cycle and Data/Record Frequency are separate controls. A
document may require review only, while formats such as FPIR and RIR generate a
record per transaction/event and SPC may generate records on a scheduled
interval. Frequency modes are Event-based, Scheduled interval, As required and
Not applicable.

MRM records on-demand monitoring confirmations without copying operational data.
MRM modules may provide automatic evidence; other software or physical records
use a responsible user's manual confirmation. Monitoring states are Due,
Completed, Overdue and Not Applicable. The system does not send reminders,
alerts or escalations. Generated data retention is configurable; released
document revisions are retained permanently.

The first rollout uses a small set of QA-approved sample documents. Importing or
migrating the legacy workbook is a separate, later decision and is not part of
this rollout.

ISO Document also groups operational registers, including the Rejection Register
(individual rejection events; lifecycle in `rejections.md`).
The document number appears on the right inside
the page header, labelled "Document No.", never in sidebar labels. The initial
Measuring Instrument Register number
is `MRMPL/ISO/REG/001` (defined in `apps/web/lib/iso-documents.ts`).

## Measuring Instrument Register

This is a live view of active Store Item Types whose category is Measuring
Instrument or Measuring Instruments (case and whitespace insensitive). Existing
and newly created items appear, including items with no received stock. Store
category edits determine inclusion; no copied records or separate entry process
exist. Inactive items follow Store Stock visibility.

One row represents an Asset Code. Opening it uses the existing Store Item
Workspace, including its physical units and their location, history, calibration
and certificates. All records and changes remain owned by Store. Store Locations
and Available Stock on the register describe available stock, not issued units;
open the workspace for individual units' current locations.

Access uses `store.stock.read`; opening a workspace additionally requires
`store.asset_history.read`. Existing Store action permissions remain enforced.
The Universal Measuring Instrument Master for inspection dropdowns is unchanged.

## Machine Maintenance Register

One row is one completed machine maintenance task, including Planned and
Breakdown work. Only tasks with Completed status and a completion timestamp
appear. Repeated maintenance on the same machine remains separate history.
Machine, production unit, work performed, completion date and technician come
from the existing maintenance records; inactive schedules do not hide history.
Facility requests without a machine link are not machine maintenance records.
Access uses `maintenance.workspace.read`.

## Machine Maintenance Plan

The selected calendar month shows saved machine maintenance due dates across
all production units. Completed planned tasks remain in their original due
month, alongside active schedules still due that month. Breakdown work is not
planned work. Counts distinguish maintenance jobs from distinct machines.
Dates are saved commitments, not recurrence forecasts; completing a task and
advancing its next due date preserves the completed task in the original month.
Access uses `maintenance.workspace.read`.

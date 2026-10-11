# ISO Document

ISO Document is the authoritative control area for MRMPL documents across MRM
and the other operational software. MRM owns document creation, approval,
release, revision history, master indexing and audit history. Another system may
hold generated operational records, but it never becomes the document master.

## Interested parties requirements and monitoring

A requirement records a party/group, the specific expectation and its scope,
source/basis and relevance to the QMS. QA records the relevance decision and
reason, responsible department/staff, acceptance criteria, monitoring method,
frequency/event trigger and planned review date. Optional climate considerations
and related risk/action/document references connect it to organizational context.

Requirements begin as Draft. Active requirements are relevant and have a complete
monitoring plan. Inactive requirements retain a reason and all history. Meeting a
requirement does not close or deactivate an ongoing obligation.

Responsible staff records an actual monitoring date, observations, evidence and
proposed result (Met, Partly met or Not met). Gaps require a follow-up plan and
target date. QA verifies or returns the result with a reason. Verification records
the next review date chosen by QA. Submitted results do not replace verified
results. Each observation retains the plan as it stood when submitted; observations
and QA decisions are retained without deletion.

Plan changes require a reason and new monitoring against the revised plan.
Resolve a submitted observation before changing the plan. A follow-up remains
visible until a later QA-verified result confirms the requirement is met. Related
CAR, PEST/SWOT or management-review actions retain their own closure lifecycles;
recording a reference does not close another record.

Workbook rows are imported as Draft examples with original dates, text, row
references and status labels. Source Done is not a verified result. Similar rows
from different dates remain separate until QA decides their scope. Missing owners,
relevance decisions, evidence and planned dates are not inferred.

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

## PEST and SWOT actions

PEST and SWOT are working analysis registers under ISO Document. Each issue or
insight owns its category, analysis year, action plan, responsible department
and staff account, target date, work evidence and review dates. Assessment records
whether the issue represents risk, opportunity or both; its business impact,
priority and expected outcome. Unassessed is explicit, never an invented rating.
PEST categories
are Political, Economic, Social and Technological; SWOT categories are Strength,
Weakness, Opportunity and Threat. These records do not release or revise the
controlled document formats (`MRM-QA-021-01` and `MRM-QA-022-01`).

New actions progress from Open to In Progress, then Completed. The responsible
account records work done and evidence; only Quality Assurance verification can
close a Completed action after recording evidence that the expected outcome was
achieved. Implementation completion and effectiveness verification are separate.
Completion requires assessment, responsible department/staff and target date.
QA closure also requires actual recorded completion, an evidence reference and
effectiveness findings; a source spreadsheet's completion label cannot authorize
closure. Ineffective or inconclusive work remains pending or is returned.
QA may return it to In Progress or reopen a Closed
action with a reason. Closed details stay locked until reopened. Every create,
edit, import, update, completion, QA decision, reopening and review retains actor,
timestamp, remarks and before/after values in append-only audit history.
Concurrent edits must not overwrite a newer saved version.

QA manages issues, assignments and deadlines. Assigned staff may read and work
their own items; View All Analyses permission permits reading both registers.
Only Verify/Close Analyses permission permits QA decisions. Action responsibility
does not grant access to unrelated analyses or document-control operations.

Imports preserve original values, filename, file hash, sheet and row. Done and
Complete entries become Completed as unverified source claims; they never invent
completion dates, verifiers or closure evidence. Pending remains Open. Missing
staff assignments and actual work details stay missing. Source Action Taken
stays in original workbook data, not in confirmed Work Done. Reimport of the same
source row does not overwrite work already recorded in MRM. PEST day timelines
derive target dates from the issue date using calendar days; the original
timeline remains available. SWOT Review Date is a review date, never an issue
or completion date. Example workbook cadence does not define the review schedule:
QA sets the next review according to the issue's importance and circumstances.
Imports do not invent a next review date. Reviews retain notes and the next
review date, including after an action is Closed. Overdue work and due reviews
are visible; no notifications or background schedules are created.

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

## Management Review Meetings

A management review records the period reviewed, time/place, chair, participants
and attendance, review inputs, discussion, evidence and decisions. Its reusable
agenda covers previous actions; context and interested parties; customer
feedback; objectives; process and product performance; nonconformities;
monitoring and measurement; audits; suppliers; resources and competence;
risk/opportunity action effectiveness; improvement; and policy/strategy.
Legal or other business topics may be recorded under additional topics.
Each input records a review outcome and reasoned discussion/decision, including
why it is not applicable. Missing evidence and deferred matters remain explicit.

Outputs record conclusions on QMS suitability, adequacy and effectiveness,
improvement decisions, QMS changes and resource decisions. No-change decisions
need an explanation. Planned next review dates are chosen, never inferred from
an example's meeting frequency. Top management participation is recorded through
the identified chair and actual attendance; QA approval does not replace it.

Minutes progress from Draft to For Approval to Approved. Submission requires
the review period, recorded chair participation, all input outcomes and outputs.
Follow-up inputs need a linked action. QA approves or returns the minutes with
remarks; approved minutes are locked. QA may reopen them with a reason, retaining
the prior approved snapshot in audit history. Approval does not close actions.

An action has one original meeting and one stable reference across subsequent
meetings. The shared pending list includes every action not Closed, including
Completed awaiting QA. Reviewing an existing point links the same action to the
new meeting and retains the then-current action snapshot and discussion. It does
not clone the point, change its original meeting or erase previous discussions.
Actions record department/person, priority, deadline and expected result.
Assigned staff record progress and completion; QA closes after checking evidence
and effectiveness, or returns/reopens with a reason. Changes and decisions retain
actor, timestamp, remarks, version and before/after values. No deletion is offered.

Imported meeting examples remain Draft, with source names, notes and status claims
preserved. Names are not silently mapped to staff accounts; attendance, approval
and completion are not invented. Continuing monitoring decisions need not become
artificially closed actions. Existing CAR, PEST/SWOT and other operational records
remain in their own registers and may be referenced as review evidence.

## Maintenance Register

One row is one completed machine or physical Unit ID maintenance job, including
Planned and Breakdown work. Repeated work remains separate history. Machine
number or Asset Code identifies the equipment. Work performed, completion date
and technician come from the existing maintenance records; inactive schedules
do not hide history. Calibration has its own record and is excluded. Facility
requests without an equipment link are excluded.
Access uses `maintenance.workspace.read`.

Each completed row opens a read-only maintenance report with the recorded
checklist answers, work details, timing, and photos. Older records show the
details actually retained; missing checklist answers or times remain explicitly
not recorded. The register table shows only the completion date.

## Maintenance Plan

The selected inclusive date range shows saved machine and physical Unit ID maintenance
due dates. Completed planned tasks remain on their original due date, alongside
active schedules still due in the range. Breakdown work is not planned work. Counts
distinguish maintenance jobs from distinct machines and Unit IDs.
Dates are saved commitments, not recurrence forecasts; completing a task and
advancing its next due date preserves the completed task on its original date.
Completed rows open the same report as the Maintenance Register. The plan table
shows only the completion date; start and finish times belong in the report.
Access uses `maintenance.workspace.read`.

## Calibration Plan

The selected calendar month shows saved calibration due dates for every physical
Store Unit ID with a Calibration Timetable, across all Store categories. Each
non-cancelled Calibration Visit appears in its original due month, including
completed and failed visits after the timetable advances or remains due. An
active timetable with no non-cancelled visit on its next due date appears as a
planned row. Dates are saved obligations, not recurrence forecasts. Counts
distinguish calibration rows from distinct Unit IDs.

The plan links a Unit ID to its existing Store Calibration workspace to assign
its timetable, open a visit, compare Supplier offers, issue the service order,
send it out, record its return and certificate, and record the result. ISO does
not create separate calibration or movement records. Plan access uses
`store.stock.read`; opening the Store workspace and its actions retain their
existing Store permissions.

## SIPOC process maps

SIPOC defines Suppliers, Inputs, Process, Outputs and Customers for one process.
It is a high-level process map with explicit start/end boundaries, purpose,
scope and accountable process owner. Inputs specify required quality or records;
outputs specify acceptance criteria and the receiving customer or department.
Process steps are ordered activities; supplier/input/output/customer lists are
independent, not implied one-to-one spreadsheet rows. Controls, resources,
risks, interfaces and performance measures make the map usable for review.

Drafts may be incomplete. Preparation requires the SIPOC manage grant (process
owners/department managers and QA). Submission requires an assigned active staff
owner, department, boundaries, all five SIPOC elements, controls, performance
measure and method/target/frequency, and a next review date. QA approves or
returns the submitted map with recorded findings. This is the organization’s
chosen approval flow, not a claim that ISO mandates SIPOC or QA approval.
Approved revisions are immutable snapshots. Editing starts a new Draft while
the previous approved revision remains the operative map. A revision cannot
overwrite pending review. All saves, submissions, decisions and revisions retain
actor, time, reason and before/after state. Review due dates flag follow-up; they
do not silently expire an approved map.

The supplied SIPOC workbook contributes ten Draft examples with exact source
cells/date/file/sheet/row retained. Process ownership, boundaries, acceptance
criteria, measures and approval are never inferred from these examples. Company
staff must assess and complete them before submission.

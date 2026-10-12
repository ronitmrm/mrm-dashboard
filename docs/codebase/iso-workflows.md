# ISO pending actions and task workflows

Business rules: [ISO Document](../glossary/iso-documents.md).

`packages/db/src/iso-workflows.ts` projects pending work from the existing ISO
registers. Source IDs keep each action unique, including management-review
references. Native records retain their own evidence, approval and QA closure
rules. Assignments update those records directly with a version check and audit.

Migration `0219_iso_pending_actions_and_workflows.sql` adds workflow metadata
to `branding.documents`, work targets where needed and
`document_control.workflow_actions`. It creates one master entry per ISO module,
without inventing document numbers, issued revisions, owners or QA approvals.
`listMasterDocuments` exposes all entries alongside the issued/pending views.

Workflow text is QA controlled, independently versioned and audited. Both its
version and the document metadata version are checked when saving. Linked actions
retain the text/version used when created. Workflow edits do not revise released
PDFs. `/iso-document/documents/[id]/workflow` reads/edits the short text and offers
an authenticated `.txt` download.

`/iso-document/pending-actions` and the master list's Pending Actions tab use
the same register component. All/My/Awaiting QA/Overdue views and persistent
column filters include department, person, target, status and source/master links.
Task details decode the encoded source key before querying it.

`iso.tasks.department` grants HOD assignment in current active departments,
resolved through Employee Master/workforce membership. A HOD cannot move work
to another department or edit QA workflow text. QA uses `iso.tasks.manage` and
`iso.tasks.verify`; assigned staff can record work. Unassigned work requires QA
allocation. Assignment/date changes require a reason.

Additional linked actions use Open → In Progress → Completed → QA Closed.
Completion needs an active owner, target, expected result and evidence. QA verifies,
returns or reopens with findings. Closed records retain their history and are
excluded from pending counts. Reopened recurring-review actions stay pending
after their original cycle advances; each verification adds a retained monitoring
confirmation rather than overwriting an earlier one.

Maintenance/calibration assignment and QA evidence are stored as linked actions.
Operational execution stays in Maintenance/Store. ISO completion checks the
actual source completion (calibration must pass). Schedule ID and original due
date preserve the same ISO key when planned work becomes an actual work order.
Due document reviews and scheduled record checks also use linked actions; QA
verification records a document monitoring confirmation and advances its cycle.

Assigned SIPOC owners may edit/submit their map; HOD preparation stays department
scoped. Assigned management-review coordinators may read, edit and submit their
draft minutes; QA approval and meeting-point management stay separate.
IPR verification and minutes/SIPOC/customer-feedback approval clear temporary work
targets so future reviews use the source's next review date.

Focused verification: `packages/db/src/iso-workflows.integration.test.ts` covers
native assignment, text/snapshot/history, staff completion, QA closure/reopening
and rejection of cross-department, stale and unauthorized decisions.

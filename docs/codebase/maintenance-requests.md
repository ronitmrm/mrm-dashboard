# Maintenance Requests

## Storage

Migrations `0111_maintenance_requests.sql` and `0112_maintenance_request_sequence_permission.sql` add `maintenance.requests`, append-only `maintenance.request_events`, the Maintenance capabilities and roles, and web-role request-number sequence access. A request row is the task; no child task table exists. Requester user ID, requester name, Department, and submission time are retained on submission. Approval and work transitions retain actor/timestamps.

Photos use the existing Artifact service and private GCS provider. Links target `maintenance.requests`, use `request-photo:<sequence>` purposes, and accept at most eight signature-verified PNG/JPEG files of 10 MB each.

## Authorization

- Authenticated users submit requests; server code resolves requester identity
  and active Departments from Employee Master and ignores client identity fields.
  A multi-department employee selects one of those Departments, rather than
  being rejected as an invalid profile. A single Department remains automatic.
  Submission re-resolves assignments and validates the selection inside the
  transaction; forged or no-longer-assigned Departments are rejected. The
  Administrative Role now grants all manager and trade capabilities; requester
  Department selection still records the employee's assigned Department.
- The protected Better Auth `admin` identity may choose any active Department
  in the current Organization without an employee link. The repository resolves
  this from `identity.users.role`, never a client flag, and rechecks it within
  the submission transaction. An ordinary unlinked account remains rejected.
  Manager and trade decisions still require their existing independent grants.
- `maintenance.requests.manage` is assigned to Maintenance Manager and Administrator.
- `maintenance.trade.<trade>.work` grants only that trade's approved work.
- Mechanical trade and manager roles also retain `maintenance.workspace.read` and `maintenance.tasks.write` for the existing scheduled workflow.

Repository reads are explicitly scoped as Manager, active assigned Departments,
or Trade. A multi-department employee's register includes only their assigned
Departments. Trade reads exclude Pending Approval, Returned, Rejected, and Closed requests.

## UI

Maintenance navigation contains Manager Approval, All Requests, Electrical, Plumbing, and Mechanical. Electrical and Plumbing are server-rendered request work lists. Mechanical retains the existing company-wide scheduled workspace and merges approved Mechanical requests through the unified work-list projection.
Mechanical reads only maintenance and machine context from the dashboard read model across all floors. `maintenance.workspace.read` opens it without granting production dashboard data for those floors.
Generated legacy history backing rows without a machine or Maintenance Code are
filtered from the planned schedule projection in
`apps/web/lib/maintenance-work-list.ts`; their historical records remain stored.
Scheduled rows open the full maintenance checklist in `MaintenancePanel`. The company-wide projection is deduplicated by checklist code and sequence. Draft and completed answers use the existing `maintenance.tasks` and `maintenance.task_results` tables; only completion updates `machine_schedules.last_completed_on` and `next_due_on`.
Assigning or updating a machine maintenance schedule queues a durable dashboard refresh in the same transaction so Machine Master and Mechanical read the saved schedule.
Planned tasks persist `startedAt`, optional draft `endedAt`, the signed-in performer's name and active linked Employee ID when available, calculated `actualMinutes`, and `changedItems[]` in the task source payload. An authorized user without an active Employee link is recorded by account name with no Employee ID. The repository writes `maintenance.tasks.started_at` from the form and leaves `completed_at` empty for drafts. Empty checklist points are omitted from task-result writes. Machine Maintenance History filters each changed part separately.
Resaving a draft clears its old answer rows through `maintenance.clear_draft_task_results` (migration `0175`), which accepts only a matching organization and In Progress task. The web role has function execute access and no table-wide DELETE privilege.

## Invariants

ISO Document exposes read-only Maintenance Register and Maintenance Plan routes
under `/iso-document/machine-maintenance-*`. Both require
`maintenance.workspace.read` and use organization-scoped queries in
`packages/db/src/maintenance.ts`. The register reads completed physical tasks;
the monthly plan combines saved task due dates with active schedule due dates,
deduplicating the same schedule/date. Asset rows use the physical Unit ID as
Asset Code. The asset projection reads Store schedules, planned tasks, and
completed Store maintenance records; calibration stays separate. It excludes
breakdowns from the plan and retains completed planned tasks after next-due
advancement. These views do not create tasks or copy records. Facility requests
remain in their existing request work lists.

Mechanical loads active Store Unit ID maintenance schedules through
`/api/maintenance/assets` alongside machine schedules. The same checklist view
saves asset drafts and completions to `store.asset_maintenance_tasks` (migration
0193), retaining one task per schedule/due date. Completion also writes the
existing `store.asset_maintenance_records` history and advances only that
schedule. The Unit ID Store workspace still assigns timetables and reads
history, but completion is performed in Mechanical.

- One request row equals one task.
- Final Category and Priority are required before Approved or later statuses.
- Only Pending Approval requests accept a manager decision.
- Trade transitions are Approved → In Progress → Completed.
- Only Completed requests may be Closed.

## Machine breakdown lifecycle

Physical-machine breakdowns use `maintenance.tasks` with task type Breakdown.
Starting one creates an In Progress task and opens a linked Production Session
downtime when that machine has a running session. The downtime link is retained
in the event source payload by maintenance task key. A second open breakdown on
the same machine is rejected, and Production Session start is blocked while the
breakdown remains open.

Completion updates the same task, records the actual completion time, the
authorized signed-in performer's name and active linked Employee ID when available,
work performed, and `changedItems[]`, and resolves either the linked open downtime
or its Shift Ended — Unresolved carry-forward. Completed breakdowns continue to
feed the Machine Maintenance Register through the existing task query.

## Physical asset breakdown lifecycle

Physical asset breakdowns use `store.asset_breakdowns` (migration `0183`),
exposed to Mechanical through `/api/maintenance/assets` and scoped to Unit IDs.
The start transition marks the unit Broken; completion inserts a Store asset
maintenance record and restores Available or Assigned from its holder. Both
transitions require `maintenance.tasks.write`. Completion stores the signed-in
performer's active linked Employee ID and name when available, or the account
name with a null Employee ID. Machine Production Session downtime is unaffected
by asset breakdowns.

# Maintenance Requests

## Storage

Migrations `0111_maintenance_requests.sql` and `0112_maintenance_request_sequence_permission.sql` add `maintenance.requests`, append-only `maintenance.request_events`, the Maintenance capabilities and roles, and web-role request-number sequence access. A request row is the task; no child task table exists. Requester user ID, requester name, Department, and submission time are retained on submission. Approval and work transitions retain actor/timestamps.

Photos use the existing Artifact service and UploadThing provider. Links target `maintenance.requests`, use `request-photo:<sequence>` purposes, and accept at most eight signature-verified PNG/JPEG files of 10 MB each.

## Authorization

- Authenticated users submit requests; server code resolves requester identity
  and active Departments from Employee Master and ignores client identity fields.
  A multi-department employee selects one of those Departments, rather than
  being rejected as an invalid profile. A single Department remains automatic.
  Submission re-resolves assignments and validates the selection inside the
  transaction; forged or no-longer-assigned Departments are rejected. The
  Administrative Role does not imply manager or trade access.
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

## Invariants

- One request row equals one task.
- Final Category and Priority are required before Approved or later statuses.
- Only Pending Approval requests accept a manager decision.
- Trade transitions are Approved → In Progress → Completed.
- Only Completed requests may be Closed.

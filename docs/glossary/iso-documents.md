# ISO Document

ISO Document groups the Rejection Register, Measuring Instrument Register,
Controlled Document Register, SOP Register, Work Instruction Register, Policies
Register, Maintenance Register, Maintenance Plan and Calibration Plan.
Document Templates owns document preparation, approval, release and revision
history; see `branding.md`. Rejection lifecycle is defined in `rejections.md`.

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

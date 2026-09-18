# ISO Document

ISO Document groups registers, including the Controlled Document Register
(latest released uploaded PDFs; lifecycle in `branding.md`) and Rejection
Register (individual rejection events; lifecycle in `rejections.md`).
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

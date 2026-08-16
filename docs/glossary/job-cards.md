# Job Cards

## Job Card Register

The Job Cards tab is a compact one-row-per-Job-Card register. It is for finding a Job Card, not displaying its complete history.

Use the table's per-column filters, including Job Card. The register does not have a separate search strip. Setup Completion and Dispatch Approval remain visible together; selecting a machine for Setup Completion fills its current Job Card and setup from planning.

Setup Completion can be recorded only by a user with Shop Floor permission, and its Completed By list contains only active Shop Floor employees from the selected Production Unit. Dispatch Approval lists only undispatched Job Cards for which every planned setup/operation is Item Complete. Its Approved By list contains active planners and Shop Floor employees from the selected Production Unit.

## Job Card Workspace

Every Job Card has one dedicated workspace URL. The workspace reads, but does not duplicate:

- its Work Order and Product Master;
- its selected Route and Setup masters;
- Cycle, Tooling and Quality Parameter masters for each selected setup;
- current planner dates and machine assignments;
- durable Planner Movement Records for machine shifts, machine constraints, priority interruptions, and queue changes, including their Production Session settlement evidence;
- Production Sessions, downtime and rejection;
- setup-progress, historical Production Card and dispatch events.

The workspace separates Overview, Masters, Setup, Production, Rejection,
Downtime, Delivery, and Complete Log so each view shows only its own metrics and
records.

## Analytics

- Plan: ordered quantity and current planned production dates.
- Actual: finished total/good pieces from the selected route's final setup, plus setup-level operation output, rejected pieces, runtime and downtime. It includes Production Sessions plus older production entries that are not already linked to a Session, preventing duplicate records.
- Completion percent: final-setup good pieces divided by ordered quantity. Earlier setup output is WIP and is not counted as finished pieces.
- Rejection percent: rejected pieces divided by total produced pieces.
- Downtime pattern: minutes and occurrences grouped by coded reason and setup.

These are Job Card Analytics, not OEE. OEE requires separate availability, performance and quality definitions.

## Setup Time

- Machinist setup time: Pre Setting start to Setting complete.
- QC wait: Setting complete to QC approval.
- Machine-start wait: QC approval to the first Production Session start.
- Setup variance: machinist setup time minus the Setup Time target in Cycle Master.

Missing timestamps remain unknown and are never treated as zero minutes.

## Material Yield

- Expected pieces from material: received kilograms multiplied by Product Master pieces/kg.
- Remaining material equivalent: remaining kilograms multiplied by pieces/kg.
- Unexplained process loss: expected pieces minus remaining-material equivalent minus first-setup output pieces. Later setup output is not subtracted again because it is the same material moving through the route.
- Order short: ordered pieces minus good produced pieces.

These values are estimates until remaining RM is maintained accurately.

## Delivery Target And Rating

The Product Master stores the default working days after full RM receipt. A Job
Card can optionally override that default. Full RM receipt is the first receipt
date when cumulative received kilograms reach ordered RM kilograms. Fridays and
Planning Calendar holidays are excluded.

- A: on or before target.
- B: 1–2 working days late.
- C: 3–5 working days late.
- D: more than 5 working days late.

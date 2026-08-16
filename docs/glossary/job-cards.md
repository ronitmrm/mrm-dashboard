# Job Cards

## Job Card Register

The Job Cards tab is a compact one-row-per-Job-Card register. It is for finding a Job Card, not displaying its complete history.

## Job Card Workspace

Every Job Card has one dedicated workspace URL. The workspace reads, but does not duplicate:

- its Work Order and Product Master;
- its selected Route and Setup masters;
- Cycle, Tooling and Quality Parameter masters for each selected setup;
- current planner dates and machine assignments;
- Production Sessions, downtime and rejection;
- setup-progress, historical Production Card and dispatch events.

The workspace separates Overview, Masters, Setup, Production, Rejection,
Downtime, Delivery, and Complete Log so each view shows only its own metrics and
records.

## Analytics

- Plan: ordered quantity and current planned production dates.
- Actual: total pieces, good pieces, rejected pieces, runtime and downtime. It includes Production Sessions plus older production entries that are not already linked to a Session, preventing double counting.
- Completion percent: good pieces divided by ordered quantity.
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
- Unexplained process loss: expected pieces minus remaining-material equivalent minus total produced pieces.
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

# Job Cards

## Job Card Register

The Job Cards tab is a compact one-row-per-Job-Card register. It is for finding a Job Card, not displaying its complete history.

Production Progress in both the register and workspace gives every distinct setup in the selected
route an equal share of 100%. Each setup's progress is its cumulative good
pieces across machines divided by ordered pieces, capped between 0% and 100%.
The Job Card percentage is the average of those setup percentages, including
setups with no output as 0%. For two setups, completing the first contributes
50%; completing half of the second raises overall progress to 75%. Excess output
on one setup cannot fill another setup's share. Without a selected route or a
positive order quantity, progress is unavailable. Finished pieces remain the
good output of the final setup; intermediate output is still WIP.

Planned Finish Date shows the immutable first valid completion forecast created
from a Job Card's first Raw Material receipt event. The receipt creates a durable
baseline request; the first planning refresh that can calculate a finish date
finalizes it exactly once. Dashboard refreshes, temporary missing source data,
later receipts, production progress, and machine constraints never replace it.
Legacy Job Cards without a durable receipt-linked baseline display
`Not recorded`; a current forecast must never be substituted or backfilled as
historical evidence.

Current Estimated Finish shows the latest forecast across the selected route's
setups, including remaining downstream work. It updates when planning
recalculates production progress and machine constraints. Both values are
matched by Job Card and part within the selected floor. An unavailable current
forecast displays `-`.

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

The workspace separates Overview, Masters, Setup, Setup Production, Production,
Inprocess Quality Control, Downtime, Delivery, and Complete Log. Setup Production
shows cumulative good output for every selected-route setup, including setups
with no output. Saved session output and corrections update on automatic refresh
and when the page regains focus; unsaved session counts are not inferred.
Inprocess Quality Control groups rejection entries, first-piece inspection
reports and hourly checks, with links to the saved records. A rejection's type,
reason and defect describe the same quantity; they are not separate rejections.
Production Session references open their session details. Quality Parameters in
Setup Masters are collapsed until opened. Material Yield retains Expected From
Received RM and omits Remaining RM Equivalent from the workspace display.

In Masters, Casting is the unitless material ratio calculated as Product Master
Blank Piece Weight divided by One-Piece Weight. For example, `5.022 / 0.90`
displays as `5.58`. Casting is displayed to exactly two decimal places without
rounding the underlying calculation. A missing or zero One-Piece Weight leaves
Casting unavailable.

Current Stage recognizes running work from an open Production Session or the current
machine plan, including imported opening production. Missing receipt history must
not label running work as awaiting raw material.

## Analytics

- Plan: ordered quantity and current planned production dates.
- Actual: finished total/good pieces from the selected route's final setup, plus setup-level operation output, rejected pieces, runtime and downtime. It includes Production Sessions plus older production entries that are not already linked to a Session, preventing duplicate records.
- Completion percent: the equal-weight average of capped setup completion percentages, using every selected-route setup as described above. Finished-output percent remains final-setup good pieces divided by ordered quantity and must be labelled separately. Earlier setup output remains WIP.
- Rejection percent: rejected pieces divided by total produced pieces.
- Downtime pattern: minutes and occurrences grouped by coded reason and setup.

These are Job Card Analytics, not OEE. OEE requires separate availability, performance and quality definitions.

## Cycle-Based Planning Capacity

Before a setup has enough production history to project from observed daily
output, its planned production duration uses the remaining pieces multiplied by
Cycle Time plus Loading / Unloading Time. CNC-01 has 22.5 productive machine
hours per working day: three shifts of 7 hours 30 minutes each. Other Production
Floors retain 8 productive machine hours per working day. Planned duration
rounds up to a whole working day; Fridays and Planning Calendar holidays are
excluded.

## Setup Time

### Machine continuity between setups

Consecutive setups of the same Job Card and selected route prefer the same
compatible physical machine when using a separate machine provides no useful
overlap. This preference includes reuse of collets, inserts and settings; it
does not depend on sharing a Tooling Master code.
The same preference applies to repeating the same part, route option and setup
across Job Cards after an existing running or completed setup. Job quantities,
WIP and production records remain separate.

Useful overlap means a feasible separate-machine start before the preceding
setup finishes that improves completion by at least one working day, the
planner's date resolution. Existing material, pooled actual-WIP, tooling and
machine-availability gates still apply. Forecast-only downstream work does not
reserve a physical machine before its actual-WIP gate is satisfied.

Where feasible, the next setup follows its predecessor immediately. Other
unstarted automatic assignments may rebalance to compatible machines. Actual
shop-floor work, explicit planner placements and higher-priority commitments
remain protected. Continuity must not postpone the setup's existing forecast
finish; it is a preference, not permission to delay delivery. Setup and quality
approval remain required, and unrecorded changeover savings are not invented.

- Machinist setup time: Pre Setting start to Setting complete.
- QC wait: Setting complete to QC approval.
- Machine-start wait: QC approval to the first Production Session start.
- Setup variance: machinist setup time minus the Setup Time target in Cycle Master.

Missing timestamps remain unknown and are never treated as zero minutes.

## Material Yield

Required RM (kg) is ordered pieces × Product Master Blank Piece Weight (grams)
÷ 1,000. For example, 10,000 pieces × 15 grams requires 150 kg. The Work Order
template's ordered kilograms represent approximate finished-goods weight, not
raw material required. The workspace compares cumulative RM receipts against
the calculated requirement when identifying the complete-RM date. Missing blank
piece weight leaves the requirement and complete-RM date unavailable.

Finished Good excludes final-setup rejections. Final Setup Total includes good
and rejected output from that final setup; they match only when none is rejected.

- Expected pieces from material: total received kilograms across every RM receipt,
  converted to grams and divided by Product Master Blank Piece Weight in grams.
- Remaining material equivalent: remaining kilograms converted to grams and
  divided by the same Blank Piece Weight.
- Unexplained process loss: expected pieces minus remaining-material equivalent minus first-setup output pieces. Later setup output is not subtracted again because it is the same material moving through the route.
- Order short: ordered pieces minus good produced pieces.

Casting is not an input to material yield. These values are unavailable without
Blank Piece Weight and remain estimates until remaining RM is maintained accurately.
Each RM inward entry is append-only for normal receiving; later inward entries add
to the Job Card total instead of replacing the previous receipt. An exact import
retry reuses its receipt identity so the tally is not duplicated.

## Work Order Line Cancellation

A Work Order Line may be cancelled before or after Raw Material is received.
Cancellation records a reason and time instead of deleting the Work Order, its
receipts, or its production history. The cancelled line and every setup leave
active planning immediately, and any active setup state releases its machine.

An open Production Session must be closed before cancellation. A dispatched
line cannot be cancelled. After cancellation, the Job Card cannot accept new
Raw Material receipts, production activity, route or planner actions. Reusing or
returning already received Raw Material is a separate inventory action and does
not change the preserved receipt history.

## Raw Material Rejection

A Raw Material Rejection is a Planner action against one Job Card. It records the
kilograms dispatched back and subtracts them from cumulative received Raw
Material without deleting or rewriting the receipt. It is separate from a
Production Rejection, which records rejected pieces against a Production
Session.

- If all usable Raw Material is rejected before production starts, every setup
  leaves the plan and the physical machine becomes available.
- If all usable Raw Material is rejected after Setup 1 has started, its open
  Production Session must first be closed. Historical setup and production
  events remain auditable, but every setup leaves the active plan until
  replacement Raw Material restores availability.
- A partial rejection requires the Planner to choose either **Continue Accepted
  Quantity** or **Wait For Replacement**. Continue Accepted Quantity uses the
  pieces supported by net usable kilograms as the provisional Setup 1 quantity
  and end-date basis. Once a setup records good production, that actual good
  quantity becomes the cumulative planning quantity for downstream setups, even
  when it exceeds the kilogram-derived estimate. Wait For Replacement removes
  all active setup plans until net usable kilograms again cover the ordered Raw
  Material.
- When a rejection puts the Job Card on **Wait For Replacement**, its closed
  setups release their machine assignments in the same transaction. They return
  to Planned without being marked Item Complete; production history is retained.
  Shop Floor can then start the next eligible Job Card on the released machine.
- When the remaining usable balance rounds to `0 kg` at the displayed `0.1 kg`
  precision, **Continue Accepted Quantity** is not available. The rejection is
  treated as full for planning and **Wait For Replacement** is enforced.

Net usable Raw Material equals cumulative receipt kilograms minus active Raw
Material Rejection kilograms. Later replacement receipts add to this balance.
When the balance is restored, Setup 1 and downstream setup forecasts rebuild
cumulatively from preserved production history and the normal WIP rules.

## Delivery Target And Rating

The Product Master stores the default working days after full RM receipt. A Job
Card can optionally override that default. Full RM receipt is the first receipt
date when cumulative received kilograms reach ordered RM kilograms. Fridays and
Planning Calendar holidays are excluded.

- A: on or before target.
- B: 1–2 working days late.
- C: 3–5 working days late.
- D: more than 5 working days late.

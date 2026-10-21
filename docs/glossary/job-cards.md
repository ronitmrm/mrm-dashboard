# Job Cards

## Rework received

Operational Entries → Rework Received records returned pieces against a previously
dispatched Job Card in the same Production Unit. Record a positive whole-piece
quantity, receipt date and reason. The system generates a unique Return Reference
on save: `RET-<base Job Card>-R<revision number>`. Both activities of a mixed return
share this reference in their records and history.
Partial and full returns are supported. Weight-converted piece quantities allow
a 5% excess: cumulative returns against the dispatched activity cannot exceed
105% of its recorded dispatch quantity, rounded down to whole pieces. Ordered
quantity is never used as a substitute. If any approved dispatch has no piece
quantity, its actual dispatched quantity must be recorded before receiving a
return. The allowance applies once to the total, not separately to each receipt.
Smaller partial returns remain valid; there is no 95% minimum.

The Job Card number stays the same. Original production is **Original** (revision
0); returns create **Rev 1**, **Rev 2**, etc. A return records the quantity that
can be reworked and the quantity rejected beyond rework. These add to the total
return quantity. Rejected pieces require replacement production and a separately
entered positive Required RM (kg). One mixed return creates one revision with
separate Rework and Replacement activity records. Each activity's reference
includes the base Job Card, revision and disposition so operational tasks, reports
and sessions remain unambiguous. References identify activity, not new orders.

Revision numbering is shared by the entire Job Card family. A repeat return must
identify the original or revised activity that dispatched those pieces. Quantities
already returned against that activity cannot be returned again. Original orders,
output, dates and dispatch remain unchanged; revised output never increases the
original order's recorded fulfilment.

Reworkable pieces start in Part Readiness. Replacement pieces await new RM
received against their own revision/activity; earlier RM receipts cannot satisfy
them. Both activities require explicit planner route selection, even for a sole
route, and are flagged in Planning Control. Only reworkable pieces bypass the
new-RM requirement. Original Job Cards retain automatic sole-route selection.
Existing per-setup first-piece/in-process inspection, production, completion and
partial/full dispatch rules apply independently to each activity.

The register shows one row per base Job Card and the current revision's status.
Its quantity and progress describe the current revision; mixed-activity dates
are viewed on the selected activity rather than blended. Earlier open work is
flagged. Original order totals exclude revised quantities.
The detail workspace lists all revisions with reason, quantity, status and dates.
Selecting an activity scopes every tab, report, session, RM balance and dispatch
to that activity. **All Revisions** is a labelled history, never combined progress
or fulfilment. No selected revision may inherit completed work or inspection from
another revision.

### Job-specific rework routes

In Part Readiness the planner can explicitly select an existing route or create
a route for the selected Rework activity. Its ordered operations, machine
families, setup/cycle times, tooling and inspection requirements belong only to
that activity. They are excluded from shared Route, Cycle, Tooling, Setup Name
and Quality Parameter masters and from other Job Cards' route choices. Existing
per-setup first-piece and in-process inspections still apply. There is no copy
from previous rework route feature. Once execution has started, the route remains
immutable so its sessions and reports retain the instructions used.

### Rework rejected

Operational Entries → Rework Rejected records that the entire selected Rework
activity cannot be salvaged. Close all its Production Sessions first. Record the
batch quantity, rejection date, reason and positive fresh RM requirement. The
activity must be undispatched and cannot be rejected twice. Trial rejections are
included in the rejected batch total; only the additional unreported balance
appears as batch rejection, without inventing production output.

Saving atomically marks the activity Rejected — Remake Required, removes its
pending planning and machine ownership, and creates a Replacement activity in the
next revision of the same base Job Card. Replacement quantity equals the rejected
batch quantity. This is a disposition of the existing return; it does not consume
another dispatch-return allowance. The original Return Reference and the failed
activity remain linked. Historical sessions, inspections, timings and reports
are retained. Replacement awaits its own fresh RM and explicit full-route
selection, starting with Setup 1; it does not inherit the correction route.

## Job Card Register

The Job Cards tab is a compact one-row-per-Job-Card register. It is for finding a Job Card, not displaying its complete history.

The summary counts the selected production unit before table filters. Every
Job Card belongs to exactly one bucket: Awaiting RM, In Production, Production
Complete, or Dispatched. In Production includes ready-for-setup and part-readiness
work, active production, and partially dispatched Job Cards whose lifecycle is
still open. Production Complete means all route setups have reached 100% and
the Job Card has not entered dispatch. Dispatched means final dispatch, including
historical dispatch approval. The four bucket counts always add up to Job Cards.

Production Progress in both the register and workspace gives every distinct setup in the selected
route an equal share of 100%. Each setup's progress is its cumulative good
pieces across machines divided by ordered pieces, capped between 0% and 100%.
The Job Card percentage is the average of those setup percentages, including
setups with no output as 0%. For two setups, completing the first contributes
50%; completing half of the second raises overall progress to 75%. Excess output
on one setup cannot fill another setup's share. Without a selected route or a
positive order quantity, progress is unavailable. Finished pieces remain the
good output of the final setup; intermediate output is still WIP.
After a final dispatch, the register shows finished good against the ordered
quantity and any remaining order shortfall instead of an in-progress percentage.
A partial dispatch leaves production open and shows both ongoing setup progress
and the quantity already dispatched. A final dispatch closes the Job Card
lifecycle even when finished good is below the order quantity; the shortfall
remains visible and is not counted as unfinished production.

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

Actual Finish Date is the plant-local calendar date of the recorded Item Complete
timestamp for the final setup in the selected route. Where that setup runs on
multiple machines, use the latest completion date only after every planned
machine stream is Item Complete.
If approved route changes carry completed work with zero remaining quantity on
the final setup, follow the chain of uniquely equivalent setup operations back
to its recorded completion for the same Job Card and part, after every recorded
machine stream is Item Complete. Work started on the selected route must use its
own completion.
Unfinished Job Cards show `-`. A completed or dispatched Job Card without a
recorded final-setup completion shows `Not recorded`; neither the forecast nor
the dispatch date is treated as its actual production finish.

Use the table's per-column filters, including Job Card. The register does not have a separate search strip. Setup Completion and Job Card Dispatch remain visible together; selecting a machine for Setup Completion fills its current Job Card and setup from planning.

Setup Completion can be recorded by a user with the task permission for the
selected Production Unit. Completed By is the signed-in performer's active
Employee ID and name when linked, or the signed-in account name otherwise.
Job Card Dispatch may send recorded good pieces from the selected route's final
setup while that setup or an earlier setup is still in production. The performer
enters a positive whole-piece quantity no greater than final-setup good pieces
already recorded minus pieces previously dispatched for that Job Card. More
pieces may be dispatched later as production is recorded. Unsaved output and
rejected pieces are never available to dispatch. Approved equivalent final work
carried with zero remaining quantity through one or more route changes also
counts once per saved production entry. Each
dispatch records its quantity, time, and signed-in performer. Dispatch does not
record an Actual Finish Date. A partial dispatch leaves the Job Card in production and in
the dispatch picker whenever more finished good is available. Once the final
setup is Item Complete and all its recorded good pieces have been dispatched,
the Job Card is Dispatched. Historical dispatch approvals without a recorded
quantity remain terminal, with their shipped quantity unknown.

## Job Card Workspace

Every Job Card has one dedicated workspace URL. The workspace reads, but does not duplicate:

- its Work Order and Product Master;
- its selected Route and Setup masters;
- Cycle, Tooling and Quality Parameter masters for each selected setup;
- current planner dates and machine assignments;
- durable Planner Movement Records for machine shifts, machine constraints, priority interruptions, and queue changes, including their Production Session settlement evidence;
- Production Sessions, downtime and rejection;
- setup-progress, historical Production Card and dispatch events.

The workspace's selected Route follows the latest unreversed Route Change for
that Job Card; otherwise it uses the current Route Selection.

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

Setup and whole-Job-Card forecasts always use remaining good pieces multiplied
by Cycle Time plus Loading / Unloading Time. Recorded output reduces remaining
quantity; it never replaces cycle capacity with an average of recorded output
per day. After a day's production is recorded, the remaining work is forecast
from the following working date. At 1,000 pieces/day, a 500-piece shortfall adds
half a working day; a 500-piece surplus removes half a working day.

CNC-01 has 22.5 productive machine hours per working day: three shifts of
7 hours 30 minutes each. Other Production Floors retain 8 productive hours.
Finish estimates retain fractional working days, shown as productive hours
into the finish date, rather than invented wall-clock shift times. Machine
queue reservations still use whole dates. The Universal Planning Calendar applies
to the selected production unit (CNC, Conventional-01, Conventional-02 or Forging),
or Whole Factory. Existing entries apply factory-wide to all shifts. Fridays are
closed by default. A dated **Working Friday** entry opens all shifts of its scope;
removing it restores the weekly off. A **Holiday** closes All shifts or a selected
shift: CNC A/B/C each removes 7.5 productive hours; General removes the other
units' 8 productive hours. Factory entries for a named shift affect units using
that shift. CNC Shift C belongs to the date it starts, including its next-morning
hours. Overlapping holidays close each shift once; a holiday takes precedence
over a Working Friday. Each date/unit/shift combination has one editable entry
with a reason; its identity is fixed (delete and recreate to change it). These rules apply
to forecast production capacity, setup/Job Card finish dates, Order Acceptance,
priority previews and delivery working-day targets. They do not prevent planning,
setup preparation, or a setup start. Delivery working-day targets count any date
with remaining productive capacity as a working date; partial shift holidays
reduce machining capacity rather than removing that date from the target calendar.
Setup start dates retain their calendar dates, including offs. Material and WIP
availability, active machine ownership, tooling, reviewed queue order, and explicit
machine-unavailable constraints still apply.

For CNC, the current planning Production Date changes at 06:00 IST, matching
Shift C's end. Thursday work remains due after midnight through Friday 06:00;
Friday's weekly off then lasts until Saturday 06:00 for finish forecasting unless
that Production Date is marked Working Friday in the Universal Planning Calendar.
Recalculation must not roll setup starts to Saturday or block their workflow
because of midnight, a weekly off, or a Planning Calendar holiday.

Shop Floor Status shows the recorded lifecycle of each setup on its assigned
machine. Job Card Current Estimated Finish includes all remaining route setups,
using the same cycle-based supply and remaining-work calculation. Forecast-only
downstream work does not reserve a machine or bypass actual-WIP readiness without
the Planner's early Setup 2 decision. The whole-job finish cannot precede the
upstream supply needed by that setup.
An approved route change sets the selected route and the remaining setup
quantities for future planning. Settle open Production Sessions first. Saving
the change releases unfinished active setups from their machines and returns
them to Planned; the new route requires RM at Machine, Setting, Quality Approval
and Machine Start again. Recorded production and the old route remain historical.
As the new setup advances, its saved workflow stage remains authoritative;
historical output must not imply that Machine Start has already happened.
A saved route with zero remaining setup quantity
still exists; it does not create a Route Master gap or new machine work. An
explicit remaining-setup plan with no positive planned quantity creates no machine
plan or finish forecast; completed production and workflow remain historical.
Setup readiness checks apply
to the setups with remaining planned quantity. If any such setup lacks required masters,
Part Readiness lists the gaps and the changed Job Card receives no new machine
plan until the selected route is ready. A Move Setup decision uses the target
machine from its decision date onward; an outage that ended before that decision
does not block the move.
A confirmed Move Setup queue may place work on a machine with an active setup.
The current target setup keeps its machine ownership and continues; moved work
waits at the selected position among future queued setups. Keeping the target
setup running does not require closing its Production Session. An explicit Stop
choice still requires settling that setup's session before releasing its machine.
Running work on the source machine must also be settled before it is moved.
For future queued work, the latest saved queue placement takes precedence over
older placements, including earlier breakdown moves. A later priority decision
uses its reviewed queue order and interruption permissions; an older placement
must not put released work back ahead of it.
Subsequent Planner Actions, Setup Checklists, Production Sessions, production
entries, and dispatch resolve setup identity from the latest active Change Route
before any earlier route choice. Interruption checks must inspect the session on
that current setup before releasing its machine.
Change Route may be found by Job Card or by Part Code. Part Code narrows the
available Job Cards; the Planner must select one Job Card because multiple Job
Cards can share a part and a route change applies to one Job Card.
The immutable RM-receipt Planned Finish Date remains historical.

A machine-unavailable action affects unfinished work only. A setup already
marked Item Complete stays complete on its recorded machine, even when its
good output is below the upstream input quantity. Unprocessed input remains
physical WIP; the action must not create another planned run for it.
Planner queue reviews and move choices show unfinished setups only. Completed
setups remain in production history; their recorded output does not make them
running blockers.

If an upstream setup is Item Complete below the customer order quantity, its
recorded good output less downstream pieces already processed is the available
input for the next setup. The remaining customer shortfall does not block that
available input. Shop Floor readiness checks this quantity even after the next
setup has a recorded workflow stage; that stage retains its machine assignment
but cannot bypass a genuine WIP shortage.

The Planner may approve **Plan Setup 2 Early** for one Job Card with a selected
route containing Setup 1 and Setup 2, on a separate idle, compatible machine. This reserves Setup 2
before the normal two/three-day WIP buffer is recorded and retains the decision
and reason in Planner history. Setup preparation may proceed. Machine start
requires recorded Setup 1 good pieces, and Setup 2's cumulative good plus
rejected output may not exceed that recorded supply. If WIP runs out, further
output waits for more Setup 1 good pieces. Other Job Cards retain the normal
buffer rule. The early plan's forecast is provisional until output is recorded.

## Setup Time

### Machine continuity between setups

Consecutive setups of the same Job Card and selected route prefer the same
compatible physical machine when using a separate machine provides no useful
overlap. This preference includes reuse of collets, inserts and settings; it
does not depend on sharing a Tooling Master code.
The same preference applies to repeating the same part, route option and setup
across Job Cards after an existing running or completed setup. Job quantities,
WIP and production records remain separate.
When another Job Card for the same part and route has run the preceding setup
more recently, that work can anchor the next setup on its machine if the two
setups share a recorded tooling asset. The normal WIP, capacity and delivery
checks still decide whether that machine is feasible.

An Item Complete setup releases its machine on its recorded completion date;
it does not reserve another full working day. Ready matching-setup work across
Job Cards can retain that machine's settings before a newly available next
route step. Recorded WIP can release the next route step on the same working date
when its pooled quantity is sufficient and the machine and tooling are available.

Useful overlap means a feasible separate-machine start before the preceding
setup finishes that improves completion by at least one working day, the
planner's date resolution. Existing material, pooled actual-WIP, tooling and
machine-availability gates still apply. Forecast-only downstream work does not
reserve a physical machine before its actual-WIP gate is satisfied unless the
Planner records the Job Card's early Setup 2 exception above.

Where feasible, the next setup follows its predecessor immediately. Other
unstarted automatic assignments may rebalance to compatible machines. Actual
shop-floor work, explicit planner placements and higher-priority commitments
remain protected. Continuity must not postpone the setup's existing forecast
finish; it is a preference, not permission to delay delivery. Setup and quality
approval remain required, and unrecorded changeover savings are not invented.
Automatic rebalancing must retain an existing feasible machine when the proposed
machine would start the same unstarted setup later, after accounting for its
queue and unavailable dates. A lighter machine queue alone is not a reason to
delay that setup.

- Machinist setup time: the first saved Setting checklist start to Setting
  complete. Existing historical Pre Setting start evidence remains the start
  for older setups when present.
- QC wait: Setting complete to QC approval.
- Machine-start wait: QC approval to the first Production Session start.
- Setup variance: machinist setup time minus the Setup Time target in Cycle Master.

Missing timestamps remain unknown and are never treated as zero minutes.

### Floor material movement wait

The floor's clock starts when the published Shop Floor task is ready: its planned
date is due, usable RM (or physical WIP for a later setup) is available, and its
assigned machine is free. Only the next task on that machine starts a clock.
Partial RM does not have to reach the shortage-review threshold to be moved.

Readiness is recorded when the system processes the confirming planning publication, without
backdating earlier unobserved waits. Recalculations of the same ready assignment
retain that start time.
The existing **RM at machine** action ends the wait and records the performer and
remark. The Job Card RM tab shows current waits and retains their history.
Floor material waits are not shown in Planning Control or Planning Review.
These are elapsed waits, with no additional completion blocker or grace-period rule.

Count scheduled working time, excluding weekly offs, Planning Calendar holidays,
out-of-shift hours and configured breaks. CNC uses its 06:00 production-day
boundary. Preserve the calendar and break schedule with each recorded interval.
If readiness is withdrawn, close that interval; a later ready task starts a new
interval, including after an RM/WIP release. Machine moves and parallel machines
have their own intervals. Earlier activity without a recorded ready time remains
unknown; an arrival correction is labelled corrected rather than delivered.

## Material Yield

### RM review and short receipt acceptance

Planning Control shows one RM shortage row per active Job Card only after some RM
has been received and usable received RM is below 95% of a known required quantity.
A shortage of up to 5% is allowed, including exactly 95% received. Use usable RM
after rejections for this comparison. No receipt means no RM shortage flag; excess
RM does not raise a shortage flag. The row shows required, received, rejected where
applicable, and pending kilograms. Receipts update the same row; reaching the 95%
threshold removes it automatically. Required, received and pending kilograms retain
their exact values. The Job Card's RM tab shows its material specification, totals,
receipt ledger and whether a remaining balance is within the 5% allowance. An
unknown requirement is shown there as not entered in the Work Order, never as complete.
The receipt ledger shows received kilograms. **Pending RM** in the Job Card
summary is the amount still due against the requirement after rejections. A
receipt's saved remaining-stock quantity is not an outstanding receipt balance
and is omitted from this ledger to avoid confusing the two.

Item Complete on any setup requires usable RM of at least 95% of the requirement
or an explicit Planner **Accept short RM** decision for a larger shortage, with a
reason. Acceptance retains the person, time and reviewed material balance; it
changes neither receipts nor original order quantity. It remains visible as
accepted while RM is below the 95% threshold. A higher required quantity or a
reduced usable balance requires review again. Releasing a machine is not acceptance.

### Release a setup awaiting material

After closing its Production Session with actual output, the Planner may select
**Release machine — awaiting material** for one setup/machine assignment. The
setup returns to Planned, inactive, preserving all production and the outstanding
quantity. Only that assignment releases its machine; other running setups continue.
Setup 1 waits for additional usable RM; later setups wait for additional recorded
good output from their preceding route operation. A material receipt alone does
not release a downstream WIP wait. When the required input increases, remaining
work returns to normal planning and readiness checks. No future receipt date is
invented. Original setup targets remain unchanged; actual output reduces remaining
work. A running downstream setup may retain its machine while waiting for WIP.

Required RM (kg) is entered on the Work Order form or in the CSV's `requiredRmKg`
column. Work Order uploads recognise template field names and downloaded record
headings, including `Required RM (kg)`, before validating the entered values.
It is never calculated from ordered pieces, Blank Piece Weight or ordered
finished-goods kilograms. The value must be positive when entered. Existing Work
Orders remain blank until someone enters it; no calculated amount is copied in.
The entered requirement supplies the RM summary, shortage flag, 5% completion
allowance, planner short-RM acceptance, replacement balance and complete-RM date.
Without it, the requirement and complete-RM date are unavailable and Item Complete
requires the Work Order value to be entered first. Ordered kilograms remain the
approximate finished-goods weight. Blank Piece Weight still supplies the separate
material-yield estimates below.

For existing Work Orders, **Update Required RM CSV** reads Job Card and Required
RM (kg) from the same downloaded CSV. It updates only the entered requirement
on matching Job Cards in the selected Production Unit, including cancelled
orders, without reopening them. Blank requirements are ignored; unmatched Job
Cards are reported as skipped and never created. Invalid or conflicting values
stop the batch without saving changes. Repeating an unchanged value does not
create another change. Updates retain an audit record.

This action preserves quantities, dates, routes, planner decisions, receipts and
setup history. It does not queue planning recalculation or change the published
machine plan. Material checks use the updated requirement; a later normal
recalculation uses the current requirement. Normal **Upload CSV** remains the
full Work Order import and can queue planning.

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
Each receipt may record an optional **RM Location**, entered in the RM Inward
form or the CSV's `rmLocation` column. It describes where that receipt's material
is stored and appears in RM Inward records and the Job Card RM receipt ledger.
Locations belong to individual receipts; earlier receipts without one remain blank.
Shop Floor Status and Shop Floor Tasks show the Job Card's saved RM locations
beside a pending material-placement task. Multiple receipt locations are listed
together; if none was entered, they show **Not recorded**. The location disappears
from that task after **RM at machine** is recorded. This is receipt storage
information, not a record of downstream WIP location or stock transfers.
RM Inward CSV uploads require a valid `DD-MM-YYYY` date on every row. A file with
an invalid date is rejected before any receipt is saved, with the failed row
number and required format shown to the uploader. Saved RM Inward dates display
in that same format, including earlier entries stored in other formats.
The uploader recognises both template field names (`rmInwardDate`, `rmLocation`)
and downloaded record headings (`Rm Inward Date`, `RM Location`). Repeated
headings that identify the same field are rejected. RM Location remains optional.
A mistaken receipt can be deleted with a reason, even after production starts.
Deletion reverses that receipt for current RM totals, availability and unlocked
planning while preserving the receipt, audit trail and recorded production
history. A forecast baseline tied to a reversed receipt is excluded from the
current dashboard; its historical record remains immutable.

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
date when cumulative received kilograms reach the Work Order's entered Required
RM (kg). It stays unavailable while that requirement is blank. Closed Fridays
and holidays follow the Universal Planning Calendar; Working Fridays count normally.

- A: on or before target.
- B: 1–2 working days late.
- C: 3–5 working days late.
- D: more than 5 working days late.

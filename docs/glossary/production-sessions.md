# Production Sessions

## Work order job cards

Each Job Card identifies one production order line. Multiple Job Cards may share
the same FG PO and Part Code, with separate ordered quantities, routes, material
readiness and production history. Reimporting a Job Card updates that line; it
must not reassign the Job Card to a different FG PO or part. Duplicate Job Cards
within one import are rejected.

## Lifecycle

Quality Inspection Parameter masters remain scoped to their production unit,
part, route option, and setup. Parameter Master and Measuring Instrument Master
are Universal: one shared vocabulary across all units. Inspection forms select
an active parameter name and, when supplied, an active measuring instrument.
Existing names seed these lists without changing inspection identities or results.
Names are unique ignoring case and surrounding spaces. Referenced names cannot
be deleted; inactive choices remain in history but cannot be selected for new saves.

Quality Inspection Parameter rows may be revised after use, including their name,
specification, instrument, tolerances, input type, sequence and remarks. New FPIR
and hourly checks use the current active master. Saved inspections retain a
snapshot of every parameter's definition and their recorded readings/results;
master edits never rewrite that evidence. Reopening a saved hourly check uses
its saved definitions, including parameters subsequently removed from the master.

Setup Checklist masters belong to one production unit. Codes and revisions are
unique within that unit; tasks may only select and complete that unit's templates.
Editing a unit's checklist does not change another unit's checklist. Existing
checklist and completion records retain their identities when assigned to a unit.

Incomplete checklist answers may be saved as progress, but cannot be marked
Completed. Completion requires every active required point for the Setting phase
to have an explicit answer, validated against the unit's master on the server.
For points marked Required, either Yes or No satisfies a checkbox/Yes-No answer;
an untouched/blank selection blocks completion. Optional points may stay blank.
Numeric zero is a valid answer. Saving incomplete progress
clears the checklist completion timestamp and leaves Setting Done locked.
CNC Setting Done rechecks saved answers on the server, so a cached checklist
or an earlier Completed status cannot bypass this lock.

An actual shop-floor setup remains visible and locked to its physical machine
after RM reaches the machine, even when its cycle or tooling master is still
incomplete. Missing masters continue to block unstarted setup planning. For CNC
startup openings, an `operator_started` setup is Running from the saved opening
state; its cycle time may be entered when that setup's real session starts.

CNC-01 has no Pre Setting stage. Its workflow is RM at Machine → Setting →
Quality Approval → Machine Start. The six CNC checklist points are completed at
Setting, without requiring an earlier checklist session. Historical Pre Setting
evidence remains recorded; it does not complete Setting or block the next action.
Other production units retain their existing Pre Setting workflow.

Department task attribution offers active assistants, HODs and Managers from
the task's department and production unit. This applies to Shop Floor (including
RM at Machine and Setup Complete), Inprocess Quality, Machinist and Planner.
HODs and Managers may perform the department's tasks when assistants are
unavailable. Dispatch approvers include eligible Planner and Shop Floor employees.
In CNC, the Programmer department performs Machinist tasks; its active Assistants,
HOD and Manager are eligible for the CNC Machinist task selector.
Employees from other units or departments are not substitutes. These selections
record who performed the work; they do not grant application permissions.
The separate machine Worker selection still requires a Worker designation.

Planner decisions identify the operation by its setup number. Display labels
such as `P1` and `Setup 1` refer to setup `1`; they must not prevent a saved
machine movement, interruption or queue order from applying. This rule is shared
by every production unit. Shop Floor uses the resulting planner assignment.

A Production Session is one uninterrupted period in which one operator runs one machine for one Job Card, option, and setup. Operator, shift, item, job, option, or setup changes end the current session. Downtime belongs to the session and does not end it.

Shop Floor starts and closes sessions. Quality may also close CNC sessions. Quality, Shop Floor, and Machinist may record downtime; only Quality may record rejection.

Close reasons are Shift Ends, Shift Change, Operator Change, Item Complete, Job / Setup Change, and Manual Stop. Shift Ends is the default because it is the normal close path.

An open session changes its displayed operational status to Closing Required as soon as its scheduled shift end passes. Closing Required sessions remain technically open, stay visible in the Session Register, can be isolated with the Status filter, and expose an immediate Close action so missed entries can be corrected using the normal close workflow. The system does not invent output or silently close them.

## Downtime lifecycle

Planner machine issues remain open until the planner marks the machine available.
An open issue whose To date has passed moves from Active Machine Issues to Pending
Review (India calendar date); a blank To uses the From date. The planner can mark
it available or extend its end date. Mark Available records the actor and time,
removes the issue from both queues, and retains it in Decision History. It ends
the availability restriction from today without reversing saved setup movements
or queue placements. This planner action does not close a production session's
downtime or start production.

Downtime starts with a coded reason and start time. A new downtime entry defaults its start time to the current IST time, while remaining editable for corrections. It remains open until an end time and one of two outcomes are entered: Resolved — Resume Production, or Shift Ended — Unresolved. Only one downtime interval may be open in a Production Session, and production cannot resume while it remains open.

An open downtime interval blocks End Session. The user must explicitly close the downtime first; ending a session never silently supplies its end time.

When a problem is unresolved at shift end, its current downtime interval closes at the scheduled shift end with Shift Ended — Unresolved, then the Production Session closes with Shift Ends. The problem appears as Carried Downtime for the next shift. Non-working hours are not counted. If the problem continues, the next shift starts a new downtime interval at that shift's start; resolving that interval clears the carry-forward. If the problem is fixed before the next shift, its actual resolution time clears the carry-forward without creating another production downtime interval.

For example, Conventional downtime from 16:00 until the 20:00 shift end records 240 minutes. If still unresolved when the next General shift starts at 08:30 and repaired at 11:00, the next interval records 150 minutes; 20:00–08:30 is excluded.

## Shift and production date

| Production Floor | Shift | Start | End |
| --- | --- | --- | --- |
| Conventional-01 | General | 08:30 | 20:00 |
| Conventional-02 | General | 08:30 | 20:00 |
| Forging | General | 08:30 | 20:00 |
| CNC | A | 06:00 | 14:00 |
| CNC | B | 14:00 | 22:00 |
| CNC | C | 22:00 | 06:00 |

Production Date is the date on which the shift starts. CNC Shift C therefore keeps its starting date after midnight until 06:00.

Start Session pre-fills the selected shift's scheduled start. End Session pre-fills that session's scheduled shift end. Both remain editable for exceptions; for example, Conventional starts at 08:30 and ends at 20:00.

## Session reference

Every session receives an immutable human-readable reference:

`<MACHINE>-<YYYYMMDD>-<DAILY_SEQUENCE>`

Example: `C501-20260815-03` is the third session for machine C501 on Production Date 15 August 2026. The daily sequence is scoped to machine and Production Date. The database UUID remains the permanent technical identity.

## Measurement and output

### CNC fresh-start transition

Only Job Cards with no production setup started enter the new CNC workflow.
Items already started finish entirely in the old system. Each machine finishes
its old-system queue before starting any new-system setup. Planning assumes idle
machines; planned dates remain estimates, and sessions record actual start/end
times when the machine switches. No historical opening quantities, setup states,
or invented production dates are imported. Every new Job Card follows the normal
material, route, setup, quality and production workflow from its first step.

Cycle Time Master revisions apply to the selected unit, item, route and setup.
Open production sessions adopt the revised cycle time, and planning refreshes
remaining-duration and completion estimates from the current master. The open
session's target is calculated using the revised cycle time for its runtime.
Closed sessions and recorded output/targets remain unchanged. New sessions read
the current master on the server, even if the start form was opened earlier.

Conventional-01, Conventional-02, and Forging use Weight. CNC selects Machine Counter or Weight per session. Counter continuity applies only when the immediately preceding closed session has the same machine, Job Card, Part Code, option, setup, and Machine Counter method.

Rejected pieces are included in total produced pieces. Good pieces equal total produced minus rejected pieces.

Planner Actions never accept a second produced-quantity figure. When a planner decision stops or moves a running setup, its Production Session must first be closed through the normal Weight or Machine Counter workflow at the actual interruption time. The planner decision then reads the resulting canonical good output and uses it as interruption evidence; the same output therefore appears immediately in the Production Entry and Job Card.

Saving an approved machine move, priority stop, or machine-constraint move also releases each stopped setup's active machine ownership in the same transaction. Its workflow returns to Planned without marking the setup complete, the planner history retains the stop evidence, and the destination machine can immediately accept the approved setup.

Customer-order balance and physical WIP are separate. Customer balance is ordered
pieces minus final-setup good output, floored at zero. For a downstream setup,
physical WIP is the preceding route setup's pooled good output minus this setup's
total processed pieces (good plus rejected), floored at zero. A planner stop never
marks that stock complete. Replanning retains the normal customer-demand forecast
and also processes physical WIP exceeding it; it must not cap that stock at the
customer order. Already recorded good output is retained, never recreated.

Recalculation replaces allocations for the same Job Card/route/setup. New upstream
good output increases its existing remaining plan; it does not append a duplicate
batch. Sum remaining allocations across machines once. Production rejects consume
input stock and do not become downstream good stock. Existing WIP timing/buffer
rules still control when stock can move. Explicit route-change quantities retain
their selected setup scope.

The interruption evidence also stores the immutable Production Session references and latest settlement time. This lets the Job Card trace every planner movement back to the exact weighed or counter-based production records.

When a machine problem delays work on the same machine, the Production Session remains open and an open Production Downtime Event is required before the delay decision can be saved. If the work moves to another machine, the source session must be closed first. Stopping running work on a destination machine follows the same close-first rule. Queued work that has not started needs neither output settlement nor session closure.

## Operational and analytical views

Production Sessions belongs inside each Production Unit. Start Session offers a dropdown containing only currently running machines in that unit and fetches the selected machine's current planner assignment for verification before Shop Floor enters the operator, start time, measurement method, and applicable machine start count. It does not expose a daily all-machine board or queued machines.

The Production Session Register shows one row per session for the selected Production Unit. The Production Event Log presents that unit's lifecycle actions and child events chronologically for analysis without creating a second source of truth.

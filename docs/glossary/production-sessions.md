# Production Sessions

## Lifecycle

A Production Session is one uninterrupted period in which one operator runs one machine for one Job Card, option, and setup. Operator, shift, item, job, option, or setup changes end the current session. Downtime belongs to the session and does not end it.

Shop Floor starts and closes sessions. Quality may also close CNC sessions. Quality, Shop Floor, and Machinist may record downtime; only Quality may record rejection.

Close reasons are Shift Ends, Shift Change, Operator Change, Item Complete, Job / Setup Change, and Manual Stop. Shift Ends is the default because it is the normal close path.

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

Conventional-01, Conventional-02, and Forging use Weight. CNC selects Machine Counter or Weight per session. Counter continuity applies only when the immediately preceding closed session has the same machine, Job Card, Part Code, option, setup, and Machine Counter method.

Rejected pieces are included in total produced pieces. Good pieces equal total produced minus rejected pieces.

## Operational and analytical views

Production Sessions belongs inside each Production Unit. Start Session offers a dropdown containing only currently running machines in that unit and fetches the selected machine's current planner assignment for verification before Shop Floor enters the operator, start time, measurement method, and applicable machine start count. It does not expose a daily all-machine board or queued machines.

The Production Session Register shows one row per session for the selected Production Unit. The Production Event Log presents that unit's lifecycle actions and child events chronologically for analysis without creating a second source of truth.

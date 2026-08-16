# Production Sessions

## Lifecycle

A Production Session is one uninterrupted period in which one operator runs one machine for one Job Card, option, and setup. Operator, shift, item, job, option, or setup changes end the current session. Downtime belongs to the session and does not end it.

Shop Floor starts and closes sessions. Quality may also close CNC sessions. Quality, Shop Floor, and Machinist may record downtime; only Quality may record rejection.

Close reasons are Shift Ends, Shift Change, Operator Change, Item Complete, Job / Setup Change, and Manual Stop. Shift Ends is the default because it is the normal close path.

An open session changes its displayed operational status to Closing Required as soon as its scheduled shift end passes. Closing Required sessions remain technically open, stay visible in the Session Register, can be isolated with the Status filter, and expose an immediate Close action so missed entries can be corrected using the normal close workflow. The system does not invent output or silently close them.

## Downtime lifecycle

Downtime starts with a coded reason and start time. It remains open until an end time and one of two outcomes are entered: Resolved — Resume Production, or Shift Ended — Unresolved. Only one downtime interval may be open in a Production Session, and production cannot resume while it remains open.

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

Conventional-01, Conventional-02, and Forging use Weight. CNC selects Machine Counter or Weight per session. Counter continuity applies only when the immediately preceding closed session has the same machine, Job Card, Part Code, option, setup, and Machine Counter method.

Rejected pieces are included in total produced pieces. Good pieces equal total produced minus rejected pieces.

## Operational and analytical views

Production Sessions belongs inside each Production Unit. Start Session offers a dropdown containing only currently running machines in that unit and fetches the selected machine's current planner assignment for verification before Shop Floor enters the operator, start time, measurement method, and applicable machine start count. It does not expose a daily all-machine board or queued machines.

The Production Session Register shows one row per session for the selected Production Unit. The Production Event Log presents that unit's lifecycle actions and child events chronologically for analysis without creating a second source of truth.

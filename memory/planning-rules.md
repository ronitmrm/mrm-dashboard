# Planning Rules

Date: 2026-06-29

## No production actuals after shop-floor progress

When a setup has reached shop-floor progress at `setting` or later but has no production entry, planning must not treat old planned production days as produced WIP. The production forecast should move forward to the current planning date until a real production entry exists. The same applies to uncompleted planned rows whose setup/planned start date is already in the past: keep the historical setup planned date visible, but move the production forecast forward and cascade the next machine row from the refreshed planned production end date.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - `rescheduleMachineQueues` separates machine queue locking from actual production start and uses `unenteredProductionForecastStartDate`.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `moves a setup-complete production forecast with no production rows and cascades the next setup`.

Once production is entered, the first production date is the actual production start and locks the production schedule. Shop-floor start/progress still locks queue order, but it is not a production actual.

## Operator-started without production rows

Date: 2026-06-29

Shop-floor `operator_started` means the machine queue item is live/running, but it is still not an actual production start unless a production entry exists. Keep `actualProductionStartDate` blank when `rawRows` is 0, move the production forecast to the current planning date, and cascade the following setup from the refreshed production end. The setup planned/completion dates can remain historical to show when setup/shop-floor work happened.

## Priority queue barrier for stale planned rows

Date: 2026-06-29

A stale normal planned row with an old setup date must not jump ahead of a running/started row or a higher-priority row just because it is technically ready earlier. The machine queue picker must treat running/started rows and preempting priority rows as barriers, then push stale normal work behind the refreshed priority production window.

## Machine availability cannot move backward

Date: 2026-06-29

During machine queue rescheduling, historical completed rows may appear after current or priority rows during sorting. They must not reset the machine's next available date backward to an old actual production end date. Keep machine availability monotonic so later stale rows are pushed after the latest scheduled/actual machine occupancy.

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

## Whole machine queue cascade

Date: 2026-06-29

When one row on a machine is delayed, the consumed machine capacity must cascade through every later queued row on that same machine, not only the immediate next row. A later setup must not keep an old setup planned date if any earlier row's refreshed planned production end now occupies that machine window. Regression coverage: `apps/web/lib/legacy-dashboard-analysis.test.ts` - `keeps stale normal work behind a high-priority item after running work` includes M43 -> M116 -> M34 -> M35 and a queue-wide no-overlap assertion.

## Cross-machine setup WIP cascade

Date: 2026-06-29

When a setup date changes, downstream setups for the same job/part/option must be recalculated from WIP availability, even when the next setup is on a different machine. If the downstream setup's date changes, that downstream machine queue must then be recalculated as well, so later rows on that machine move when the changed setup consumes capacity. Regression coverage: `apps/web/lib/legacy-dashboard-analysis.test.ts` - `moves a setup-complete production forecast with no production rows and cascades the next setup` includes a delayed setup 1, setup 2 on a different D3 machine family, and a later D301 queue follower.

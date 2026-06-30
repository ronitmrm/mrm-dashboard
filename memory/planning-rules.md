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
## Daily planning snapshot refresh

Date: 2026-06-30

No-production forecasts depend on the current planning date. The dashboard must not keep serving a ready snapshot from a previous calendar day without recalculation. The Convex snapshot query exposes `snapshotCacheUpdatedAt`, and the web dashboard queues a non-forced planning refresh when that cache date is older than the browser's current local date. Identical rebuilds still advance the chunk `updatedAt` so the UI does not repeatedly request the same daily refresh.

The dashboard header displays the last completed planning recalculation time from snapshotCacheUpdatedAt, separate from workbook/data updatedAt, so operators can tell when the planning cache was last rebuilt.

## Single active shop-floor setup per machine

Date: 2026-06-30

A physical machine can have only one active shop-floor setup at a time. Once any setup on a machine has non-complete shop-floor progress (`raw_material_at_machine` through `operator_started`) or is shown as running/setup-complete, later setup tasks on the same machine must stay blocked until that active setup is marked `item_complete`. `raw_material_at_machine` and later stages also lock route-family assignment to that physical machine; moving it afterward requires an explicit planner machine switch/override. The dashboard snapshot suppresses later duplicate active `shop_floor_status` rows on the same machine and adds a machine-active blocker to later queued rows, so the shop-floor first task does not appear prematurely and machine detail does not show two running setups on the same machine.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - `singleActiveShopFloorStatusRows` and `applyMachineActiveTaskReadiness`.
- `apps/web/convex/dashboard.ts` - `saveDataEntry` rejects new cross-machine shop-floor locks unless a matching part-specific machine switch exists.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `does not treat a second shop-floor start on the same machine as running until the active setup completes`.

## Correction cascade for shop-floor workflow tasks

Date: 2026-06-30

When a shop-floor workflow task is reversed from the Corrections tab, every downstream task for the same job/part/option/setup/machine must reopen as well. The cascade is `raw_material_at_machine -> presetting -> setting -> first_piece_inspection_report -> quality_approval -> operator_started -> item_complete`. Correcting an FPIR invalidates quality approval and later stages. The snapshot correction filter expands active correction targets before planning analysis, and data-entry upserts use the same expanded target set so a reopened downstream row is not reused as the current live row.

A correction cascade is time-bounded. It invalidates downstream task rows that existed at the time of the correction, but a downstream row completed after the correction must stay live. Otherwise, an old correction can keep making newly completed tasks disappear from the dashboard.

Relevant code:

- `apps/web/lib/dashboard-corrections.ts` - `dataEntryCorrectionTargetsWithWorkflowCascade`.
- `apps/web/lib/dashboard-corrections.test.ts` - regression `cascades reversed shop-floor tasks to downstream tasks on the same setup`.

## Operational actions queue planning refresh

Date: 2026-06-30

Operational rows that can change planning state must queue a planning recalculation automatically. This includes production entries (`software_raw`), RM inward, shop-floor workflow status, FPIR, and corrections that reverse those data-entry types. Master/structural changes such as route, cycle, machine master, and work-order imports stay manual through the Recalculate planning button to avoid broad unnecessary Convex snapshot rebuilds.

Relevant code:

- `apps/web/lib/planning-refresh-policy.ts` - automatic refresh allow-list.
- `apps/web/convex/dashboard.ts` - `saveDataEntry` and `reverseEntry` queue the snapshot refresh.

## Canonical dashboard source for live setup state

Date: 2026-06-30

Per-machine/per-setup live state must be read from `productionControl.machinePlanDetailRows`. Machine Detail, Shop Floor Status, role task tabs, and Job Card schedule/status badges should derive running/shop-floor state from those setup rows instead of independently trusting duplicated fields on `jobCardStatusTiles`. Job-card tile rows remain the source for static work-order fields such as job card, part, FG PO, order quantity, RM, route/cycle/tooling readiness, and planning blocker.

Relevant code:

- `apps/web/components/mrmpl-dashboard.tsx` - `JobCardTileBoard` passes planned setup rows into job-card tracking/search/filter helpers.

## Machine assignment stability band

Date: 2026-06-30

When recalculating route-machine-family assignments, compatible physical machines must not churn just because another machine is marginally lighter. Use the physical machine number as the stable default, and only let planned days already loaded, planned quantity already loaded, next available date, or current load override that stable order when the improvement is material. Current thresholds are 2 planning days for planned-days/date gaps, one setup-day of quantity for planned quantity, and 2 queued setups for current load. Production actuals, `raw_material_at_machine` or later shop-floor locks, explicit planner machine switches, and machine-unavailable constraints still override this stability band.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - `candidatePhysicalMachines` and `compareMachineAssignmentCandidate` apply the stability bands.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `keeps route-family machine assignment stable until load improvement is material`.

## Snapshot owner scope

Date: 2026-06-30

Planning snapshots still include legacy owner-scoped workbook/master rows because historical imports stored work orders and RM inward rows that way. For shop-floor status conflict resolution, current global status rows must take precedence over legacy owner-scoped active rows on the same machine; otherwise an old owner-scoped active setup can suppress a newer global RM-at-machine entry. This was observed on M93/JC-067 on ADB503.

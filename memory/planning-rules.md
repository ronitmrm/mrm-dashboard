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

Date: 2026-07-01

Workflow progress should still save and reflect in the dashboard immediately, but it should not always queue the expensive planning recalculation. Automatic planning refresh is reserved for rows that can change planning dates/capacity: production entries (`software_raw`), RM inward, machine start (`shop_floor_status` stage `operator_started`), item completion (`shop_floor_status` stage `item_complete`), and corrections that reverse those planning-impacting rows. RM-at-machine, presetting, setting, quality approval, and FPIR/report saves are workflow progress only; they should update task state without rebuilding the plan. Master/structural changes such as route, cycle, machine master, and work-order imports stay manual through the Recalculate planning button to avoid broad unnecessary Convex snapshot rebuilds.

Relevant code:

- `apps/web/lib/planning-refresh-policy.ts` - automatic refresh allow-list and shop-floor stage filter.
- `apps/web/convex/dashboard.ts` - `saveDataEntry` and `reverseEntry` pass workflow payloads into the refresh policy.
- `apps/web/lib/shop-floor-optimistic.ts` - current-browser task state updates without waiting for a planning snapshot rebuild.

## Canonical dashboard source for live setup state

Date: 2026-06-30

Per-machine/per-setup live state must be read from `productionControl.machinePlanDetailRows`. Machine Detail, Shop Floor Status, role task tabs, and Job Card schedule/status badges should derive running/shop-floor state from those setup rows instead of independently trusting duplicated fields on `jobCardStatusTiles`. Job-card tile rows remain the source for static work-order fields such as job card, part, FG PO, order quantity, RM, route/cycle/tooling readiness, and planning blocker.

Relevant code:

- `apps/web/components/mrmpl-dashboard.tsx` - `JobCardTileBoard` passes planned setup rows into job-card tracking/search/filter helpers.

## Machine assignment stability band

Date: 2026-06-30

When recalculating route-machine-family assignments, the stability rule applies to the same setup identity, not to every setup of the part or every future row. If setup 1 of a job card was previously planned on `ADB503`, setup 1 should stay on `ADB503` unless another physical machine gives a material improvement, the machine becomes unavailable, production/shop-floor actuals lock a different machine, or the planner explicitly switches it. Setup 2 of the same part remains an independent setup and may be assigned to another compatible machine such as `ADB504` when normal machine load/availability makes that sensible.

The material improvement check uses planned days already loaded, planned quantity already loaded, next available date, and current load for the previously planned machine versus the best current candidate. Production actuals, `raw_material_at_machine` or later shop-floor locks, explicit planner machine switches, and machine-unavailable constraints still override this stability rule.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - `previousMachineAssignmentsBySetup` and `stableMachineAssignmentCandidates` apply same-setup preservation.
- `apps/web/convex/dashboard.ts` - snapshot refresh passes previous `machinePlanDetailRows` into the next recalculation.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `preserves a previous machine for the same setup while downstream setup can move`.

## Snapshot owner scope

Date: 2026-06-30

Planning snapshots still include legacy owner-scoped workbook/master rows because historical imports stored work orders and RM inward rows that way. For shop-floor status conflict resolution, current global status rows must take precedence over legacy owner-scoped active rows on the same machine; otherwise an old owner-scoped active setup can suppress a newer global RM-at-machine entry. This was observed on M93/JC-067 on ADB503.
## Planning audit WIP sequence check

Date: 2026-07-01

The planning audit must not validate downstream setup sequence by simply comparing setup start dates across split/parallel machine rows. The correct audit rule mirrors planning: use cycle master daily capacity (`cycleTime + loadingUnloading`) to calculate pooled WIP from all previous-setup machine streams, apply the one planning-day WIP availability buffer, and compare that against the downstream setup's active machine demand. A future row that is already held with `Previous setup WIP buffer is not ready` is not a high-severity violation because the shop-floor task is correctly blocked; flag only rows that are released/active or missing that blocker while WIP is still short.

Relevant local audit artifact:

- `.handoff/run-planning-audit.mjs` - current local audit script used for the 2026-07-01 planning audit.
## Priority preview respects setup dependency

Date: 2026-07-01

The planner decision console's probable priority plan is only a preview, but it must still respect setup sequence. When setup 1 is delayed by a non-stoppable running machine, later setup preview windows must be pushed behind the setup 1 preview window even if their own machines are free. This prevents a priority preview from showing setup 2/3 before WIP from setup 1 can exist.

Relevant code:

- `apps/web/lib/priority-change-plan.ts` - builds target setup rows and sequence-aware preview windows.
- `apps/web/lib/priority-plan-scenarios.ts` - supports a downstream minimum start date for machine-window scenarios.
- `apps/web/lib/priority-change-plan.test.ts` - regression for M62-style setup 1 delayed on AC701 while setup 2/3 machines are free.

## Priority queue position is planner-controlled

Date: 2026-07-01

A priority change must not hard-code downstream machine queue placement. For each setup, the planner can place the priority setup at position 1, after a selected queued setup, or at the current queue position. The preview and the actual recalculation both persist this as `queueBeforeSetups`: setup rows listed there must remain ahead of the priority setup for that specific target setup number. This lets a downstream machine fill useful work before WIP is available without silently delaying the priority part beyond the planner's chosen position.

Relevant code:

- `apps/web/lib/priority-change-plan.ts` - preview queue-position choices and `queueBeforeSetups` payload.
- `apps/web/components/mrmpl-dashboard.tsx` - planner decision console queue-position selector.
- `apps/web/lib/legacy-dashboard-analysis.ts` - machine queue sorter honors held queue rows before applying priority preemption.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression for keeping a selected SA705 queued setup ahead of M62 priority work.
## Priority queue placement preview UI

Date: 2026-07-01

The planner decision console should show priority queue placement as a draggable priority setup tile inside the affected machine queue, not as a dropdown. Moving the tile before/after queued setups updates `queueAfterByStep`, which recalculates the probable setup windows for all target setups immediately. The saved backend contract remains `queueBeforeSetups`, so execution still honors the queued setup rows that the planner left ahead of the priority setup.

Relevant code:

- `apps/web/components/mrmpl-dashboard.tsx` - `PriorityQueuePlacementBoard` and `PrioritySetupPreviewSummary`.
- `apps/web/lib/priority-change-plan.ts` - queue placement state feeds `priorityPlanStepWindows` and `priorityPlanQueueBeforeSetups`.

## Machine unavailable / breakdown planning

Date: 2026-07-01

Machine-unavailable constraints are date-window constraints, not only machine-selection filters. During recalculation, `shift_required` and `shift_all` should avoid the unavailable physical machine only when an unlocked setup has a viable alternate. If a setup is already physically locked by raw-material-at-machine or later shop-floor progress, or if no alternate machine exists, the setup stays on that machine and the production forecast moves after the unavailable window. That delayed production end must cascade through the rest of that machine queue and downstream setup WIP dates.

The planner console should review affected setup rows before saving a machine issue. Locked rows are shown as delayed on the current machine; planned/unlocked rows are shown as shift-if-alternate candidates.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - machine-unavailable windows feed assignment and production-date delay.
- `apps/web/components/mrmpl-dashboard.tsx` - `MachineConstraintPlannerForm` shows affected queue before saving.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `delays a locked running setup on an unavailable machine and cascades that machine queue`.

## Running breakdown quantity split

Date: 2026-07-01

If a machine-unavailable/breakdown window is saved while the affected machine is running, the planner must enter the produced quantity for that running setup before the issue is saved. Planning treats that quantity as real produced WIP on the stopped machine and replans only the remaining quantity onto compatible alternate machines when possible. Alternate-machine selection still uses the normal route-machine rules and must keep the 25-day dispatch target from RM inward date in mind. If no viable alternate exists, the remaining quantity is delayed after the unavailable window on the original locked machine.

Relevant code:

- `apps/web/components/mrmpl-dashboard.tsx` - machine issue review requires produced quantity for running rows and records system-recalculation/review choice.
- `apps/web/lib/legacy-dashboard-analysis.ts` - splits produced quantity from remaining quantity and schedules the remaining quantity on alternates using all planning rules, including the 25-day dispatch target.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `moves remaining running breakdown quantity to an alternate machine using system planning rules`.

## Machine breakdown queue review

Date: 2026-07-01

When a planner chooses review-before-save for a machine-unavailable/breakdown action, the review must show the affected rows on the unavailable machine and only the queue that the planner is directly deciding. For `shift_required` or `shift_all`, show compatible destination queues where the unavailable-machine work can be shifted; compatibility must follow the planning route-machine family rule, so machine type alone must not pull in unrelated machine families. For `delay`, show the later queue on the same unavailable machine. Do not show downstream setup queues in this review step; downstream same-part/setup WIP changes are recalculated automatically after the planner saves the machine action.

Relevant code:

- `apps/web/lib/machine-constraint-review.ts` - computes route-family destination, same-machine, and optional downstream queue review groups.
- `apps/web/components/mrmpl-dashboard.tsx` - renders the queue review panel and confirmation gate.
- `apps/web/lib/machine-constraint-review.test.ts` - regression for destination-only review, automatic downstream cascade, and DT501-style same-type unrelated machine exclusion.

## Part-specific machine switch queue review

Date: 2026-07-01

A part-specific machine switch is not a whole-machine queue move. Before saving the switch, the planner must review the selected job/part/setup row and the chosen destination machine queue only. The review must not show the source machine's later queue or downstream setup queues as if those rows are being directly moved; once the selected setup is shifted, normal planning recalculation applies downstream same-part/setup WIP rules automatically.

Relevant code:

- `apps/web/components/mrmpl-dashboard.tsx` - `PartMachineSwitchPlannerForm` replaces the legacy generic switch form with queue review and confirmation.
- `apps/web/lib/machine-constraint-review.ts` - supports explicit destination machines and optional source-machine queue suppression.
- `apps/web/lib/machine-constraint-review.test.ts` - regression coverage for selected-destination-only review and no source-machine later queue in part switches.

## Machine breakdown moved-item queue placement

Date: 2026-07-01

When `review_then_plan` is selected for a machine-unavailable/breakdown action with `shift_required` or `shift_all`, the affected movable setup rows must be shown as draggable tiles in the compatible destination queue review. The planner's tile placement is saved as `queuePlacements`, including the target setup, destination machine, and existing queue rows kept ahead of that moved setup. During recalculation, the destination machine from the reviewed placement is preferred for that moved setup, listed blockers stay ahead, and active/running destination rows still cannot be bypassed. Family idle-gap balancing must not silently insert other work ahead of a reviewed moved setup unless the planner explicitly kept that work ahead.

Relevant code:

- `apps/web/components/mrmpl-dashboard.tsx` - `MachineConstraintQueuePlacementBoard` and `machineConstraintQueuePlacements`.
- `apps/web/convex/dashboard.ts` and `apps/web/convex/schema.ts` - machine constraint `queuePlacements` persistence.
- `apps/web/lib/legacy-dashboard-analysis.ts` - machine-unavailable placement parsing, assignment override, final queue ordering, and idle-gap guard.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `honors reviewed destination queue placement for a machine-unavailable shift`.

## Cumulative WIP feasibility for downstream setups

Date: 2026-07-02

A downstream setup may start before the previous setup has completed only when the previous setup's cumulative produced/planned WIP can feed the downstream setup continuously for its planned run. For breakdown splits, stopped-machine WIP may unlock the next setup only when that produced quantity can feed the downstream setup for 15 planning days or complete the order, whichever quantity is lower. If stopped-machine WIP is below that threshold, the downstream setup must wait for the later remaining-quantity setup 1 stream, while still counting the stopped-machine quantity as available WIP once the delayed run starts. Do not reuse the stale ideal cycle stream from before the breakdown/under-production event.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - `plannedWipBufferReadyDate`, `downstreamWipFeasibleStartDate`, and `downstreamWipRunIsFeasible` calculate cumulative WIP availability through the downstream run.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `waits for the later setup 1 stream when stopped-machine WIP cannot feed 15 days`.

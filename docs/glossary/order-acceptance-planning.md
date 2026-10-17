# Order Acceptance Planning

Order Acceptance Planning belongs to Planner Actions and evaluates a **Proposed
Order** before Purchase confirms a PO. It does not create or change purchase
orders, job cards, reservations, priorities or production commitments.

1. Upload proposed lines with stable line references, product, route option and
   quantity. Load existing pending work for the selected production unit.
2. Export an RM-date workbook containing pending existing lines without material
   and every proposed line. The planner supplies production-ready RM dates.
   Blank dates remain unknown; no tentative completion is promised for them.
3. Calculate tentative line completion using remaining operations, actual cycle
   times, active machines and the working calendar. This workflow plans machining
   only. The full start-to-deadline period is available for machining; no separate
   finishing, inspection or packing allowance is added.
4. Optionally set a machining deadline and select complete proposed lines. Ignore
   individual RM dates in this capacity-only selection. An optional common
   tentative RM availability date sets the earliest start for all proposed lines;
   when blank, assume readiness at the machining start. Existing waiting work
   retains its capacity-only readiness assumption. Protect existing commitments first. Compare candidate mixes by
   completed line count, then machine-family utilisation. Report the search
   method honestly; a heuristic is not a proven global optimum.
   Existing work may finish after the proposed order's deadline. Reserve that
   work first across the two-year planning horizon, then select only new lines
   that fit the original deadline. A busy machine excludes dependent proposed
   lines without blocking products on other available machines.
5. Report the RM-ready deadline supporting each selected schedule. Dispatch
   remains conditional on material being ready by this date. Family output
   capacities cannot be summed as finished output across shared routings.
   Existing-work warnings describe the jobs to resolve once; proposed lines stay
   awaiting this check rather than being reported as individual capacity failures.
6. Planner approval freezes the reviewed proposal and ends this workflow.
   The planner obtains Purchase approval separately and manually enters the
   confirmed PO in the existing Purchase Order flow. Corrections create a new
   proposal revision and repeat checks; approved revisions remain unchanged.

Plans are estimates, not shop-floor instructions. Missing master data or unknown
existing workload prevents approval rather than silently treating it as zero.
For forecasting only, tooling occupancy uses each active setup's latest complete
Tooling Master requirement. Superseded code links do not consume forecast capacity.
Requirements without a complete saved definition retain their recorded occupancy.
This read-only interpretation does not change Tooling Master, actual start checks,
published production plans, machine assignments or production activity.
Proposed orders run through the production planner in memory, including automatic
parallel machining, tooling capacity, machine continuity, queue settlement,
unavailable windows and WIP supply. Existing commitments retain their published
assignments and dates. Automatic parallel splits retain the normal minimum
15 production days per machine; planner-only overrides are not invented for a
proposal. Productive daily hours come from the selected unit's production planner.
Proposed setup forecasts use the production planner's WIP readiness rule:
accumulate two downstream production days of supply, or three when upstream
production is slower, capped at the line quantity. Downstream production may
overlap on a separate compatible machine only when projected supply supports
the full run without starvation. Eligible operations may use parallel machines,
with their supply pooled by the production planner. This
forecast does not bypass recorded-WIP gates in actual shop-floor execution.
Changed inputs or refreshed workload require recalculation before approval.
Machine-family labels match without regard to capitalization. Closed planner
constraints, including those marked Available, do not reserve machine capacity.
Existing physical WIP retains its canonical machine reservations even after
final good output meets customer demand. Demand completion alone does not finish
a setup or free its capacity.
An approved route change with zero remaining machining and a recorded canonical
Actual Finish Date needs no new machine assignment. Unfinished physical machine
streams still retain their reservations. RM rejected with the saved decision to
wait for replacement is treated as awaiting RM: retain completed setup output and
schedule the remaining quantities. RM-date mode requires an assumed replacement
date; deadline mode assumes readiness at the planning start like other waiting RM.
An approved proposal reserves no capacity; a later PO needs current capacity
review if intervening commitments have changed.

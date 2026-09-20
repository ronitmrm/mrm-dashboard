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
   times, active machines and the working calendar. Include an explicit allowance
   for finishing, inspection and packing before dispatch.
4. Optionally set a dispatch deadline and select complete proposed lines. Ignore
   tentative RM dates in this capacity-only selection, including existing waiting
   work, but protect existing commitments first. Compare candidate mixes by
   completed line count, then machine-family utilisation. Report the search
   method honestly; a heuristic is not a proven global optimum.
5. Report the RM-ready deadline supporting each selected schedule. Dispatch
   remains conditional on material being ready by this date. Family output
   capacities cannot be summed as finished output across shared routings.
6. Planner approval freezes the reviewed proposal and ends this workflow.
   The planner obtains Purchase approval separately and manually enters the
   confirmed PO in the existing Purchase Order flow. Corrections create a new
   proposal revision and repeat checks; approved revisions remain unchanged.

Plans are estimates, not shop-floor instructions. Missing master data or unknown
existing workload prevents approval rather than silently treating it as zero.
Changed inputs or refreshed workload require recalculation before approval.
Existing physical WIP retains its canonical machine reservations even after
final good output meets customer demand. Demand completion alone does not finish
a setup or free its capacity.
An approved proposal reserves no capacity; a later PO needs current capacity
review if intervening commitments have changed.

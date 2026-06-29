# Planning Rules

Date: 2026-06-29

## No production actuals after shop-floor progress

When a setup has reached shop-floor progress at `setting` or later but has no production entry, planning must not treat old planned production days as produced WIP. The production forecast should move forward to the current planning date until a real production entry exists.

Relevant code:

- `apps/web/lib/legacy-dashboard-analysis.ts` - `rescheduleMachineQueues` separates machine queue locking from actual production start and uses `unenteredProductionForecastStartDate`.
- `apps/web/lib/legacy-dashboard-analysis.test.ts` - regression `moves a setup-complete production forecast with no production rows and cascades the next setup`.

Once production is entered, the first production date is the actual production start and locks the production schedule. Shop-floor start/progress still locks queue order, but it is not a production actual.
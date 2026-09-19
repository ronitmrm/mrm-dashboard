# CNC fresh start

Canonical rules: [Production sessions](../glossary/production-sessions.md#cnc-fresh-start-transition).

Import only completely unstarted Job Cards using normal Work Order entry/import.
Keep existing CNC masters. Record material readiness and route selection through
the normal application workflow, then plan assuming machines are idle. A machine
starts its new queue only after its entire old-system queue is finished. Record
actual session timestamps; initial planned dates may precede actual dates.

The old opening-balance importer and its runtime calculations are retired.
Applied database migrations 0154/0157 remain immutable historical records.
Migration 0159 removes the opening schema only when its tables are empty; the
authorized operational reset is separate, never part of a schema migration.
Deploy the updated web and worker code before applying 0159 because older
versions still query the opening tables. Do not run the retired import scripts.

Retain the general fixes made during startup: separate Job Cards may share an
FG PO/part, master source budgets cover 5,000 rows, and normal planner/session
ownership rules continue to apply.

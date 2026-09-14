# Order Acceptance Planning

Business contract: [Order Acceptance Planning](../glossary/order-acceptance-planning.md).

Planner Actions links to `/order-acceptance?floor=<code>`. The page and API require
the selected floor's Planner Actions read capability. Mutations additionally
require `operations.floors.<code>.planner_actions.order_acceptance.write`.

`apps/web/lib/order-acceptance.ts` schedules complete batches, each operation on
one compatible machine, with sequential routing. Four deterministic line orders
are compared in deadline mode by completed line count then utilised hours. This
is a heuristic, not a proof of globally optimal selection. Splitting a batch
across machines is not assumed. Input-order scheduling is used in RM-date mode.

The adapter in `order-acceptance-context.ts` reads the canonical floor snapshot:
route/cycle masters, active machines, pending work, machine plan dates and holidays.
Received existing work retains its canonical machine reservations, conservatively
occupying its assigned working dates. Waiting-RM work is scheduled before proposed
lines. Unknown remaining work, overdue unrefreshed schedules, ambiguous masters
and truncated source snapshots block approval. The first scheduled operation's
date is reported as RM required by for that schedule, not a global latest-start
optimisation. Finishing/inspection/packing use an explicit calendar-day allowance.

`order-acceptance-workbook.ts` implements the browser Excel round trip. Template
headers identify line reference, product, route option, quantity pcs and RM date.
RM uploads match proposal reference, source, line, product and quantity and require
all exported lines. Planner dates use YYYY-MM-DD.

Migration 0145 adds `manufacturing.order_acceptance_proposals`. Draft saves use
optimistic version checks. Approval recalculates on the server, compares the saved
inputs/result to the fresh calculation, and freezes the record. A database trigger
rejects updates/deletes of approved records. Revisions reference the approved
source but are independent drafts. No purchase-order or production write is made.

The register shows the latest 100 proposals for the unit. Proposal uploads are
limited to 1,000 lines and 5 MB; the JSON API is limited to 1.5 MB. Plans use a
maximum two-year horizon. Shared database migration is separate from application
deployment; local and production both use staging.

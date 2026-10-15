# Order Acceptance Planning

Business contract: [Order Acceptance Planning](../glossary/order-acceptance-planning.md).

Planner Actions links to `/order-acceptance?floor=<code>`. The page and API require
the selected floor's Planner Actions read capability. Mutations additionally
require `operations.floors.<code>.planner_actions.order_acceptance.write`.

`apps/web/lib/order-acceptance.ts` schedules complete batches, each operation on
one compatible machine, with forecast-WIP overlap between route setups. It reuses
`plannedWipBufferReadyDate` from the canonical production planner, including its
two/three-day buffer, next-working-day planned supply and starvation check.
Four deterministic line orders are compared in deadline mode by completed line
count then utilised hours. For families with rejected lines, a longest-family-work
first queue refinement is evaluated at the same positions in the winning order;
only a better score is retained. This
is a heuristic, not a proof of globally optimal selection. Splitting a batch
across machines is not assumed. Input-order scheduling is used in RM-date mode.
Deadline mode accepts an optional common `tentativeRmDate` for proposed lines.
Their earliest start is the later of that date and `startDate`; blank retains
the existing start-date assumption. Existing workload is reserved first without
applying this proposed-order date. The date is saved with the proposal and
included in the exported assumptions; changing it requires recalculation.

The adapter in `order-acceptance-context.ts` reads the canonical floor snapshot:
route/cycle masters, active machines, pending work, machine plan dates and holidays.
Route operation and machine-family keys are normalized to uppercase before
scheduling; constraint activity uses the shared `isActivePlannerDecision` rule.
Received existing work retains its canonical machine reservations, conservatively
occupying its assigned working dates. Waiting-RM work is scheduled before proposed
lines across the two-year horizon; the proposal deadline limits new lines only.
Canonical Actual Finish Date can prove completed work without a new assignment,
including zero-remaining route changes. Replacement-RM waits use recorded good
output per setup to schedule remaining quantities, with an assumed RM date in
RM-date mode. Unknown remaining work, overdue unrefreshed schedules, ambiguous masters
and truncated source snapshots block approval. The first scheduled operation's
date is reported as RM required by for that schedule, not a global latest-start
optimisation. Completion is the last machining operation's date. No additional
finishing, inspection or packing days are accepted or applied, including when
recalculating older drafts that retained that input. Approved records stay frozen.
The persisted `dispatchDays` field is always written as zero to preserve the
saved-proposal format; it is not editable or used by the scheduler.

The workspace separates order details, product upload and capacity review. RM
dates appear only in the RM-date mode. Existing-work blockers are grouped into
one action list with job/product references; blocked proposed rows are not shown
as individually rejected. Detailed scheduling assumptions and family hours use
disclosures to keep the first view focused on the next action.

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

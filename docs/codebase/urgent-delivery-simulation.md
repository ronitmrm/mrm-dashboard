# Urgent Delivery Simulation

Planner Actions contains a separate Urgent Delivery Simulation action. Search by
Job Card Number or Part Code, select one unfinished job, review its current
probable machining finish, then enter the preferred finish date.

`urgent-delivery.ts` uses the canonical dashboard planning calculation with the
same source inputs as the published plan: recorded production, shop-floor
states, route/cycle/tooling masters, allocations, calendar, existing decisions
and machine continuity. It compares the current plan, idle-queue urgency and
complete scenarios with compatible moves, two machines, three machines and up to
eight tooling-supported compatible machines per setup (at most five alternatives,
including idle-queue urgency). It prefers fewer changes once the
requested date is met. This search is not a proof of a global optimum.

The scope is the full remaining quantity. Prepared/running setups keep their
machines. Additional machines queue behind their current executing setups.
Downstream assignments retain normal recorded-WIP gates. The result reports
current/preferred/proposed finish, setup-machine quantities, proposed actions
and revised finish dates for other affected jobs. Material waits, missing target
masters, absent current forecasts, truncated source reads and planner conflicts
prevent approval. Inspection, packing and dispatch allowances remain separate.

Simulation writes nothing. Approval recalculates from current canonical sources
in a serializable transaction, compares the reviewed workload/result fingerprint,
locks the Job Card and applies the existing priority/override repository actions
in one transaction. A failure rolls all actions back. Priority history retains
the complete approved proposal and fingerprint. Duplicate approvals are rejected.
Input changes clear the preview. Approved proposals do not change delivery
ratings or promised dispatch dates.

The API requires the unit's Planner Actions read permission. Approval additionally
requires both existing priority and machine-plan override write permissions.
No new schema, permission grants or production-data patch is required.

# Quality reports

Dashboard contains Daily Quality, Inspector Approvals, Machine Rejection,
Defect Rejection and Shift Quality. Individual charts can be selected and ordered
on My Dashboard. Filters default to today's IST calendar date at both ends;
inclusive date ranges and permitted production units apply to charts and totals.

Production includes every setup operation, not unique finished pieces. Total
production is accepted plus rejected; rejection percent is rejected divided by
that total. Session-linked production entries are excluded to avoid duplication.
Reversed records are excluded. All production rejection types are combined.
Session defects use the session's production date, matching its output and shift,
rather than the later date when somebody entered the rejection.
Additional Checking/Assembly/QC rejection entries are separate from machine
production and do not change these operation-level rejection percentages.

Setting Done raises a first-piece request. Each request remains pending,
including Not OK, until its first successful QC inspection or its request closes.
A later Setting Done replaces the previous request; a recorded QC approval,
production start, item completion or planner release also closes its pending wait.
These closures do not invent inspection approvals or elapsed-time measurements.
Historical ranges retain requests that were still waiting at that cutoff.
Repeated Setting Done events define separate request windows. Daily status bars
show approvals completed on each date and all requests still pending at that
IST day's end, including earlier requests. Today's pending count stops at the
current instant and matches the first-piece requests awaiting QC approval for
the same permitted units; downtime restart tasks are separate. Future dates do
not project today's pending requests forward. Shift status bars show approvals
completed in the selected range and outstanding requests at its cutoff,
including earlier requests, grouped by the Setting Done shift. Approvals and
elapsed-time trends count approvals completed in the selected range.
Pending before range means outstanding at its start;
pending at range end includes earlier outstanding requests. Future ranges are
capped at the current instant when evaluating status. Elapsed time includes
overnight/non-working hours. Shift comparisons attribute status and approval
time to the Setting Done shift. An explicit Setting shift takes precedence;
otherwise its timestamp determines the configured shift. Other jobs' production
sessions cannot supply that shift. Missing shift context is shown as Unspecified.
An inspection must belong to its original Setting task, before replacement or
release/completion. Late submissions cannot approve a replacement task or inflate
elapsed approval time; saved historical reports remain available for correction.
Active quality employees appear even without approvals; historical approving
inspectors remain visible in the selected range.

Expected hourly checks are complete hours of recorded actual machine running
time, accumulated per machine and IST date across sessions. Downtime and scheduled
breaks do not contribute. A partial final hour creates no expectation: 10h20m
means 10 checks. Each obligation matches at most one check for the same machine,
Job Card and setup in its actual clock-hour slot; duplicate checks cannot cover
other hours. Hours spanning pauses retain only their running intervals. The shift
where a running hour completes owns that expectation. Missed = expected minus
matched completed checks. Older output without timed sessions contributes to
production but cannot create inferred hourly expectations.
Open sessions stop contributing at their configured shift end; an overdue
unclosed session is not evidence that the machine ran continuously afterwards.

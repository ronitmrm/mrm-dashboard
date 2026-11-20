# Work Order Planning Handbook

MRMPL Dashboard | Draft for business review | 19 November 2026

## 1. Purpose and scope

This handbook explains how a planner plans a Work Order in the current application: what information is needed, how dates and machine assignments are calculated, and how to handle changes during production.

It describes the local application source reviewed on the date above. It does not certify which version is deployed. Examples are illustrative, not live Job Cards or promised dates. This document creates no orders, production records, planner decisions, or capacity reservations.

The handbook covers Conventional-01, Conventional-02, CNC-01, and Forging. Each unit has its own planning workload, machines, routes, and production records. A machine in another unit is not automatically available to this unit.

## 2. Terms every planner must distinguish

| Term | Meaning for planning |
| --- | --- |
| Work Order / Job Card | The customer production requirement being planned. Select the exact Job Card and part; several Job Cards can share a Part Code. |
| Route option | The selected manufacturing method, containing the ordered sequence of setups. |
| Setup | One operation in the selected route, with its own machine family, cycle standard, tooling, and quality requirements. |
| Machine family | The explicit compatibility group in Machine Master, such as D5. It is not a physical machine. |
| Physical machine | An actual active machine, such as D501, that can own a setup and perform production. |
| Good output | Accepted pieces after production rejection. Only good output supplies the next setup. |
| Total processed output | Good plus rejected pieces. Both consume input material/WIP. |
| WIP | Good output from an earlier setup still requiring later operations. It is not finished customer output. |
| Forecast | An estimate of future work and finish dates. It can include downstream setups that do not yet reserve machines. |
| Machine reservation | An assignment that occupies a physical machine's plan. Forecast WIP alone normally does not create a downstream reservation. |
| Item Complete | A recorded setup completion event. Meeting the customer quantity alone does not record this event or release every physical stream. |
| Dispatch | Shipment of recorded final-setup good pieces. Production completion and dispatch are separate events. |

**Core principle:** plan the full route, reserve machines according to readiness, and preserve recorded production.

## 3. Where the planner works

| Workspace | Planner's purpose |
| --- | --- |
| Operational Entry → Work Order | Check the Job Card, part, ordered pieces, unit, and entered Required RM (kg). |
| Operational Entry → RM Inward | Record actual receipts against the correct Job Card, with date, kilograms, and optional receipt location. |
| Part Readiness | Resolve missing route, cycle, tooling, machine, and other required master details. Production Validation shows received-material work; Whole Work-Order Missing Details also includes other pending work. |
| Master Data | Correct the underlying production masters. Fix an incorrect source record instead of compensating with a planner decision. |
| Machine Detail / machine plan | Review assigned machines, sequence, quantity, dates, load, and constraints. |
| Job Cards → selected activity | Review full-route progress, material, current finish, history, production, and delivery. |
| Planner Actions | Review and save a priority change, machine issue, move, parallel machine, early Setup 2, route change, RM rejection, release, or reopening. |
| Planning Control / Planning Review | Resolve planning gaps, RM shortage reviews, workflow exceptions, session flags, and delivery reminders. |
| Production Sessions / Shop Floor | Record actual setup execution, output, downtime, quality, and completion. Planner approval does not replace these steps. |

Actions depend on the signed-in user's permissions for the selected unit. Read access does not imply permission to save a planner decision.

## 4. Standard planning procedure

### Step 1 — Identify the requirement

1. Select the production unit and exact Job Card.
2. Verify the Part Code, ordered pieces, and customer requirement.
3. Check whether this is Original production, Rework, or Replacement. Select the correct revision/activity before reviewing quantities.
4. Confirm the Work Order's Required RM (kg). This is an entered requirement, not a calculation from finished-goods kilograms or piece weight.
5. Check whether the Job Card is cancelled, finally dispatched, waiting for replacement RM, or subject to an existing planner decision.

### Step 2 — Establish material availability

1. Check actual RM receipts and rejections in the Job Card RM ledger.
2. Verify that each receipt belongs to this Job Card/activity.
3. Check usable kilograms, shortage, and receipt locations where recorded.
4. Distinguish the first receipt date used for initial material availability from the full-RM receipt date used by delivery targets.
5. For later setups, check recorded good WIP from the preceding setup rather than treating fresh RM as their direct input.

### Step 3 — Select and validate the route

1. Original Job Cards with one route option use that option automatically.
2. If multiple options exist, select the intended route explicitly.
3. Existing Job Cards retain their earlier automatically selected option when another option is added.
4. Rework and Replacement activities always require explicit route selection, even when only one option exists.
5. Resolve the missing details listed in Part Readiness for the required setups. Never interpret an absent master as a zero cycle, unlimited tooling, or an available machine.

### Step 4 — Review the calculated plan

For each setup, review the machine family, physical machine assignment, remaining quantity, cycle capacity, tooling status, earliest input availability, and planned dates.

Review the complete Job Card finish, including downstream operations. A downstream setup can contribute to this forecast while still waiting for recorded WIP before receiving a physical-machine reservation.

### Step 5 — Decide whether intervention is needed

Use normal automatic planning when the result is acceptable. If intervention is needed, choose the specific Planner Action and review its impact on the target Job Card and other affected work. Do not stop a running setup merely to make a preview look earlier.

### Step 6 — Save and verify

1. Complete any required Production Session settlement before confirming a stop or move.
2. Save the reason, selected setup/machine, and reviewed queue position.
3. Wait for the planning refresh to publish the updated plan.
4. Verify the machine queue, affected Job Cards, remaining quantities, and full-route finish.
5. Check Decision History and Production Session references for traceability.

## 5. Rules for material and readiness

| Rule | Required interpretation |
| --- | --- |
| Receipts accumulate | Every valid RM receipt adds kilograms; later receipts do not replace earlier receipts. An exact import retry must not add the same receipt twice. |
| First receipt | Planning uses the first effective receipt date for initial RM availability. It does not wait for full RM merely to begin planning or material placement. |
| Usable RM | Cumulative received kilograms minus active RM rejection kilograms. |
| Required RM | Must be entered on the Work Order. Blank means unknown, not zero or fully received. |
| Shortage flag | Appears after some RM is received when usable RM is below 95% of a known requirement. Exactly 95% is within the allowance. No receipt produces no shortage flag, but does not make the job ready. |
| Shortage and start | The 95% rule is a shortage/completion control. It is not a universal requirement to receive 95% before moving material or starting setup. Other readiness gates still apply. |
| Item Complete | Requires the RM requirement to be entered and usable RM to reach 95%, or a valid explicit Accept short RM decision with a reason. |
| Short RM acceptance | Preserves the reviewed balance, person, and time. Does not change receipts or the order quantity. A higher requirement or reduced usable balance requires renewed review. |
| Release while waiting | Releasing a machine does not accept a shortage or mark the setup complete. |
| Replacement wait | Do not invent a future receipt date. Resume through actual replacement receipts and normal replanning. |
| Receipt location | Describes storage for that receipt. It is not downstream WIP location or a stock-transfer record. |
| Receipt correction | A mistaken receipt can be reversed with a reason. Current balances and unlocked planning change; recorded production and audit history remain. |

RM Inward CSV receipt dates use `DD-MM-YYYY`. An invalid date rejects the upload before saving receipts. The separate Order Acceptance RM-date workbook uses `YYYY-MM-DD`.

Updating only Required RM through its dedicated CSV action changes material checks but does not itself recalculate the published machine plan. Updating only RM locations also needs no planning recalculation.

## 6. Rules for routes, machines, and tooling

### Routes and masters

- Route Master defines the setup sequence, operation, and machine family. Cycle and Tooling masters refer to that route setup.
- Machine Type comes from the family's Machine Master records. Conflicting or missing family types require correction at source.
- Adding/removing/reordering setups in a selected or used route requires a new route option. A different manufacturing method also requires a new option.
- Correcting a master family can affect queued/future work. It does not move a physically committed or running setup.
- A live Job Card route change is an explicit Planner Action, not an incidental result of editing a master.

### Machine eligibility and assignment

- Use active physical machines in the selected unit with the complete matching explicit Machine Family and required type. A machine's number/name does not establish its family.
- `T25` and `T26` are different families. Family matching ignores capitalization, not the actual family value.
- If the family has no eligible active physical machine, flag a Machine Master gap. Never schedule on the family code as a substitute machine.
- Automatic assignment considers planned days, planned quantity, next availability, existing load, and stable machine ordering.
- Recalculation prefers a feasible previous assignment unless a meaningful improvement or constraint justifies moving unstarted work.
- Recorded setup commitment, production actuals, and running work retain physical-machine ownership until an authorized action releases or moves them.
- A setup at RM at Machine or a later execution stage cannot simply be shuffled behind other work by automatic queue balancing.

### Tooling capacity

- A free compatible machine is insufficient when required tooling is unavailable.
- Review usable stock, quantity allocated to the unit, occupied quantity, and free quantity. Stock still in Store is not automatically allocated production capacity.
- Shared tools/fixtures can force jobs to run sequentially even when multiple machines exist.
- Tooling limits both start dates and feasible parallel-machine counts. Follow explicit Not Required definitions where applicable; an absent definition is not proof that tooling is unnecessary.
- Releasing/completing work and changing allocations can change future tooling availability. Recalculate and verify the result.

## 7. How duration and dates are calculated

### Production capacity

For normal piece-cycle operations:

`Seconds per piece = Cycle Time + Loading / Unloading Time`

`Remaining machining hours = remaining good pieces × seconds per piece ÷ 3,600`

`Full-day capacity per machine = productive hours × 3,600 ÷ seconds per piece`

| Unit | Productive hours per full working date |
| --- | --- |
| CNC-01 | 22.5 hours: three shifts of 7.5 productive hours |
| Conventional-01 | 8 hours |
| Conventional-02 | 8 hours |
| Forging | 8 hours |

These are forecasting hours, not the full elapsed attendance span of a shift. Machine queues, setup readiness, tooling, upstream supply, and unavailable windows can push the result later than the simple calculation.

Production Session targets are a separate measure: the start form shows capacity from the entered start through shift end, minus scheduled breaks. Recorded downtime reduces the open-session target dynamically; overlapping breaks and downtime count once. On closure, the final target uses the actual session end. Elapsed productive runtime remains separate from the full-session target.

**Blasting exception:** Cycle Master uses standard net batch kilograms and total batch minutes, including normal loading/unloading. Planning and session targets use that batch rate, not a manually entered seconds-per-piece standard. Route piece weight and weighed output retain the connection to Job Card pieces and downstream WIP.

- Recorded good output reduces the balance. The forecast does not replace Cycle Master capacity with average historical daily output.
- Following recorded production, the remaining machining forecast starts from the next working Production Date after the latest recorded production, subject to other constraints.
- A cycle revision applies to remaining work no earlier than its effective date. Saved production remains unchanged. Open sessions use the revised standard; closed sessions retain their saved standard unless explicitly corrected.
- Forecast finishes can show productive hours into the last working date. This is not a promised wall-clock finishing time.
- Machine queue reservations use whole production dates; a fractional finish does not automatically advertise the remainder of that date as a free queue slot.
- Production start is a forecast until actual start is recorded. Delayed setup readiness moves the forecast; actual production locks its historical start.
- Overdue unstarted work must be refreshed from the current planning date. An old availability date does not justify leaving future work planned in the past.

### Working calendar

- Friday is the default weekly off.
- A dated Working Friday opens its selected unit or Whole Factory.
- Holidays can close all shifts or a named shift. CNC A/B/C each removes 7.5 productive hours; a General shift closure removes 8 hours in the other units.
- Overlapping holiday records close a shift once. A holiday takes precedence over a Working Friday.
- A date with some remaining capacity still counts as a working date for delivery targets, while machining capacity is reduced.
- CNC Production Date changes at 06:00 IST. Shift C belongs to the date it started, including its after-midnight hours.
- Calendar offs reduce forecast production capacity. They do not themselves prohibit planning, setup preparation, or setup start. Actual material, WIP, tooling, ownership, and explicit machine-unavailable constraints still apply.

### Four different dates

| Date | Meaning |
| --- | --- |
| Planned Finish Date | Immutable first valid full-route forecast linked to the first RM receipt baseline. It finalizes after all required setup readiness is available. Later recalculation does not overwrite it. Legacy jobs without this evidence show Not recorded. |
| Current Estimated Finish / probable machining finish | Latest full-route forecast using remaining work and constraints. It can change. A screen label mentioning probable dispatch is not evidence of actual shipment. |
| Actual Finish Date | Recorded final-setup Item Complete date, after all its planned machine streams complete. Not derived from a forecast or dispatch date. Approved equivalent completed work through route changes follows its recorded completion evidence. |
| Dispatch Commitment | Calendar date promised for dispatch of the selected Job Card revision. A promise/reminder, not a machine-priority instruction or machining calculation. |

The delivery working-day target is separate: Product Master default or Job Card override, counted after full RM receipt. Full receipt is when cumulative received kilograms first reach the entered Required RM. Ratings are A: on time; B: 1–2 working days late; C: 3–5 late; D: more than 5 late.

## 8. WIP and downstream planning

### Common pool

All machines working on the preceding setup contribute good output to a common pool for the next setup. There is no fixed machine-to-machine pairing.

`Physical WIP available = max(0, preceding setup pooled good output − next setup total processed output)`

Rejected upstream pieces do not enter the good pool. Downstream rejections consume input stock. Recorded good output can support the next setup on the same working date; there is no automatic extra transfer day. Forecast output becomes available after its production date because its within-day completion time is unknown.

### Normal buffer gate

An unstarted downstream setup normally receives a physical-machine reservation only after recorded upstream good output satisfies the pooled buffer for its assigned machine count.

`Required buffer = downstream combined daily capacity × buffer days, capped at the quantity being planned`

Use two production days, or three when upstream supply is slower than downstream consumption. The actual-readiness calculation can use recorded upstream good output per recorded production date to assess that comparison; following a cycle revision it uses the revised cycle capacity. Duration forecasting remains cycle-based.

Adding downstream machines increases combined consumption and can increase required WIP. Review the displayed buffer for the actual proposed machine count.

Before this gate is met, compatible machines remain available to other RM-ready or WIP-ready work. The full-route forecast still includes the waiting setup.

Once the normal actual buffer is met, a downstream setup may start even if later upstream production will still be needed. Its finish forecast must account for that supply. If every upstream stream is Item Complete below order quantity, plan the stock that actually exists; do not wait for hypothetical additional output from a completed setup. Customer shortfall remains visible separately.

### Early Setup 2 exception

Planner Actions → Plan Setup 2 Early can reserve a separate idle compatible machine before the normal buffer is recorded, with an explicit reason. It applies to the selected Job Card's Setup 2, not every downstream operation or other Job Cards.

Preparation may proceed, but machine start requires positive recorded Setup 1 good output. Setup 2 cumulative processed pieces cannot exceed recorded upstream supply. When WIP runs out, production waits. The exception does not create WIP or bypass setup/quality steps.

## 9. Queue order, continuity, and parallel machines

### Queue order

Initial work-order ordering considers planner priority first, then delivery date, RM date, and Job Card number. Named priorities score Urgent/Top/Critical highest, then High, Medium/Normal, and Low. No saved priority is distinct from an explicit priority decision.

The final machine queue also respects actual execution, reviewed planner placements, material/WIP readiness, and unavailable windows. It is not a simple sort by one date.

- A ready unstarted setup may move ahead of a setup still waiting for input, preventing avoidable idle time.
- A reviewed queue position remains binding during recalculation and idle-gap filling. Older material dates do not automatically overtake it.
- A later valid queue decision supersedes an earlier placement for the same future work.
- Position 1 means first eligible planned work; it does not remove active ownership, WIP, tooling, or unavailable-window restrictions.
- Idle-gap filling checks compatible machines, including empty machines. The complete run must fit before the next reservation and finish earlier than the existing plan.

### Machine continuity

Consecutive compatible setups prefer the same machine when another machine creates no useful earlier overlap. The same part/route/setup across Job Cards may also reuse settings, while quantities and WIP remain separate.

A separate-machine overlap must be feasible and improve completion by at least one working day. Continuity is a preference: it cannot delay the existing finish, move actual execution, or override higher-priority commitments and explicit decisions. Normal setup and quality approval remain required; the application does not invent changeover savings.

### Parallel machines

- Automatic splitting retains a normal minimum of 15 production days of work per machine. A small job is not automatically split simply because a second machine is idle.
- The automatic sizing heuristic uses a 25-working-day target and a one-day sizing allowance. This is an internal machine-count rule, not a universal delivery promise or a fixed extra transfer day.
- A Planner can explicitly add a compatible machine even when the automatic minimum-run rule would not split again.
- Existing setup machines keep their work; review the shared remaining allocation, per-machine quantities, WIP, tooling, and downstream finish.
- If the added machine is occupied, either queue behind its executing setup or explicitly approve stopping it after closing its Production Session.
- Adding machines does not multiply available WIP or tooling. Sum remaining allocations across machines once; do not duplicate the Job Card quantity.

## 10. Planner Actions: decision rules

### Handoff to execution

The normal setup sequence in all four units is **RM at Machine → Setting → Quality Approval → Machine Start**. There is no separate new Pre Setting stage. Setting requires the machine's assigned active checklist and completion of all required points. Each new Setting completion creates its own first-piece inspection task; an earlier setup run's inspection is not reusable evidence for the new request.

Blasting Machines use **RM at Machine → Machine Start**, skipping Setting, checklist, and Quality Approval. Material availability, active Worker assignment, and machine ownership still apply.

Planner decisions do not perform these shop-floor tasks. Closing a session for Shift Ends or Manual Stop does not itself complete or release the setup. The dedicated **Awaiting material — release machine** close reason can save actual output and release the assignment together without a separate Planner action; complete Weight/Counter evidence is required.

| Action | When to use | Rules before and after saving |
| --- | --- | --- |
| Change Priority | An existing job needs to move forward. | Confirm actions one setup at a time. Downstream dates open after the preceding action is confirmed. Editing an earlier action clears later confirmations. Review displaced work. A running target continues from actual start on its current machine. |
| Move Setup | One setup should use another compatible physical machine. | Settle running source output first. Review destination queue. Keep its current setup running, or explicitly stop it after settlement. Existing completed work stays historical. |
| Add Parallel Machine | Another machine can improve the remaining setup plan. | Review remaining quantity, WIP buffer, tooling, destination ownership, and queue position. Approval does not start production automatically. |
| Machine Unavailable | Breakdown, maintenance, or a machine quality hold affects work. | Record machine, period, reason, and whether to delay, shift compulsory work, or shift the full queue. The active window is a hard constraint. |
| Plan Setup 2 Early | Preparation/overlap is justified before the normal recorded buffer. | Separate idle compatible machine, selected Job Card, reason, and actual positive WIP before machine start. |
| Change Route | Remaining production needs another route. | Select one Job Card, settle open sessions, review each remaining setup quantity. The new route must be ready. Old output remains history; setup/quality/start workflow is required again. |
| Reject Raw Material | Actual rejected RM is returned. | Record kilograms and choose the valid continuation/replacement action. Preserve receipts and production history. |
| Release machine — awaiting material | A setup should free its machine while waiting for RM/WIP. | Close its session with actual output first. Only the selected assignment releases. Setup returns to Planned, with outstanding work preserved. |
| Reopen Setup | Item Complete was recorded by mistake. | Requires reason and eligibility. Final dispatch or a later completed setup prevents reopening. Partial dispatch alone does not. Reverses completion evidence, returns the setup to Planned/inactive, and retains session times/output. It does not take a machine from another job. |

### Stop or move running work: mandatory settlement

Close the affected Production Session at the actual interruption time through Weight or Machine Counter, as applicable. Planner Actions read that saved good output and session reference; they do not accept a second produced-quantity figure.

An approved stop releases machine ownership and returns unfinished work to Planned. It does not mark Item Complete. A subsequent actual restart/completion supersedes the historical stop; an old decision must not reset resumed work.

Queued unstarted work needs no production settlement. Keeping an occupied destination setup running also needs no session closure for that setup.

### Machine-unavailable choices

| Choice | Expected behavior |
| --- | --- |
| Delay plan | Work stays on the affected machine and resumes around its unavailable period. For a running setup, its session remains open and an open downtime event is required before saving the delay decision. |
| Shift only compulsory parts | Review and move the required affected work to compatible destinations and queue positions. Settle any running work that is stopped/moved. |
| Shift full plan | Move the machine's complete current planned queue. Future recalculation may use the original machine again only for work after the unavailable window. |

Completed setups remain complete and are excluded from unfinished queue/move choices. Review unresolved machine issues when their expected end passes; record actual availability or an updated decision. Closed/resolved/cancelled/Available/inactive constraints do not reserve capacity.

## 11. RM rejection, route changes, and physical balances

### RM rejection

- Full usable-RM rejection removes all setup plans until replacement availability is restored. Settle any open production first.
- Partial rejection → Continue Accepted Quantity: use usable kilograms to estimate supported Setup 1 pieces. Recorded setup good output becomes the downstream quantity basis, even when it exceeds that estimate.
- Partial rejection → Wait For Replacement: remove active setup plans and release affected ownership until usable RM again covers the required RM quantity.
- A balance rounding to zero at the displayed 0.1 kg precision cannot use Continue Accepted Quantity.
- Replacement receipts add to the existing ledger. Replanning retains previous good output and schedules the remaining work; it does not manufacture the original quantity again.

### Route changes

Review the new route's remaining setup quantities explicitly. Old production is retained and can supply downstream WIP, but is not treated as newly performed production on the changed route. Earlier machine-switch/parallel approvals do not automatically carry into the new route.

Readiness checks apply to setups with remaining work. A valid zero-remaining route is not a missing route and should not create artificial machine work. If the explicit remaining plan has no positive quantity, it creates no new machine plan or finish forecast.

### Customer balance versus physical WIP

`Customer balance = max(0, ordered pieces − final-setup good pieces)`

This differs from physical WIP. Physical stock can remain after customer demand is met. A planner stop does not make that stock complete or erase its machine streams. Replanning retains physical remaining work rather than capping all stock at customer demand. Conversely, an Item Complete setup below target is not automatically restarted by a later machine-unavailable action.

## 12. Completion, dispatch, cancellation, and returns

- Overall production progress averages each selected-route setup's capped completion percentage equally. In a two-setup route, completing Setup 1 contributes 50%; completing half of Setup 2 gives 75% overall.
- Finished pieces are final-setup good output. Intermediate WIP does not become dispatchable simply because overall progress is high.
- Every parallel stream must be Item Complete before its setup's actual completion is established.
- Partial dispatch may use already recorded final-setup good pieces while production continues. Available dispatch quantity is recorded eligible good output minus earlier dispatches.
- Final dispatch closes the lifecycle; a visible customer shortfall is not automatically another open production requirement on that closed activity.
- A dispatch commitment reminder stays open through production completion and partial dispatch. It clears on complete dispatch. Rescheduling a promise does not change machine priority.
- Cancellation requires closed Production Sessions and is unavailable for a dispatched line. It removes the Job Card from active planning and releases ownership while preserving receipts, output, and history. It does not return RM to inventory automatically.
- Customer returns create revision activities on the same base Job Card. Reworkable pieces use returned stock; Replacement requires fresh RM against its own activity. Both need explicit route selection. Never borrow another revision's receipts, production, completion, or inspection evidence.
- A rejected unsalvageable Rework activity requires settled sessions and creates Replacement in a later revision; the failed activity and return trace remain historical.

## 13. Before accepting a new customer order

Order Acceptance Planning assesses a proposed order before Purchase confirms it.

1. Upload proposed product/route/quantity lines with stable references and load existing workload for the unit.
2. Choose RM-date mode to calculate dates from assumed production-ready RM dates. A blank RM date remains unknown and gets no promised tentative finish.
3. Or choose deadline mode to select complete proposed lines that fit a machining deadline. Individual RM dates are ignored in this capacity-only mode. An optional common tentative RM date limits the proposed lines' earliest start; blank assumes readiness at planning start.
4. Existing commitments are protected first across the planning horizon, including existing waiting work. Their machining may extend beyond the proposed order's deadline; new selected lines must fit the proposed deadline.
5. Review line completion, machine plan, material-required-by dates, tooling, and excluded lines. Missing/ambiguous masters, unknown workload, overdue unrefreshed work, or incomplete source data prevent approval.
6. Treat the selection method as a heuristic, not a proven best possible mix. Machine-family hours cannot be summed as finished output across shared routes.
7. Approve the reviewed proposal. Approval freezes that revision but creates no PO, Job Card, production instruction, or capacity reservation.
8. Obtain Purchase approval separately and enter the confirmed PO through the normal flow. Recheck current capacity if intervening commitments changed.

This workflow estimates machining only. It adds no separate finishing, inspection, packing, or dispatch allowance. Its simulation can forecast downstream work from projected WIP, but cannot bypass actual-WIP gates on the shop floor. It retains normal automatic parallel minimums. Changed inputs/workload require recalculation before approval; approved corrections use a new proposal revision.

## 14. Worked use cases

The quantities below demonstrate rules. Actual dates must come from the current plan after queues, calendar, tooling, and recorded supply are applied.

| Case | Situation | Planner action and expected result |
| --- | --- | --- |
| 1. New received order | 10,000 pieces, one original route, valid masters, first RM received. | Verify the automatic route, received balance, and Setup 1 machine plan. Review the full-route finish. Later setups may have forecasts without machine reservations. |
| 2. Material received but no plan | Route family D5 exists but Machine Master has no active D5 physical machine. | Correct Machine Master and refresh. Do not use D5 itself as a machine or move the job to an unrelated family. |
| 3. Several routes | A new original Job Card has Options 1 and 2. | Choose the intended route explicitly, resolve its setup gaps, then review dates. Do not assume the application chooses the fastest method. |
| 4. Cycle calculation | CNC has 9,000 remaining good pieces; cycle plus handling is 90 seconds. | Work is 225 hours, or ten full 22.5-hour production dates on one otherwise available machine. Holidays and queues may extend the finish. |
| 5. Partial-shift holiday | A CNC date has Shift B closed. | That date provides 15 productive hours per machine. It still counts as a working date where capacity remains. Do not treat it as either a full 22.5-hour date or a complete factory shutdown. |
| 6. Normal WIP buffer | Setup 2 consumes 1,000 pieces/day on one machine; upstream supplies at least that rate; 10,000 pieces remain. | Normal buffer is 2,000 available recorded pieces. At 1,500, retain the forecast but do not normally reserve an unstarted Setup 2 machine. At 2,000, review normal assignment/readiness. |
| 7. More machines need more WIP | The same Setup 2 would use two 1,000/day machines; upstream provides 1,000/day. | Combined demand is 2,000/day, slower upstream triggers three days, so buffer is 6,000 pieces, capped by planned quantity. Two machines cannot be assumed ready from the original 2,000-piece buffer. |
| 8. Early Setup 2 | Only 300 good Setup 1 pieces exist, below normal buffer, and a separate compatible idle machine is available. | Record Plan Setup 2 Early with reason. Preparation can proceed; processed Setup 2 output cannot exceed actual supplied good pieces. Pause when supply is exhausted. |
| 9. Shared tool bottleneck | Two compatible machines are free but only one required fixture is allocated and available. | Sequence work or obtain a real additional allocation. Merely choosing two machines does not create fixture capacity. |
| 10. Ready work behind waiting work | The first unstarted queue entry lacks WIP; a later entry has RM and fits the gap. | Automatic planning may bring the ready entry forward, subject to saved queue decisions and physical locks. Review the published sequence. |
| 11. Urgent job, keep running work | An urgent order needs the same family as a running setup. | Review Change Priority setup by setup without selecting the running blocker for stop. It continues; urgency rearranges eligible future work rather than silently interrupting it. |
| 12. Urgent job, stop approved | The planner chooses to stop that running blocker. | Close its session using actual Weight/Counter output, then save the reviewed priority action. Output is read once, ownership releases, and remaining work stays visible. |
| 13. Breakdown, delay | Running machine is unavailable for repair; work will remain there. | Record downtime and save Delay plan with the window. Session stays open; forecasts shift around the unavailable period. |
| 14. Breakdown, move | Work must transfer to another compatible machine. | Close the source session, review the destination queue, and save the move. Keep destination work running unless a separately settled stop is explicitly approved. |
| 15. Explicit parallel addition | A short remaining job would not meet the automatic 15-day-per-machine rule. | Use Add Parallel Machine if justified. Review tooling/WIP and queue. Existing machines retain their work; the application recalculates shared remaining quantities. |
| 16. Short RM | Required RM is 100 kg; usable RM is 90 kg. | Review the shortage. Work may have begun, but Item Complete needs more RM or a reasoned Accept short RM decision. At 95 kg, the normal allowance is met. |
| 17. RM partially rejected | Of 100 kg required/received, 50 kg is returned. | Choose Continue Accepted Quantity or Wait For Replacement. The latter removes active plans until usable balance is restored; a later 50 kg receipt rebuilds remaining work using preserved production. |
| 18. Waiting downstream | Setup 2 has exhausted recorded WIP but fresh RM arrives for Setup 1. | Fresh RM does not directly release Setup 2's WIP wait. Setup 1 must record additional good output. Release the waiting machine if appropriate after session settlement. |
| 19. Route change after production | Setup 1 has produced material; remaining work needs another method. | Settle sessions, select one Job Card, review new remaining setup quantities and masters. Preserve old output; repeat required setup/quality/start steps on the new route. |
| 20. Upstream finishes short | Ordered 10,000; every Setup 1 stream is Item Complete at 8,000 good; Setup 2 has processed 2,000. | Physical WIP is 6,000. Plan that available supply instead of waiting for another 2,000 from completed Setup 1. Keep the customer shortfall separate. |
| 21. Demand met, WIP remains | Final good meets order quantity but an intermediate stream still holds physical stock. | Do not assume all machines are free. Review stream completion and physical remaining work separately from customer balance. |
| 22. Marked complete by mistake | A setup was closed prematurely; no final dispatch or later completed setup exists. | Use Reopen Setup with reason. If eligibility fails, do not bypass the lifecycle by editing production history. |
| 23. Promise changed | Dispatch is promised sooner. | Save the commitment for tracking, then separately review planning intervention. A promise alone does not move the job ahead. |
| 24. Customer return | Returned pieces include salvageable and rejected material. | Select the new Rework/Replacement activities separately. Rework uses returned pieces; Replacement waits for its own new RM and full-route selection. |
| 25. Proposed new order | Customer asks which complete lines can finish by a deadline. | Run Order Acceptance with current existing workload, review assumptions, and approve a proposal. Do not describe that approval as reserved production capacity. |

## 15. Daily operating checklist

### Start of day

- Confirm the unit, current published plan, and any pending refresh.
- Review overdue dispatch commitments and changed customer requirements.
- Review unresolved/overdue machine issues and expected repair dates.
- Review received-material readiness gaps and missing masters.
- Review RM shortage decisions and replacement waits.
- Review WIP-ready jobs, blocked next setups, tooling, and avoidable idle machines.

### Before any planner change

- Exact Job Card, revision/activity, route, setup, and machine selected?
- Actual good output, rejected output, and physical WIP checked?
- Running source/destination sessions identified?
- Stops settled; keeping-running choices preserved?
- Compatible machines, tooling, calendar, queue position, and unavailable dates reviewed?
- Other affected Job Cards and full-route finishes checked?
- Reason and impact understood?

### After saving

- Updated planning publication visible?
- No duplicate remaining allocations or lost production?
- Source release and destination queue match the approved choice?
- Material/WIP gates and downstream dates still valid?
- History links to the saved decision and settlement evidence?
- Any customer promise requiring separate communication identified?

## 16. Common questions

**Why does the Job Card have a finish forecast but no Setup 2 machine row?** The full route is forecast, while the downstream physical reservation normally waits for recorded WIP.

**Why does an idle machine not receive this job?** Check unit/family/type, actual input, tooling, saved queue positions, machine-unavailable windows, continuity, and the automatic parallel minimum.

**Why did the finish move after production was entered?** Actual good output changed the balance; the remaining forecast uses current cycle capacity and begins after the recorded production date. Rejections, constraints, and upstream supply also matter.

**Why did the original Planned Finish stay unchanged?** It is the historical receipt-linked baseline. Compare it with Current Estimated Finish.

**Why cannot the planner just enter finished quantity while stopping?** Production Sessions are the canonical source. Settle Weight/Counter output there; the planner decision reads it.

**Why is the shortage flag gone at 95 kg when 100 kg was required?** The flag permits a 5% shortage. The entered requirement, full-receipt date, and original order are not changed to 95 kg.

**Does production above 100% efficiency need approval to count?** No. These sessions create informational review flags. A planner comment closes the flag without changing quantities or targets. Correct incorrect output through the authorized session correction workflow.

**Does refresh change actual history?** It recalculates forecasts from saved facts. Actual production, completion evidence, and immutable baselines remain historical.

## 17. Review status and source references

This is a documentation draft based on current local source and business contracts. No application changes or production-data changes were made to prepare it. Deployment status and real factory adherence were not tested.

The working tree contains an in-progress Urgent Delivery Simulation. It is intentionally excluded from the standard operating instructions until its release status and business acceptance are confirmed. Its local design describes read-only scenario preview followed by a separately approved live-plan action; it must not be confused with Order Acceptance proposal approval.

Before issuing this as a controlled factory procedure, the business owner should confirm role ownership, approval authority, and the deployed screen labels. These are organizational decisions, not rules inferred from the scheduler.

| Subject | Reviewed sources |
| --- | --- |
| Factory process and navigation | [FACTORY.md](../FACTORY.md) |
| Material, dates, completion, dispatch, routes, continuity, returns | [Job Cards business contract](glossary/job-cards.md) |
| Readiness, master ownership, physical machines, idle gaps | [Master Data Scope](glossary/master-data-scope.md) |
| Settlement, WIP, sessions, parallel additions, downtime | [Production Sessions](glossary/production-sessions.md) |
| Pooled WIP and early Setup 2 | [Parallel WIP decision](adr/0001-parallel-wip-planning.md) |
| Actual production start locking | [Production start decision](adr/0002-production-start-forecast-locking.md) |
| Physical machine locks | [Machine recalculation decision](adr/0003-planning-recalculation-locks-actual-machines.md) |
| Sequential priority confirmation | [Priority plan decision](adr/0004-priority-plan-scenarios.md) |
| Proposed-order assessment | [Order Acceptance contract](glossary/order-acceptance-planning.md), [implementation notes](codebase/order-acceptance-planning.md) |
| Capacity, sorting, buffers, automatic splitting | [Canonical planning calculation](../packages/db/src/legacy-dashboard-analysis.ts), [shared planning rules](../packages/db/src/planning-rules.ts) |
| Refresh behavior | [Planning refresh policy](../apps/web/lib/planning-refresh-policy.ts) |
| Available planner action descriptions | [Planner workspace](../apps/web/components/planner-decision-workspace.tsx) |

Where older general terminology differs from the focused contracts or implementation, this handbook follows the focused current rule. For example, it uses equal-weight setup progress, the CNC 06:00 boundary, automatic production-master refresh requests, and recorded-WIP downstream reservations.

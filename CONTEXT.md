# MRM Dashboard

MRM Dashboard supports production planning and shop-floor tracking for job cards, route setups, machines, and WIP movement between operations.

## Language

**Customer Commercial Defaults**:
The buyer, Incoterms, payment terms, shipment mode, packaging, and currency normally used for a Customer. A new Enquiry copies these defaults, while that Enquiry may select different active Commercial Master values without changing the Customer.
_Avoid_: Fixed customer terms, enquiry-only terms.

**Customer Bulk Revision**:
A staged, customer-scoped request that applies one or more commercial parameter changes to selected active Sent or Accepted prices, previews the recalculation, and completes once by creating immutable replacement Quote revisions through every affected Package or Assembly ancestor.
_Avoid_: Editing active Quote rows in place, product parameter revision, customer default update.

**Product Bulk Revision**:
A two-stage, cross-customer request that applies staged Product Parameter changes to Product Master for selected active Sent or Accepted prices, expands the affected Product identity across every active customer price, then waits in Customer Bulk Revision for optional customer parameter changes before creating immutable replacement Quote revisions through every affected Package or Assembly ancestor.
_Avoid_: Creating Quote revisions during the product stage, editing active Quote rows in place, customer-only revision.

**Pricing Register**:
The current customer-price spreadsheet built from active or editable root Quotes and their immutable recursive Product and calculation snapshots. It keeps Package / Assembly parent, depth, quantity, commercial inputs, formula evidence, currency, and purchased-product website descriptions together; selecting a Customer Part Code opens its complete retained Quote revision history.
_Avoid_: Product Master price, mutable calculation sheet, unscoped full-history load.

**Setup**:
One operation in a part route. A setup may run on one machine or be split across compatible parallel machines.
_Avoid_: Operation when referring to a route step in the dashboard.

**Setup Name**:
A reusable manufacturing operation name selected from Setup Name Master and referenced by Route Master lines within one Production Floor.
_Avoid_: Free-text operation name, setup description typed again in Cycle Time Master.

**Route Master Line**:
One Part Code, route option, and setup-number combination that selects a Setup Name and Route Machine Family for a Production Floor.
_Avoid_: Re-entered route details in Cycle Time Master or Tooling Master.

**Cycle Time Standard**:
The cycle-time value assigned to one existing Route Master Line. Its Part Code, route option, setup number, Setup Name, and Route Machine Family come from that route line.
_Avoid_: Independently typed setup identity, loading/unloading copy.

**WIP Stream**:
The planned or actual output produced by one machine for one setup, bounded by that machine's start date, end date, quantity, and daily capacity.
_Avoid_: Machine output bucket.

**Common WIP Pool**:
The available WIP for a setup after all machine WIP streams have been transferred into the shared stock for the next setup.
_Avoid_: Machine-to-machine WIP pairing.

**WIP Availability Buffer**:
The planning delay between producing WIP on one setup and allowing the next setup to consume it.
_Avoid_: Same-day transfer.

**Production Start Forecast**:
The planned production start date for a setup before actual production starts. It follows the later of the machine plan and setup completion date.
_Avoid_: Fixed production start date.

**Actual Production Start**:
The first recorded production date for a setup on a machine. Once present, it locks the production start date used by planning.
_Avoid_: Setup completion date.

**Production Session**:
One uninterrupted period in which one operator runs one machine for one Job Card, option, and setup. Shop Floor records its start; Shop Floor closes it, while Quality may also close CNC sessions. A shift change, operator change, item completion, or job/setup change ends the session. Downtime does not end it.
_Avoid_: Daily production entry, permanent setup operator.

**Production Session Reference**:
The immutable human-readable reference generated from the machine number, Production Date, and that machine's daily session sequence, such as `C501-20260815-03`. The internal UUID remains the permanent technical identity.
_Avoid_: User-entered session name, shortened UUID.

**Closing Required**:
The operational status of a Production Session that is still open after its scheduled Production Shift end. It remains an open session until an authorized user completes the normal close action; the status is derived, not a separate saved lifecycle state.
_Avoid_: Automatically closed session, overdue shift.

**Production Shift**:
A configured operating interval for one Production Floor. Conventional-01, Conventional-02, and Forging use General shift from 08:30 to 20:00; CNC uses A from 06:00 to 14:00, B from 14:00 to 22:00, and C from 22:00 to 06:00.
_Avoid_: User-entered free-text shift.

**Production Date**:
The calendar date on which a Production Shift starts. An overnight CNC C shift therefore keeps its starting date after midnight until 06:00.
_Avoid_: UTC date, session-end date.

**Production Session Start Lookup**:
The Production Unit-scoped machine-number lookup used to fetch and verify the current planner assignment before entering operator, start time, and an applicable machine start count.
_Avoid_: Daily machine board, company-wide machine list, retyping planner details.

**Production Session Register**:
The filterable one-row-per-session record used to find and open current and historical Production Sessions.
_Avoid_: Daily Machine Board, event-level log.

**Production Event Log**:
The chronological analysis view that presents session starts, downtime, rejection, session closes, and corrections as individual rows without duplicating their canonical records.
_Avoid_: Mutable audit note, duplicate event storage.

**Production Measurement Method**:
The method selected for one Production Session. Conventional-01, Conventional-02, and Forging use Weight. CNC asks for either Machine Counter or Weight for every session.
_Avoid_: Machine-wide permanent counting method.

**Planner Interruption Settlement**:
The required Production Session action before a planner decision interrupts running work. Moving or stopping work requires the matching session to be closed through its Weight or Machine Counter method; delaying it on the same machine requires an open downtime event. Planner Actions read the canonical session output and never ask for a separate produced quantity.
_Avoid_: Planner finished quantity, duplicate production actual.

**Planner Movement Record**:
A durable Job Card history entry created when a planner decision moves, stops, reprioritizes, or requeues a setup. It identifies the decision, affected setup, source and destination machines where applicable, reason, planner, time, and the Production Session references and canonical good output used to settle interrupted work.
_Avoid_: Current machine assignment as history, free-text machine-shift note, duplicate output entry.

**Machine Counter Continuity**:
The previous closed CNC Production Session's end count becomes the next session's start count only when the physical machine, Job Card, Part Code, option, and setup all remain the same and both sessions use Machine Counter.
_Avoid_: Carrying a counter across a job/setup change, retyping an eligible carried count.

**Production Downtime Event**:
A non-overlapping start/end interval within one Production Session, recorded by Quality, Shop Floor, or Machinist with a coded reason and closure outcome. It reduces effective runtime but does not close the session; an open interval must be closed before the session can end.
_Avoid_: One editable daily downtime total, automatically closing downtime with the session.

**Carried Downtime**:
An unresolved machine problem whose current Production Downtime Event closes at shift end and continues into the next operating shift. Non-working hours between shifts are excluded; each affected shift records its own downtime interval until the problem is resolved.
_Avoid_: One continuous downtime interval across off-shift hours, resolved downtime.

**Production Rejection Event**:
A quantity and coded type, reason, and remark recorded only by Quality against one Production Session. Rejected pieces are part of total produced pieces; good pieces equal total produced minus rejected pieces.
_Avoid_: Rejection without a Production Session, rejection entered by Machinist or Shop Floor.

**Planning Recalculation**:
A rebuild of forecast planning from the latest masters, holidays, constraints, production entries, and shop-floor workflow data. It may move future unstarted setups to newly available physical machines, but it must not move setups that already have production actuals or a raw-material-at-machine-or-later shop-floor task unless a planner explicitly switches the machine.
_Avoid_: Manual date refresh.

**Planning Readiness Hold**:
An accepted Work Order that cannot enter planning because one or more required planning masters are missing. It remains visible in Part Readiness until a planner completes the required master actions.
_Avoid_: Rejected Work Order, failed import.

**Work Order Line**:
One production requirement identified by the combination of FG PO Number and Part Code. The same FG PO may contain different Part Codes, but it cannot repeat the same Part Code.
_Avoid_: FG PO, Job Card.

**Job Card**:
A unique identifier assigned to exactly one Work Order Line. A Job Card cannot identify two lines, even when their FG PO Number or Part Code matches another line.
_Avoid_: Work Order Line, FG PO Number.

**Job Card Workspace**:
The permanent traceability view for one Job Card. It combines the Work Order, selected Product/Route/Setup masters, planning dates, Production Sessions, downtime, rejection, setup progress, dispatch events, and Job Card Analytics without copying their canonical records.
_Avoid_: Job Card tile, filtered Job Cards list, duplicate history store.

**Job Card Analytics**:
The calculated comparison of ordered quantity and planned dates against finished output from the selected route's final setup, setup-level operation output, rejection, runtime, and downtime patterns for one Job Card. It is derived from current planning and canonical event records.
_Avoid_: OEE, manually entered summary, machine-wide analytics.

**Job Card Production Progress**:
The percentage of ordered pieces completed as finished good pieces: good output from the selected route's final setup divided by ordered quantity, capped at 100%. Output from earlier setups is WIP and never increases finished Job Card progress.
_Avoid_: Task-count progress, total operation-output progress, counting the same pieces once per setup.

**Job Card Delivery Target**:
The working-day limit after full Raw Material receipt. Product Master provides the default and the Job Card may override it; Fridays and Planning Calendar holidays are excluded. A/B/C/D ratings mean on time, 1–2, 3–5, or more than 5 working days late.
_Avoid_: Calendar-day promise, Job Card-only default.

**Job Card Setup Time**:
Setup-wise elapsed time split into machinist setup (Pre Setting start to Setting complete), QC wait (Setting complete to QC approval), and machine-start wait (QC approval to first Production Session). Missing timestamps stay unknown.
_Avoid_: One combined setup duration, missing time as zero.

**Operational Replanning**:
An automatic planning recalculation after live planning inputs change, such as priority, RM inward, shop-floor progress, setup completion, or production quantity. Master and structural changes remain manually recalculated.
_Avoid_: Manual operational refresh.

**Machine Assignment Stability**:
A recalculation rule for route machine families: when the same job-card setup was already planned on a physical machine, keep that setup on the same machine unless there is a material planning improvement, machine unavailability, a physical shop-floor lock, production actuals, or an explicit planner machine switch. Other setups, including setup 2 of the same part, are assigned independently.
_Avoid_: Load balancing every recalculation.

**Route Machine Family**:
A route-level machine code such as `D5` or `C5` that represents a physical-machine family. Future planning requires at least one active physical machine in machine master for that family, such as `D501`; otherwise the work order is flagged and no unstarted machine plan row is created.
_Avoid_: Pseudo-machine.

**Production Floor**:
An independent production operation with its own team, machines, routes, cycle standards, inspection parameters, planning, tasks, and entries. Conventional, CNC, and Forging are separate production floors; records from one floor never participate in another floor's planning or task queues.
_Avoid_: Department, machine group, production-floor filter.

**Production Unit Workspace**:
A company-wide Master Tables or Data Entry workspace whose required Production Unit selection determines which Production Floor's scoped records are shown or changed.
_Avoid_: Separate Master Tables or Data Entry pages for each Production Floor.

**Universal Production Corrections Workspace**:
A company-wide workspace where eligible records from every Production Floor can be reviewed and reversed. Each reversal preserves the original record and its correction evidence while removing the wrong record's effect from live operational state.
_Avoid_: Production-floor-specific Corrections, deleting wrong entries.

**Company-Wide Quality Code Master**:
The shared Rejection Type, Defect / Downtime Reason, and Rejection Remark code lists used by every Production Floor. Their codes are system-generated and CSV uploads cannot replace the established sequence. These codes are not copied or customized per Production Floor.
_Avoid_: Production-floor rejection codes, department-specific defect reasons.

**CSV Import Deduplication**:
The import rule that keeps the first exact business row, skips later copies in the same file, and reuses the existing database identity when the same data is uploaded again. Real differences such as setup number, checklist sequence, quantity, date, or machine keep rows distinct. Historical duplicates are not deleted automatically.
_Avoid_: Deleting legitimate repeated operations, creating another record on repeat upload.

**Priority Plan Scenario**:
The setup-by-setup decision flow shown before saving a planner priority change. It opens one setup at a time; downstream setup dates are hidden until the previous setup action is confirmed.
_Avoid_: Single probable date.

**Quality Inspection Parameter Set**:
The ordered parameters, specifications, instruments, and tolerances assigned to one item, option, and setup and reused by both first-piece inspection and hourly quality checks. A parameter name and specification pair may occur only once in a set. Measurement parameters use numeric values; visual and gauge parameters may use OK / Not OK values and matching textual tolerances.
_Avoid_: Separate FPIR master, hourly QC parameter master.

**Quality Inspection Line**:
An existing Route Master combination of item code, option number, and setup number to which a Quality Inspection Parameter Set may be assigned.
_Avoid_: Free-text quality master target.

**Coded Checklist**:
A reusable checklist identified by one system-generated code and containing one or more ordered steps. CSV code values may group uploaded steps but never become the saved code. Checklist counts refer to unique checklist codes, not step rows.
_Avoid_: Checklist row count.

**Machinist Setup Checklist**:
A coded checklist whose points belong to Pre Setting or Setting. Each phase shows and completes only its own points, records a machinist from the relevant Production Floor, and retains a remark per point. Machinist eligibility follows the employee's stable HR Department Master code, so editing the department display name does not remove the employee from the Production Floor. Pre Setting Done By and Setting Done By are separate fields and may name the same machinist.
_Avoid_: Repeating the machinist name inside an opened checklist, completing both phases from either checklist.

**Production Task Assignee**:
An active Employee Master employee selected from the task role's department in the current Production Floor: Machinist, Inprocess Quality, or Shop Floor. Matching follows the stable Department Master code, with legacy department-name fallback; HOD, Manager, and Management designations are not operational assignees. The Start Machine Worker is narrower: the employee must have a Worker designation and belong to that Production Floor's Shop Floor department.
_Avoid_: Free-text person names, employees from another Production Floor, leadership-only posts.

**Mechanical Maintenance Workspace**:
The company-wide operational workspace for planned and breakdown maintenance across every Production Floor. Schedules and maintenance history belong to a physical machine; its Production Unit assignment does not create a separate maintenance workspace.
_Avoid_: Production-floor maintenance tab, separate maintenance workspace per Production Unit.

**Machine Workspace**:
The company-wide operational record for physical machines. Its machine list opens one machine's identity, Production Unit, Store assets, assigned maintenance schedules, planned and breakdown maintenance history, and reports without copying those canonical records. Machine creation and identity changes belong only to Machine Master in Master Data.
_Avoid_: Editing Machine Master inside the Machine Workspace, duplicate machine-history storage, Production-floor-specific machine registers.

**Factory Planning Holiday**:
A non-working date applied to Conventional, CNC, and Forging production-floor planning.
_Avoid_: Re-entering the same factory holiday separately for each floor.

**Production-Floor Planning Holiday**:
A non-working date applied only to one selected production floor while other floors remain available for planning.
_Avoid_: Department holiday.

**Defect / Downtime Reason**:
A coded reason describing a quality defect or a downtime cause that can stop or affect machine production.
_Avoid_: Separate defect code, separate downtime code.

**Approved Post**:
One sanctioned staffing position identified by a post code. It is vacant,
appointed, occupied, resigned, or inactive and may participate in one combined role.
_Avoid_: Job post.

**Department Master Rename**:
An HR master change that keeps the Department's stable identity. Choosing to apply
the rename everywhere preserves existing links and shows the new name on linked
records. Choosing not to apply it clears the Department from existing Approved
Posts, Job Requirement Templates, and Candidates while retaining those records.
_Avoid_: Silently changing linked records, deleting linked records.

**Recruitment Master Code**:
The stable code automatically assigned when a Department or Designation is created. Multi-word names use initials while ignoring "and" / `&`; single-word names use their first two letters. A numeric suffix is added when another master already uses the abbreviation. Existing codes do not change when names are edited.
_Avoid_: User-entered master code, unrelated sequential code.

**Approved Post Status**:
The staffing state of an approved post: vacant has no appointee, appointed has a
selected person who has not confirmed joining, occupied has a person whose actual
joining was confirmed with an Employee ID, and resigned retains the departing
person's last assignment while reopening the post for recruitment. Passing the
planned joining date alone never changes an appointed post to occupied.
_Avoid_: Candidate status, recruitment opening status.

**Job Requirement Template**:
The reusable qualification, salary, and responsibility profile attached to an
approved post and copied into a recruitment opening.
_Avoid_: Job post.

**Recruitment Opening**:
A time-bounded hiring request created from an approved post and identified by
a vacancy code.
_Avoid_: Approved post, vacancy master.

**Candidate Application**:
One attempt by a candidate to fill a recruitment opening. Interview planning,
round outcomes, and a possible joining date belong to this application cycle.
_Avoid_: Candidate, interview.

**Candidate Appointment**:
The accepted joining commitment created after all three interview rounds are
approved and the candidate confirms willingness, joining date, and salary terms.
_Avoid_: Final interview approval, occupied post.

**Pre-Probation Salary**:
The fixed monthly salary agreed for a Candidate Appointment before probation is
completed.
_Avoid_: Salary range.

**Post-Probation Salary Range**:
The agreed minimum and maximum monthly salary applicable after probation.
_Avoid_: Fixed probation salary.

**Active Candidate Application**:
A candidate application that is assigned, in interview, or on hold. A candidate
can have only one active application for the same recruitment opening.
_Avoid_: Open round, current entry.

**Closed Candidate Application**:
A candidate application that was finally approved, rejected, or withdrawn. It
remains part of recruitment history and does not prevent a later application.
_Avoid_: Deleted application, old entry.

**Candidate Withdrawal**:
The candidate's decision to stop one active Candidate Application before
appointment. Its reason and prior interview history remain recorded.
_Avoid_: Candidate deletion, job closure.

**Recruitment Interview Round**:
One sequential standardized assessment within a candidate application:
Screening, Technical, then HR. A later round cannot begin until the preceding
round is approved.
_Avoid_: Freely selected interview stage.

**Interview Assessment**:
The preset question scores, interviewer, decision, and comments recorded for
one recruitment interview round. The interviewer is an active Employee Master
employee whose designation is HOD, Manager, or Management, regardless of
department.
_Avoid_: Overall score without question-level marks.

**Recruitment Assignment Command**:
One atomic, ordered request that assigns Candidates to a Recruitment Opening or applies employee transitions to Approved Posts.
_Avoid_: Independent row updates, workbook import batch.

**Recruitment Assignment Event**:
One durable, command-ordered fact recording an application or Approved Post transition caused by a Recruitment Assignment Command.
_Avoid_: Unordered audit row, log message.

**Store Asset Type**:
The stock-control classification of a Store Item Type: Consumable or Non Consumable.
_Avoid_: Tracking mode, free-text asset type.

**Consumable Store Item**:
A quantity-managed item whose quantities share one Asset Code and are allocated and issued without a Unit ID, Asset Movement, Store Return, maintenance, or calibration.
_Avoid_: Physical Asset, returnable asset.

**Non Consumable Asset**:
One returnable physical unit whose Unit ID / Serial ID keeps its assignment, Asset Movement, Store Return, maintenance, and calibration separate from other units sharing the same Asset Code.
_Avoid_: Consumable quantity, Store Item Type row.

**Asset Movement**:
An immutable holder change for one Non Consumable Unit ID between the Store, a Department, a Machine, or a Vendor; movement back to Store is a Store Return.
_Avoid_: Consumable issue, Purchase Order receipt.

**Asset Code**:
The permanent code shared by every quantity of one Store Item Type, whether Consumable or Non Consumable.
_Avoid_: Type Code, per-unit code.

**Store Item Workspace**:
The permanent Asset Code view containing Store Item details, Supplier Price history, Suppliers, and every physical Unit ID belonging to the Store Item.
_Avoid_: Individual Unit ID lifecycle view.

**Unit ID / Serial ID**:
The permanent identity of one Non Consumable physical unit used for its movement, maintenance, calibration, and lifecycle history.
_Avoid_: Asset Code, Consumable unit code.

**Tooling Asset**:
A Store Item Type whose existing Asset Code may be referenced in Tooling Master.
_Avoid_: Free-text tool, tool created inside Tooling Master.

**Tooling Requirement**:
A manufacturing master record stating that a quantity of one existing Tooling Asset Code is used to manufacture a production item at a route option and setup; it is not a physical assignment or Store movement.
_Avoid_: Tooling assignment, Tooling inventory, Tooling Asset creation.

**Store Purchase Order**:
The authority to receive one or more Stock Register items from exactly one Supplier at their Current Supplier Prices; a mixed selection creates one order per Supplier.
_Avoid_: Separate receipt workspace, direct stock entry.

**Store Purchase Order Line**:
One ordered Store Item, quantity, retained unit price, and receipt progress within a Store Purchase Order.
_Avoid_: One Purchase Order per selected item.

**Current Supplier Price**:
The newest effective Supplier Price Master entry for one Store Item, which determines its Supplier and Purchase Order unit price.
_Avoid_: Price typed while creating a Purchase Order, arbitrary Supplier selection.

**Store Receipt**:
A goods receipt against one Store Purchase Order that cannot exceed its remaining quantity. It enters the single central Store under the signed-in account; Supplier Bill Date and optional Warranty / Guarantee Until remain separate dates.
_Avoid_: Receipt without order, direct inward.

**Store Purchase Register**:
The single table containing Store Purchase Orders and receipt progress, with receiving completed against each order row.
_Avoid_: Separate Purchase Order and receipt workspaces.

**Stock Register**:
The single filterable inventory table where Consumables remain quantity-managed rows and every available Non Consumable Unit ID is a separate quantity-one row. Physical-unit rows retain their shared Asset Code and open the individual Asset Workspace from a separately filterable Unit ID column.
_Avoid_: Separate Consumable table, Physical Asset register on Stock.

**Store Request**:
One numbered demand submitted by a Department and a signed-in individual, containing one or more Coded Item Request Lines selected from Current Stock. Requested By is the signed-in account email; Department comes from that account's linked Employee Master assignments, with a choice only when multiple assignments apply. All requests use the single central Store automatically.
_Avoid_: One request number per item, New Item Request.

**Store Issue Allocation**:
The fulfillment of one Coded Item Request Line to its saved Department by the signed-in Store user. For a Non Consumable, one available Unit ID for that Asset Code is selected from the Store at a time; Department, Issued By, and Unit ID eligibility are not free text.
_Avoid_: Typed Department, typed issuer identity, typed Unit ID, issuing multiple physical units as one shared quantity.

**Coded Item Request Line**:
One Store Item Type and requested quantity within a Store Request, allocated independently by Store.
_Avoid_: New Item Request, physical Asset selection.

**New Item Request**:
Demand for an item that cannot be found in Current Stock and has no Asset Code yet.
_Avoid_: Coded Item Request Line, missing-stock issue.

**Request Allocation Queue**:
The filterable Store worklist of Coded Item Request Lines awaiting or undergoing allocation.
_Avoid_: Request creation form, New Item Request list.

**Store Vendor**:
An external party that may temporarily hold a Non Consumable Asset.
_Avoid_: Supplier when referring to an asset holder.

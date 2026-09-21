# Master Data Scope

**Master Data Workspace**: The company workspace containing two views of the
same reusable records: Data Entry creates or maintains a master, and Master
Tables searches and reviews the saved masters. Machine, route, quality,
maintenance, Store, HR, and Commercial masters belong here when the user has
permission to access them.

**Operational Entry Workspace**: The separate company workspace for business
events currently entered manually: Work Orders, Raw-Material Inward,
Production Output, Enquiries, and Purchase Orders. Operational Data Entry opens
only after Unit, Main Entry, and Entry Form are chosen on **Operational Entry
Selection**. Operational Tables uses the same selection pattern. The selected
form and Unit stay locked until the user returns to selection. These records are
corrected or reversed under their own lifecycle and never use Master Rename,
Master Replacement, or Master Deletion.

**Operational Entry Transfer**: Every selected Operational Data Entry workspace
provides one uniform **Upload CSV** action. Every selected Operational Entry
Table workspace provides one uniform **Export** action for that table. CSV
upload is never available in Entry Table view; imports remain write-authorized
entry operations, while exports remain read-authorized table operations.
Purchase Orders use separate Data Entry and Entry Table views under the same
locked Operational Entry selection.

**Company-wide Master**: A master whose records apply to the whole MRMPL
software and are not owned by one Production Unit. In Data Entry and Master
Tables, its Production Unit is shown automatically as **Full Software / Not
Applicable**. Manual entries and CSV imports must not attach the currently
viewed Production Unit to these records.

The company-wide masters are:

- Setup Checklist Master;
- Maintenance Checklist Master;
- Maintenance Schedule Master;
- Rejection Type Master;
- Rejection Remark Master;
- Defect / Downtime Reason Master;
- Store Masters;
- HR Departments & Designations;
- HR Job Templates; and
- Commercial Pricing Masters;
- Customers; and
- Website Products.

Master Data Entry opens only after Unit, Main Master, and Sub Master are chosen
on **Master Selection**. It is not a standalone Master Data navigation item.
The selected form and Unit stay locked until the user returns to Master
Selection.

**Master Data Transfer**: Every selected Data Entry workspace provides one
uniform **Upload CSV** action. Every selected Master Table workspace provides
one uniform **Export** action for that table. CSV upload is never available in
Master Table view; imports remain write-authorized Data Entry operations, while
exports remain read-authorized table operations.

Successful production master saves and uploads automatically queue a dashboard
refresh. Their tables update when the refresh completes, without a separate
Recalculate Planning action. Universal checklists and maintenance schedules
are available in every Production Unit; unit-owned masters stay scoped to their unit.

Master Tables opens only after Unit, Main Master, and Sub Master are chosen on
**Master Table Selection**. The selected table and Unit stay locked. Changing
to another Master Table requires returning to Master Table Selection and making
a new selection; tables never provide direct master-to-master navigation.

Website Products exposes its existing dependent masters under the Website
Products Main Master: Website Product Data, Material Grade, Design Category,
Design Subcategory, Website Application, Website Certification, and Website
Field Option. These selections reuse the existing Commercial forms and tables;
they do not create duplicate master records. Legacy Commercial URLs remain the
implementation routes for forms, tables, exports, and saved links.
Design Category and Design Subcategory appear only under Website Products in
Master Selection. Commercial Pricing and Design workflows reuse those same
company-wide records without listing a second copy under Commercial Pricing
Masters.

**Rod Size Master**: The company-wide list under Commercial Pricing Masters
that supplies Rod Size choices in Design. Its initial values are all nonblank
Rod Sizes in the permanent internal Product Portfolio, including products with
no customer code or customer price. Values are trimmed and deduplicated without
regard to letter case; distinct measurements and descriptions remain distinct.
Products and design/quote records retain their captured Rod Size text. Renaming
or removing a choice changes future selections, not saved product specifications
or historical evidence; existing values remain visible in their records.

**Production-unit Master**: A master whose records differ by Production Unit.
Its Data Entry and CSV import require one of the recognized Production Units.
Quality Inspection Parameter Master is production-unit-scoped even though the
three quality code masters above are company-wide.

**Next Tool / Fixture Number**: Planning Control numbering recommendations apply
only to PPAC Conventional-01 and PPAC Conventional-02. CNC-01 and PPAC Forging
do not use these numbering categories; their dashboard snapshots must not retain
or generate these recommendations. This does not change Route or Tooling Master
records used by production planning.

Setup Name Master, Route Master, Cycle Time Master, and Tooling Master are
production-unit masters. Route Master selects Setup Name and Machine Family.
Machine Type is fetched from Machine Master for that family in the selected
production unit, displayed read-only, and derived again on save/import. All
machines in a family must agree on its type; missing or conflicting types must
be corrected in Machine Master before saving a route setup.
Route Master does not accept an independently entered Machine Type;
Cycle Time Master and Tooling Master select an existing Route Master Line and
cannot redefine its identity.

**Part Readiness**: The production-unit workspace for resolving master-data
gaps before planning. Both its Production Validation and Whole Work-Order
Missing Details tables show the Job Card ordered quantity, selected option, and
setup number. Work-order-level gaps without a selected route remain one row per
Job Card. Setup-scoped gaps, including Cycle Time, Tooling, and Machine Master,
produce one row for each affected Route Master setup; gaps on the same setup
share that setup row. Production Validation is the Raw-Material-received subset
of the whole work-order list.

**Route corrections and new options**: In every Production Unit, an existing
setup's number/sequence and the option's declared number of setups are fixed.
An unused draft option may be completed with its remaining setups. Once selected
or used in production, adding/removing/reordering setups requires a new option.
Setup Name and Machine Family may be corrected directly through Edit and Save;
the system detects changes without an extra confirmation. A different operation or alternate
manufacturing method requires a new option. A family correction applies to queued
and future work. Running work retains its current physical machine and saved
production; editing the master never moves an active assignment. Work already
committed to a machine through shop-floor setup also retains that assignment.

Stage Weight may be revised on the existing setup. New production sessions read
the current weight (Cycle Time Master's operation weight still takes precedence);
existing sessions retain their starting weight. Close and restart a session when
the physical weight changes during production. Saved production is never rewritten
by a route correction.

A sole route option remains automatically selected. When a second option is
created, existing job cards keep the previously automatic option; new job cards
with multiple options require planner selection. Changing an existing job's route
is an explicit planner action.

Machine allocation, family balancing, machine switches and proposal capacity use
the dedicated Machine Family field in the unit's Machine Master. An explicit
family is required in every Production Unit and is matched in full (for example,
T25 and T26 are different families). Machine numbers and names never determine
family. Machines without a family cannot receive automatic allocations or be
offered as compatible switch destinations or proposal capacity.

Operational replanning after Raw Material receipt checks leading and internal
idle gaps across every active physical machine in the compatible family. Ready,
unstarted setup streams may fill a gap only when they fit before the machine's
next reserved work. WIP availability, tooling capacity, physical machine locks,
planner decisions and minimum parallel-run rules remain binding.

Within one physical machine's queue, unstarted setups follow effective material
availability: Raw Material for the first setup and pooled WIP availability for
later setups. If a later-listed setup becomes ready before the setup ahead of it,
planning moves the ready setup forward instead of leaving the machine idle. A
setup at Raw Material at Machine or any later shop-floor stage retains its queue
position unless an explicit planner action moves or stops it.

Forecast upstream production does not reserve a physical machine for an unstarted
downstream setup. The planner allocates that setup only after recorded upstream
good output satisfies its pooled WIP buffer for the assigned machine count; until
then, the machine remains available for other material-ready work. Recorded setup
or production execution retains its physical assignment. The unreserved downstream
forecast still contributes every remaining route setup to the Job Card's current
probable dispatch date; forecast visibility and physical machine reservation are
separate planning decisions.

Raw Material receipt or pooled WIP availability is the earliest setup forecast
date, not a permanently retained overdue date. On recalculation, an unstarted
setup whose forecast is already past moves to the current planning date (or the
next working date), and its planned production start and finish move with it.
Recorded setup or production actuals remain locked.

**Master Identity**: The permanent system identity and generated code of one
master record. Editing its permitted details does not create a second master
or change its identity.

**Duplicate Master Entry**: Manual creation must reject an existing master
identity with “This entry already exists. Please edit the existing record.”
The rejected save leaves the existing record unchanged. Identity uses the
master's existing company, Production Unit, parent, code, or combination scope;
names ignore letter case and surrounding spaces where names define identity.
Explicit edits and workbook imports retain their existing behavior.

**Master Rename**: A correction to the name of an existing Master Identity.
Current records linked to that identity use the corrected name everywhere.
Finalized historical documents retain the values recorded when they were
issued.

**Master Replacement**: The surviving Master Identity selected when a
referenced duplicate or incorrect master is removed. Current references move
to the replacement before the unwanted master is deleted. The replacement
must be valid for every affected record.

Replacement includes current name-based selections as well as database links.
It must retain the same Production Unit, field/term type and any parent scope
required by the consuming record. Inactive replacements are invalid. Saved
inspection snapshots and issued commercial documents keep their recorded values.
Used route structure still requires a new route option; replacement cannot bypass
that rule. Conflicting child identities must be resolved before merging parents.

**Master Deletion**: Permanent removal of a master that has no references. A
referenced master cannot be deleted directly; it first requires a valid Master
Replacement. If no valid replacement exists, deletion is prohibited. Every
deletion and replacement remains recorded in the audit history. Master
workspaces do not offer Deactivate as an alternative to this lifecycle.

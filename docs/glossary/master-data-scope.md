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

**Production-unit Master**: A master whose records differ by Production Unit.
Its Data Entry and CSV import require one of the recognized Production Units.
Quality Inspection Parameter Master is production-unit-scoped even though the
three quality code masters above are company-wide.

Setup Name Master, Route Master, Cycle Time Master, and Tooling Master are
production-unit masters. Route Master selects Setup Name and Machine Family;
Cycle Time Master and Tooling Master select an existing Route Master Line and
cannot redefine its identity.

**Master Identity**: The permanent system identity and generated code of one
master record. Editing its permitted details does not create a second master
or change its identity.

**Master Rename**: A correction to the name of an existing Master Identity.
Current records linked to that identity use the corrected name everywhere.
Finalized historical documents retain the values recorded when they were
issued.

**Master Replacement**: The surviving Master Identity selected when a
referenced duplicate or incorrect master is removed. Current references move
to the replacement before the unwanted master is deleted. The replacement
must be valid for every affected record.

**Master Deletion**: Permanent removal of a master that has no references. A
referenced master cannot be deleted directly; it first requires a valid Master
Replacement. If no valid replacement exists, deletion is prohibited. Every
deletion and replacement remains recorded in the audit history. Master
workspaces do not offer Deactivate as an alternative to this lifecycle.

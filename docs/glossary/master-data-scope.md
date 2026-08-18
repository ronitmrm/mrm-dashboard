# Master Data Scope

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
- Commercial Pricing Masters.

**Production-unit Master**: A master whose records differ by Production Unit.
Its Data Entry and CSV import require one of the recognized Production Units.
Quality Inspection Parameter Master is production-unit-scoped even though the
three quality code masters above are company-wide.

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
deletion and replacement remains recorded in the audit history.

# Commercial Enquiries

**Customer Commercial Defaults**: The buyer, Incoterms, payment terms, shipment
mode, packaging, and currency normally used for a Customer. A new Enquiry copies
these defaults, while that Enquiry may select different active Commercial Master
values without changing the Customer.

**Commercial Term Master**: The company-wide active values available for Buyer,
Incoterms, Payment Terms, Shipment Mode, and Packaging dropdowns.

**Currency Catalog**: The application-owned, company-wide list of currency codes
available in Customer, Enquiry, and Purchase Order dropdowns. Currency is not a
maintainable Commercial Term Master. Existing saved currency values remain
readable and selectable when editing historical records.

**Enquiry Intake**: The Sales-owned recording and correction of one Enquiry's
commercial terms and line items before downstream work. Its line register opens
one selected line for editing and does not expose Technical Review or Design
inputs.
_Avoid_: Combined enquiry, Technical Review, and Design workspace.

**Originating Salesperson**: The authenticated Sales user who first creates an
Enquiry. The Enquiry and every Sales task derived from it remain visible and
actionable only to that user. Technical Review, Design, Costing, and other
downstream team queues remain shared; when downstream work is returned to
Sales, it returns to the same Originating Salesperson.
_Avoid_: Reassigning ownership when another team reviews or updates the Enquiry.

**Technical Review Release**: A Technical Review decision that marks one line
Feasible or Duplicate / Existing Product and makes it available in the Design
queue. Saving the decision stays within Technical Review; it does not start
Design work or transfer the reviewer into the Design workspace.
_Avoid_: Feasible means Design started.

**Design Task Detail**: The read-only page opened by Start Task for one released
Enquiry line. It shows the complete Technical Review in a structured form and
offers separate actions to search the Current Portfolio or open the Design form.
Portfolio search occurs on the Current Portfolio page, not inside the task.

**Current Product Portfolio**: The Design-readable, non-pricing catalog used to
find an existing Product before opening the new-Product Design form. It exposes
only Product UID, List / Package type, Product Size, Rod Size, Category,
Subcategory, MRMPL Description, and Product Type. Product Size, Category, and
Subcategory reuse the canonical Product metadata shown by Pricing; Rod Size is
the Product's separate raw-material section. Every nonblank Category and
Category/Subcategory pair displayed by the permanent internal Portfolio also
exists in the editable Design Category and Design Subcategory masters; legacy
Portfolio classifications are backfilled into those masters without creating
duplicates. Each Product UID appears once as
its own Product, regardless of how many Package BOMs use it; Package membership
never repeats a List Product under each parent. Membership includes every permanent internal
Product UID (the ordered portfolio across all Customers), plus active Sent
quoted Products that have not received an order for the current Design task's
Customer. The page uses column filters rather than a separate search box. Design
users access it through the `pricing.products.read` capability and do not use
or receive access to the Pricing Register.
_Avoid_: Sending Design users to Pricing, exposing prices and formula inputs,
showing another Customer's un-ordered quoted Products, displaying Rod Size as
Product Size, package-context component duplicates.

**Design Work Start**: The Design team's explicit choice to open the Design form
for one released line. It changes Pending Design to In Progress and opens that
line's separate new-Product Design workspace. Every tab saves only draft progress;
no tab-level Save action completes the task, and a draft save returns to the tab
from which it was submitted. The workspace order is Product
Details, BOM, Files, then Design Controls. Design Complete is an explicit final
action on Design Controls after every tab's requirements are satisfied. A
completed read-only workspace keeps all four tabs navigable for review. Successful
completion closes the editor and returns to the active Design queue. Completion
is counted in the Design Complete view only after the controlled Product handoff
to Product Parameter Costing succeeds. A failed handoff or a Product Costing
request for Design changes remains Active Design work, even if a prior save had
already stored Design Complete; it does not appear as Product Costing-ready until
Design completes the required correction and handoff.
Completion requires the Designer, target date, internal size, Category, Subcategory,
Checked By, every conditional requirement cost, a completed valid BOM with the
required new-component material, process, and piece-weight inputs, and current
Internal Drawing and CAD files. Product Type and Production Type are required on
each new List BOM line. Package parents and Assembly BOM rows have no Product
Type, but may select their post-container Production Type and Pricing Process
Columns Required.
When a Package BOM line selects an Existing Product, its Product UID/name,
Product Size, Category/Subcategory, material, Product Type, Production Type,
weights, Pricing process columns, and notes come from that controlled Product
and remain read-only; only BOM structure and quantity remain editable.
Customer-marked drawing, Operation Notes, and Design Remarks remain optional.
An incomplete completion attempt remains In Progress, stays in the active Design
queue, opens Design Controls, and displays each missing field in a visible remark.
The Designer is selected from active staff whose account or Approved Post has
the Design Team Profile. Checked By uses that same active Design Team staff
list. Completing and saving Design automatically creates or updates the
controlled Product and hands the line to Product Parameter Costing; Design has
no separate Prepare Product Costing action. Internal Category and Internal
Subcategory are selected from their company-wide masters. Product Type uses the
Design Process master and is limited to Barstock, Forged, Moulded, or Punching;
Forging, Conventional, and CNC are not Product Types. Production Type uses the
Product Machine Type master and is limited to CNC, Conventional, DP (Direct
Purchase), M/C Assembly, or Assembly. A Subcategory remains within its parent Category. Package Process
and Components Required are not
separate Product Details inputs; component identity, structure, and quantities
belong in the BOM.
For a new quoted Package or Assembly, Design owns the recursive BOM definition
before Product Parameter Costing starts. A matched existing Product reuses its
current Product Master BOM. Costing consumes that BOM; it does not redefine its
components or quantities. A Package requires at least two BOM lines before it
can complete.
A new quoted List is one manufactured part and therefore has one material and
process definition row: its source is New, component type is List, quantity is
one, and its parent, package-component name, and child UID are not applicable.
The Item Type explicitly selected by Design is authoritative on save; List BOM
display values must never cause the task to be inferred as a Package.
Its Part UID is the main Q/C Number allocated on save. A Package BOM begins with
a visible Package parent card for the controlled Product. The card repeats its
Product Size, Category, Subcategory, and automatic Product Name, derives its
One-Piece Weight recursively from top-level BOM quantities, and may select a
Production Type plus Pricing Process Columns Required for work performed after
the Package is combined. Add Component creates a top-level List or Assembly
below that parent; Remove Component removes only a component line. Each
component line opens Current Product Portfolio
through its own Select Product action; the draft is saved first, and choosing a
Product returns to that same line as Existing. A line without a selected Product
is New. Every component chooses List or Assembly, while only a component nested
below an earlier Assembly selects that Assembly as its parent; other lines are
automatically top-level and require no Parent entry. A line created below an
Assembly is always a List and cannot be changed to another Assembly. Every new List or Assembly
component in a Package selects its own Product Size, Category, and Subcategory;
its Product Name is generated in that order and the classification flows to the
controlled component Product. Changing an earlier line to Assembly makes it
available immediately as a parent for later lines. A new Assembly is a BOM
container, not a manufactured List part: it requires at least one child BOM
line, exposes Add List Part to create a child already assigned to that Assembly,
and has no Rod, Grade, Product Type, or manual weight. Its One-Piece Weight is
displayed as the recursive sum of each child's One-Piece Weight multiplied by
that child's BOM quantity. It may select Production Type and Pricing Process
Columns Required for operations performed after assembly.
For a new List, its Product Name is generated as Product Size + Category +
Subcategory. New BOM material fields reuse Product master choices: Rod Size uses
existing Product Rod Size values, while Rod Type and Grade use their active
masters. Product Type (Barstock, Forged, Moulded, or Punching) is distinct from
Production Type (CNC, Conventional, DP, M/C Assembly, or Assembly); both reuse
their Product masters and flow from each List BOM line to the corresponding
Product Parameter Costing and Pricing fields. Package parents and Assembly rows
may carry Production Type and their own post-container Pricing process
selection, but neither carries Product Type. BOM
headings match
Product Parameter Costing: Product Type, Production Type, Blank Piece Weight
( gm ), and 1 Piece Weight ( gm ). Pricing Process Columns Required selects the exact
optional Product Parameter Costing columns (Washing, Checking, Marking, Plating,
Annealing, Deburring, Buffing, and Sealant); the saved selection controls which
cost inputs are applicable in Product Parameter Costing.
_Avoid_: Inline portfolio search, opening every Design editor inside the queue,
automatic start on Technical Review completion, manual Costing handoff from
the Design workspace.

**Commercial Attachment**: Immutable drawing or CAD evidence retained through
the shared Artifact lifecycle. Enquiry drawings, Sales Clarification responses,
Design internal drawings, customer-marked drawings, and CAD files keep separate
business purposes and filenames. Replacing one purpose creates a new current
version and supersedes the former version without overwriting its bytes; exact
bytes may share one Organization-scoped physical object.
Each uploaded Commercial Attachment may be up to 25 MB; the request envelope
allows the multipart overhead needed to carry that validated file size.
Design Files separates the Package/List root and every BOM line into its own
file tab. Each tab keeps its Internal Drawing, Customer Marked Drawing, and CAD
evidence attached to that exact Product or BOM line, so different component
drawings are not merged into one undifferentiated Design file set.
_Avoid_: Mutable file paths, overwriting stored bytes, merging logical purposes.

**Product Base Price**: The Product-owned INR-per-piece cost before any
Customer-specific scrap/purchase choice, rejection adjustment, profit,
packaging, shipping, or FX. For a Derived Product, it is every applicable
Product process input per kg (machining, washing, checking, marking, plating,
annealing, deburring, buffing, sealant, assembly operation, and overhead)
divided by Pieces per kg. For a Direct Purchase Product, it is Direct Purchase
INR/kg divided by Pieces per kg. For a Package or Assembly, it is the
BOM-quantity sum of component Product Base Prices plus the parent Product's own
unadjusted full process cost per piece. Product Base Price is derived and must
not be copied from a customer workbook formula result.
A Package or Assembly One-Piece Weight is also derived recursively as the sum of
each direct component's One-Piece Weight multiplied by its BOM quantity. A nested
Package or Assembly contributes its recursively derived weight. Pieces per Kg is
`1000 / One-Piece Weight`; neither value is a parent-level manual input.

**Customer Parameter Costing**: The customer- and Enquiry-specific price step
after Product Parameter Costing. It applies scrap/purchase factors, profit,
packaging, shipping, and FX without changing the Product master cost. Product
Overhead is an INR/kg Product Parameter input and cannot be entered or overridden
at the customer level. For a Package or Assembly, Product Overhead joins only the
parent's own assembly process amount, not the combined component value.
Only one selected Enquiry and its recursive BOM are opened for editing at a
time. Product Parameter Costing and Customer Parameter Costing queues are
worklists only; each selected task opens on its own task URL so growing queues
do not share a page with the active form.

**Grade and Rod Material Rate**: The active Grade + Rod Type combination in the
Material Rates master owns Alloy Premium and Extrusion Cost. Product Parameter
Costing displays those values read-only and persists them when calculating the
Product Base Price. A Product's stored values are used only as a compatibility
fallback when no active master combination exists; Costing never manually
overrides an active master rate.

**Supplier Material Price List**: The MRMPL supplier list effective 05 May 2026
through 31 March 2027 initializes editable Material Rates by Grade + RM/Rod Type.
Its yellow Grade row supplies Alloy Premium and its orange matrix supplies
Extrusion Cost. `C36000`, `CW510L`, and `CuZn37` map to the existing canonical
Grades `CDA-360`, `LF-CW510L`, and `LF-CuZn37`. A blank Alloy Premium explicitly
means the document requires Copper/Zinc-market pricing and publishes no fixed
premium; blank must never be converted to zero.
_Avoid_: Hard-coded Product rates, duplicating aliased Grades, or inventing a
fixed premium for a market-based Grade.

**Package/Assembly Price Composition**: A Package or Assembly Customer Price
is the BOM-quantity sum of its component Customer Prices plus its own adjusted
process amount. Each component retains its own rejection and profit. The parent
applies rejection only to its own Product process amount. Packaging and shipping
are then added to that adjusted process line, and parent profit applies to that
parent line. The component total and parent line are added once, and FX is
applied once to the final INR total. The parent never applies rejection or profit
to the combined component value. Nested Package and Assembly prices follow the
same rule recursively. Product Parameter Costing separately rolls up component
base costs plus the unadjusted parent process cost per piece.
_Avoid_: Applying parent rejection or profit to component prices, flattening all
rejection/profit into one package-wide percentage.

**Ready Quote**: A Customer Parameter Costing result explicitly completed for
Sales. An In-Progress Quote remains `Draft` and editable; a `Ready` Quote is
locked for Costing and may be sent by Sales. Sending makes its saved calculation
and recursive Product snapshots immutable.

**Sent Quote PDF**: The exact generated PDF Artifact stored and linked during
Quote issuance before the Quote becomes `Sent`. Draft preview generation remains
live and creates no Artifact. Failed upload or Artifact metadata storage leaves
the Quote retryable; retries reuse the same logical issuance and
Organization-scoped physical bytes. Sent and superseded download URLs resolve
the stored Artifact instead of rebuilding from later Quote, Customer,
Organization, pricing, market, or term values.
_Avoid_: Regenerated historical Quote PDF, persisted draft preview, Sent without
an issued PDF Artifact.

**Sent PI document set**: The exact Proforma Invoice PDF and XLSX Artifacts
stored and linked as one required set before the PI becomes `Sent`. Draft PI
previews remain live and create no Artifact. If either file fails, neither
logical Artifact is issued and the PI remains retryable. Retries reuse the same
logical and Organization-scoped physical results. Approval and later Customer,
Purchase Order, or source-data changes do not replace either issued file; the
existing PI PDF and XLSX URLs resolve the stored Artifacts.
_Avoid_: Partial PI issuance, persisted draft preview, or regenerating either
sent file from current data.

**Issued Store Purchase Order PDF**: The exact PDF Artifact stored and linked
before a Goods or Repair Store Purchase Order becomes visible or operational.
Failed storage leaves the pending issuance hidden and retryable. The same
issuance retry reuses its Purchase Order, logical Artifact link, and
Organization-scoped physical bytes. Receipt progress, status changes, Supplier
details, and Store Item values never replace the issued PDF; the Purchase
Register download resolves the stored Artifact.
_Avoid_: Visible Store PO without a PDF, duplicate PO on retry, or regenerating
the PDF from current Store data.

**PO Price Match Costing**: A controlled replacement Quote requested when Sales
accepts a customer's PO price. The prior sent Quote remains immutable. The new
Quote may complete only when its price matches the requested PO price to four
decimal places; sending that exact replacement resolves the PO revision.

**Pricing Register**: The combined current-pricing spreadsheet. Product Base
rows expose ordered Product Master costs even before a customer Quote exists;
Customer Price rows come from active or editable root Quotes and their immutable
recursive Product and calculation snapshots. Package / Assembly customer pricing
displays each summary before its ordered BOM components. Every Package or Assembly,
including an intermediate Assembly, uses the same summary rules: Total Rate / PCS
In INR is only that summary's adjusted process price, BOM Component Cost is the sum
of its direct component customer prices times BOM quantities, and Total Package
Price Including BOM Component Cost is their combined INR price. Rate / PCS In
Currency divides that combined price by the saved customer conversion rate once.
Customer rows display that same saved rate; rows without a source rate display `-`. The legacy
Assembled Part and Product Base Cost columns are not displayed. Material-only
casting, scrap, alloy, extrusion, forging, raw-material formula outputs, and Total
Rods Cost are not applicable on a Package or Assembly summary and display `-`.
Grade, Rod Type, Rod Size, Burning Loss, and machining cost are also not applicable
to those summaries and display `-`. Marking,
plating, annealing, deburring, buffing, and sealant retain numeric zero when zero
and show their actual values when non-zero. Forging cost is applicable only when
Product Type is Casting or Forging; every other type, including Barstock and
Moulded, displays `-`. Rejection, burning-loss, and profit values include a
visible `%` suffix. Populated formula-derived cells use a light-blue fill in the
Pricing and Price Revisions tables; input/source cells retain the standard fill.
Package / Assembly rows otherwise retain parent, BOM quantity, commercial inputs,
formula evidence, and currency.
Package / Assembly completeness never reports One-Piece Weight or Pieces per Kg
as missing parent inputs; their derived values come from the recursive BOM. Any
missing component weight remains visible on the affected component row.
Purchased Products also show their current Website Product size and MRMPL Product
Description. Selecting a Customer Part Code opens its complete retained Quote
revision history. Customer Part Code is required only on a root customer line;
BOM component rows inherit the package context and may omit it. A component sold
separately is a root line with its own Customer Part Code. BOM hierarchy depth
remains internal structural metadata and is not displayed as a Pricing column.
Product Base rows never invent customer or Quote values.

**Quote Follow-Up Task**: The pending Sales task created atomically when a
Quote is sent. Sales must choose its Follow-Up Date during Quote send; the task
retains the sent Quote reference, uses Email as its initial channel, and remains
in the Sales Task List until completed or continued with a next Follow-Up Date.
There is no separate manual Follow-Up creation workflow.

**Drawing Register**: The operational drawing list with exactly one row per
Part. The row shows that Part's latest Drawing Revision; older revisions remain
stored and are not duplicated in the register.

**Drawing Change Log**: The immutable chronological record of every saved
Drawing History change. Each entry identifies the Part, time, user, and the
before and after drawing values, including Drawing Number, Revision, Revision
Date, laminated quantities, and remarks.

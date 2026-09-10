# Commercial Enquiries

**Customer Commercial Defaults**: The buyer, Incoterms, payment terms, shipment
mode, packaging, and currency normally used for a Customer. A new Enquiry copies
these defaults, while that Enquiry may select different active Commercial Master
values without changing the Customer.

**Commercial Term Master**: The company-wide active values available for Buyer,
Incoterms, Payment Terms, Shipment Mode, Packaging, Brass Material Specs, Reports,
and Taxes and Duties dropdowns. Packaging owns its packing cost (INR/kg), and
Incoterms owns its shipping cost (INR/kg). Each has one name used on forms and
the PDF; there is no separate PDF description. Shipment Mode has no cost.
Enquiries reference Packaging and Incoterms master IDs. Customer Parameter
Costing derives these costs from those records and snapshots them into the
Quote; submitted text or costs cannot override them. Unmapped/inactive masters
and missing costs must be corrected before costing. Zero is an explicit valid
cost. Legacy per-100-piece packaging rates are not silently treated as INR/kg.
Issued quotations retain their saved prices and PDF bytes. Removed values may
be displayed as historical text, but are not offered as active dropdown choices.

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
actionable only to that user or staff with the Administrative role. Administrative
access does not change the originating salesperson. Technical Review, Design, Costing, and other
downstream team queues remain shared; when downstream work is returned to
Sales, it returns to the same Originating Salesperson.
_Avoid_: Reassigning ownership when another team reviews or updates the Enquiry.

**Commercial Requote**: Sales selects an existing matched Product for a new
commercial price without a technical change. The Enquiry line retains that Product
link and is marked Duplicate / Existing Product; Technical Review and Design are
not required. It proceeds directly to Customer Parameter Costing using the existing
Product cost. This applies to CSV Import Review and Sales clarification decisions.
New lines and Technical Revision decisions still require Technical Review.

**Technical Review Release**: A Technical Review decision that marks one line
Feasible or Duplicate / Existing Product and makes it available in the Design
queue. Saving the decision stays within Technical Review; it does not start
Design work or transfer the reviewer into the Design workspace.
_Avoid_: Feasible means Design started.

**Design Task Detail**: The read-only page opened by Start Task for one released
Enquiry line. It shows the complete Technical Review in a structured form and
offers separate actions to search the Current Portfolio or open the Design form.
Portfolio search occurs on the Current Portfolio page, not inside the task.

**Product Design Dossier**: The current approved design definition owned by one
controlled Product. It combines Product classification and material/process
details, the canonical Product BOM, retained drawings, and Design controls
without copying Customer pricing. The dossier is seeded by the Product's
completed Design Task and advances only through a completed ECN Design Revision.
_Avoid_: Editing the original Design Task, a second Product Master, storing
design fields in Customer pricing.

**ECN Design Revision**: The editable Design-stage draft for one Engineering
Change Note, seeded from the Product Design Dossier. It uses the complete Design
workspace on a dedicated ECN page. Completion locks before/after design evidence,
publishes the revised Product Design Dossier, and sends the ECN to Product
Parameter Costing; earlier Design Tasks and ECN stages remain immutable.
_Avoid_: Inline ECN form on the register, editing the historical Design Task,
changing Product pricing during Design.

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
line's separate new-Product Design workspace. Before Design is complete, Return
to Portfolio Selection opens the Current Product Portfolio table so an authorized
editor can filter each column and select an existing ordered Product. Selection
returns that Product to the same task for confirmation; it never opens an inline
search box or Product dropdown. Opening selection does not change the
saved task; confirming the match replaces the new-design draft with that Product.
Every tab saves only draft progress;
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
Only tasks actually performed and completed by Design belong in Design Complete.
Matches confirmed through a Design task also remain visible there; previously
quoted or purchased Products that bypass Design do not. Costing readiness alone
does not count as completion of work by Design.
Matched tasks' stored Design status is `Not Required` because the
existing Product definition is reused; Product Costing is already complete.
They leave Active Design but retain their Enquiry line and matched Product
reference. Review opens the matched Product's read-only Design dossier.
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

**Canonical Product BOM**: The current Product-owned structure for a Package or
Assembly. A List Product is a leaf and has no BOM lines. Selecting an Existing
Product from Portfolio reuses that Product and its current BOM; adding it below
another Product creates only a reference in the parent BOM. Each Customer Quote
keeps an immutable BOM snapshot, so later Product changes never rewrite history.
_Avoid_: Self-BOM for a List, copying an Existing Product, rebuilding historical
Quote snapshots from the current BOM.

**Product Commercial Usage**: A derived description of how a Product is used
today: Directly Sold, Component Only, Both, or Unused. It follows active root
Customer Prices and current canonical BOM membership and may change without
changing the Product UID or Item Type.
_Avoid_: Permanent usage classification, creating another Product when a
component is later sold directly.

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

**Product Parameter Bulk Revision**: Product-owned costing work created from
Product Bulk Revision and completed from Product Parameter Costing on a dedicated
revision page. The candidate list contains each Product UID once, irrespective of
how many Customers or active Quotes use it. Permanent Products without active
Quotes are included with zero affected customer prices. They follow the same
staging and publication steps; no customer decision or Quote is created when
there are no affected prices. A staged Product process change shows
an INR-per-piece Product Base preview from Product-owned inputs only; it does not
change Product Master or the Pricing Register. Every active Quote path containing
the changed Product is handed to Customer Parameter Costing, where the staged
Product values remain unpublished. Customer Parameter Costing shows only the
affected active root prices. Each price requires one decision: revise it from the
new Product cost, or keep the current price by deriving the balancing Customer
profit. A shared decision may be recorded for selected pending prices; Select All
includes every pending price matching the current filters across all pages.
Bulk recording is atomic and never overwrites an existing decision or publishes
prices. Product-origin work never enters Customer Bulk Revision. Final revision
completion atomically publishes the Product inputs, re-derives that Product and
every canonical Package or Assembly ancestor in child-before-parent order, and
creates the immutable replacement Quote revisions. Product selection never
depends on Customer identity.

All bulk revisions remain in the single Revision Request Status table on their
initiating page. Incomplete rows open the matching revision in its current costing
queue: Customer Parameter Costing for Customer-origin requests and Product-origin
requests handed over to Customer Costing, otherwise Product Parameter Costing.
Completed rows link to read-only revision details:
Product Bulk Revision for Product-origin requests (including completion in Customer
Parameter Costing), and Customer Bulk Revision for Customer-origin requests.
History retains the reason, effective/completion dates, requested parameter values,
affected products/prices and publication results. New stages preserve the original
parameter value separately from the Product Base or customer price preview.
Legacy original values are shown only when saved evidence exists; current master
values must never be presented as historical inputs. Completed history cannot be edited.

**Customer Parameter Bulk Revision**: Customer-specific commercial recalculation.
Customer Bulk Revision owns request creation, request status and completed
read-only revision details.
Pending requests appear in Customer Parameter Costing; each opens a dedicated
Customer revision page there for selecting prices, staging/removing parameter
changes, and completing the revision.
Its Customer selector contains only Customers with an active Sent or Accepted
Quote. It does not contain Product-origin work. Customer inputs are staged against
the selected Customer''s applicable active prices and produce immutable Quote
replacements on completion.
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
For a Derived List, raw-material and scrap-return quantities use
`Blank Piece Weight / One-Piece Weight`; Blank Piece Weight remains grams per
finished piece and is never treated directly as a multiplier. For a Direct
Purchase root, Product Base Price and rejection stay per piece, while root
packaging and shipping INR/kg are divided by Pieces per kg before Product profit
and FX. Forging Cost applicability follows the List Product's Product Type
(`Forged`, with legacy `Forging`/`Casting` compatibility), not Production Type
such as CNC or Conventional.
Only one selected Enquiry and its recursive BOM are opened for editing at a
time. Product Parameter Costing and Customer Parameter Costing queues are
worklists only; each selected task opens on its own task URL so growing queues
do not share a page with the active form.

Each organization has exactly one Material Rate per Grade + Rod Type combination.
Price Master is one form containing Grade-specific Market Rates (INR/kg), common
process defaults, and currency conversion rates (INR per unit of quote currency).
Washing, Checking, Forging, Plating, Annealing, Deburring and Overhead defaults
are INR/kg. Buffing, Marking and Sealant defaults are INR/piece, multiplied by
the product's Pieces/kg to populate the existing INR/kg costing inputs.
Design process selection controls applicability. Product Costing may override
these defaults, including zero; saved product inputs and issued quotes retain
their snapshots. Market Rate defaults the existing Scrap INR/kg input for new
customer quotes; existing pricing formulas are unchanged. Exchange rate belongs
to Customer Costing, not Sales enquiry entry.
Master Tables shows both prices; users with Material Rates Save permission can
edit them in place. Blank Alloy Premium means market-based; zero is an explicit
price. Adding a duplicate combination is rejected; imports update the existing rate.

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

**Enquiry Line Current Status**: The workflow position of this Enquiry line.
Completed Customer Parameter Costing is Ready To Send; Sales issuance is Quote
Sent. Ordered requires acceptance/order evidence on this line's Quote. A Product
already having permanent P status does not mean this Enquiry has been ordered.
Quotes explicitly attached to another line must not supply this line's status.
Quote PDF status describes issuance only (Not Sent or PDF Sent); PDF Sent At is
the Quote issuance timestamp. Received is the Enquiry received date.

**Sent Quote PDF**: The exact generated PDF Artifact stored and linked during
Quote issuance before the Quote becomes `Sent`. Draft preview generation remains
live and creates no Artifact. Failed upload or Artifact metadata storage leaves
the Quote retryable; retries reuse the same logical issuance and
Organization-scoped physical bytes. Sent and superseded download URLs resolve
the stored Artifact instead of rebuilding from later Quote, Customer,
Organization, pricing, market, or term values.
_Avoid_: Regenerated historical Quote PDF, persisted draft preview, Sent without
an issued PDF Artifact.

**Full Enquiry Quotation**: Sales sends the whole Enquiry together, once every
independent line has completed Customer Parameter Costing or is marked Cannot
Quote. Draft or uncosted lines block sending. One action marks all Ready lines
Sent and stores one combined PDF, including previously sent lines and explicit
Cannot Quote outcomes. Linked duplicate lines follow their originating line.
Previously issued PDFs remain immutable; retries reuse the issued document.

The Technical Review handoff badge records history, not the current owner.
The enquiry header derives its current stage from its lines. A sent quotation is
Quotation Complete with Sales Follow-up still open; it is not an order completion.
While all actionable lines are back with Sales and no purchase order exists,
Sales may update commercial terms without changing enquiry identity. Changing
Incoterms, Packaging or Currency marks applicable lines for Customer Costing and
blocks full-enquiry sending until they are completed again. Other terms do not
reopen costing. Repricing creates new quote snapshots; previous sent prices and
issued PDFs remain unchanged.

Quote PDFs use the approved Mayank Raw Mint letterhead, green quotation banner,
details/customer blocks, Product and Customer codes, item prices, prepared-by
section, commercial terms, and contact footer. The customer record supplies To
(company, contact, available address); the Enquiry supplies Buyer, RFQ/customer
reference, items, payment/delivery/incoterms, shipment and packaging. Customer
Costing supplies the quote's saved exchange rate. Brass Material Specs, Reports, and Taxes and Duties each have a commercial
master. Sales selects their values on the Enquiry; the PDF uses those saved
values, so later master edits do not rewrite an enquiry. Unselected terms are
omitted. Generic Quote Term Templates are not appended. Quote numbers are generated
as `QTN-<Enquiry number>` without displaying the internal pricing revision; the date is the PDF
generation date in India time. Prepared by is always Ankit Khattar, Engineering
Lead. Westmetall's Official LME USD/ton **3 months** Copper and Zinc column is
fetched when generating the PDF, with its published date retained in PDF metadata (latest available
on weekends or before the day's publication). Missing metal rates block a new
PDF rather than substituting cash prices or blanks. Stored issued PDFs retain
their original date, rates and contents.

Every page uses the same letterhead and quotation banner. Item-table headings
and values are horizontally centred. Typography uses the supplied reference's
Outfit fonts and sizes. Delivery appears once, using saved delivery terms with
incoterms as fallback. The Customer master stores a multiline
address separately from country; both are included under To when saved.

An explicitly requested correction may replace an issued PDF with a new Artifact
version. Retain the previous bytes as history; do not change the underlying Sent
Quote prices or status. The enquiry PDF action opens the current corrected
version inside the authenticated viewer, with a separate explicit download.

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
uses **Q/P per Organization, Customer, Product and Customer Part Code**, independent
of the Product's M/R UID or catalog lifecycle. Only root customer rows with a
Customer Part Code display Q/P. BOM components at every depth and Product Base
rows display `-`, even when that component is sold separately elsewhere.
The migration workbook establishes each mapping's initial Q/P. Subsequently,
only PI approval changes Q to P, atomically with approval. Quotes, PO imports,
PI generation and marking a PI Sent do not change Q/P. Once P, the mapping stays
P across subsequent quotes and price revisions; other customers and part codes
remain independent. A separately sold component has its own customer mapping.
Package / Assembly customer pricing
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
Pricing presents Q/P once and does not expose migration-diagnostic completeness
or missing-value columns.

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

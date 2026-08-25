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

**Design Work Start**: The Design team's explicit choice to open the Design form
for one released line. It changes Pending Design to In Progress and opens that
line's separate new-Product Design workspace. Saving incomplete work remains In
Progress; completing its required BOM changes it to Design Complete.
_Avoid_: Inline portfolio search, opening every Design editor inside the queue,
automatic start on Technical Review completion.

**Customer Parameter Costing**: The customer- and Enquiry-specific price step
after Product Parameter Costing. It applies scrap/purchase factors, profit,
packaging, shipping, overhead, and FX without changing the Product master cost.
Only one selected Enquiry and its recursive BOM are opened for editing at a
time.

**Package/Assembly Price Composition**: A Package or Assembly Customer Price
is the BOM-quantity sum of its component Customer Prices plus its own adjusted
process amount. Each component retains its own rejection and profit. The parent
applies its rejection and profit only to its own assembly/package process amount;
it never applies either percentage to the combined component value. Nested
Package and Assembly prices follow the same rule recursively. Product Parameter
Costing separately rolls up component base costs plus the unadjusted parent
process cost per piece.
_Avoid_: Applying parent rejection or profit to component prices, flattening all
rejection/profit into one package-wide percentage.
**Ready Quote**: A Customer Parameter Costing result explicitly completed for
Sales. An In-Progress Quote remains `Draft` and editable; a `Ready` Quote is
locked for Costing and may be sent by Sales. Sending makes its saved calculation
and recursive Product snapshots immutable.

**PO Price Match Costing**: A controlled replacement Quote requested when Sales
accepts a customer's PO price. The prior sent Quote remains immutable. The new
Quote may complete only when its price matches the requested PO price to four
decimal places; sending that exact replacement resolves the PO revision.

**Pricing Register**: The current customer-price spreadsheet built from active
or editable root Quotes and their immutable recursive Product and calculation
snapshots. Package / Assembly rows retain parent, BOM depth, quantity,
commercial inputs, formula evidence, and currency. Purchased Products also show
their current Website Product size and MRMPL Product Description. Selecting a
Customer Part Code opens its complete retained Quote revision history.

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

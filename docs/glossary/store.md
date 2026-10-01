# Store

**Store Classification Master**: The maintained hierarchy of Asset Category,
Asset Subcategory, and Asset Name. A Subcategory belongs to one Category, and
an Asset Name belongs to one Subcategory. Store item creation selects these
values from the masters; users do not retype classification names. Store
masters are maintained in the company Data Entry workspace and reviewed in
Master Tables; they are not a separate Store workspace. Asset Category, Asset
Subcategory, and Asset Name do not own user-facing codes. Their hierarchy is
combined only when creating a Store Item Type.

**Store Item Type**: The unique combination of Asset Type and one selected
Store Classification Master path. It owns one permanent Asset Code and one
optional Identification. Identification records the distinguishing make, model,
size, grade, or specification when useful. It may be left blank in Data Entry
and CSV imports; received Physical Assets may also have blank Identification.
Data Entry controls its Drawing Number: new and edited Store Item Types use
their Asset Code as their Drawing Number. During Data Entry, the exact Asset
Type, Asset Category,
Asset Subcategory, and Asset Name combination is checked before saving. An
existing combination displays and reuses its existing Asset Code without
creating another Store Item Type; only a new combination generates a new Asset
Code. Its Master Table shows Asset Type, Category, Subcategory, Asset Name, and
Identification in separate columns. When a Store Item Type applies to a
manufactured product, its Product Portfolio UID is selected from active internal
Portfolio products instead of entered as free text.

Item Type CSV imports use Category, Subcategory, and Asset Name text from the
existing classification masters, matched ignoring letter case and outer spaces.
Subcategory is resolved within its Category and Asset Name within its Subcategory.
Unknown or ambiguous names are rejected with a row error; imports do not create
classification masters. Existing CSVs with internal IDs remain accepted.

All Store master CSV templates use readable references: Subcategory uses Category
name; Asset Name uses Category and Subcategory names; Supplier Price uses Supplier
name (or Supplier Code) and Store Asset Code. Category can be omitted for Asset
Name only when the Subcategory uniquely identifies one record. Unknown or
ambiguous references stop the import with a row error. Legacy ID columns remain
accepted. Unit and Location Type accept the form's displayed labels; units are
stored using the same values as the form. Supplier Price `valid_from` accepts
`YYYY-MM-DD`, `DD-MM-YYYY`, or `DD/MM/YYYY` and is stored as an ISO date. Master
exports include readable references as well.

**Asset Type**: The stock-control choice for a Store Item Type. It is either
Consumable or Non Consumable; users select it from a dropdown and never enter
another value.

**Asset Code**: The immutable, company-wide Store Item code generated from two
independent sequences when a Store Item Type is created: Consumables use
`C001`, `C002`, and so on; Non Consumables use `NC001`, `NC002`, and so on.
Users and CSV imports cannot supply or replace it. Every ordered quantity of
the same Store Item shares this code; Store checks the requested combination
before generating another code. Replacing the previous shared series is a
one-time normalization; after that migration, the new codes remain immutable.

**Physical Asset**: One Non Consumable item tracked individually through receipt,
assignment, movement, maintenance, calibration, breakage, and scrap.
Its Unit ID owns due dates, completed maintenance and calibration history, and
any open breakdown. Maintenance Masters and calibration appointments are assigned
to a physical Unit ID. The shared Asset Code describes the item type and never
receives a maintenance schedule.

**Unit ID / Serial ID**: The permanent identity of one Physical Asset, separate
from its shared Asset Code. It may use the manufacturer's serial number and has
a system Unit ID, for example `NC041-0001`; a replacement receives a new Unit
ID while the old unit keeps its history.

**Consumable**: A quantity-managed Store Item with no individual Unit ID or
Asset Workspace. All quantities share its Asset Code. A transfer between
accountable stores moves available quantity without changing company on-hand;
consumption, loss, or damage reduces company on-hand exactly once. Consumables
do not have calibration or maintenance timetables.

**Non Consumable**: A returnable Store Item whose physical units share one Asset
Code but each receive a Unit ID / Serial ID. It may be held by a Department,
Machine, Vendor, or the Store and is the only Asset Type that participates in
Asset Movement, maintenance, calibration, and Store Return.

**Accountable Store**: The company team responsible for the stock. Main Store
receives purchases initially; Quality Store and each production department's
store can receive a formal transfer. An accountable store may hold serialized
equipment and Consumables of any eligible Store Item Type. It controls that
stock's routine movements and supplier service orders. All stores use one
company database, Supplier Master, purchase register, and movement history.
An explicit accountability transfer changes which store controls a Unit ID or
quantity. A physical issue for use does not.

**Physical Holder / Location**: Where a Unit ID is currently kept or used,
including a store, production area, machine, or supplier. It may differ from
the Accountable Store. For example, a compressor accountable to Main Store can
be physically at a CNC machine; Main Store remains responsible until a formal
transfer to CNC Store. Company ownership persists through internal transfers.

**Store Balance**: Unused quantity of one Consumable at one accountable store.
An internal transfer decreases the source balance and increases the destination
balance by the same amount. Available to issue is the local unreserved balance;
company on-hand is the sum of unused balances across all accountable stores,
with each unit counted once. Consumption records the amount, date, operator,
and machine or job card; it lowers the accountable store balance and company
on-hand. An unused return is a new stock movement, and loss or damage is a
separately identified adjustment. No balance may become negative.

**Supplier**: The party from whom goods or repair services are purchased. A
Supplier owns one immutable system-generated code (`SUP-001`, `SUP-002`, and so
on), name, GST number, address, email, and contact details. Supplier names are
unique after trimming and ignoring letter case; a GST number, when supplied,
also belongs to only one Supplier. The same Supplier record is used when that
party temporarily holds an Asset for paid repair, avoiding a duplicate Vendor
record.

**Supplier Price Revision**: One dated price quoted by one Supplier for one
Store Item Type. Saving a new active revision makes the previous revision for
that exact Supplier and Store Item inactive; history is never overwritten.
There is at most one active revision per Supplier and Store Item. An optional
Supplier Quote PDF is attached to the exact revision rather than to the Item or
Supplier generally.

**Supplier Quote PDF**: The PDF evidence for one Supplier Price Revision. It is
limited to 10 MB, stored through the shared Artifact lifecycle, and available
from the Supplier Quotes tab in the Store Item Workspace. Replacing the current
file retains immutable superseded Artifact versions.

**Recommended Supplier Price**: The cheapest active Supplier Price Revision
effective on the Purchase Order date. It is selected by default. Store may
explicitly choose another Supplier with an active effective price; the
Purchase Order Line permanently keeps the chosen Supplier price as its price
snapshot. An item without an eligible price cannot be ordered.

**Vendor**: An external holder that does not receive a Purchase Order. Paid
repair and calibration providers are Suppliers, not duplicate Vendor records.

**Store Purchase Order**: The authority to receive one or more Store Item lines
from exactly one Supplier at their chosen Supplier Price Revisions. Selecting
items from multiple Suppliers creates one Purchase Order per Supplier. Each
goods order progresses through Open, Partially Received, Received, or
Cancelled.

**Store Purchase Order Line**: One Store Item Type, ordered quantity, chosen
Supplier Price Revision snapshot, and received quantity within a Store Purchase
Order. Receiving is saved against the line and cannot exceed its remaining
quantity. The issued Purchase Order identifies each line as `Item Code - Asset
Name`; the optional Identification Name does not replace the Asset Name on the
supplier document.

**Issued Store Purchase Order Format**: The supplier-facing PDF uses the
approved centered company header, centered numeric price columns, centered
amount-in-words value, and the authorized company signature-and-stamp block.
Continuation pages use a compact, left-aligned company logo, name, and
`Precision Brass Fittings & Metal Components` line. The PO number remains
right aligned on the same header row. Their green Purchase Order title band
matches the first page's height and title scale.

**Repair Purchase Order**: A Purchase Order for one or more individually tracked
Non Consumable Unit IDs sent to one Supplier for repair. Main Store selects the Unit
IDs from Stock; other accountable Stores select their units in their own Store
workspace. Each Store then reviews service scope, agreed price, and
repair Supplier on a separate page. One Supplier may be applied to all selected
units; when Suppliers differ, the accountable store issues one order per Supplier. Issuance
temporarily assigns every selected Physical Asset to its order's Supplier.
Each unit's line remains visible in the Purchase Register and its Asset
Workspace. When an assigned unit's order is issued, Store records its return
from the previous holder and its dispatch from Store to the repair Supplier.
For each Unit ID, Store may request reassignment to a selected Department as
part of the order. This creates a pending Store Request for one unit of the same
Asset Code, without reserving the Unit ID sent for repair. Store may issue any
available Unit ID of that Asset Code, including before the repaired unit returns.
Main Store completes each repair line in the Purchase Register; other
accountable Stores complete their lines in their Store workspace. The order is
complete when every unit is complete. Completion records that Unit ID's physical
return to its originating Store location as Asset Movement. The Department request is issued separately from available
stock; a returned unit can also be assigned by direct Store Movement. Repair
completion creates no goods receipt quantity. The PO records its originating
accountable store. Calibration service orders also use this order type for a
single unit and retain their Quality Control visit workflow.

**Store Purchase Register**: The shared record containing every Store Purchase
Order and its received quantity. Goods are received against the same order row;
repair lines and calibration service orders keep their originating accountable
store. Main Store repair completion is recorded on the repair line in this
register when the Unit ID returns; other Stores complete repair in their own
workspace. Purchase Order entry and goods receipt are not separate workspaces.

**Store Receipt**: One Goods Receipt Note recorded against exactly one Store
Purchase Order. It may contain one or more selected open goods lines from that
order; each line inherits its Store Item Type and agreed unit price and cannot
exceed its remaining quantity. Bulk receipt receives every selected line's full
remaining quantity into the primary Store in one atomic operation. Supplier Bill
Number, Supplier Bill Date, and an optional warranty / guarantee document belong
to the receipt header, while a common Warranty / Guarantee Until date is copied
to every selected receipt line and its Physical Assets. A receipt selection can
never mix lines from different Purchase Orders. Received By is the authorized
signed-in person's active linked Employee ID and name, or account name when no
active link exists.

**Store Request**: One numbered demand submitted by a Department and an
individual to one Store location. It contains one or more Coded Item Request
Lines selected from Current Stock and receives an immutable number such as
`STR-REQ-2026-000001`. Requested By is filled from the signed-in user's active
linked Employee ID and name, or their account name when no active link exists.
An assigned single Department is automatic; multiple assigned Departments
require a choice. System Administrators without an assignment may choose an
active Department.

A Repair Purchase Order may create a pending Store Request on behalf of a
selected Department for one unit of the same Asset Code when reassignment is
requested. The request does not reserve the unit sent for repair and can be
issued with any available Unit ID of that Asset Code. Its Requested By field
shows the selected Department; the PO creator remains the audited actor.

**Coded Item Request Line**: One Store Item Type and requested quantity within
a Store Request. Store allocates and saves each line independently; its live
available stock changes immediately after an issue is saved. Store may cancel
an open line when it will not fulfill the remaining quantity. Already issued
units stay issued; a cancelled line cannot be issued again. A Non Consumable
line may name one exact Unit ID, in which case its quantity is one and Store
must issue that Unit ID when it becomes available. A type-only request leaves
the choice of physical unit to Store.

**New Item Request**: Demand for an item that cannot be found in Current Stock
and therefore has no Asset Code. The requester may choose Category, Subcategory,
and Asset Name suggestions from the current Store Classification Master or type
new requested values without creating master records. An exact existing master
path remains linked to the request; a new or mixed path stays as request text for
Store to review. It is reviewed separately from Store Requests and cannot be
allocated until it resolves to a Store Item Type. Resolution requires an
explicitly selected Asset Code of the requested Asset Type; the request remains
Pending until that link is saved. The register shows the linked Asset Code after
resolution.
It uses the same signed-in requester identity and Department choice as a Store
Request.

**Request Allocation Queue**: The filterable Store worklist of Coded Item
Request Lines. It shows the Department, requesting individual, item, requested
and remaining quantities, and Current Available Stock, and allows each line to
be allocated independently. Issuing uses the request's Department and the
signed-in Store user's identity. A Non Consumable Unit ID is selected from the
available physical units for that request's Asset Code and Store; it is never
entered as free text. One bulk allocation can contain only selected open lines
for the same Department, and each line's full remaining quantity must be
currently available. The operator selects one available Non Consumable Unit ID
for every whole unit being issued. For a serialized line with a remaining
quantity of one, the first available Unit ID is preselected and remains editable;
the operator can choose another available Unit ID before saving. The complete
batch is issued in one atomic operation. A mixed Department, missing or duplicate
Unit ID, unavailable Unit ID, or stock shortfall leaves every selected line
unchanged.

**Stock Register**: Main Store's filterable inventory table containing both
Consumable and Non Consumable items across accountable Stores. It shows Main
Store availability alongside company-wide on-hand quantity or Unit ID count;
company totals include stock accountable to Quality and production Stores.
Departmental and Quality Store workspaces show their own accountable stock.
A Consumable has one quantity-managed row. Main Store records a loss or damage
adjustment against that row, with a reason; this reduces company on-hand.
Each Non Consumable Asset Code has a classification row with Main available and
company-wide unit counts.
Every company physical unit has a separate row, including assigned or unavailable units,
showing its permanent Unit ID, responsible Store, status, holder or location, and its actual purchase
Supplier and cost when recorded. Available units have quantity one; other units
show zero available. Assigned quantity is one only for a unit currently in
Assigned status and zero for other units. Asset Code rows show Main available
quantity and the company-wide count of assigned units; Consumables show their available
balance and no assigned quantity. Supplier quotes for future purchases remain
on the Asset Code, distinct from each unit's acquired Supplier and cost.
Receiptless legacy units may have their verified acquisition Supplier and price
recorded by Store against that individual Unit ID; receipt-backed units use the
original receipt and cannot be overridden here. For example, `NC001-0001` and
`NC001-0002` are different physical rows under Asset Code `NC001`; each opens
its own Asset Workspace. Purchase Order and type-only request controls remain
on the Asset Code row.

**Store Page Access**: Access is granted per Store page rather than through one
module-wide permission. Store Overview, Requests & Issues, New Item Requests,
Purchase Register, and Stock each have independent Read Only access and, where
the page changes data, independent Full Access. Stock Read Only reveals product
rows, quantities, and available Unit IDs but does not grant access to a Store
Item Workspace or the full Asset Workspace; scoped accountable Store history
remains visible. Asset Movement & Maintenance History has its
own Read Only and Full Access levels covering item/unit details, movements,
maintenance, calibration, repair, Supplier, and price history. A user allowed
to complete Repair POs may access the Purchase Register's non-calibration
Repair lines without Purchase Register Read Only; Goods lines and PO documents
remain restricted to Purchase Register readers.

**Current Available Stock**: A live derived value, never a request snapshot.
For Consumables it is the signed movement-ledger balance at the requested
Store. For Physical Assets it is the count of Available Unit IDs at that
Store. Every open request therefore sees the effect of the latest allocation.

**Store Item Workspace**: The permanent view for one Asset Code. Its Overview
tab contains identity, classification, stock, and every physical Unit ID; its
Drawings tab owns the current Asset Drawing upload; and its Supplier Quotes tab
contains every Supplier Price Revision and its Quote PDF. For a Non Consumable,
each Unit ID opens its individual Asset Workspace.

**Asset Workspace**: The permanent view for one Non Consumable Unit ID containing its
identity, current assignment, Department/Machine/Supplier/Vendor movement history,
maintenance and calibration timetable and history, Purchase Order, Supplier
price history, bill, warranty, and guarantee documents.

**Asset Drawing**: A PDF, JPG, or PNG drawing attached to one Store Item Type,
not to an individual Unit ID. Every Physical Asset of that Store Item Type sees
the same current drawing. The file is limited to 10 MB and uses the shared
Artifact lifecycle. Replacements retain immutable superseded versions, and
exact bytes may reuse one Organization-scoped physical object without
merging logical drawing links. Historical Store document rows remain readable.

**Asset Movement**: An immutable change in the holder of one Non Consumable
Unit ID between the Store, a Department, a Machine, or a Vendor. A Store Return
is an Asset Movement back to a Store location. The accountable Store records
direct movements without a request. Destinations are selected from
their active Department, Machine, Vendor, or Store masters. Selecting a Unit ID
shows its available quantity, allocated (assigned) quantity, and current holder
or Store location before recording the move. The Unit ID workspace shows the
movement history. Consumables never participate.

**Movement Register**: Main Store's operational screen for physical Unit ID
movements and explicit transfers of Unit ID responsibility or Consumable
quantity to another accountable Store. A physical move leaves the responsible
Store unchanged. A Store transfer changes the responsible Store or its local
available quantity while preserving company ownership. The register shows a
single history of these events and quantity adjustments. Fulfilling a
Department request remains an Issue, not a transfer into a department Store.

**Gauge Set**: A Quality Store handling group of exactly two physical gauges,
of any gauge types, under one Set ID and chosen name. It is not a third stock
item. Each gauge retains its Unit ID, manufacturing identity, calibration,
certificate, and movement history. Both must be accountable to Quality Store
and together when the set is created or moved as a set. One atomic Set Movement
records the same destination for both. Active members move together; a failed
or physically separated member makes the set Incomplete until corrected.
Replacement and disbanding retain membership history.

**Asset Maintenance Plan**: One active Calendar Days Maintenance Master assigned
to one physical Unit ID. The selected Master supplies the name, frequency and
checklist. The chosen first due date and subsequent completions belong only to
that unit. Receiving another unit does not assign a schedule automatically.
Historical Asset Code plans are inactive; their already created unit timetables
and completion history remain intact.

**Asset Maintenance Timetable**: The due and completion state for one physical
Unit ID. A Maintenance Master can supply its maintenance name and frequency;
existing direct timetables remain readable and completable from Mechanical.
Planned maintenance completion is recorded in Mechanical, not on the Unit ID
workspace. Calibration
scheduling and service evidence also belong to the individual Unit ID.
Moved By, Completed By, and asset-status Changed By identify the authorized signed-in
performer: active linked Employee ID and name when available, or account name
otherwise. Supplier / Lab separately records an external service provider.

**Calibration Timetable**: A named frequency and due date for one physical Unit
ID. Quality Control assigns it directly to the unit, regardless of accountable
store. Its next due date advances only after
a passing calibration result; a failed result remains due for corrective work.
One Unit ID may have multiple timetables, and each failed timetable needs its
own later passing result.

**Calibration Visit**: One due calibration occurrence for a Unit ID and its
Calibration Timetable. For Supplier calibration, the accountable store compares
offers and issues the service Purchase Order. Quality Control records physical
dispatch and return, uploads the Supplier certificate, and signs off pass or
fail. A passing sign-off advances that timetable and closes its service PO.
The Unit ID is released for use only when no other timetable has an unresolved
failure and no breakdown or repair hold remains. A failed result leaves it unavailable and due for
corrective work. An in-house visit has no Supplier, service order, or physical
movement; Quality Control records scope, date, signed-in performer, certificate
number and PDF, result, and notes. Each visit remains in the Unit ID history;
only one visit per timetable may be in progress at a time.

**Calibration Offer**: One Supplier's quoted service price for one Calibration
Visit. The Supplier is selected from Store Supplier Master. Offers are retained
as visit history; the selected price is copied to the visit and service Purchase
Order so later quotes do not change the agreed price. Goods Supplier Price
Revisions on an Asset Code remain separate from calibration service offers.

**Tooling Asset**: A Store Item Type created before it can be used as fixture,
tooling, or foam tooling in production. Its Asset Code is the only identity
that Tooling Master may reference; Tooling Master cannot create or accept a
free-text tool.

**Tooling Requirement**: A manufacturing master record that references one
existing Tooling Asset Code for a specific Route Master Line and identifies it
as fixture, tooling, or foam tooling. Quantity is not part of this master. It
does not assign, reserve, issue, or move a physical Store unit, and it does not
change Store stock or its holder.

A Route Master Line may explicitly require no special tooling. Fixture,
Tooling and Foam Tool can all be Not Required; saving still records the
completed tooling master for planning readiness. This record has no Asset Code
and does not create a Store asset or a physical tool requirement.

**Production tooling capacity**: Fixture, Tooling and Foam Tool are reusable
resources identified by their existing Store Asset Code. Each required code uses
one usable physical unit per setup/machine; listing the same code twice does not
create a second requirement. Not Required creates no reservation. Planning uses
only usable units allocated to the production department (including its machines),
never unallocated Store stock, another department's stock, broken, scrapped or
under-maintenance units. Store remains the only allocation/quantity source.

A setup holds its resources from presetting/setting through production until an
explicit planner stop or setup completion. Session closure for a shift change,
temporary pause or downtime does not release them. Stopping releases production
occupancy, not the department's Store allocation. Restarting checks capacity again.
Forecast reservations last through the planned production end; a late running
setup still blocks an actual start until released. Allocation and lifecycle changes
refresh planning. Insufficient allocated stock blocks the plan and its downstream
setups until Store supplies it; no release date is invented.

When successive setups share a resource with one allocated usable unit, prefer
the same compatible machine in sequence. Existing running ownership and explicit
planner machine choices take precedence, but cannot override resource capacity.
Machine, WIP and resource constraints all determine the forecast dates. Displays
separate total usable, Store-held, department allocated, occupied and free quantities.

Priority previews also respect department tooling capacity across machines and
the working calendar. Unselected reservations remain protected throughout the
previewed run; missing allocation or an unknown release date cannot promise dates.

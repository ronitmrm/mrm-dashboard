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
Identification. During Data Entry, the exact Asset Type, Asset Category,
Asset Subcategory, and Asset Name combination is checked before saving. An
existing combination displays and reuses its existing Asset Code without
creating another Store Item Type; only a new combination generates a new Asset
Code. Its Master Table shows Asset Type, Category, Subcategory, Asset Name, and
Identification in separate columns.

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

**Unit ID / Serial ID**: The permanent identity of one Physical Asset, separate
from its shared Asset Code. It may use the manufacturer's serial number and has
a system Unit ID, for example `NC041-0001`; a replacement receives a new Unit
ID while the old unit keeps its history.

**Consumable**: A quantity-managed Store Item that is allocated and issued
without an expected return. It has no individual Unit ID or Asset Workspace
and never participates in Asset Movement, maintenance, or calibration. All
quantities share the Store Item's Asset Code and an issue only reduces Current
Available Stock.

**Non Consumable**: A returnable Store Item whose physical units share one Asset
Code but each receive a Unit ID / Serial ID. It may be held by a Department,
Machine, Vendor, or the Store and is the only Asset Type that participates in
Asset Movement, maintenance, calibration, and Store Return.

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
There is at most one active revision per Supplier and Store Item.

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
quantity.

**Repair Purchase Order**: A Purchase Order for one individually tracked Non
Consumable Unit ID sent to one Supplier for repair or calibration. It records
the service description and agreed price, temporarily assigns the Physical
Asset to that Supplier, and remains visible in the Purchase Register and Asset
Workspace. Completing the work returns through the normal Asset Movement and
Maintenance History flows; it does not create stock receipt quantity.

**Store Purchase Register**: The single table containing every Store Purchase
Order and its received quantity. Goods are received against the same order row;
Purchase Order entry and receipt are not separate workspaces.

**Store Receipt**: A goods receipt recorded against one Store Purchase Order.
It cannot exceed the order's remaining quantity and inherits its Supplier,
Store Item Type, and agreed unit price.

**Store Request**: One numbered demand submitted by a Department and an
individual to one Store location. It contains one or more Coded Item Request
Lines selected from Current Stock and receives an immutable number such as
`STR-REQ-2026-000001`.

**Coded Item Request Line**: One Store Item Type and requested quantity within
a Store Request. Store allocates and saves each line independently; its live
available stock changes immediately after an issue is saved.

**New Item Request**: Demand for an item that cannot be found in Current Stock
and therefore has no Asset Code. It is reviewed separately from Store Requests
and cannot be allocated until it resolves to a Store Item Type.

**Request Allocation Queue**: The filterable Store worklist of Coded Item
Request Lines. It shows the Department, requesting individual, item, requested
and remaining quantities, and Current Available Stock, and allows each line to
be allocated independently. Issuing uses the request's Department and the
signed-in Store user's identity. A Non Consumable Unit ID is selected from the
available physical units for that request's Asset Code and Store; it is never
entered as free text.

**Stock Register**: The single filterable Store inventory table containing both
Consumable and Non Consumable Store Item Types. Each row shows Asset Code, Asset
Name, Category, Subcategory, quantity, and Storage Location. Purchase Order
mode adds row selection and ordered quantity without opening another form. The
Asset Code opens its Store Item Workspace. A Non Consumable row also lists each
available Unit ID, such as `NC001-0001` and `NC001-0002`; its quantity is the
count of those available physical units, not a shared consumable balance.

**Store Page Access**: Access is granted per Store page rather than through one
module-wide permission. Store Overview, Requests & Issues, New Item Requests,
Purchase Register, and Stock each have independent Read Only access and, where
the page changes data, independent Full Access. Stock Read Only reveals product
rows, quantities, and available Unit IDs but does not grant access to a Store
Item Workspace or Asset Workspace. Asset Movement & Maintenance History has its
own Read Only and Full Access levels covering item/unit details, movements,
maintenance, calibration, repair, Supplier, and price history.

**Current Available Stock**: A live derived value, never a request snapshot.
For Consumables it is the signed movement-ledger balance at the requested
Store. For Physical Assets it is the count of Available Unit IDs at that
Store. Every open request therefore sees the effect of the latest allocation.

**Store Item Workspace**: The permanent view for one Asset Code containing the
Store Item identity and classification, every Supplier Price revision and
Supplier able to supply it, and every physical Unit ID created for the item.
For a Non Consumable, each Unit ID opens its individual Asset Workspace.

**Asset Workspace**: The permanent view for one Non Consumable Unit ID containing its
identity, current assignment, Department/Machine/Supplier/Vendor movement history,
maintenance and calibration timetable and history, Purchase Order, Supplier
price history, bill, warranty, and guarantee documents.

**Asset Drawing**: A PDF, JPG, or PNG drawing attached to one Store Item Type,
not to an individual Unit ID. Every Physical Asset of that Store Item Type sees
the same current drawing. The file is limited to 10 MB and uses the configured
attachment storage; adding this feature does not introduce a new object-storage
provider.

**Asset Movement**: An immutable change in the holder of one Non Consumable
Unit ID between the Store, a Department, a Machine, or a Vendor. A Store Return
is an Asset Movement back to a Store location; Consumables never participate.

**Asset Maintenance Timetable**: A Maintenance Master definition assigned to
one specific Unit ID. Completing the work records evidence and calculates
the next due date from the definition frequency. Calibration is a maintenance
type and does not belong to the Store Item Type.

**Tooling Asset**: A Store Item Type created before it can be used as fixture,
tooling, or foam tooling in production. Its Asset Code is the only identity
that Tooling Master may reference; Tooling Master cannot create or accept a
free-text tool.

**Tooling Requirement**: A manufacturing master record stating that a quantity
of one existing Tooling Asset Code is used to manufacture a specific production
item at a route option and setup. It does not assign, reserve, issue, or move a
physical Store unit, and it does not change Store stock or its holder.

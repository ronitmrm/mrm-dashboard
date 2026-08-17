# Store

**Store Classification Master**: The maintained hierarchy of Asset Category,
Asset Subcategory, and Asset Name. A Subcategory belongs to one Category, and
an Asset Name belongs to one Subcategory. Store item creation selects these
values from the masters; users do not retype classification names. Store
masters are maintained in the company Data Entry workspace and reviewed in
Master Tables; they are not a separate Store workspace.

**Store Item Type**: The unique combination of Asset Type and one selected
Store Classification Master path. It owns one permanent Asset Code and one
Identification Name.

**Asset Type**: The stock-control choice for a Store Item Type. It is either
Consumable or Non Consumable; users select it from a dropdown and never enter
another value.

**Asset Code**: The immutable, company-wide Store Item code generated in sequence as
`ST001`, `ST002`, and so on when a Store Item Type is created. Users and CSV
imports cannot supply or replace it. Every ordered quantity of the same Store
Item shares this code; Store checks the requested combination before generating
another code.

**Physical Asset**: One Non Consumable item tracked individually through receipt,
assignment, movement, maintenance, calibration, breakage, and scrap.

**Unit ID / Serial ID**: The permanent identity of one Physical Asset, separate
from its shared Asset Code. It may use the manufacturer's serial number and has
a system Unit ID, for example `ST041-00001`; a replacement receives a new Unit
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

**Supplier**: The party from whom a Purchase Order is placed. Supplier and
email are maintained in Supplier Master. Price history belongs to the ordered
Store Item and is visible from its individual Asset workspace.

**Current Supplier Price**: The newest effective Supplier Price Master entry
for one Store Item Type. It determines both the Supplier and unit price when
that item is added to a Purchase Order; an item without one cannot be ordered.

**Vendor**: An external party that may temporarily hold a Non Consumable Asset,
for example for repair or calibration. A Vendor is not a Supplier unless it is
separately maintained in both masters.

**Store Purchase Order**: The authority to receive one or more Store Item lines
from exactly one Supplier at their Current Supplier Prices. Selecting items
from multiple Suppliers creates one Purchase Order per Supplier. Each order
progresses through Open, Partially Received, Received, or Cancelled.

**Store Purchase Order Line**: One Store Item Type, ordered quantity, Current
Supplier Price, and received quantity within a Store Purchase Order. Receiving
is saved against the line and cannot exceed its remaining quantity.

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
be allocated independently.

**Stock Register**: The single filterable Store inventory table containing both
Consumable and Non Consumable Store Item Types. Each row shows Asset Code, Asset
Name, Category, Subcategory, quantity, and Storage Location. Purchase Order
mode adds row selection and ordered quantity without opening another form.

**Current Available Stock**: A live derived value, never a request snapshot.
For Consumables it is the signed movement-ledger balance at the requested
Store. For Physical Assets it is the count of Available Unit IDs at that
Store. Every open request therefore sees the effect of the latest allocation.

**Asset Workspace**: The permanent view for one Unit ID containing its
identity, current assignment, Department/Machine/Vendor movement history,
maintenance and calibration timetable and history, Purchase Order, Supplier
price history, bill, warranty, and guarantee documents.

**Asset Movement**: An immutable change in the holder of one Non Consumable
Unit ID between the Store, a Department, a Machine, or a Vendor. A Store Return
is an Asset Movement back to a Store location; Consumables never participate.

**Asset Maintenance Timetable**: A Maintenance Master definition assigned to
one specific Unit ID. Completing the work records evidence and calculates
the next due date from the definition frequency. Calibration is a maintenance
type and does not belong to the Store Item Type.

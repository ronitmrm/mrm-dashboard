# Store

**Store Classification Master**: The maintained hierarchy of Asset Category,
Asset Subcategory, and Asset Name. A Subcategory belongs to one Category, and
an Asset Name belongs to one Subcategory. Store item creation selects these
values from the masters; users do not retype classification names. Store
Masters shows one selector-driven data-entry form and its saved records at a
time.

**Store Item Type**: The unique combination of Asset Type and one selected
Store Classification Master path. It owns one permanent Type Code and one
Identification Name.

**Asset Type**: The stock-control choice for a Store Item Type. It is either
Consumable or Non Consumable; users select it from a dropdown and never enter
another value.

**Type Code**: The immutable, company-wide Store code generated in sequence as
`ST001`, `ST002`, and so on when a Store Item Type is created. Users and CSV
imports cannot supply or replace it. Existing historical Type Codes remain
unchanged. Store checks a requested combination before generating another code.

**Physical Asset**: One Non Consumable item tracked individually through receipt,
assignment, movement, maintenance, calibration, breakage, and scrap.

**Asset Code**: The permanent identity of one Physical Asset, formed as its
Type Code plus a sequential five-digit number, for example `N41-00001`. A
replacement receives a new Asset Code; the old asset keeps its history.

**Consumable**: A quantity-managed Store Item that is issued without an
expected return or later movement tracking. Consumables do not receive
individual Asset Codes.

**Non Consumable**: A returnable Store Item that receives one permanent Asset
Code per physical unit. It may be held by a Department, Machine, Vendor, or the
Store.

**Supplier**: The party from whom a Purchase Order is placed. Supplier and
price history belong to the ordered Store Item and are visible from its
individual Asset workspace.

**Vendor**: An external party that may temporarily hold a Non Consumable Asset,
for example for repair or calibration. A Vendor is not a Supplier unless it is
separately maintained in both masters.

**Store Purchase Order**: The authority to receive a quantity of one Store Item
Type from one Supplier at an agreed unit price. It progresses through Open,
Partially Received, Received, or Cancelled.

**Store Receipt**: A goods receipt recorded against one Store Purchase Order.
It cannot exceed the order's remaining quantity and inherits its Supplier,
Store Item Type, and agreed unit price.

**Store Request**: One department requisition for one Store Item Type and one
Store location. It receives an immutable number such as
`STR-REQ-2026-000001` and progresses through Pending, Partially Issued,
Fulfilled, or Cancelled. An open request may start a Purchase Order with its
Store Item Type and remaining quantity prefilled; Supplier and agreed price
must still be selected before the order is saved.

**Current Available Stock**: A live derived value, never a request snapshot.
For Consumables it is the signed movement-ledger balance at the requested
Store. For Physical Assets it is the count of Available Asset Codes at that
Store. Every open request therefore sees the effect of the latest issue. The
Stock workspace also contains the complete clickable Physical Asset register.

**Asset Workspace**: The permanent view for one Asset Code containing its
identity, current assignment, Department/Machine/Vendor movement history,
maintenance and calibration timetable and history, Purchase Order, Supplier
price history, bill, warranty, and guarantee documents.

**Asset Maintenance Timetable**: A Maintenance Master definition assigned to
one specific Asset Code. Completing the work records evidence and calculates
the next due date from the definition frequency. Calibration is a maintenance
type and does not belong to the Store Item Type.

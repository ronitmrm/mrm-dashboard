# ISO Document

ISO Document groups registers. The document number appears on the right inside
the page header, labelled "Document No.", never in sidebar labels. The initial
Measuring Instrument Register number
is `MRMPL/ISO/REG/001` (defined in `apps/web/lib/iso-documents.ts`).

## Measuring Instrument Register

This is a live view of active Store Item Types whose category is Measuring
Instrument or Measuring Instruments (case and whitespace insensitive). Existing
and newly created items appear, including items with no received stock. Store
category edits determine inclusion; no copied records or separate entry process
exist. Inactive items follow Store Stock visibility.

One row represents an Asset Code. Opening it uses the existing Store Item
Workspace, including its physical units and their location, history, calibration
and certificates. All records and changes remain owned by Store. Store Locations
and Available Stock on the register describe available stock, not issued units;
open the workspace for individual units' current locations.

Access uses `store.stock.read`; opening a workspace additionally requires
`store.asset_history.read`. Existing Store action permissions remain enforced.
The Universal Measuring Instrument Master for inspection dropdowns is unchanged.

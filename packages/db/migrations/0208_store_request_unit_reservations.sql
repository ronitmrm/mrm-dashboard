-- An open exact-unit request holds its Unit ID until fulfillment or cancellation.
-- This also prevents two concurrent Store requests from reserving one unit.
CREATE UNIQUE INDEX store_requisitions_open_requested_asset_unique
  ON store.requisitions (organization_id, requested_asset_id)
  WHERE requested_asset_id IS NOT NULL
    AND status IN ('Pending', 'Partially Issued');

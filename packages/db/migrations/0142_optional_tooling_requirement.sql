-- A null asset code records an explicit no-special-tooling requirement.
ALTER TABLE manufacturing.operation_tooling ALTER COLUMN tool_code DROP NOT NULL;
CREATE UNIQUE INDEX operation_tooling_no_asset_unique
  ON manufacturing.operation_tooling (operation_setup_id)
  WHERE tool_code IS NULL;

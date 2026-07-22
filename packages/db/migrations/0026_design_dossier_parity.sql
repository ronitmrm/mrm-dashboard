ALTER TABLE sales.design_tasks
  ADD COLUMN IF NOT EXISTS designer_name text,
  ADD COLUMN IF NOT EXISTS target_completion_date date,
  ADD COLUMN IF NOT EXISTS internal_part_size text,
  ADD COLUMN IF NOT EXISTS internal_part_sub_category text,
  ADD COLUMN IF NOT EXISTS internal_part_category text,
  ADD COLUMN IF NOT EXISTS internal_part_name text,
  ADD COLUMN IF NOT EXISTS revision_no text,
  ADD COLUMN IF NOT EXISTS design_bom_required text NOT NULL DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS components_required text,
  ADD COLUMN IF NOT EXISTS assembly_required text NOT NULL DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS operation_notes text,
  ADD COLUMN IF NOT EXISTS tooling_required text NOT NULL DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS tooling_approx_cost numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixture_required text NOT NULL DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS fixture_approx_cost numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gauges_required text NOT NULL DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS inspection_approx_cost numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checked_by text,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'Pending';

ALTER TABLE sales.design_tasks
  ADD CONSTRAINT design_tasks_tooling_cost_nonnegative
    CHECK (tooling_approx_cost >= 0) NOT VALID,
  ADD CONSTRAINT design_tasks_fixture_cost_nonnegative
    CHECK (fixture_approx_cost >= 0) NOT VALID,
  ADD CONSTRAINT design_tasks_inspection_cost_nonnegative
    CHECK (inspection_approx_cost >= 0) NOT VALID;

ALTER TABLE sales.design_tasks
  VALIDATE CONSTRAINT design_tasks_tooling_cost_nonnegative;
ALTER TABLE sales.design_tasks
  VALIDATE CONSTRAINT design_tasks_fixture_cost_nonnegative;
ALTER TABLE sales.design_tasks
  VALIDATE CONSTRAINT design_tasks_inspection_cost_nonnegative;

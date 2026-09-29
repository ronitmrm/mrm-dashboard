CREATE TABLE store.asset_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  asset_id uuid NOT NULL REFERENCES store.assets(id),
  started_at timestamptz NOT NULL,
  reason_code text NOT NULL,
  reason_name text NOT NULL,
  remark text,
  status text NOT NULL DEFAULT 'In Progress'
    CHECK (status IN ('In Progress', 'Completed')),
  completed_at timestamptz,
  completed_by text,
  completed_by_employee_code text,
  work_done text,
  changed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  maintenance_record_id uuid REFERENCES store.asset_maintenance_records(id),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  completed_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'In Progress' AND completed_at IS NULL)
    OR (status = 'Completed' AND completed_at IS NOT NULL))
);

CREATE UNIQUE INDEX store_asset_breakdown_one_open_idx
  ON store.asset_breakdowns (organization_id, asset_id)
  WHERE status = 'In Progress';

CREATE INDEX store_asset_breakdown_open_idx
  ON store.asset_breakdowns (organization_id, started_at DESC)
  WHERE status = 'In Progress';

GRANT SELECT, INSERT, UPDATE ON store.asset_breakdowns TO mrmpl_web;
GRANT SELECT ON store.asset_breakdowns TO mrmpl_worker, mrmpl_reporting;

CREATE TABLE store.asset_maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  schedule_id uuid NOT NULL REFERENCES store.asset_maintenance_schedules(id),
  due_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('In Progress', 'Completed')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  completed_at timestamptz,
  completed_by text NOT NULL,
  completed_by_employee_code text,
  checklist_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  work_done text,
  maintenance_record_id uuid UNIQUE REFERENCES store.asset_maintenance_records(id),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, due_on),
  CHECK ((status = 'In Progress' AND completed_at IS NULL AND maintenance_record_id IS NULL)
    OR (status = 'Completed' AND completed_at IS NOT NULL AND maintenance_record_id IS NOT NULL))
);

CREATE INDEX store_asset_maintenance_tasks_due_idx
  ON store.asset_maintenance_tasks (organization_id, due_on);

GRANT SELECT, INSERT, UPDATE ON store.asset_maintenance_tasks TO mrmpl_web;
GRANT SELECT ON store.asset_maintenance_tasks TO mrmpl_worker, mrmpl_reporting;

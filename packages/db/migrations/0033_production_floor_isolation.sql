CREATE TABLE manufacturing.production_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

INSERT INTO manufacturing.production_floors (
  organization_id,
  code,
  name
)
SELECT organization.id, floor.code, floor.name
FROM core.organizations organization
CROSS JOIN (
  VALUES
    ('conventional', 'Conventional Production Floor'),
    ('cnc', 'CNC Production Floor'),
    ('forging', 'Forging Production Floor')
) AS floor(code, name)
ON CONFLICT (organization_id, code) DO NOTHING;

ALTER TABLE catalog.machines
  ADD COLUMN production_floor_id uuid
    REFERENCES manufacturing.production_floors(id);

UPDATE catalog.machines machine
SET production_floor_id = floor.id
FROM manufacturing.production_floors floor
WHERE floor.organization_id = machine.organization_id
  AND floor.code = 'conventional'
  AND machine.production_floor_id IS NULL;

ALTER TABLE catalog.machines
  ALTER COLUMN production_floor_id SET NOT NULL;

DROP INDEX catalog.machines_number_unique;

CREATE UNIQUE INDEX machines_floor_number_unique
  ON catalog.machines (
    organization_id,
    production_floor_id,
    lower(machine_number)
  );

ALTER TABLE manufacturing.route_options
  ADD COLUMN production_floor_id uuid
    REFERENCES manufacturing.production_floors(id);

UPDATE manufacturing.route_options route
SET production_floor_id = floor.id
FROM manufacturing.production_floors floor
WHERE floor.organization_id = route.organization_id
  AND floor.code = 'conventional'
  AND route.production_floor_id IS NULL;

ALTER TABLE manufacturing.route_options
  ALTER COLUMN production_floor_id SET NOT NULL;

ALTER TABLE manufacturing.route_options
  DROP CONSTRAINT route_options_item_id_route_code_revision_key;

ALTER TABLE manufacturing.route_options
  ADD CONSTRAINT route_options_floor_route_revision_unique
  UNIQUE (item_id, production_floor_id, route_code, revision);

DROP INDEX maintenance.machine_schedules_key_unique;

CREATE UNIQUE INDEX machine_schedules_key_unique
  ON maintenance.machine_schedules (
    organization_id,
    machine_id,
    lower(schedule_key)
  );

DROP INDEX maintenance.maintenance_tasks_key_unique;

CREATE UNIQUE INDEX maintenance_tasks_key_unique
  ON maintenance.tasks (
    organization_id,
    machine_schedule_id,
    lower(task_key)
  );

CREATE INDEX production_floors_active_idx
  ON manufacturing.production_floors (organization_id, active, code);

CREATE INDEX route_options_floor_active_idx
  ON manufacturing.route_options (
    organization_id,
    production_floor_id,
    active,
    item_id
  );

DROP INDEX IF EXISTS catalog.machines_floor_number_unique;

CREATE UNIQUE INDEX machines_number_unique
  ON catalog.machines (organization_id, lower(machine_number));

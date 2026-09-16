-- Preserve checklist identities; never copy a universal checklist into every unit.
ALTER TABLE quality.setup_checklist_templates
  ADD COLUMN production_floor_id uuid REFERENCES manufacturing.production_floors(id);

UPDATE quality.setup_checklist_templates template
SET production_floor_id = floor.id
FROM manufacturing.production_floors floor
WHERE floor.organization_id = template.organization_id
  AND floor.code = COALESCE(
    template.source_payload->>'productionFloorCode',
    template.source_payload->'payload'->>'productionFloorCode',
    (SELECT route.production_floor_code FROM (
      SELECT f.code AS production_floor_code
      FROM manufacturing.route_options r
      JOIN manufacturing.production_floors f ON f.id = r.production_floor_id
      WHERE r.id = template.route_option_id
    ) route),
    CASE WHEN lower(btrim(template.name)) = 'setup checklist cnc' THEN 'cnc' END
  );

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM quality.setup_checklist_templates WHERE production_floor_id IS NULL) THEN
    RAISE EXCEPTION 'Assign existing setup checklists to a production unit before migration.';
  END IF;
END $$;

ALTER TABLE quality.setup_checklist_templates
  ALTER COLUMN production_floor_id SET NOT NULL,
  DROP CONSTRAINT setup_checklist_templates_organization_id_code_revision_key,
  ADD UNIQUE (organization_id, production_floor_id, code, revision);

UPDATE quality.setup_checklist_templates template
SET source_payload = COALESCE(template.source_payload, '{}'::jsonb)
    || jsonb_build_object('productionFloorCode', floor.code),
    updated_at = now(), row_version = template.row_version + 1
FROM manufacturing.production_floors floor
WHERE floor.id = template.production_floor_id;

UPDATE quality.setup_checklist_template_items item
SET source_payload = COALESCE(item.source_payload, '{}'::jsonb)
    || jsonb_build_object('productionFloorCode', floor.code),
    updated_at = now(), row_version = item.row_version + 1
FROM quality.setup_checklist_templates template
JOIN manufacturing.production_floors floor ON floor.id = template.production_floor_id
WHERE item.template_id = template.id;

-- Preserve existing access, including explicit denials and expiry dates.
CREATE TEMP TABLE setup_checklist_permission_mapping ON COMMIT DROP AS
SELECT p.id AS old_id,
  replace(p.key, 'masters.universal.', 'masters.' || unit.code || '.') AS new_key,
  p.name, p.description
FROM identity.permissions p
CROSS JOIN (VALUES ('conventional'), ('conventional-02'), ('cnc'), ('forging')) unit(code)
WHERE p.key LIKE 'masters.universal.setup_checklist_master.%';

INSERT INTO identity.permissions (key, module, name, description)
SELECT new_key, 'masters', name, description FROM setup_checklist_permission_mapping
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id FROM setup_checklist_permission_mapping map
JOIN identity.role_permissions rp ON rp.permission_id = map.old_id
JOIN identity.permissions p ON p.key = map.new_key
ON CONFLICT DO NOTHING;

INSERT INTO identity.user_permission_overrides
  (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at)
SELECT overrides.user_id, p.id, overrides.effect, overrides.reason,
  overrides.assigned_by_user_id, overrides.assigned_at, overrides.expires_at
FROM setup_checklist_permission_mapping map
JOIN identity.user_permission_overrides overrides ON overrides.permission_id = map.old_id
JOIN identity.permissions p ON p.key = map.new_key
ON CONFLICT DO NOTHING;

DELETE FROM identity.permissions WHERE key LIKE 'masters.universal.setup_checklist_master.%';

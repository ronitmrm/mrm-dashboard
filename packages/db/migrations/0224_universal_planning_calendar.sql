-- One shared calendar entry per date. Preserve existing dates, IDs and reasons.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM manufacturing.planning_calendar_exceptions
    GROUP BY organization_id, exception_date HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate calendar dates before moving holidays to Universal.';
  END IF;
END $$;

UPDATE manufacturing.planning_calendar_exceptions
SET exception_type = 'calendar',
    source_payload = jsonb_build_object(
      'date', exception_date::text,
      'dayType', 'Holiday',
      'reason', name,
      'remark', COALESCE(source_payload->'payload'->>'remark', source_payload->>'remark', '')
    ),
    working_minutes = 0,
    updated_at = now(), row_version = row_version + 1;

-- Move the existing holiday grants to the shared master; no umbrella grants.
CREATE TEMP TABLE planning_calendar_permission_mapping ON COMMIT DROP AS
SELECT id AS old_id, 'masters.universal.planning_holiday.' || split_part(key, '.', 4) AS new_key,
  'Universal / Planning Calendar / ' || split_part(key, '.', 4) AS name
FROM identity.permissions
WHERE key ~ '^masters\.(conventional|conventional-02|cnc|forging)\.planning_holiday\.';

INSERT INTO identity.permissions (key, module, name)
SELECT DISTINCT new_key, 'masters', name FROM planning_calendar_permission_mapping
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id FROM planning_calendar_permission_mapping map
JOIN identity.role_permissions rp ON rp.permission_id = map.old_id
JOIN identity.permissions p ON p.key = map.new_key
ON CONFLICT DO NOTHING;

-- Do not silently resolve contradictory individual access rules across units.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM planning_calendar_permission_mapping map
    JOIN identity.user_permission_overrides o ON o.permission_id = map.old_id
    GROUP BY o.user_id, map.new_key
    HAVING count(DISTINCT (o.effect, o.expires_at)) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve conflicting holiday permission overrides before moving to Universal.';
  END IF;
END $$;

INSERT INTO identity.user_permission_overrides
  (user_id, permission_id, effect, reason, assigned_by_user_id, assigned_at, expires_at)
SELECT DISTINCT ON (o.user_id, p.id)
  o.user_id, p.id, o.effect, o.reason, o.assigned_by_user_id, o.assigned_at, o.expires_at
FROM planning_calendar_permission_mapping map
JOIN identity.user_permission_overrides o ON o.permission_id = map.old_id
JOIN identity.permissions p ON p.key = map.new_key
ORDER BY o.user_id, p.id, o.assigned_at DESC
ON CONFLICT DO NOTHING;

DELETE FROM identity.permissions
WHERE id IN (SELECT old_id FROM planning_calendar_permission_mapping);

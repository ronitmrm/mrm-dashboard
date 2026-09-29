-- The NC285/MM001 Asset Code plan was created before maintenance moved to
-- individual Unit IDs. Retire that confirmed plan without touching its
-- NC285-0001 timetable or completed records.
UPDATE store.item_type_maintenance_plans
SET active = false, updated_at = now()
WHERE id = '8ac800ee-c6aa-4a03-a46b-b47ecc80008d'
  AND active;

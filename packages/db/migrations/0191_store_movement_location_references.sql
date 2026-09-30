UPDATE store.stock_movements movement
SET from_holder_reference = location.code,
    from_holder_name = location.name
FROM store.locations location
WHERE movement.organization_id = location.organization_id
  AND movement.from_holder_type = 'STORE'
  AND (
    movement.from_holder_reference = location.id::text
    OR (movement.from_holder_reference IS NULL
      AND movement.location_id = location.id)
    OR (lower(movement.from_holder_reference) = lower(location.code)
      AND nullif(movement.from_holder_name, '') IS NULL)
  )
  AND (movement.from_holder_reference IS DISTINCT FROM location.code
    OR movement.from_holder_name IS DISTINCT FROM location.name);

UPDATE store.stock_movements movement
SET to_holder_reference = location.code,
    to_holder_name = location.name
FROM store.locations location
WHERE movement.organization_id = location.organization_id
  AND movement.to_holder_type = 'STORE'
  AND (
    movement.to_holder_reference = location.id::text
    OR (movement.to_holder_reference IS NULL
      AND movement.location_id = location.id)
    OR (lower(movement.to_holder_reference) = lower(location.code)
      AND nullif(movement.to_holder_name, '') IS NULL)
  )
  AND (movement.to_holder_reference IS DISTINCT FROM location.code
    OR movement.to_holder_name IS DISTINCT FROM location.name);

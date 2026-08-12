UPDATE manufacturing.production_floors
SET name = 'Production Planning & Control Forging',
  updated_at = now()
WHERE code = 'forging'
  AND name IS DISTINCT FROM 'Production Planning & Control Forging';

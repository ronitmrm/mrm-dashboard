UPDATE manufacturing.production_floors
SET name = 'Production Planning & Control Conventional-01',
  updated_at = now()
WHERE code = 'conventional'
  AND name IS DISTINCT FROM 'Production Planning & Control Conventional-01';

UPDATE manufacturing.production_floors
SET name = 'Production Planning & Control Conventional-02',
  updated_at = now()
WHERE code = 'conventional-02'
  AND name IS DISTINCT FROM 'Production Planning & Control Conventional-02';

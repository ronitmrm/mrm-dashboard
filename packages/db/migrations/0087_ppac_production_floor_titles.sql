UPDATE manufacturing.production_floors
SET name = CASE code
    WHEN 'conventional' THEN 'PPAC Conventional-01'
    WHEN 'conventional-02' THEN 'PPAC Conventional-02'
    WHEN 'cnc' THEN 'PPAC CNC-01'
    WHEN 'forging' THEN 'PPAC Forging'
  END,
  updated_at = now()
WHERE code IN ('conventional', 'conventional-02', 'cnc', 'forging')
  AND name IS DISTINCT FROM CASE code
    WHEN 'conventional' THEN 'PPAC Conventional-01'
    WHEN 'conventional-02' THEN 'PPAC Conventional-02'
    WHEN 'cnc' THEN 'PPAC CNC-01'
    WHEN 'forging' THEN 'PPAC Forging'
  END;
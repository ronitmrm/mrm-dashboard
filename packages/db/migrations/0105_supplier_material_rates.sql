-- Seed the editable MRMPL supplier price list valid from 2026-05-05 through
-- 2027-03-31. A NULL alloy premium means the supplier document marks that
-- grade as Copper/Zinc market based instead of publishing a fixed premium.

ALTER TABLE sales.material_rates
  ALTER COLUMN alloy_premium DROP NOT NULL;

WITH organization AS (
  SELECT id
  FROM core.organizations
  WHERE lower(code) = 'mrmpl'
), missing_grades(name) AS (
  VALUES ('HPB59-1'), ('C69300')
)
INSERT INTO catalog.material_grades (
  organization_id,
  name,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  organization.id,
  missing_grades.name,
  'supplier-price-list',
  'revised-price-list-mrmpl-2026-05-05',
  lower(missing_grades.name),
  jsonb_build_object(
    'document', 'Revised Price List - MRMPL',
    'effectiveOn', DATE '2026-05-05',
    'validThrough', DATE '2027-03-31'
  )
FROM organization
CROSS JOIN missing_grades
ON CONFLICT DO NOTHING;

WITH organization AS (
  SELECT id
  FROM core.organizations
  WHERE lower(code) = 'mrmpl'
), supplier_rates(
  supplier_grade,
  canonical_grade,
  rod_type,
  alloy_premium,
  extrusion_cost
) AS (
  VALUES
    ('C3604', 'C3604', 'SOLID', 7, 26),
    ('C3604', 'C3604', 'SOLID STRAIGHT KNURLING', 7, 31),
    ('C3604', 'C3604', 'SOLID DIAMOND KNURLING', 7, 36),
    ('C3604', 'C3604', 'HOLLOW', 7, 36),
    ('C3604', 'C3604', 'HOLLOW STRAIGHT KNURLING', 7, 41),
    ('C3604', 'C3604', 'HOLLOW DIAMOND KNURLING', 7, 46),
    ('C3604', 'C3604', 'SECTION', 7, 33),
    ('C37700', 'C37700', 'SOLID', 18, 26),
    ('C37700', 'C37700', 'SOLID STRAIGHT KNURLING', 18, 31),
    ('C37700', 'C37700', 'SOLID DIAMOND KNURLING', 18, 36),
    ('C37700', 'C37700', 'HOLLOW', 18, 36),
    ('C37700', 'C37700', 'HOLLOW STRAIGHT KNURLING', 18, 41),
    ('C37700', 'C37700', 'HOLLOW DIAMOND KNURLING', 18, 46),
    ('C37700', 'C37700', 'SECTION', 18, 33),
    ('C36000', 'CDA-360', 'SOLID', 36, 26),
    ('C36000', 'CDA-360', 'SOLID STRAIGHT KNURLING', 36, 31),
    ('C36000', 'CDA-360', 'SOLID DIAMOND KNURLING', 36, 36),
    ('C36000', 'CDA-360', 'HOLLOW', 36, 36),
    ('C36000', 'CDA-360', 'HOLLOW STRAIGHT KNURLING', 36, 46),
    ('C36000', 'CDA-360', 'HOLLOW DIAMOND KNURLING', 36, 51),
    ('C36000', 'CDA-360', 'SECTION', 36, 36),
    ('HPB59-1', 'HPB59-1', 'SOLID', 10, 26),
    ('HPB59-1', 'HPB59-1', 'SOLID STRAIGHT KNURLING', 10, 31),
    ('HPB59-1', 'HPB59-1', 'SOLID DIAMOND KNURLING', 10, 36),
    ('HPB59-1', 'HPB59-1', 'HOLLOW', 10, 36),
    ('HPB59-1', 'HPB59-1', 'HOLLOW STRAIGHT KNURLING', 10, 41),
    ('HPB59-1', 'HPB59-1', 'HOLLOW DIAMOND KNURLING', 10, 46),
    ('HPB59-1', 'HPB59-1', 'SECTION', 10, 36),
    ('CW510L', 'LF-CW510L', 'SOLID', NULL, 35),
    ('CW510L', 'LF-CW510L', 'HOLLOW', NULL, 50),
    ('CW510L', 'LF-CW510L', 'SECTION', NULL, 45),
    ('C46500', 'C46500', 'SOLID', NULL, 40),
    ('C46500', 'C46500', 'HOLLOW', NULL, 55),
    ('C46500', 'C46500', 'SECTION', NULL, 50),
    ('C69300', 'C69300', 'SOLID', NULL, 100),
    ('CuZn37', 'LF-CuZn37', 'PIPE', NULL, 135)
)
INSERT INTO sales.material_rates (
  organization_id,
  material_grade_id,
  rod_type_id,
  effective_on,
  rate_per_kg,
  currency_code,
  active,
  alloy_premium,
  extrusion_cost,
  source_system,
  source_table,
  source_id,
  source_payload
)
SELECT
  organization.id,
  grade.id,
  rod_type.id,
  DATE '2026-05-05',
  0,
  'INR',
  true,
  supplier_rates.alloy_premium,
  supplier_rates.extrusion_cost,
  'supplier-price-list',
  'revised-price-list-mrmpl-2026-05-05',
  lower(supplier_rates.supplier_grade || ':' || supplier_rates.rod_type),
  jsonb_build_object(
    'document', 'Revised Price List - MRMPL',
    'supplierGrade', supplier_rates.supplier_grade,
    'effectiveOn', DATE '2026-05-05',
    'validThrough', DATE '2027-03-31',
    'alloyPremiumBasis', CASE
      WHEN supplier_rates.alloy_premium IS NULL
      THEN 'Copper and Zinc market based'
      ELSE 'Fixed'
    END
  )
FROM organization
JOIN catalog.material_grades grade
  ON grade.organization_id = organization.id
JOIN supplier_rates
  ON lower(grade.name) = lower(supplier_rates.canonical_grade)
JOIN catalog.rod_types rod_type
  ON rod_type.organization_id = organization.id
 AND lower(rod_type.name) = lower(supplier_rates.rod_type)
ON CONFLICT (organization_id, material_grade_id, rod_type_id)
DO UPDATE SET
  effective_on = EXCLUDED.effective_on,
  active = true,
  alloy_premium = EXCLUDED.alloy_premium,
  extrusion_cost = EXCLUDED.extrusion_cost,
  source_system = EXCLUDED.source_system,
  source_table = EXCLUDED.source_table,
  source_id = EXCLUDED.source_id,
  source_payload = EXCLUDED.source_payload,
  updated_at = now(),
  row_version = sales.material_rates.row_version + 1;

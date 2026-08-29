BEGIN;

ALTER TABLE sales.design_bom_lines
  ADD COLUMN IF NOT EXISTS production_type text;

UPDATE sales.design_bom_lines bom
SET production_type = COALESCE(
  NULLIF(btrim(bom.production_type), ''),
  NULLIF(btrim(bom.manufacturing_process), ''),
  NULLIF(btrim(task.manufacturing_process), '')
)
FROM sales.design_tasks task
WHERE task.id = bom.design_task_id
  AND NULLIF(btrim(bom.production_type), '') IS NULL;

COMMIT;

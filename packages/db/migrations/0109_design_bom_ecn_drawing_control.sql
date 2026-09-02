-- Controlled Product Design/Drawing revisions and Design HOD release gate.

ALTER TABLE sales.design_tasks
  ADD COLUMN IF NOT EXISTS drawing_requirement text NOT NULL DEFAULT 'Required'
    CHECK (drawing_requirement IN ('Required', 'Not Required')),
  ADD COLUMN IF NOT EXISTS structured_bom_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS drawings_completed_at timestamptz;

ALTER TABLE sales.design_bom_lines
  ADD COLUMN IF NOT EXISTS drawing_requirement text NOT NULL DEFAULT 'Required'
    CHECK (drawing_requirement IN ('Required', 'Not Required'));

ALTER TABLE sales.engineering_change_notes
  ADD COLUMN IF NOT EXISTS design_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS design_submitted_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS design_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS design_approved_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS design_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS design_rejected_by_user_id uuid
    REFERENCES identity.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS design_rejection_remarks text,
  ADD COLUMN IF NOT EXISTS cost_impacting boolean,
  ADD COLUMN IF NOT EXISTS cost_impact_drivers_json jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE sales.engineering_change_notes
SET status = 'Pending Customer Costing'
WHERE status = 'Pending Costing';

CREATE TABLE catalog.product_design_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  engineering_change_note_id uuid REFERENCES sales.engineering_change_notes(id),
  revision_number integer NOT NULL CHECK (revision_number >= 0),
  revision_label text NOT NULL CHECK (
    revision_label = lpad(revision_number::text, 2, '0')
  ),
  status text NOT NULL CHECK (status IN ('Draft', 'Released', 'Superseded', 'Rejected')),
  is_current boolean NOT NULL DEFAULT false,
  effective_on date,
  change_reason text NOT NULL,
  design_snapshot jsonb NOT NULL,
  bom_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  released_at timestamptz,
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (item_id, revision_number),
  UNIQUE (source_system, source_table, source_id),
  CHECK (NOT is_current OR status = 'Released')
);

CREATE UNIQUE INDEX product_design_revisions_current_unique
  ON catalog.product_design_revisions (item_id)
  WHERE is_current;

CREATE INDEX product_design_revisions_item_history_idx
  ON catalog.product_design_revisions (item_id, revision_number DESC);

CREATE TABLE catalog.drawing_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  item_id uuid NOT NULL REFERENCES catalog.items(id),
  product_design_revision_id uuid NOT NULL
    REFERENCES catalog.product_design_revisions(id),
  engineering_change_note_id uuid REFERENCES sales.engineering_change_notes(id),
  file_id uuid REFERENCES core.files(id),
  drawing_number text NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number >= 0),
  revision_label text NOT NULL CHECK (
    revision_label = lpad(revision_number::text, 2, '0')
  ),
  requirement_status text NOT NULL DEFAULT 'Required'
    CHECK (requirement_status IN ('Required', 'Not Required')),
  status text NOT NULL CHECK (status IN ('Draft', 'Released', 'Superseded', 'Rejected')),
  is_current boolean NOT NULL DEFAULT false,
  effective_on date,
  change_reason text NOT NULL,
  raised_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  uploaded_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  source_system text NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (item_id, revision_number),
  UNIQUE (source_system, source_table, source_id),
  CHECK (NOT is_current OR status = 'Released'),
  CHECK (requirement_status = 'Not Required' OR file_id IS NOT NULL)
);

CREATE UNIQUE INDEX drawing_revisions_current_unique
  ON catalog.drawing_revisions (item_id)
  WHERE is_current;

CREATE INDEX drawing_revisions_item_history_idx
  ON catalog.drawing_revisions (item_id, revision_number DESC);

CREATE OR REPLACE FUNCTION catalog.prevent_released_design_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Released design revision evidence cannot be deleted.';
  END IF;
  IF OLD.status = 'Released'
     AND NEW.status = 'Superseded'
     AND OLD.is_current
     AND NOT NEW.is_current
     AND (to_jsonb(OLD) - ARRAY['status', 'is_current']::text[])
       = (to_jsonb(NEW) - ARRAY['status', 'is_current']::text[]) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Released design revision evidence cannot be changed.';
END;
$$;

CREATE TRIGGER product_design_revisions_immutable
BEFORE UPDATE OR DELETE ON catalog.product_design_revisions
FOR EACH ROW WHEN (OLD.status IN ('Released', 'Superseded'))
EXECUTE FUNCTION catalog.prevent_released_design_revision_mutation();

CREATE TRIGGER drawing_revisions_immutable
BEFORE UPDATE OR DELETE ON catalog.drawing_revisions
FOR EACH ROW WHEN (OLD.status IN ('Released', 'Superseded'))
EXECUTE FUNCTION catalog.prevent_released_design_revision_mutation();

-- Initial Design may seed applicability from positive prices once. From this
-- point onward `processesRequired` is the sole pricing applicability source.
UPDATE catalog.items item
SET source_payload = jsonb_set(
  COALESCE(item.source_payload, '{}'::jsonb),
  '{processesRequired}',
  to_jsonb(array_remove(ARRAY[
    CASE WHEN item.machining_cost > 0 THEN 'Machining' END,
    CASE WHEN item.washing > 0 THEN 'Washing' END,
    CASE WHEN item.checking > 0 THEN 'Checking' END,
    CASE WHEN item.marking > 0 THEN 'Marking' END,
    CASE WHEN item.plating > 0 THEN 'Plating' END,
    CASE WHEN item.annealing > 0 THEN 'Annealing' END,
    CASE WHEN item.deburring > 0 THEN 'Deburring' END,
    CASE WHEN item.buffing > 0 THEN 'Buffing' END,
    CASE WHEN item.sealant > 0 THEN 'Sealant' END,
    CASE WHEN item.assembly_operation_cost > 0 THEN 'Package Assembly' END
  ], NULL)),
  true
)
WHERE NOT COALESCE(item.source_payload, '{}'::jsonb) ? 'processesRequired';

INSERT INTO catalog.product_design_revisions (
  organization_id, item_id, revision_number, revision_label, status,
  is_current, effective_on, change_reason, design_snapshot, bom_snapshot,
  created_at, created_by_user_id, approved_at, approved_by_user_id,
  released_at, source_system, source_table, source_id, source_payload
)
SELECT item.organization_id, item.id, 0, '00', 'Released', true,
  item.updated_at::date, 'Initial Release',
  jsonb_build_object(
    'uid', item.uid,
    'description', item.description,
    'itemType', item.item_type,
    'productionType', item.production_type,
    'materialGradeId', item.material_grade_id,
    'rodTypeId', item.rod_type_id,
    'rodSize', item.rod_size,
    'weight100Pcs', item.weight_100_pcs,
    'casting', item.casting,
    'processesRequired', COALESCE(item.source_payload->'processesRequired', '[]'::jsonb),
    'sourcePayload', COALESCE(item.source_payload, '{}'::jsonb)
  ),
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'componentItemId', line.component_item_id,
      'quantity', line.quantity,
      'sequence', line.sequence,
      'notes', line.notes
    ) ORDER BY line.sequence, line.created_at, line.id)
    FROM catalog.bom_lines line
    WHERE line.parent_item_id = item.id
  ), '[]'::jsonb),
  item.created_at, item.created_by_user_id, item.updated_at,
  item.updated_by_user_id, item.updated_at, 'mrm-dashboard',
  'product_design_revisions', item.id::text || ':00',
  jsonb_build_object('backfilled', true)
FROM catalog.items item
WHERE item.uid_kind = 'INTERNAL' AND item.lifecycle_status = 'P'
ON CONFLICT (item_id, revision_number) DO NOTHING;

WITH ranked AS (
  SELECT drawing.*,
    row_number() OVER (
      PARTITION BY drawing.item_id
      ORDER BY drawing.effective_at DESC NULLS LAST,
        drawing.updated_at DESC, drawing.id DESC
    ) AS rank
  FROM catalog.drawings drawing
), current_design AS (
  SELECT revision.id, revision.item_id
  FROM catalog.product_design_revisions revision
  WHERE revision.is_current
)
INSERT INTO catalog.drawing_revisions (
  organization_id, item_id, product_design_revision_id, file_id,
  drawing_number, revision_number, revision_label, requirement_status,
  status, is_current, effective_on, change_reason, raised_by_user_id,
  uploaded_by_user_id, approved_at, approved_by_user_id, released_at,
  created_at, source_system, source_table, source_id, source_payload
)
SELECT ranked.organization_id, ranked.item_id, current_design.id,
  ranked.file_id, COALESCE(NULLIF(btrim(ranked.drawing_number), ''), item.uid),
  0, '00', CASE WHEN ranked.file_id IS NULL THEN 'Not Required' ELSE 'Required' END,
  'Released', true, ranked.effective_at::date, 'Initial Release',
  ranked.created_by_user_id, ranked.created_by_user_id, ranked.effective_at,
  ranked.created_by_user_id, COALESCE(ranked.effective_at, ranked.updated_at),
  ranked.created_at, 'mrm-dashboard', 'drawing_revisions',
  ranked.item_id::text || ':00',
  jsonb_build_object('backfilled', true, 'legacyRevision', ranked.revision)
FROM ranked
JOIN current_design ON current_design.item_id = ranked.item_id
JOIN catalog.items item ON item.id = ranked.item_id
WHERE ranked.rank = 1
ON CONFLICT (item_id, revision_number) DO NOTHING;

INSERT INTO identity.permissions (key, module, name, description)
VALUES (
  'pricing.ecns.engineering_approve', 'pricing',
  'Approve Engineering Change Design',
  'Allows a linked Design HOD to approve or reject an ECN Design revision.'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO identity.role_permissions (role_id, permission_id)
SELECT existing.role_id, approval.id
FROM identity.role_permissions existing
JOIN identity.permissions revision_write
  ON revision_write.id = existing.permission_id
 AND revision_write.key = 'pricing.revisions.write'
JOIN identity.permissions approval
  ON approval.key = 'pricing.ecns.engineering_approve'
ON CONFLICT (role_id, permission_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON
  catalog.product_design_revisions,
  catalog.drawing_revisions
TO mrmpl_web;

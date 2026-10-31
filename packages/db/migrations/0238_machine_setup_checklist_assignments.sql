CREATE TABLE quality.machine_setup_checklist_assignments (
  machine_id uuid PRIMARY KEY REFERENCES catalog.machines(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES core.organizations(id),
  template_id uuid REFERENCES quality.setup_checklist_templates(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0)
);
CREATE INDEX machine_setup_checklist_assignments_template_idx
  ON quality.machine_setup_checklist_assignments(template_id);

ALTER TABLE manufacturing.shop_floor_setup_state
  ADD COLUMN setup_checklist_template_id uuid REFERENCES quality.setup_checklist_templates(id),
  ADD COLUMN setup_checklist_pinned_at timestamptz,
  ADD COLUMN setup_checklist_legacy_session boolean NOT NULL DEFAULT false;

ALTER TABLE quality.setup_checklist_sessions
  ADD COLUMN items_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(items_snapshot) = 'array');

-- Preserve the checklist the existing unit-wide workflow selects today. This
-- runs once, before operators create and explicitly assign additional templates.
INSERT INTO quality.machine_setup_checklist_assignments
  (machine_id, organization_id, template_id)
SELECT machine.id, machine.organization_id, selected.id
FROM catalog.machines machine
CROSS JOIN LATERAL (
  SELECT template.id
  FROM quality.setup_checklist_templates template
  WHERE template.organization_id = machine.organization_id
    AND template.production_floor_id = machine.production_floor_id
    AND template.active
    AND EXISTS (SELECT 1 FROM quality.setup_checklist_template_items item
                WHERE item.template_id = template.id AND item.active)
  ORDER BY (template.code ~* '^SC[0-9]+$') DESC,
    CASE WHEN template.code ~* '^SC[0-9]+$'
      THEN substring(template.code FROM 3)::numeric END DESC NULLS LAST,
    length(template.code) DESC, lower(template.code) DESC, template.revision DESC
  LIMIT 1
) selected
WHERE machine.active;

-- Existing saved definitions take precedence over today's master definitions.
-- Item UUIDs continue to identify the relational answers; snapshots freeze the
-- prompts, response types and required flags shown for this saved session.
WITH saved_definitions AS (
  SELECT session.id, COALESCE((
    SELECT jsonb_agg(point.value)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(session.source_payload->'items') = 'array'
      THEN session.source_payload->'items' ELSE '[]'::jsonb END) point
    WHERE jsonb_typeof(point.value) = 'object'
      AND COALESCE(NULLIF(point.value->>'checkPoint', ''), NULLIF(point.value->>'prompt', '')) IS NOT NULL
  ), (
    SELECT jsonb_agg(point.value)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(session.source_payload->'payload'->'items') = 'array'
      THEN session.source_payload->'payload'->'items' ELSE '[]'::jsonb END) point
    WHERE jsonb_typeof(point.value) = 'object'
      AND COALESCE(NULLIF(point.value->>'checkPoint', ''), NULLIF(point.value->>'prompt', '')) IS NOT NULL
  ), '[]'::jsonb) AS items
  FROM quality.setup_checklist_sessions session
)
UPDATE quality.setup_checklist_sessions session
SET items_snapshot = COALESCE((
  SELECT jsonb_agg(snapshot.item ORDER BY (snapshot.item->>'sequence')::integer, snapshot.item->>'itemKey')
  FROM (
    -- When saved definitions exist, their membership is authoritative. A point
    -- added to today's master must never become a historical required point.
    SELECT jsonb_build_object(
      'itemId', item.id,
      'itemKey', COALESCE(NULLIF(saved.value->>'itemKey', ''), item.item_key,
        template.code || '|' || saved.position::text),
      'checkPoint', COALESCE(NULLIF(saved.value->>'checkPoint', ''), saved.value->>'prompt'),
      'inputType', COALESCE(NULLIF(saved.value->>'inputType', ''), item.response_type, 'checkbox'),
      'required', CASE WHEN NULLIF(saved.value->>'required', '') IS NOT NULL
        THEN lower(saved.value->>'required') NOT IN ('no', 'false', '0', 'optional')
        ELSE COALESCE(item.required, true) END,
      'sequence', CASE WHEN saved.value->>'sequence' ~ '^[0-9]+$'
        THEN (saved.value->>'sequence')::integer ELSE COALESCE(item.sequence, saved.position::integer) END,
      'section', 'Setting', 'checklistCode', template.code, 'version', template.code
    ) AS item
    FROM jsonb_array_elements(definitions.items) WITH ORDINALITY saved(value, position)
    JOIN quality.setup_checklist_templates template ON template.id = session.template_id
    LEFT JOIN LATERAL (
      SELECT point.id, point.item_key, point.response_type, point.required, point.sequence
      FROM quality.setup_checklist_template_items point
      WHERE point.template_id = session.template_id AND (
        point.item_key = saved.value->>'itemKey'
        OR (NULLIF(saved.value->>'itemKey', '') IS NULL
            AND point.sequence::text = saved.value->>'sequence'))
      ORDER BY (point.item_key = saved.value->>'itemKey') DESC NULLS LAST, point.id
      LIMIT 1
    ) item ON true
    UNION ALL
    -- Older sessions without saved definitions can only use existing master
    -- definitions and referenced answer items; no historical detail is invented.
    SELECT jsonb_build_object(
      'itemId', item.id, 'itemKey', item.item_key, 'checkPoint', item.prompt,
      'inputType', item.response_type, 'required', item.required,
      'sequence', item.sequence, 'section', 'Setting',
      'checklistCode', template.code, 'version', template.code
    )
    FROM quality.setup_checklist_template_items item
    JOIN quality.setup_checklist_templates template ON template.id = item.template_id
    WHERE jsonb_array_length(definitions.items) = 0 AND item.template_id = session.template_id
      AND (item.active OR EXISTS (SELECT 1 FROM quality.setup_checklist_results answer
        WHERE answer.session_id = session.id AND answer.template_item_id = item.id))
  ) snapshot
), '[]'::jsonb)
FROM saved_definitions definitions
WHERE definitions.id = session.id;

-- Keep current setups on their existing checklist even when a machine's default
-- later changes. Existing keys and browser drafts remain valid for these runs.
UPDATE manufacturing.shop_floor_setup_state state
SET setup_checklist_template_id = COALESCE((
    SELECT session.template_id FROM quality.setup_checklist_sessions session
    WHERE session.organization_id = state.organization_id
      AND session.work_order_id = state.work_order_id
      AND session.operation_setup_id = state.operation_setup_id
      AND session.machine_id = state.machine_id AND session.reversed_at IS NULL
    ORDER BY session.started_at DESC, session.id DESC LIMIT 1
  ), assignment.template_id),
  setup_checklist_pinned_at = COALESCE(state.started_at, state.created_at),
  setup_checklist_legacy_session = true
FROM quality.machine_setup_checklist_assignments assignment
WHERE state.machine_id = assignment.machine_id AND state.active;

-- Also retain saved evidence on a current setup whose machine has no default.
UPDATE manufacturing.shop_floor_setup_state state
SET setup_checklist_template_id = (
    SELECT session.template_id FROM quality.setup_checklist_sessions session
    WHERE session.organization_id = state.organization_id
      AND session.work_order_id = state.work_order_id
      AND session.operation_setup_id = state.operation_setup_id
      AND session.machine_id = state.machine_id AND session.reversed_at IS NULL
    ORDER BY session.started_at DESC, session.id DESC LIMIT 1
  ),
  setup_checklist_pinned_at = COALESCE(state.started_at, state.created_at),
  setup_checklist_legacy_session = true
WHERE state.active AND state.setup_checklist_pinned_at IS NULL;

UPDATE manufacturing.shop_floor_setup_state state
SET source_payload = COALESCE(state.source_payload, '{}'::jsonb) || COALESCE((
  SELECT jsonb_build_object('setupChecklistSessionKey', session.session_key,
    'setupChecklistCode', template.code)
  FROM quality.setup_checklist_sessions session
  JOIN quality.setup_checklist_templates template ON template.id = session.template_id
  WHERE session.organization_id = state.organization_id
    AND session.work_order_id = state.work_order_id
    AND session.operation_setup_id = state.operation_setup_id
    AND session.machine_id = state.machine_id AND session.reversed_at IS NULL
  ORDER BY session.started_at DESC, session.id DESC LIMIT 1
), '{}'::jsonb)
WHERE state.active AND state.setup_checklist_legacy_session;

GRANT SELECT, INSERT, UPDATE ON quality.machine_setup_checklist_assignments TO mrmpl_web;
GRANT SELECT ON quality.machine_setup_checklist_assignments TO mrmpl_worker, mrmpl_reporting;

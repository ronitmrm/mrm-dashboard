import type { PoolClient } from "pg"

type SetupChecklistContext = {
  organizationId: string
  productionFloorCode: string
  machineId: string
  workOrderId: string
  operationSetupId: string
}

export async function resolveSetupChecklistTemplate(
  client: Pick<PoolClient, "query">,
  input: SetupChecklistContext
) {
  const result = await client.query<{
    templateId: string | null
    templateCode: string | null
    pinnedAt: Date | string | null
    sessionKey: string
    legacySession: boolean | null
    legacySessionKey: string | null
  }>(
    `SELECT template.id AS "templateId", template.code AS "templateCode",
       state.setup_checklist_pinned_at AS "pinnedAt",
       state.setup_checklist_legacy_session AS "legacySession",
       NULLIF(state.source_payload->>'setupChecklistSessionKey', '') AS "legacySessionKey",
       lower(concat_ws('|', work_order.job_card_number, item.uid,
         COALESCE(route.legacy_option_number, route.route_code),
         COALESCE(setup.legacy_setup_code, setup.setup_number::text), machine.machine_number))
       AS "sessionKey"
     FROM manufacturing.work_orders work_order
     JOIN catalog.items item ON item.id = work_order.item_id
     JOIN manufacturing.operation_setups setup ON setup.id = $5
     JOIN manufacturing.route_options route ON route.id = setup.route_option_id AND route.item_id = item.id
     JOIN manufacturing.production_floors floor ON floor.id = route.production_floor_id
     JOIN catalog.machines machine ON machine.id = $3 AND machine.production_floor_id = floor.id
     LEFT JOIN LATERAL (
       SELECT current_state.* FROM manufacturing.shop_floor_setup_state current_state
       WHERE current_state.work_order_id = work_order.id
         AND current_state.operation_setup_id = setup.id AND current_state.machine_id = machine.id
       ORDER BY current_state.active DESC, current_state.updated_at DESC LIMIT 1
     ) state ON true
     LEFT JOIN quality.machine_setup_checklist_assignments assignment
       ON assignment.machine_id = machine.id AND assignment.organization_id = $1
     LEFT JOIN quality.setup_checklist_templates template
       ON template.id = CASE WHEN state.setup_checklist_pinned_at IS NOT NULL
         THEN state.setup_checklist_template_id ELSE assignment.template_id END
       AND template.organization_id = $1 AND template.production_floor_id = floor.id
       AND (state.setup_checklist_pinned_at IS NOT NULL OR template.active)
     WHERE work_order.id = $4 AND work_order.organization_id = $1
       AND machine.organization_id = $1 AND floor.code = $2`,
    [input.organizationId, input.productionFloorCode, input.machineId,
      input.workOrderId, input.operationSetupId]
  )
  const selected = result.rows[0]
  if (!selected) return null
  const { pinnedAt, legacySession, legacySessionKey, ...template } = selected
  const timestamp = pinnedAt instanceof Date ? pinnedAt.toISOString()
    : pinnedAt ? new Date(pinnedAt).toISOString() : null
  return {
    ...template,
    pinnedAt: timestamp,
    sessionKey: legacySession ? legacySessionKey || template.sessionKey
      : timestamp ? `${template.sessionKey}|${timestamp}` : template.sessionKey,
  }
}

export async function pinSetupChecklistTemplate(
  client: PoolClient,
  input: SetupChecklistContext & { setupStateId: string; reset?: boolean }
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('quality.machine-setup-checklist'), hashtext($1))",
    [input.machineId]
  )
  const template = await client.query<{ id: string }>(
    `SELECT template.id FROM quality.machine_setup_checklist_assignments assignment
       JOIN quality.setup_checklist_templates template ON template.id = assignment.template_id
       JOIN manufacturing.production_floors floor ON floor.id = template.production_floor_id
       WHERE assignment.machine_id = $3 AND assignment.organization_id = $1
         AND template.organization_id = $1 AND template.active AND floor.code = $2
       FOR SHARE OF template`,
    [input.organizationId, input.productionFloorCode, input.machineId]
  )
  await client.query(
    `UPDATE manufacturing.shop_floor_setup_state state
     SET setup_checklist_template_id = $3,
       setup_checklist_pinned_at = now(), setup_checklist_legacy_session = false
     WHERE state.id = $2 AND state.organization_id = $1
       AND (state.setup_checklist_pinned_at IS NULL OR $4)`,
    [input.organizationId, input.setupStateId, template.rows[0]?.id ?? null, input.reset ?? false]
  )
}

export async function assertSettingChecklistComplete(
  client: PoolClient,
  templateId: string,
  sessionId: string
) {
  const items = await client.query<{ prompt: string; satisfied: boolean }>(
    `WITH required_items AS (
       SELECT snapshot.item->>'itemId' AS id, snapshot.item->>'checkPoint' AS prompt
       FROM quality.setup_checklist_sessions session,
         jsonb_array_elements(session.items_snapshot) snapshot(item)
       WHERE session.id = $2 AND (snapshot.item->>'required')::boolean
       UNION ALL
       SELECT item.id::text, item.prompt FROM quality.setup_checklist_template_items item
       WHERE item.template_id = $1 AND item.active AND item.required
         AND NOT EXISTS (SELECT 1 FROM quality.setup_checklist_sessions session
           WHERE session.id = $2 AND jsonb_array_length(session.items_snapshot) > 0)
     )
     SELECT item.prompt,
       (answer.response_boolean IS NOT NULL OR answer.response_numeric IS NOT NULL
         OR NULLIF(btrim(answer.response_text), '') IS NOT NULL) AS satisfied
     FROM required_items item
     LEFT JOIN quality.setup_checklist_results answer
       ON answer.template_item_id::text = item.id AND answer.session_id = $2 AND answer.phase = 'end'`,
    [templateId, sessionId]
  )
  const missing = items.rows.filter((item) => !item.satisfied)
  if (missing.length) {
    throw new Error(`Complete required checklist points before completion: ${missing.map((item) => item.prompt).join(", ")}`)
  }
}

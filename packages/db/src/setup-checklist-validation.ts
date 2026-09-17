import type { PoolClient } from "pg"

export async function assertSettingChecklistComplete(
  client: PoolClient,
  templateId: string,
  sessionId: string
) {
  const items = await client.query<{ prompt: string; section: string; satisfied: boolean }>(
    `SELECT item.prompt, COALESCE(item.source_payload->>'section', '') AS section,
       (answer.response_boolean IS NOT NULL OR answer.response_numeric IS NOT NULL
         OR NULLIF(btrim(answer.response_text), '') IS NOT NULL) AS satisfied
     FROM quality.setup_checklist_template_items item
     LEFT JOIN quality.setup_checklist_results answer
       ON answer.template_item_id = item.id AND answer.session_id = $2 AND answer.phase = 'end'
     WHERE item.template_id = $1 AND item.active AND item.required`,
    [templateId, sessionId]
  )
  const missing = items.rows.filter((item) => {
    const section = item.section.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ")
    const preSettingOnly = section.includes("pre setting") && !section.replace("pre setting", "").includes("setting")
    return !preSettingOnly && !item.satisfied
  })
  if (missing.length) {
    throw new Error(`Complete required checklist points before completion: ${missing.map((item) => item.prompt).join(", ")}`)
  }
}

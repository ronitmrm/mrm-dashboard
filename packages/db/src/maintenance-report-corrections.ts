import type { PoolClient } from "pg"

import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import type { ResolvedMaintenanceWorkPhotoTarget } from "./maintenance-work-photos"
import { repositoryPool, withTransaction, type RepositoryPoolOptions } from "./postgres-runtime"

export type MaintenanceReportKind = "machine" | "asset"

export type MaintenanceReportCorrection = {
  action: string
  actor: string | null
  occurredAt: string
  reason: string
}

export type MaintenanceReportCorrectionInput = {
  actorUserId: string
  changedItems: string[]
  checklistSteps: Array<{ id: string | null; sequence: number; value: string; remark: string }>
  kind: MaintenanceReportKind
  organizationId: string
  reason: string
  remark: string
  reportId: string
  workDone: string
}

type SavedStep = { sequence: number; prompt?: string; value?: string; remark?: string }

function savedItems(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : []
}

async function appendCorrection(client: PoolClient, input: MaintenanceReportCorrectionInput, before: unknown, after: unknown) {
  await client.query(
    `INSERT INTO audit.events (
       organization_id, event_type, target_schema, target_table, target_id,
       actor_user_id, reason, before_state, after_state,
       source_system, source_table, source_id
     ) VALUES ($1, 'maintenance.report.corrected', $2, $3, $4, $5, $6, $7, $8,
       'mrm-dashboard', 'maintenance_report_corrections', gen_random_uuid()::text)`,
    [input.organizationId, input.kind === "machine" ? "maintenance" : "store",
      input.kind === "machine" ? "tasks" : "asset_maintenance_records",
      input.reportId, input.actorUserId, input.reason, before, after]
  )
}

export function createMaintenanceReportCorrectionRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [code]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async correct(input: MaintenanceReportCorrectionInput) {
      const reason = input.reason.trim()
      if (!reason || reason.length > 500) throw new Error("Enter an edit reason (up to 500 characters).")
      const changedItems = input.changedItems.map((item) => item.trim()).filter(Boolean)
      if (changedItems.length > 50 || changedItems.some((item) => item.length > 200) ||
        input.workDone.length > 5000 || input.remark.length > 2000 || input.checklistSteps.length > 100) {
        throw new Error("Maintenance report changes are too long.")
      }
      return withTransaction(pool, async (client) => {
        if (input.kind === "machine") {
          const task = await client.query<{
            sourcePayload: Record<string, unknown> | null
            taskType: string
          }>(
            `SELECT source_payload AS "sourcePayload", task_type AS "taskType"
             FROM maintenance.tasks WHERE organization_id = $1 AND id = $2
               AND status = 'Completed' FOR UPDATE`,
            [input.organizationId, input.reportId]
          )
          const saved = task.rows[0]
          if (!saved) throw new Error("Completed maintenance report was not found.")
          const answers = await client.query<{
            id: string
            inputType: string
            passed: boolean | null
            remark: string | null
            required: boolean
            sequence: number
            value: string
          }>(
            `SELECT answer.id, item.sequence, lower(item.response_type) AS "inputType", item.required,
               CASE WHEN lower(item.response_type) = 'checkbox' THEN
                 CASE lower(COALESCE(answer.source_payload->>'value', answer.response_text,
                   answer.response_boolean::text, ''))
                   WHEN 'true' THEN 'Yes' WHEN 'yes' THEN 'Yes'
                   WHEN 'false' THEN 'No' WHEN 'no' THEN 'No'
                   ELSE COALESCE(answer.source_payload->>'value', answer.response_text, '') END
                 ELSE COALESCE(answer.source_payload->>'value', answer.response_text,
                   answer.response_numeric::text, '') END AS value,
               COALESCE(answer.notes, answer.source_payload->>'notes') AS remark,
               answer.passed
             FROM maintenance.task_results answer
             JOIN maintenance.checklist_items item ON item.id = answer.checklist_item_id
               AND item.organization_id = answer.organization_id
             WHERE answer.organization_id = $1 AND answer.task_id = $2
             ORDER BY item.sequence, answer.id FOR UPDATE OF answer`,
            [input.organizationId, input.reportId]
          )
          const submitted = new Map(input.checklistSteps.map((step) => [step.id, step]))
          if (submitted.size !== answers.rows.length || input.checklistSteps.length !== answers.rows.length) {
            throw new Error("The saved checklist has changed. Reload the report.")
          }
          const before = {
            changedItems: savedItems(saved.sourcePayload?.changedItems),
            workDone: typeof saved.sourcePayload?.workDone === "string" ? saved.sourcePayload.workDone : "",
            remark: typeof saved.sourcePayload?.remark === "string" ? saved.sourcePayload.remark : "",
            checklistSteps: answers.rows.map(({ id, sequence, value, remark }) => ({ id, sequence, value, remark: remark ?? "" })),
          }
          const checklistSteps = answers.rows.map((answer) => {
            const step = submitted.get(answer.id)
            if (!step || step.sequence !== answer.sequence) throw new Error("The saved checklist has changed. Reload the report.")
            const value = step.value.trim()
            const remark = step.remark.trim()
            if (answer.required && !value) throw new Error(`Complete checklist point ${answer.sequence}.`)
            if (answer.inputType === "checkbox" && value !== "Yes" && value !== "No") {
              throw new Error(`Choose Yes or No for checklist point ${answer.sequence}.`)
            }
            if (answer.inputType === "number" && value && !Number.isFinite(Number(value))) {
              throw new Error(`Enter a number for checklist point ${answer.sequence}.`)
            }
            return { id: answer.id, sequence: answer.sequence, value, remark }
          })
          if (saved.taskType.toLowerCase() === "breakdown" && !input.workDone.trim()) {
            throw new Error("Work done is required for a completed breakdown.")
          }
          const after = { changedItems, workDone: input.workDone.trim(), remark: input.remark.trim(), checklistSteps }
          if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("Change at least one report detail.")
          const sourceSteps = saved.sourcePayload?.checklistSteps
          const correctionBySequence = new Map(checklistSteps.map((step) => [step.sequence, step]))
          const inputTypeBySequence = new Map(answers.rows.map((answer) => [answer.sequence, answer.inputType]))
          const sourceUpdates: Record<string, unknown> = {
            changedItems, partsChanged: changedItems.join(", "),
            workDone: after.workDone, remark: after.remark,
          }
          if (Array.isArray(sourceSteps)) {
            sourceUpdates.checklistSteps = sourceSteps.map((item: unknown) => {
              if (!item || typeof item !== "object" || Array.isArray(item)) return item
              const original = item as Record<string, unknown>
              const corrected = correctionBySequence.get(Number(original.sequence))
              if (!corrected) return item
              return {
                ...original, value: corrected.value, remark: corrected.remark,
                result: corrected.value
                  ? inputTypeBySequence.get(corrected.sequence) === "checkbox"
                    ? corrected.value === "Yes" ? "OK" : "Not OK"
                    : "Recorded"
                  : "",
              }
            })
          }
          await client.query(
            `UPDATE maintenance.tasks SET source_payload = COALESCE(source_payload, '{}'::jsonb) || $3::jsonb,
               updated_by_user_id = $4, updated_at = now(), row_version = row_version + 1
             WHERE organization_id = $1 AND id = $2`,
            [input.organizationId, input.reportId, sourceUpdates, input.actorUserId]
          )
          for (const [index, answer] of answers.rows.entries()) {
            const step = checklistSteps[index]!
            if (step.value === answer.value && step.remark === (answer.remark ?? "")) continue
            const checkbox = answer.inputType === "checkbox"
            const number = answer.inputType === "number" && step.value ? Number(step.value) : null
            const passed = checkbox ? step.value === "Yes" : answer.passed
            await client.query(
              `UPDATE maintenance.task_results SET response_text = $3,
                 response_numeric = $4, response_boolean = $5, passed = $6,
                 notes = $7, source_payload = COALESCE(source_payload, '{}'::jsonb) || $8::jsonb
               WHERE organization_id = $1 AND id = $2`,
              [input.organizationId, answer.id, step.value, number,
                checkbox ? step.value === "Yes" : null, passed, step.remark,
                { value: step.value, notes: step.remark, passed }]
            )
          }
          await appendCorrection(client, { ...input, reason }, before, after)
        } else {
          const result = await client.query<{
            breakdownId: string | null
            breakdownStatus: string | null
            changedItems: unknown
            checklistSteps: unknown
            remark: string | null
            taskId: string | null
            taskStatus: string | null
            workDone: string | null
          }>(
            `SELECT task.id AS "taskId", task.status AS "taskStatus",
               breakdown.id AS "breakdownId", breakdown.status AS "breakdownStatus",
               COALESCE(task.changed_items, breakdown.changed_items, '[]'::jsonb) AS "changedItems",
               COALESCE(task.checklist_steps, '[]'::jsonb) AS "checklistSteps",
               breakdown.remark, COALESCE(task.work_done, breakdown.work_done, record.work_done) AS "workDone"
             FROM store.asset_maintenance_records record
             LEFT JOIN store.asset_maintenance_tasks task ON task.maintenance_record_id = record.id
             LEFT JOIN store.asset_breakdowns breakdown ON breakdown.maintenance_record_id = record.id
             WHERE record.organization_id = $1 AND record.id = $2
               AND record.maintenance_type IN ('MAINTENANCE', 'BREAKDOWN')
             FOR UPDATE OF record`,
            [input.organizationId, input.reportId]
          )
          const saved = result.rows[0]
          if (!saved || (!saved.taskId && !saved.breakdownId) ||
            (saved.taskId && saved.taskStatus !== "Completed") ||
            (saved.breakdownId && saved.breakdownStatus !== "Completed")) {
            throw new Error("Editable completed maintenance report was not found.")
          }
          const savedSteps = Array.isArray(saved.checklistSteps) ? saved.checklistSteps as SavedStep[] : []
          const checklistRules = saved.taskId ? await client.query<{
            inputType: string
            required: boolean
            sequence: number
          }>(
            `SELECT item.sequence, item.required, lower(item.response_type) AS "inputType"
             FROM store.asset_maintenance_tasks task
             JOIN store.asset_maintenance_schedules schedule ON schedule.id = task.schedule_id
               AND schedule.organization_id = task.organization_id
             JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
             JOIN maintenance.definitions checklist ON checklist.organization_id = definition.organization_id
               AND lower(checklist.code) = lower(COALESCE(definition.checklist_code, definition.code))
             JOIN maintenance.checklist_items item ON item.definition_id = checklist.id
               AND item.organization_id = checklist.organization_id
             WHERE task.organization_id = $1 AND task.id = $2`,
            [input.organizationId, saved.taskId]
          ) : null
          const ruleBySequence = new Map(checklistRules?.rows.map((rule) => [rule.sequence, rule]))
          const submitted = new Map(input.checklistSteps.map((step) => [step.sequence, step]))
          if (submitted.size !== savedSteps.length || input.checklistSteps.length !== savedSteps.length) {
            throw new Error("The saved checklist has changed. Reload the report.")
          }
          const beforeSteps = savedSteps.map((step) => ({
            id: null, sequence: step.sequence, value: step.value ?? "", remark: step.remark ?? "",
          }))
          const checklistSteps = savedSteps.map((step) => {
            const edited = submitted.get(step.sequence)
            if (!edited || edited.id !== null) throw new Error("The saved checklist has changed. Reload the report.")
            const value = edited.value.trim()
            const rule = ruleBySequence.get(step.sequence)
            if (rule?.required && !value) throw new Error(`Complete checklist point ${step.sequence}.`)
            if (rule?.inputType === "checkbox" && value && value !== "Yes" && value !== "No") {
              throw new Error(`Choose Yes or No for checklist point ${step.sequence}.`)
            }
            if (rule?.inputType === "number" && value && !Number.isFinite(Number(value))) {
              throw new Error(`Enter a number for checklist point ${step.sequence}.`)
            }
            return { ...step, value, remark: edited.remark.trim() }
          })
          if (saved.breakdownId && !input.workDone.trim()) {
            throw new Error("Work done is required for a completed breakdown.")
          }
          if (saved.taskId && input.remark.trim()) throw new Error("This planned report has no overall remark field.")
          const before = { changedItems: savedItems(saved.changedItems), workDone: saved.workDone ?? "",
            remark: saved.remark ?? "", checklistSteps: beforeSteps }
          const after = { changedItems, workDone: input.workDone.trim(),
            remark: saved.taskId ? "" : input.remark.trim(),
            checklistSteps: checklistSteps.map((step) => ({ id: null, sequence: step.sequence,
              value: step.value ?? "", remark: step.remark ?? "" })) }
          if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("Change at least one report detail.")
          if (saved.taskId) {
            await client.query(
              `UPDATE store.asset_maintenance_tasks SET checklist_steps = $3::jsonb,
                 changed_items = $4::jsonb, work_done = NULLIF($5, ''),
                 updated_by_user_id = $6, updated_at = now()
               WHERE organization_id = $1 AND id = $2`,
              [input.organizationId, saved.taskId, JSON.stringify(checklistSteps), JSON.stringify(changedItems), after.workDone, input.actorUserId]
            )
          } else {
            await client.query(
              `UPDATE store.asset_breakdowns SET changed_items = $3::jsonb,
                 work_done = $4, remark = NULLIF($5, '')
               WHERE organization_id = $1 AND id = $2`,
              [input.organizationId, saved.breakdownId, JSON.stringify(changedItems), after.workDone, after.remark]
            )
          }
          await client.query(
            `UPDATE store.asset_maintenance_records SET work_done = NULLIF($3, '')
             WHERE organization_id = $1 AND id = $2`,
            [input.organizationId, input.reportId, after.workDone]
          )
          await appendCorrection(client, { ...input, reason }, before, after)
        }
        await queueDashboardRefresh(client, input.organizationId)
      })
    },

    async listHistory(input: {
      completedAt: string
      kind: MaintenanceReportKind
      organizationId: string
      photoTarget: ResolvedMaintenanceWorkPhotoTarget | null
      reportId: string
    }): Promise<MaintenanceReportCorrection[]> {
      const schema = input.kind === "machine" ? "maintenance" : "store"
      const table = input.kind === "machine" ? "tasks" : "asset_maintenance_records"
      const result = await pool.query<MaintenanceReportCorrection>(
        `SELECT CASE event.event_type
             WHEN 'maintenance.report.photo_added' THEN 'Photo added'
             WHEN 'artifact.deleted' THEN 'Photo removed'
             ELSE 'Report corrected' END AS action,
           COALESCE(actor.name, event.legacy_actor) AS actor,
           event.occurred_at::text AS "occurredAt", COALESCE(event.reason, '') AS reason
         FROM audit.events event
         LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
         WHERE event.organization_id = $1 AND (
           (event.target_schema = $2 AND event.target_table = $3
             AND event.target_id = $4 AND event.event_type IN
               ('maintenance.report.corrected', 'maintenance.report.photo_added'))
           OR (event.event_type = 'artifact.deleted'
             AND event.occurred_at > $8::timestamptz AND EXISTS (
             SELECT 1 FROM core.file_links link
             WHERE link.organization_id = $1 AND link.file_id = event.target_id
               AND link.target_schema = $5 AND link.target_table = $6
               AND link.target_id = $7 AND link.purpose LIKE 'work-photo:%'
           ))
         ) ORDER BY event.occurred_at DESC, event.id DESC`,
        [input.organizationId, schema, table, input.reportId,
          input.photoTarget?.schema ?? "", input.photoTarget?.table ?? "",
          input.photoTarget?.id ?? null, input.completedAt]
      )
      return result.rows
    },
  }
}

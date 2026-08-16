import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  normalizeProductionFloorCode,
  type ProductionFloorCode,
} from "./production-floors"


type ChecklistItemInput = {
  active?: boolean
  inputType: string
  itemKey: string
  prompt: string
  required: boolean
  sequence: number
}

type TaskResultInput = {
  itemKey: string
  itemPrompt?: string | null
  notes?: string | null
  passed?: boolean | null
  sequence?: number | null
  value: boolean | number | string | null
}

type CompleteTaskInput = {
  actorUserId?: string | null
  completedAt: string
  completedBy?: string | null
  dueOn: string
  machineNumber: string
  nextDueOn?: string | null
  organizationId: string
  payload: Record<string, unknown>
  productionFloorCode?: string
  results: TaskResultInput[]
  scheduleKey: string
  taskKey: string
  taskType: string
}

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

async function generatedMaintenanceChecklistCode(
  client: PoolClient,
  organizationId: string,
  requestedCode: string
) {
  const cleaned = requestedCode.trim()
  if (cleaned) return cleaned
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('maintenance.checklist-code'), hashtext($1))",
    [organizationId]
  )
  const result = await client.query<{ nextNumber: number }>(
    `
      SELECT COALESCE(MAX(
        CASE WHEN code ~* '^MC[0-9]+$'
          THEN substring(code from '([0-9]+)$')::integer END
      ), 0) + 1 AS "nextNumber"
      FROM maintenance.definitions
      WHERE organization_id = $1
    `,
    [organizationId]
  )
  return `MC${String(result.rows[0]?.nextNumber ?? 1).padStart(3, "0")}`
}


async function machineIdFor(
  client: PoolClient,
  organizationId: string,
  machineNumber: string,
  productionFloorCode: ProductionFloorCode
) {
  const result = await client.query<{ id: string }>(
    `
      SELECT machine.id FROM catalog.machines machine
      JOIN manufacturing.production_floors floor
        ON floor.id = machine.production_floor_id
      WHERE machine.organization_id = $1
        AND lower(machine.machine_number) = lower($2)
        AND floor.code = $3
    `,
    [
      organizationId,
      requiredText(machineNumber, "Machine"),
      productionFloorCode,
    ]
  )
  if (!result.rows[0]) throw new Error("Machine was not found.")
  return result.rows[0].id
}

function resultColumns(value: TaskResultInput["value"]) {
  if (typeof value === "boolean") {
    return { booleanValue: value, numericValue: null, textValue: null }
  }
  if (typeof value === "number") {
    return { booleanValue: null, numericValue: value, textValue: null }
  }
  return {
    booleanValue: null,
    numericValue: null,
    textValue: value === null ? null : String(value),
  }
}

async function upsertDefinitionItems(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    definitionId: string
    items: ChecklistItemInput[]
    organizationId: string
    payload?: Record<string, unknown>
  }
) {
  for (const item of input.items) {
    await client.query(
      `
        INSERT INTO maintenance.checklist_items (
          organization_id, definition_id, item_key, prompt, response_type,
          required, sequence, active, created_by_user_id, updated_by_user_id,
          source_system, source_table, source_id, source_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9,
          'mrm-dashboard', 'maintenance_checklist_master', $10, $11)
        ON CONFLICT (definition_id, item_key)
        DO UPDATE SET prompt = EXCLUDED.prompt,
          response_type = EXCLUDED.response_type,
          required = EXCLUDED.required,
          sequence = EXCLUDED.sequence,
          active = EXCLUDED.active,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          source_payload = EXCLUDED.source_payload,
          updated_at = now(), row_version = maintenance.checklist_items.row_version + 1
      `,
      [
        input.organizationId,
        input.definitionId,
        requiredText(item.itemKey, "Maintenance checklist item key"),
        requiredText(item.prompt, "Maintenance checklist prompt"),
        requiredText(item.inputType, "Maintenance response type"),
        item.required,
        item.sequence,
        item.active ?? true,
        input.actorUserId ?? null,
        randomUUID(),
        {
          ...input.payload,
          ...item,
          status: item.active === false ? "Inactive" : "Active",
        },
      ]
    )
  }
}

async function completeMaintenanceTask(
  client: PoolClient,
  input: CompleteTaskInput
) {
  const taskKey = requiredText(input.taskKey, "Maintenance task key")
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('maintenance.task'), hashtext(lower($1)))",
    [taskKey]
  )
  const machineId = await machineIdFor(
    client,
    input.organizationId,
    input.machineNumber,
    normalizeProductionFloorCode(input.productionFloorCode)
  )
  const schedule = await client.query<{
    checklist_definition_id: string
    definition_id: string
    id: string
    machine_id: string
  }>(
    `
      SELECT schedule.id, schedule.definition_id, schedule.machine_id,
        COALESCE(checklist_definition.id, definition.id) AS checklist_definition_id
      FROM maintenance.machine_schedules schedule
      JOIN maintenance.definitions definition
        ON definition.id = schedule.definition_id
      LEFT JOIN maintenance.definitions checklist_definition
        ON checklist_definition.organization_id = schedule.organization_id
        AND lower(checklist_definition.code) = lower(
          COALESCE(definition.checklist_code, definition.code)
        )
      WHERE schedule.organization_id = $1
        AND lower(schedule.schedule_key) = lower($2)
        AND schedule.machine_id = $3
      FOR UPDATE OF schedule
    `,
    [
      input.organizationId,
      requiredText(input.scheduleKey, "Maintenance schedule key"),
      machineId,
    ]
  )
  if (!schedule.rows[0]) throw new Error("Maintenance schedule was not found.")
  if (schedule.rows[0].machine_id !== machineId) {
    throw new Error("Maintenance schedule does not belong to this machine.")
  }
  const existing = await client.query<{ id: string }>(
    `
      SELECT id FROM maintenance.tasks
      WHERE organization_id = $1
        AND lower(task_key) = lower($2)
        AND machine_schedule_id = $3
      FOR UPDATE
    `,
    [input.organizationId, taskKey, schedule.rows[0].id]
  )
  const result = existing.rows[0]
    ? await client.query<{ id: string }>(
        `
          UPDATE maintenance.tasks
          SET machine_schedule_id = $1,
            due_on = COALESCE(migration.try_date($2), due_on),
            status = 'Completed',
            completed_at = COALESCE(migration.try_timestamptz($3), now()),
            completed_by_user_id = $4, legacy_completer = $5,
            task_type = $6, source_payload = $7,
            updated_by_user_id = $4, updated_at = now(),
            row_version = row_version + 1
          WHERE id = $8 RETURNING id
        `,
        [
          schedule.rows[0].id,
          input.dueOn,
          input.completedAt,
          input.actorUserId ?? null,
          input.completedBy ?? null,
          requiredText(input.taskType, "Maintenance task type"),
          input.payload,
          existing.rows[0].id,
        ]
      )
    : await client.query<{ id: string }>(
        `
          INSERT INTO maintenance.tasks (
            organization_id, machine_schedule_id, due_on, status,
            completed_at, completed_by_user_id, legacy_completer,
            created_by_user_id, updated_by_user_id, task_key, task_type,
            source_system, source_table, source_id, source_payload
          )
          VALUES ($1, $2, COALESCE(migration.try_date($3), current_date),
            'Completed', COALESCE(migration.try_timestamptz($4), now()),
            $5, $6, $5, $5, $7, $8, 'mrm-dashboard',
            'maintenance_task', $9, $10)
          RETURNING id
        `,
        [
          input.organizationId,
          schedule.rows[0].id,
          input.dueOn,
          input.completedAt,
          input.actorUserId ?? null,
          input.completedBy ?? null,
          taskKey,
          requiredText(input.taskType, "Maintenance task type"),
          randomUUID(),
          input.payload,
        ]
      )
  await client.query(
    "DELETE FROM maintenance.task_results WHERE task_id = $1",
    [result.rows[0]!.id]
  )
  for (const itemResult of input.results) {
    const item = await client.query<{ id: string }>(
      `
        SELECT id FROM maintenance.checklist_items
        WHERE definition_id = $1 AND (
          lower(item_key) = lower($2)
          OR (
            $3::integer IS NOT NULL
            AND sequence = $3::integer
            AND (
              NULLIF($4, '') IS NULL
              OR lower(prompt) = lower($4)
            )
          )
        )
        ORDER BY
          CASE WHEN lower(item_key) = lower($2) THEN 0 ELSE 1 END,
          CASE WHEN lower(prompt) = lower(COALESCE($4, '')) THEN 0 ELSE 1 END,
          id
        LIMIT 1
      `,
      [
        schedule.rows[0].checklist_definition_id,
        requiredText(itemResult.itemKey, "Maintenance checklist item key"),
        itemResult.sequence ?? null,
        itemResult.itemPrompt ?? null,
      ]
    )
    if (!item.rows[0]) {
      throw new Error(
        `Maintenance checklist item ${itemResult.itemKey} was not found.`
      )
    }
    const columns = resultColumns(itemResult.value)
    await client.query(
      `
        INSERT INTO maintenance.task_results (
          organization_id, task_id, checklist_item_id, response_text,
          response_numeric, response_boolean, passed, notes,
          recorded_by_user_id, source_system, source_table, source_id,
          source_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
          'mrm-dashboard', 'maintenance_task_result', $10, $11)
      `,
      [
        input.organizationId,
        result.rows[0]!.id,
        item.rows[0].id,
        columns.textValue,
        columns.numericValue,
        columns.booleanValue,
        itemResult.passed ?? null,
        itemResult.notes ?? null,
        input.actorUserId ?? null,
        randomUUID(),
        itemResult,
      ]
    )
  }
  await client.query(
    `
      UPDATE maintenance.machine_schedules
      SET last_completed_on = COALESCE(migration.try_date($1), current_date),
        next_due_on = COALESCE(migration.try_date($2), next_due_on),
        updated_by_user_id = $3, updated_at = now(),
        row_version = row_version + 1
      WHERE id = $4
    `,
    [
      input.completedAt,
      input.nextDueOn ?? null,
      input.actorUserId ?? null,
      schedule.rows[0].id,
    ]
  )
  return result.rows[0]!
}

export function createMaintenanceRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async upsertDefinition(input: {
      actorUserId?: string | null
      active?: boolean
      checklistCode?: string | null
      code: string
      description?: string | null
      estimatedMinutes?: number | null
      frequencyBasis?: string | null
      frequencyDays: number
      items: ChecklistItemInput[]
      name: string
      organizationId: string
      payload: Record<string, unknown>
    }) {
      return transaction(pool, async (client) => {
        if (!(input.frequencyDays > 0)) {
          throw new Error("Maintenance frequency days must be positive.")
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO maintenance.definitions (
              organization_id, code, name, description, frequency_unit,
              frequency_value, active, checklist_code, frequency_basis,
              estimated_minutes, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, 'day', $5, $6, $7, $8, $9,
              $10, $10, 'mrm-dashboard', 'maintenance_master', $11, $12)
            ON CONFLICT (organization_id, lower(code))
            DO UPDATE SET name = EXCLUDED.name,
              description = EXCLUDED.description,
              frequency_unit = EXCLUDED.frequency_unit,
              frequency_value = EXCLUDED.frequency_value,
              active = EXCLUDED.active,
              checklist_code = EXCLUDED.checklist_code,
              frequency_basis = EXCLUDED.frequency_basis,
              estimated_minutes = EXCLUDED.estimated_minutes,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload,
              updated_at = now(), row_version = maintenance.definitions.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            requiredText(input.code, "Maintenance code"),
            requiredText(input.name, "Maintenance name"),
            input.description ?? null,
            input.frequencyDays,
            input.active ?? true,
            input.checklistCode ?? null,
            input.frequencyBasis ?? "Calendar days",
            input.estimatedMinutes ?? null,
            input.actorUserId ?? null,
            randomUUID(),
            input.payload,
          ]
        )
        await upsertDefinitionItems(client, {
          actorUserId: input.actorUserId,
          definitionId: result.rows[0]!.id,
          items: input.items,
          organizationId: input.organizationId,
        })
        return result.rows[0]!
      })
    },

    async upsertChecklistItem(input: {
      actorUserId?: string | null
      checklistCode: string
      checklistTitle: string
      item: ChecklistItemInput
      organizationId: string
      payload: Record<string, unknown>
    }) {
      return transaction(pool, async (client) => {
        const code = await generatedMaintenanceChecklistCode(client, input.organizationId, input.checklistCode)
        const payload = { ...input.payload, checklistCode: code }
        const normalizedItem = { ...input.item, itemKey: `${code}|${input.item.sequence}` }
        await client.query(
          `
            INSERT INTO maintenance.definitions (
              organization_id, code, name, frequency_unit, frequency_value,
              active, checklist_code, frequency_basis, created_by_user_id,
              updated_by_user_id, source_system, source_table, source_id,
              source_payload
            )
            VALUES ($1, $2, $3, 'day', 1, true, $2, 'Calendar days',
              $4, $4, 'mrm-dashboard', 'maintenance_checklist_master', $5, $6)
            ON CONFLICT (organization_id, lower(code)) DO NOTHING
          `,
          [
            input.organizationId,
            code,
            requiredText(input.checklistTitle, "Maintenance checklist title"),
            input.actorUserId ?? null,
            randomUUID(),
            payload,
          ]
        )
        const definition = await client.query<{ id: string }>(
          `
            SELECT id FROM maintenance.definitions
            WHERE organization_id = $1 AND lower(code) = lower($2)
          `,
          [input.organizationId, code]
        )
        if (!definition.rows[0]) {
          throw new Error("Maintenance checklist definition was not found.")
        }
        await upsertDefinitionItems(client, {
          actorUserId: input.actorUserId,
          definitionId: definition.rows[0].id,
          items: [normalizedItem],
          organizationId: input.organizationId,
          payload,
        })
        const itemResult = await client.query<{ id: string }>(
          `
            SELECT id FROM maintenance.checklist_items
            WHERE definition_id = $1 AND lower(item_key) = lower($2)
          `,
          [definition.rows[0].id, normalizedItem.itemKey]
        )
        return { ...itemResult.rows[0]!, code }
      })
    },

    async upsertMachineSchedule(input: {
      actorUserId?: string | null
      active?: boolean
      definitionCode: string
      machineNumber: string
      nextDueOn: string
      organizationId: string
      payload: Record<string, unknown>
      productionFloorCode?: string
      scheduleKey: string
    }) {
      return transaction(pool, async (client) => {
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const definition = await client.query<{ id: string }>(
          `
            SELECT id FROM maintenance.definitions
            WHERE organization_id = $1 AND lower(code) = lower($2)
          `,
          [
            input.organizationId,
            requiredText(input.definitionCode, "Maintenance definition"),
          ]
        )
        if (!definition.rows[0]) {
          throw new Error("Maintenance definition was not found.")
        }
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO maintenance.machine_schedules (
              organization_id, definition_id, machine_id, next_due_on,
              active, schedule_key, created_by_user_id, updated_by_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3,
              COALESCE(migration.try_date($4), current_date), $5, $6, $7, $7,
              'mrm-dashboard', 'maintenance_schedule', $8, $9)
            ON CONFLICT (definition_id, machine_id)
            DO UPDATE SET next_due_on = EXCLUDED.next_due_on,
              active = EXCLUDED.active, schedule_key = EXCLUDED.schedule_key,
              updated_by_user_id = EXCLUDED.updated_by_user_id,
              source_payload = EXCLUDED.source_payload,
              updated_at = now(), row_version = maintenance.machine_schedules.row_version + 1
            RETURNING id
          `,
          [
            input.organizationId,
            definition.rows[0].id,
            machineId,
            input.nextDueOn,
            input.active ?? true,
            requiredText(input.scheduleKey, "Maintenance schedule key"),
            input.actorUserId ?? null,
            randomUUID(),
            input.payload,
          ]
        )
        return result.rows[0]!
      })
    },

    async completeTask(input: CompleteTaskInput) {
      return transaction(pool, (client) =>
        completeMaintenanceTask(client, input)
      )
    },

    async completeBreakdownTask(input: {
      actorUserId?: string | null
      completedAt: string
      completedBy?: string | null
      machineNumber: string
      organizationId: string
      payload: Record<string, unknown>
      productionFloorCode?: string
      taskKey: string
    }) {
      return transaction(pool, async (client) => {
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const definition = await client.query<{ id: string }>(
          `
            INSERT INTO maintenance.definitions (
              organization_id, code, name, frequency_unit, frequency_value,
              active, checklist_code, frequency_basis, source_system,
              source_table, source_id, source_payload
            )
            VALUES ($1, 'BREAKDOWN', 'Breakdown maintenance', 'event', 1,
              true, 'BREAKDOWN', 'Event', 'mrm-dashboard',
              'maintenance_master', $2, $3)
            ON CONFLICT (organization_id, lower(code))
            DO UPDATE SET updated_at = now()
            RETURNING id
          `,
          [input.organizationId, randomUUID(), { generated: true }]
        )
        const scheduleKey = `${input.machineNumber}|BREAKDOWN`
        await client.query(
          `
            INSERT INTO maintenance.machine_schedules (
              organization_id, definition_id, machine_id, next_due_on,
              active, schedule_key, source_system, source_table, source_id,
              source_payload
            )
            VALUES ($1, $2, $3,
              COALESCE(migration.try_date($4), current_date), false, $5,
              'mrm-dashboard', 'maintenance_schedule', $6, $7)
            ON CONFLICT (definition_id, machine_id)
            DO UPDATE SET schedule_key = EXCLUDED.schedule_key,
              updated_at = now(), row_version = maintenance.machine_schedules.row_version + 1
          `,
          [
            input.organizationId,
            definition.rows[0]!.id,
            machineId,
            input.completedAt,
            scheduleKey,
            randomUUID(),
            { generated: true },
          ]
        )
        return completeMaintenanceTask(client, {
          actorUserId: input.actorUserId,
          completedAt: input.completedAt,
          completedBy: input.completedBy,
          dueOn: input.completedAt,
          machineNumber: input.machineNumber,
          organizationId: input.organizationId,
          payload: input.payload,
          productionFloorCode: input.productionFloorCode,
          results: [],
          scheduleKey,
          taskKey: input.taskKey,
          taskType: "Breakdown",
        })
      })
    },
  }
}

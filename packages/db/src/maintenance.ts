import { assertMasterAvailable } from "./master-duplicate"
import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"

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

export type MachineBreakdownRow = {
  changedItems: string[]
  completedAt: string | null
  completedBy: string | null
  downtimeEventId: string | null
  id: string
  machineNumber: string
  productionFloorCode: string
  reasonCode: string | null
  reasonName: string | null
  startedAt: string | null
  status: string
  taskKey: string
  workDone: string | null
}

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

function requiredTimestamp(value: unknown, label: string) {
  const timestamp = new Date(requiredText(value, label))
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} is invalid.`)
  }
  return timestamp
}

async function generatedMaintenanceChecklistCode(
  client: PoolClient,
  organizationId: string,
  requestedCode: string,
  checklistTitle?: string
) {
  const cleaned = requestedCode.trim()
  if (cleaned) return cleaned
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('maintenance.checklist-code'), hashtext($1))",
    [organizationId]
  )
  const title = checklistTitle?.trim()
  if (title) {
    const existing = await client.query<{ code: string }>(
      `
        SELECT code FROM maintenance.definitions
        WHERE organization_id = $1
          AND source_table = 'maintenance_checklist_master'
          AND lower(btrim(name)) = lower(btrim($2))
          AND code ~* '^MC[0-9]+$'
        ORDER BY created_at, code
        LIMIT 1
        FOR UPDATE
      `,
      [organizationId, title]
    )
    if (existing.rows[0]) return existing.rows[0].code
  }
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

async function ensureBreakdownSchedule(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    machineNumber: string
    organizationId: string
    productionFloorCode?: string
    startedAt: string
  }
) {
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
        active, checklist_code, frequency_basis, created_by_user_id,
        updated_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      VALUES ($1, 'BREAKDOWN', 'Breakdown maintenance', 'event', 1,
        true, 'BREAKDOWN', 'Event', $2, $2, 'mrm-dashboard',
        'maintenance_master', $3, $4)
      ON CONFLICT (organization_id, lower(code))
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [
      input.organizationId,
      input.actorUserId ?? null,
      randomUUID(),
      { generated: true },
    ]
  )
  const scheduleKey = `${input.machineNumber}|BREAKDOWN`
  const schedule = await client.query<{ id: string }>(
    `
      INSERT INTO maintenance.machine_schedules (
        organization_id, definition_id, machine_id, next_due_on,
        active, schedule_key, created_by_user_id, updated_by_user_id,
        source_system, source_table, source_id, source_payload
      )
      VALUES ($1, $2, $3, COALESCE(migration.try_date($4), current_date),
        false, $5, $6, $6, 'mrm-dashboard', 'maintenance_schedule', $7, $8)
      ON CONFLICT (definition_id, machine_id)
      DO UPDATE SET schedule_key = EXCLUDED.schedule_key,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = now(),
        row_version = maintenance.machine_schedules.row_version + 1
      RETURNING id
    `,
    [
      input.organizationId,
      definition.rows[0]!.id,
      machineId,
      input.startedAt,
      scheduleKey,
      input.actorUserId ?? null,
      randomUUID(),
      { generated: true },
    ]
  )
  return { machineId, scheduleId: schedule.rows[0]!.id, scheduleKey }
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

    async listCompletedMachineMaintenance(organizationId: string) {
      const result = await pool.query<{
        id: string
        machineNumber: string
        productionUnit: string
        maintenance: string
        taskType: string
        dueOn: string
        completedAt: string
        completedBy: string | null
        workDone: string | null
      }>(`
        SELECT task.id, machine.machine_number AS "machineNumber",
          floor.name AS "productionUnit", definition.name AS maintenance,
          task.task_type AS "taskType", task.due_on::text AS "dueOn",
          task.completed_at::text AS "completedAt",
          COALESCE(NULLIF(task.legacy_completer, ''), technician.name) AS "completedBy",
          task.source_payload->>'workDone' AS "workDone"
        FROM maintenance.tasks task
        JOIN maintenance.machine_schedules schedule ON schedule.id = task.machine_schedule_id
          AND schedule.organization_id = task.organization_id
        JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
          AND definition.organization_id = task.organization_id
        JOIN catalog.machines machine ON machine.id = schedule.machine_id
          AND machine.organization_id = task.organization_id
        JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
        LEFT JOIN identity.users technician ON technician.id = task.completed_by_user_id
        WHERE task.organization_id = $1 AND task.status = 'Completed'
          AND task.completed_at IS NOT NULL
        ORDER BY task.completed_at DESC, machine.machine_number, task.id
      `, [organizationId])
      return result.rows
    },

    async listBreakdowns(input: {
      organizationId: string
      status?: "Completed" | "In Progress"
    }): Promise<MachineBreakdownRow[]> {
      const result = await pool.query<MachineBreakdownRow>(
        `
          SELECT task.id, task.task_key AS "taskKey", task.status,
            task.started_at::text AS "startedAt",
            task.completed_at::text AS "completedAt",
            machine.machine_number AS "machineNumber",
            floor.code AS "productionFloorCode",
            task.source_payload->>'downtimeReasonCode' AS "reasonCode",
            task.source_payload->>'breakdownReason' AS "reasonName",
            COALESCE(
              task.source_payload->'changedItems', '[]'::jsonb
            ) AS "changedItems",
            task.source_payload->>'workDone' AS "workDone",
            COALESCE(
              NULLIF(task.legacy_completer, ''), technician.name,
              task.source_payload->>'completedBy'
            ) AS "completedBy",
            downtime.id AS "downtimeEventId"
          FROM maintenance.tasks task
          JOIN maintenance.machine_schedules schedule
            ON schedule.id = task.machine_schedule_id
           AND schedule.organization_id = task.organization_id
          JOIN catalog.machines machine
            ON machine.id = schedule.machine_id
           AND machine.organization_id = task.organization_id
          JOIN manufacturing.production_floors floor
            ON floor.id = machine.production_floor_id
          LEFT JOIN identity.users technician
            ON technician.id = task.completed_by_user_id
          LEFT JOIN LATERAL (
            SELECT event.id
            FROM manufacturing.production_session_downtime_events event
            WHERE event.organization_id = task.organization_id
              AND event.source_payload->>'maintenanceTaskKey' = task.task_key
              AND event.reversed_at IS NULL
            ORDER BY event.started_at
            LIMIT 1
          ) downtime ON true
          WHERE task.organization_id = $1
            AND lower(task.task_type) = 'breakdown'
            AND ($2::text IS NULL OR task.status = $2)
          ORDER BY task.started_at DESC, task.id DESC
        `,
        [input.organizationId, input.status ?? null]
      )
      return result.rows
    },

    async listMachineMaintenancePlan(organizationId: string, month: string) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Select a valid month.")
      const result = await pool.query<{
        id: string
        machineId: string
        machineNumber: string
        productionUnit: string
        maintenance: string
        dueOn: string
        status: string
        completedAt: string | null
      }>(`
        WITH planned AS (
          SELECT task.id::text, task.machine_schedule_id AS schedule_id,
            task.due_on, task.status, task.completed_at
          FROM maintenance.tasks task
          WHERE task.organization_id = $1 AND lower(task.task_type) = 'planned'
            AND task.due_on >= $2::date AND task.due_on < $2::date + interval '1 month'
            AND task.status <> 'Cancelled'
          UNION ALL
          SELECT 'schedule-' || schedule.id::text, schedule.id, schedule.next_due_on,
            'Planned', NULL::timestamptz
          FROM maintenance.machine_schedules schedule
          JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
            AND definition.organization_id = schedule.organization_id
          WHERE schedule.organization_id = $1 AND schedule.active AND definition.active
            AND lower(definition.code) <> 'breakdown'
            AND schedule.next_due_on >= $2::date
            AND schedule.next_due_on < $2::date + interval '1 month'
            AND NOT EXISTS (
              SELECT 1 FROM maintenance.tasks task
              WHERE task.organization_id = $1 AND task.machine_schedule_id = schedule.id
                AND task.due_on = schedule.next_due_on AND lower(task.task_type) = 'planned'
                AND task.status <> 'Cancelled'
            )
        )
        SELECT planned.id, machine.id AS "machineId", machine.machine_number AS "machineNumber",
          floor.name AS "productionUnit", definition.name AS maintenance,
          planned.due_on::text AS "dueOn", planned.status,
          planned.completed_at::text AS "completedAt"
        FROM planned
        JOIN maintenance.machine_schedules schedule ON schedule.id = planned.schedule_id
          AND schedule.organization_id = $1
        JOIN maintenance.definitions definition ON definition.id = schedule.definition_id
          AND definition.organization_id = $1
        JOIN catalog.machines machine ON machine.id = schedule.machine_id AND machine.organization_id = $1
        JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
        ORDER BY planned.due_on, machine.machine_number, planned.id
      `, [organizationId, `${month}-01`])
      return result.rows
    },

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async upsertDefinition(input: {
      rejectDuplicates?: boolean
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
        await assertMasterAvailable(
          client,
          input,
          "maintenance.definitions",
          "lower(code) = lower($2)",
          [input.code.trim()]
        )
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
              $10, $10, 'mrm-dashboard', 'dataEntries', $11, $12)
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
              source_table = EXCLUDED.source_table,
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
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async upsertChecklistItem(input: {
      rejectDuplicates?: boolean
      actorUserId?: string | null
      checklistCode: string
      checklistTitle: string
      item: ChecklistItemInput
      organizationId: string
      payload: Record<string, unknown>
    }) {
      return transaction(pool, async (client) => {
        const code = await generatedMaintenanceChecklistCode(
          client,
          input.organizationId,
          input.checklistCode,
          input.checklistTitle
        )
        await assertMasterAvailable(
          client,
          input,
          "maintenance.checklist_items",
          "definition_id IN (SELECT id FROM maintenance.definitions WHERE organization_id = $1 AND lower(code) = lower($2)) AND sequence = $3",
          [code, input.item.sequence]
        )
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
        await queueDashboardRefresh(client, input.organizationId)
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

    async startBreakdown(input: {
      actorUserId?: string | null
      machineNumber: string
      organizationId: string
      payload: Record<string, unknown>
      productionFloorCode?: string
      reasonCode: string
      reasonName: string
      startedAt: string
      taskKey: string
    }) {
      return transaction(pool, async (client) => {
        const startedAt = requiredTimestamp(input.startedAt, "Breakdown start")
        const taskKey = requiredText(input.taskKey, "Breakdown task key")
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('maintenance.breakdown'), hashtext(lower($1)))",
          [`${input.organizationId}|${input.machineNumber}`]
        )
        const existing = await client.query<{
          downtime_event_id: string | null
          id: string
          production_session_id: string | null
          status: string
        }>(
          `
            SELECT task.id, task.status, downtime.id AS downtime_event_id,
              downtime.production_session_id
            FROM maintenance.tasks task
            LEFT JOIN LATERAL (
              SELECT event.id, event.production_session_id
              FROM manufacturing.production_session_downtime_events event
              WHERE event.organization_id = task.organization_id
                AND event.source_payload->>'maintenanceTaskKey' = task.task_key
                AND event.reversed_at IS NULL
              ORDER BY event.started_at
              LIMIT 1
            ) downtime ON true
            WHERE task.organization_id = $1 AND lower(task.task_key) = lower($2)
            FOR UPDATE OF task
          `,
          [input.organizationId, taskKey]
        )
        if (existing.rows[0]) {
          return {
            downtimeEventId: existing.rows[0].downtime_event_id,
            downtimeStarted: Boolean(existing.rows[0].downtime_event_id),
            id: existing.rows[0].id,
            productionSessionId: existing.rows[0].production_session_id,
            status: existing.rows[0].status,
            taskKey,
          }
        }

        const schedule = await ensureBreakdownSchedule(client, {
          actorUserId: input.actorUserId,
          machineNumber: input.machineNumber,
          organizationId: input.organizationId,
          productionFloorCode: input.productionFloorCode,
          startedAt: startedAt.toISOString(),
        })
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('production.session'), hashtext($1))",
          [schedule.machineId]
        )
        const open = await client.query<{ id: string }>(
          `
            SELECT task.id
            FROM maintenance.tasks task
            WHERE task.organization_id = $1
              AND task.machine_schedule_id = $2
              AND lower(task.task_type) = 'breakdown'
              AND task.status = 'In Progress'
            LIMIT 1
            FOR UPDATE
          `,
          [input.organizationId, schedule.scheduleId]
        )
        if (open.rows[0]) {
          throw new Error("This machine already has an open breakdown.")
        }
        const sourcePayload = {
          ...input.payload,
          breakdownReason: requiredText(input.reasonName, "Breakdown reason"),
          changedItems: [],
          downtimeReasonCode: requiredText(
            input.reasonCode,
            "Downtime reason code"
          ),
          machineNo: input.machineNumber,
          maintenanceCode: "BREAKDOWN",
          maintenanceTitle: "Breakdown maintenance",
          maintenanceType: "Breakdown",
          productionFloorCode: normalizeProductionFloorCode(
            input.productionFloorCode
          ),
          startedAt: startedAt.toISOString(),
          status: "In Progress",
          taskId: taskKey,
        }
        const task = await client.query<{ id: string }>(
          `
            INSERT INTO maintenance.tasks (
              organization_id, machine_schedule_id, due_on, status,
              started_at, created_by_user_id, updated_by_user_id,
              task_key, task_type, source_system, source_table, source_id,
              source_payload
            )
            VALUES ($1, $2, COALESCE(migration.try_date($3), current_date),
              'In Progress', $3, $4, $4, $5, 'Breakdown',
              'mrm-dashboard', 'maintenance_task', $6, $7)
            RETURNING id
          `,
          [
            input.organizationId,
            schedule.scheduleId,
            startedAt.toISOString(),
            input.actorUserId ?? null,
            taskKey,
            randomUUID(),
            sourcePayload,
          ]
        )
        const session = await client.query<{ id: string; started_at: Date }>(
          `
            SELECT id, started_at
            FROM manufacturing.production_sessions
            WHERE organization_id = $1 AND machine_id = $2
              AND status = 'open' AND reversed_at IS NULL
            FOR UPDATE
          `,
          [input.organizationId, schedule.machineId]
        )
        let downtimeEventId: string | null = null
        if (session.rows[0]) {
          if (startedAt < session.rows[0].started_at) {
            throw new Error(
              "Breakdown start cannot be before the production session start."
            )
          }
          const openDowntime = await client.query<{ id: string }>(
            `
              SELECT id
              FROM manufacturing.production_session_downtime_events
              WHERE production_session_id = $1
                AND ended_at IS NULL AND reversed_at IS NULL
              LIMIT 1
              FOR UPDATE
            `,
            [session.rows[0].id]
          )
          if (openDowntime.rows[0]) {
            throw new Error(
              "Close the current production downtime before starting a breakdown."
            )
          }
          const downtime = await client.query<{ id: string }>(
            `
              INSERT INTO manufacturing.production_session_downtime_events (
                organization_id, production_session_id, reason_code,
                reason_name, started_at, entered_role, entered_by_user_id,
                source_payload
              )
              VALUES ($1, $2, $3, $4, $5, 'machinist', $6, $7)
              RETURNING id
            `,
            [
              input.organizationId,
              session.rows[0].id,
              sourcePayload.downtimeReasonCode,
              sourcePayload.breakdownReason,
              startedAt.toISOString(),
              input.actorUserId ?? null,
              {
                maintenanceTaskId: task.rows[0]!.id,
                maintenanceTaskKey: taskKey,
                source: "breakdown-maintenance",
              },
            ]
          )
          downtimeEventId = downtime.rows[0]!.id
        }
        await queueDashboardRefresh(client, input.organizationId)
        return {
          downtimeEventId,
          downtimeStarted: Boolean(downtimeEventId),
          id: task.rows[0]!.id,
          productionSessionId: session.rows[0]?.id ?? null,
          status: "In Progress",
          taskKey,
        }
      })
    },

    async completeBreakdown(input: {
      actorUserId?: string | null
      changedItems: readonly string[]
      completedAt: string
      completedBy: string
      organizationId: string
      payload: Record<string, unknown>
      taskKey: string
      workDone: string
    }) {
      return transaction(pool, async (client) => {
        const completedAt = requiredTimestamp(
          input.completedAt,
          "Breakdown completion"
        )
        const taskKey = requiredText(input.taskKey, "Breakdown task key")
        const task = await client.query<{
          machine_number: string
          production_floor_code: string
          source_payload: Record<string, unknown>
          started_at: Date
          status: string
        }>(
          `
            SELECT task.status, task.started_at, task.source_payload,
              machine.machine_number,
              floor.code AS production_floor_code
            FROM maintenance.tasks task
            JOIN maintenance.machine_schedules schedule
              ON schedule.id = task.machine_schedule_id
             AND schedule.organization_id = task.organization_id
            JOIN catalog.machines machine ON machine.id = schedule.machine_id
            JOIN manufacturing.production_floors floor
              ON floor.id = machine.production_floor_id
            WHERE task.organization_id = $1
              AND lower(task.task_key) = lower($2)
              AND lower(task.task_type) = 'breakdown'
            FOR UPDATE OF task
          `,
          [input.organizationId, taskKey]
        )
        const current = task.rows[0]
        if (!current) throw new Error("Open breakdown was not found.")
        if (current.status === "Completed") {
          return { status: current.status, taskKey }
        }
        if (current.status !== "In Progress") {
          throw new Error("Only an in-progress breakdown can be completed.")
        }
        if (completedAt <= current.started_at) {
          throw new Error("Breakdown completion must be after its start.")
        }
        const changedItems = input.changedItems
          .map((item) => item.trim())
          .filter(Boolean)
        const completedBy = requiredText(input.completedBy, "Completed by")
        const workDone = requiredText(input.workDone, "Work done")
        const downtime = await client.query<{
          carry_forward_resolved_at: Date | null
          end_outcome: string | null
          ended_at: Date | null
          id: string
          started_at: Date
        }>(
          `
            SELECT event.id, event.started_at, event.ended_at,
              event.end_outcome, event.carry_forward_resolved_at
            FROM manufacturing.production_session_downtime_events event
            WHERE event.organization_id = $1
              AND event.source_payload->>'maintenanceTaskKey' = $2
              AND event.reversed_at IS NULL
            ORDER BY event.started_at DESC
            LIMIT 1
            FOR UPDATE
          `,
          [input.organizationId, taskKey]
        )
        const linkedDowntime = downtime.rows[0]
        if (linkedDowntime && !linkedDowntime.ended_at) {
          if (completedAt <= linkedDowntime.started_at) {
            throw new Error("Breakdown completion must be after downtime start.")
          }
          const durationMinutes = Math.max(
            Math.ceil(
              (completedAt.getTime() - linkedDowntime.started_at.getTime()) /
                60_000
            ),
            1
          )
          await client.query(
            `
              UPDATE manufacturing.production_session_downtime_events
              SET ended_at = $1, duration_minutes = $2,
                end_outcome = 'resolved', ended_by_user_id = $3,
                updated_at = now(),
                source_payload = source_payload || $4::jsonb
              WHERE id = $5
            `,
            [
              completedAt.toISOString(),
              durationMinutes,
              input.actorUserId ?? null,
              { resolvedBy: "breakdown-maintenance" },
              linkedDowntime.id,
            ]
          )
        } else if (
          linkedDowntime?.end_outcome === "shift_end_unresolved" &&
          !linkedDowntime.carry_forward_resolved_at
        ) {
          await client.query(
            `
              UPDATE manufacturing.production_session_downtime_events
              SET carry_forward_resolved_at = $1,
                carry_forward_resolved_by_user_id = $2,
                updated_at = now(),
                source_payload = source_payload || $3::jsonb
              WHERE id = $4
            `,
            [
              completedAt.toISOString(),
              input.actorUserId ?? null,
              { carryResolvedBy: "breakdown-maintenance" },
              linkedDowntime.id,
            ]
          )
        }
        const payload = {
          ...current.source_payload,
          ...input.payload,
          changedItems,
          actualMinutes: Math.max(
            Math.ceil(
              (completedAt.getTime() - current.started_at.getTime()) / 60_000
            ),
            1
          ),
          completedAt: completedAt.toISOString(),
          completedBy,
          result: "Completed",
          status: "Completed",
          workDone,
        }
        const result = await completeMaintenanceTask(client, {
          actorUserId: input.actorUserId,
          completedAt: completedAt.toISOString(),
          completedBy,
          dueOn: current.started_at.toISOString(),
          machineNumber: current.machine_number,
          organizationId: input.organizationId,
          payload,
          productionFloorCode: current.production_floor_code,
          results: [],
          scheduleKey: `${current.machine_number}|BREAKDOWN`,
          taskKey,
          taskType: "Breakdown",
        })
        await queueDashboardRefresh(client, input.organizationId)
        return { ...result, status: "Completed", taskKey }
      })
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

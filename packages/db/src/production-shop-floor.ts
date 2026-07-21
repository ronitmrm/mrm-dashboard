import { randomUUID } from "node:crypto"

import { Pool, type PoolClient } from "pg"

type RepositoryOptions = { connectionString: string }

type WorkOrderContext = {
  item_id: string
  route_option_id: string | null
  work_order_id: string
}

const stageAliases: Record<string, string> = {
  item_complete: "item_complete",
  operator_started: "operator_started",
  presetting: "presetting",
  qc_approval: "quality_approval",
  quality_approval: "quality_approval",
  raw_material_at_machine: "raw_material_at_machine",
  setting: "setting",
  shop_floor_rm: "raw_material_at_machine",
  tools_drawing: "presetting",
  worker_start: "operator_started",
}

const stageRanks = new Map([
  ["raw_material_at_machine", 0],
  ["presetting", 1],
  ["setting", 2],
  ["quality_approval", 3],
  ["operator_started", 4],
  ["item_complete", 5],
])

function requiredText(value: string, label: string) {
  const cleaned = value.trim()
  if (!cleaned) throw new Error(`${label} is required.`)
  return cleaned
}

function canonicalStage(value: string) {
  const cleaned = requiredText(value, "Shop-floor stage").toLowerCase()
  return stageAliases[cleaned] ?? cleaned
}

function stageIsActive(value: string) {
  const rank = stageRanks.get(canonicalStage(value)) ?? -1
  return rank >= 0 && rank < 5
}

function valueIsBlank(value: unknown) {
  if (value === undefined || value === null || value === "") return true
  if (typeof value === "number") return value === 0
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as Record<string, unknown>).length === 0
  }
  return false
}

function mergeProductionCardPayload(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
) {
  const merged = { ...previous, ...next }
  for (const [key, value] of Object.entries(next)) {
    if (key === "savedAt") continue
    const previousValue = previous[key]
    if (valueIsBlank(value) && !valueIsBlank(previousValue)) {
      merged[key] = previousValue
    }
  }
  return merged
}

async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>
) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await operation(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

async function queueDashboardRefresh(
  client: PoolClient,
  organizationId: string
) {
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO derived.refresh_jobs (
        organization_id, queue_key, idempotency_key, status, run_after
      )
      VALUES ($1, 'dashboard', $2, 'pending', now())
      ON CONFLICT (organization_id, queue_key)
        WHERE status IN ('pending', 'running')
      DO UPDATE SET run_after = LEAST(derived.refresh_jobs.run_after, now()),
        updated_at = now(), last_error = NULL
      RETURNING id
    `,
    [organizationId, randomUUID()]
  )
  const refreshJobId = result.rows[0]!.id
  await client.query(
    `
      INSERT INTO derived.outbox_events (
        organization_id, topic, aggregate_type, aggregate_id,
        payload, idempotency_key
      )
      VALUES ($1, 'dashboard.refresh.requested', 'refresh_job', $2, $3, $4)
    `,
    [
      organizationId,
      refreshJobId,
      { organizationId, queueKey: "dashboard", refreshJobId },
      randomUUID(),
    ]
  )
}

async function workOrderContext(
  client: PoolClient,
  organizationId: string,
  jobCardNumber: string
) {
  const result = await client.query<WorkOrderContext>(
    `
      SELECT work_order.id AS work_order_id, work_order.item_id,
        selection.route_option_id
      FROM manufacturing.work_orders work_order
      LEFT JOIN manufacturing.route_selections selection
        ON selection.work_order_id = work_order.id
        AND selection.reversed_at IS NULL
      WHERE work_order.organization_id = $1
        AND lower(work_order.job_card_number) = lower($2)
      FOR UPDATE OF work_order
    `,
    [organizationId, requiredText(jobCardNumber, "Job card")]
  )
  if (!result.rows[0]) throw new Error("Production work order was not found.")
  return result.rows[0]
}

async function operationSetupForCode(
  client: PoolClient,
  routeOptionId: string | null,
  setupCode?: string | null
) {
  if (!routeOptionId || !setupCode?.trim()) return null
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM manufacturing.operation_setups
      WHERE route_option_id = $1 AND active
        AND (
          lower(COALESCE(legacy_setup_code, '')) = lower($2)
          OR setup_number::text = btrim($2)
        )
      ORDER BY
        (lower(COALESCE(legacy_setup_code, '')) = lower($2)) DESC,
        sequence
      LIMIT 1
      FOR UPDATE
    `,
    [routeOptionId, setupCode]
  )
  if (!result.rows[0]) throw new Error("Production route setup was not found.")
  return result.rows[0].id
}

async function machineIdFor(
  client: PoolClient,
  organizationId: string,
  machineNumber?: string | null
) {
  if (!machineNumber?.trim()) return null
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM catalog.machines
      WHERE organization_id = $1 AND lower(machine_number) = lower($2)
        AND active
      FOR UPDATE
    `,
    [organizationId, machineNumber.trim()]
  )
  if (!result.rows[0]) throw new Error("Physical machine was not found.")
  return result.rows[0].id
}

async function employeeIdFor(
  client: PoolClient,
  organizationId: string,
  employeeCode?: string | null
) {
  if (!employeeCode?.trim()) return null
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM workforce.employees
      WHERE organization_id = $1 AND lower(employee_code) = lower($2)
      LIMIT 1
    `,
    [organizationId, employeeCode.trim()]
  )
  return result.rows[0]?.id ?? null
}

async function plannerSwitchExists(
  client: PoolClient,
  input: {
    fromMachineId: string
    operationSetupId: string
    targetMachineId: string
    workOrderId: string
  }
) {
  const result = await client.query(
    `
      SELECT 1 FROM manufacturing.plan_override_events
      WHERE work_order_id = $1
        AND (operation_setup_id = $2 OR operation_setup_id IS NULL)
        AND target_machine_id = $3
        AND (source_machine_id = $4 OR source_machine_id IS NULL)
        AND reversed_at IS NULL
      ORDER BY occurred_at DESC
      LIMIT 1
    `,
    [
      input.workOrderId,
      input.operationSetupId,
      input.targetMachineId,
      input.fromMachineId,
    ]
  )
  return Boolean(result.rows[0])
}

export function createProductionShopFloorRepository({
  connectionString,
}: RepositoryOptions) {
  const pool = new Pool({ connectionString })

  return {
    async close() {
      await pool.end()
    },

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async upsertRawMaterialReceipt(input: {
      actorUserId?: string | null
      organizationId: string
      payload: Record<string, unknown>
      quantityKg: number
      receiptNumber: string
      receivedOn: string
    }) {
      return transaction(pool, async (client) => {
        const receiptNumber = requiredText(
          input.receiptNumber,
          "Raw-material receipt"
        )
        if (!(input.quantityKg > 0)) {
          throw new Error("Raw-material receipt quantity must be positive.")
        }
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('production.raw-material'), hashtext(lower($1)))",
          [receiptNumber]
        )
        const existing = await client.query<{ id: string }>(
          `
            SELECT id FROM manufacturing.raw_material_receipts
            WHERE organization_id = $1 AND lower(receipt_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, receiptNumber]
        )
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.raw_material_receipts
                SET received_on = COALESCE(migration.try_date($1), received_on),
                  quantity_kg = $2, remaining_quantity_kg = $2,
                  updated_by_user_id = $3, source_payload = $4,
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $5 RETURNING id
              `,
              [
                input.receivedOn,
                input.quantityKg,
                input.actorUserId ?? null,
                input.payload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.raw_material_receipts (
                  organization_id, receipt_number, received_on, quantity_kg,
                  remaining_quantity_kg, created_by_user_id,
                  updated_by_user_id, source_system, source_table, source_id,
                  source_payload
                )
                VALUES ($1, $2, COALESCE(migration.try_date($3), current_date),
                  $4, $4, $5, $5, 'mrm-dashboard', 'rm_inward', $6, $7)
                RETURNING id
              `,
              [
                input.organizationId,
                receiptNumber,
                input.receivedOn,
                input.quantityKg,
                input.actorUserId ?? null,
                randomUUID(),
                input.payload,
              ]
            )
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async upsertProductionCard(input: {
      actorUserId?: string | null
      cardNumber: string
      jobCardNumber: string
      organizationId: string
      payload: Record<string, unknown>
    }) {
      return transaction(pool, async (client) => {
        const cardNumber = requiredText(input.cardNumber, "Production card")
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('production.card'), hashtext(lower($1)))",
          [cardNumber]
        )
        const existing = await client.query<{
          id: string
          source_payload: Record<string, unknown> | null
        }>(
          `
            SELECT id, source_payload FROM manufacturing.production_cards
            WHERE organization_id = $1 AND lower(card_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, cardNumber]
        )
        const payload = mergeProductionCardPayload(
          existing.rows[0]?.source_payload ?? {},
          input.payload
        )
        const card = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.production_cards
                SET work_order_id = $1, route_option_id = $2,
                  issued_on = COALESCE(migration.try_date($3), issued_on),
                  source_payload = $4, updated_by_user_id = $5,
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $6
                RETURNING id
              `,
              [
                workOrder.work_order_id,
                workOrder.route_option_id,
                String(payload.prodDate ?? ""),
                payload,
                input.actorUserId ?? null,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.production_cards (
                  organization_id, card_number, work_order_id,
                  route_option_id, status, issued_on, created_by_user_id,
                  updated_by_user_id, source_system, source_table,
                  source_id, source_payload
                )
                VALUES ($1, $2, $3, $4, 'Open',
                  COALESCE(migration.try_date($5), current_date), $6, $6,
                  'mrm-dashboard', 'production_card', $7, $8)
                RETURNING id
              `,
              [
                input.organizationId,
                cardNumber,
                workOrder.work_order_id,
                workOrder.route_option_id,
                String(payload.prodDate ?? ""),
                input.actorUserId ?? null,
                randomUUID(),
                payload,
              ]
            )
        const setupId = await operationSetupForCode(
          client,
          workOrder.route_option_id,
          String(payload.setupNo ?? "")
        )
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          String(payload.machine ?? "")
        )
        await client.query(
          `
            INSERT INTO manufacturing.production_card_events (
              organization_id, production_card_id, event_type,
              operation_setup_id, machine_id, actor_user_id, details,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7,
              'mrm-dashboard', 'production_card_event', $8, $7)
          `,
          [
            input.organizationId,
            card.rows[0]!.id,
            String(payload.cardEntryKind || "production"),
            setupId,
            machineId,
            input.actorUserId ?? null,
            payload,
            randomUUID(),
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return card.rows[0]!
      })
    },

    async recordProductionEntry(input: {
      actorUserId?: string | null
      jobCardNumber: string
      machineNumber?: string | null
      operationSetupCode?: string | null
      operatorCode?: string | null
      organizationId: string
      payload: Record<string, unknown>
      productionDate: string
      quantityGood: number
      quantityRejected: number
      shift?: string | null
    }) {
      return transaction(pool, async (client) => {
        if (input.quantityGood < 0 || input.quantityRejected < 0) {
          throw new Error("Production quantities cannot be negative.")
        }
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        const setupId = await operationSetupForCode(
          client,
          workOrder.route_option_id,
          input.operationSetupCode
        )
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber
        )
        const employeeId = await employeeIdFor(
          client,
          input.organizationId,
          input.operatorCode
        )
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.production_entries (
              organization_id, work_order_id, route_option_id,
              operation_setup_id, machine_id, operator_employee_id,
              production_date, shift, quantity_good, quantity_rejected,
              started_at, completed_at, recorded_by_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6,
              COALESCE(migration.try_date($7), current_date), $8, $9, $10,
              migration.try_timestamptz($11), migration.try_timestamptz($12),
              $13, 'mrm-dashboard', 'production_entry', $14, $15)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.work_order_id,
            workOrder.route_option_id,
            setupId,
            machineId,
            employeeId,
            input.productionDate,
            input.shift?.trim() || null,
            input.quantityGood,
            input.quantityRejected,
            String(input.payload.startTime ?? ""),
            String(input.payload.endTime ?? ""),
            input.actorUserId ?? null,
            randomUUID(),
            input.payload,
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async recordShopFloorStage(input: {
      actorUserId?: string | null
      jobCardNumber: string
      machineNumber: string
      operationSetupCode: string
      organizationId: string
      payload: Record<string, unknown>
      stage: string
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        if (!workOrder.route_option_id) {
          throw new Error("Select a route before saving shop-floor status.")
        }
        const setupId = await operationSetupForCode(
          client,
          workOrder.route_option_id,
          input.operationSetupCode
        )
        if (!setupId) throw new Error("Shop-floor setup is required.")
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber
        )
        if (!machineId) throw new Error("Shop-floor machine is required.")
        const stage = canonicalStage(input.stage)
        const active = stageIsActive(stage)
        const current = await client.query<{
          id: string
          machine_id: string | null
          stage: string
        }>(
          `
            SELECT id, machine_id, stage
            FROM manufacturing.shop_floor_setup_state
            WHERE work_order_id = $1 AND route_option_id = $2
              AND operation_setup_id = $3
            FOR UPDATE
          `,
          [workOrder.work_order_id, workOrder.route_option_id, setupId]
        )
        if (
          active &&
          current.rows[0]?.machine_id &&
          current.rows[0].machine_id !== machineId &&
          !(await plannerSwitchExists(client, {
            fromMachineId: current.rows[0].machine_id,
            operationSetupId: setupId,
            targetMachineId: machineId,
            workOrderId: workOrder.work_order_id,
          }))
        ) {
          throw new Error(
            "This setup is already locked to another machine. Use the planner machine switch before moving it."
          )
        }
        if (active) {
          const occupied = await client.query<{ id: string }>(
            `
              SELECT id FROM manufacturing.shop_floor_setup_state
              WHERE machine_id = $1 AND active
                AND id IS DISTINCT FROM $2::uuid
              FOR UPDATE
            `,
            [machineId, current.rows[0]?.id ?? null]
          )
          if (occupied.rows[0]) {
            throw new Error(
              "The target machine is owned by another active setup."
            )
          }
        }
        const sourcePayload = {
          ...input.payload,
          jobCardNumber: input.jobCardNumber,
          machineNumber: input.machineNumber,
          operationSetupCode: input.operationSetupCode,
          stage,
        }
        const state = current.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.shop_floor_setup_state
                SET machine_id = $1, stage = $2, active = $3,
                  started_at = COALESCE(started_at, now()),
                  completed_at = CASE WHEN $3 THEN NULL ELSE now() END,
                  updated_by_user_id = $4, source_payload = $5,
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $6 RETURNING id
              `,
              [
                machineId,
                stage,
                active,
                input.actorUserId ?? null,
                sourcePayload,
                current.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.shop_floor_setup_state (
                  organization_id, work_order_id, route_option_id,
                  operation_setup_id, machine_id, stage, active, started_at,
                  completed_at, created_by_user_id, updated_by_user_id,
                  source_system, source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, now(),
                  CASE WHEN $7 THEN NULL ELSE now() END, $8, $8,
                  'mrm-dashboard', 'shop_floor_status', $9, $10)
                RETURNING id
              `,
              [
                input.organizationId,
                workOrder.work_order_id,
                workOrder.route_option_id,
                setupId,
                machineId,
                stage,
                active,
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
        await client.query(
          `
            INSERT INTO manufacturing.shop_floor_stage_events (
              organization_id, setup_state_id, from_stage, to_stage,
              machine_id, occurred_at, actor_user_id, legacy_actor, reason,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5,
              COALESCE(migration.try_timestamptz($6), now()), $7, $8, $9,
              'mrm-dashboard', 'shop_floor_status', $10, $11)
          `,
          [
            input.organizationId,
            state.rows[0]!.id,
            current.rows[0]?.stage ?? null,
            stage,
            machineId,
            String(input.payload.completedAt ?? ""),
            input.actorUserId ?? null,
            String(input.payload.doneBy || input.payload.worker || "") || null,
            String(input.payload.remark || "") || null,
            randomUUID(),
            sourcePayload,
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { id: state.rows[0]!.id, ok: true }
      })
    },

    async recordDispatchApproval(input: {
      actorUserId?: string | null
      approvedBy: string
      jobCardNumber: string
      organizationId: string
      remark?: string | null
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        const sourcePayload = input
        const result = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.dispatch_approval_events (
              organization_id, work_order_id, decision, reason,
              actor_user_id, legacy_actor, source_system, source_table,
              source_id, source_payload
            )
            VALUES ($1, $2, 'approved', $3, $4, $5,
              'mrm-dashboard', 'dispatchApprovals', $6, $7)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.work_order_id,
            input.remark?.trim() || null,
            input.actorUserId ?? null,
            requiredText(input.approvedBy, "Approved by"),
            randomUUID(),
            sourcePayload,
          ]
        )
        return { id: result.rows[0]!.id, ok: true }
      })
    },

    async recordSetupCompletion(input: {
      actorUserId?: string | null
      completedBy: string
      jobCardNumber: string
      machineNumber?: string | null
      operationSetupCode?: string | null
      organizationId: string
      remark?: string | null
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        if (!workOrder.route_option_id) {
          throw new Error("Select a route before completing a setup.")
        }
        let setupId = await operationSetupForCode(
          client,
          workOrder.route_option_id,
          input.operationSetupCode
        )
        let machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber
        )
        const state = await client.query<{
          id: string
          machine_id: string | null
          operation_setup_id: string
          stage: string
        }>(
          `
            SELECT id, machine_id, operation_setup_id, stage
            FROM manufacturing.shop_floor_setup_state
            WHERE work_order_id = $1 AND route_option_id = $2
              AND ($3::uuid IS NULL OR operation_setup_id = $3)
              AND active
            ORDER BY updated_at DESC
            LIMIT 1
            FOR UPDATE
          `,
          [workOrder.work_order_id, workOrder.route_option_id, setupId]
        )
        if (!setupId) setupId = state.rows[0]?.operation_setup_id ?? null
        if (!machineId) machineId = state.rows[0]?.machine_id ?? null
        if (!setupId) throw new Error("Setup completion target was not found.")
        const sourcePayload = {
          actorUserId: input.actorUserId ?? null,
          completedBy: input.completedBy,
          jobCardNumber: input.jobCardNumber,
          machineNumber: input.machineNumber ?? null,
          operationSetupCode: input.operationSetupCode ?? null,
          organizationId: input.organizationId,
          remark: input.remark ?? null,
        }
        const completion = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.setup_completion_events (
              organization_id, work_order_id, operation_setup_id,
              machine_id, completed_at, actor_user_id, legacy_actor, notes,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, now(), $5, $6, $7,
              'mrm-dashboard', 'setupCompletions', $8, $9)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.work_order_id,
            setupId,
            machineId,
            input.actorUserId ?? null,
            requiredText(input.completedBy, "Completed by"),
            input.remark?.trim() || null,
            randomUUID(),
            sourcePayload,
          ]
        )
        if (state.rows[0]) {
          await client.query(
            `
              UPDATE manufacturing.shop_floor_setup_state
              SET stage = 'item_complete', active = false,
                completed_at = now(), updated_by_user_id = $1,
                source_payload = $2, updated_at = now(),
                row_version = row_version + 1
              WHERE id = $3
            `,
            [input.actorUserId ?? null, sourcePayload, state.rows[0].id]
          )
          await client.query(
            `
              INSERT INTO manufacturing.shop_floor_stage_events (
                organization_id, setup_state_id, from_stage, to_stage,
                machine_id, actor_user_id, legacy_actor, reason,
                source_system, source_table, source_id, source_payload
              )
              VALUES ($1, $2, $3, 'item_complete', $4, $5, $6, $7,
                'mrm-dashboard', 'setupCompletions', $8, $9)
            `,
            [
              input.organizationId,
              state.rows[0].id,
              state.rows[0].stage,
              machineId,
              input.actorUserId ?? null,
              input.completedBy,
              input.remark?.trim() || null,
              randomUUID(),
              sourcePayload,
            ]
          )
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: completion.rows[0]!.id, ok: true }
      })
    },

    async reverseProductionEntry(input: {
      actorUserId?: string | null
      productionEntryId: string
      reason: string
    }) {
      return transaction(pool, async (client) => {
        const current = await client.query<{
          organization_id: string
          source_payload: unknown
        }>(
          `
            SELECT organization_id, source_payload
            FROM manufacturing.production_entries
            WHERE id = $1 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [input.productionEntryId]
        )
        if (!current.rows[0]) {
          throw new Error("Active production entry was not found.")
        }
        const reason = requiredText(input.reason, "Reversal reason")
        await client.query(
          `
            UPDATE manufacturing.production_entries
            SET reversed_at = now(), reversal_reason = $1
            WHERE id = $2
          `,
          [reason, input.productionEntryId]
        )
        await client.query(
          `
            INSERT INTO audit.events (
              organization_id, event_type, target_schema, target_table,
              target_id, actor_user_id, reason, before_state, after_state,
              source_system, source_table, source_id
            )
            VALUES ($1, 'production.entry.reversed', 'manufacturing',
              'production_entries', $2, $3, $4, $5,
              jsonb_build_object('reversed', true),
              'mrm-dashboard', 'production_entry_reversal', $6)
          `,
          [
            current.rows[0].organization_id,
            input.productionEntryId,
            input.actorUserId ?? null,
            reason,
            current.rows[0].source_payload,
            randomUUID(),
          ]
        )
        await queueDashboardRefresh(client, current.rows[0].organization_id)
        return { id: input.productionEntryId, ok: true }
      })
    },
  }
}

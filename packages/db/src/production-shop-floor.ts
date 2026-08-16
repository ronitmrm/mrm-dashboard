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
import {
  calculateProductionSessionOutput,
  formatProductionSessionReference,
  productionShiftAt,
  type ProductionMeasurementMethod,
} from "./production-session-domain"
import { buildJobCardAnalytics } from "./job-card-workspace"


type RawMaterialReceiptInput = {
  actorUserId?: string | null
  organizationId: string
  payload: Record<string, unknown>
  productionFloorCode?: string
  quantityKg: number
  receiptNumber: string
  receivedOn: string
}

type RawMaterialWorkOrder = {
  job_card_number: string
  part_code: string
  rm_po_number: string
}

type WorkOrderContext = {
  item_id: string
  route_option_id: string | null
  work_order_id: string
}

type ProductionSessionEndReason =
  | "operator_change"
  | "shift_change"
  | "item_complete"
  | "job_change"
  | "manual_stop"

type ProductionEntryRole = "quality" | "shop_floor" | "machinist"

const shopFloorDepartmentCode: Record<ProductionFloorCode, string> = {
  cnc: "PPC-CNCSF",
  conventional: "PPC-CVSF",
  "conventional-02": "PPC-CV02SF",
  forging: "PPC-FGSF",
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

function requiredTimestamp(value: string, label: string) {
  const timestamp = new Date(requiredText(value, label))
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`${label} must be a valid date and time.`)
  }
  return timestamp
}

function nonNegativeWholeNumber(value: number | undefined, label: string) {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number.`)
  }
  return value
}

function positiveWholeNumber(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive whole number.`)
  }
  return value
}

function productionMeasurementMethod(value: string) {
  if (value !== "weight" && value !== "counter") {
    throw new Error("Production measurement method must be weight or counter.")
  }
  return value satisfies ProductionMeasurementMethod
}

function productionSessionEndReason(value: string) {
  const reasons = new Set<ProductionSessionEndReason>([
    "operator_change",
    "shift_change",
    "item_complete",
    "job_change",
    "manual_stop",
  ])
  if (!reasons.has(value as ProductionSessionEndReason)) {
    throw new Error("A valid production session end reason is required.")
  }
  return value as ProductionSessionEndReason
}

function productionEntryRole(value: string) {
  const roles = new Set<ProductionEntryRole>([
    "quality",
    "shop_floor",
    "machinist",
  ])
  if (!roles.has(value as ProductionEntryRole)) {
    throw new Error("A valid production entry role is required.")
  }
  return value as ProductionEntryRole
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


function payloadText(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = String(payload[key] ?? "").trim()
    if (value) return value
  }
  return ""
}

function sameIdentifier(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

async function writeRawMaterialReceipt(
  client: PoolClient,
  input: RawMaterialReceiptInput
) {
  const requestedJobCard = requiredText(
    payloadText(input.payload, "jcNo", "jobCard"),
    "Job card"
  )
  if (!(input.quantityKg > 0)) {
    throw new Error("Raw-material receipt quantity must be positive.")
  }

  const workOrderResult = await client.query<RawMaterialWorkOrder>(
    `
      SELECT work_order.job_card_number, item.uid AS part_code,
        COALESCE(
          NULLIF(btrim(work_order.source_payload->>'rmPoNo'), ''),
          NULLIF(btrim(work_order.source_payload->>'RM PO NO.'), ''),
          NULLIF(btrim(work_order.source_payload->>'RM PO NO'), '')
        ) AS rm_po_number
      FROM manufacturing.work_orders work_order
      JOIN catalog.items item ON item.id = work_order.item_id
      WHERE work_order.organization_id = $1
        AND lower(work_order.job_card_number) = lower($2)
      FOR UPDATE OF work_order
    `,
    [input.organizationId, requestedJobCard]
  )
  const workOrder = workOrderResult.rows[0]
  if (!workOrder) {
    throw new Error(
      `RM receipt rejected: Job Card "${requestedJobCard}" was not found in Work Orders.`
    )
  }
  if (!workOrder.rm_po_number) {
    throw new Error(
      `RM receipt rejected: Work Order for Job Card "${workOrder.job_card_number}" has no RM PO Number.`
    )
  }

  const requestedRmPo = payloadText(input.payload, "rmPoNo")
  if (requestedRmPo && !sameIdentifier(requestedRmPo, workOrder.rm_po_number)) {
    throw new Error(
      `RM receipt rejected: RM PO Number "${requestedRmPo}" does not match Work Order "${workOrder.rm_po_number}" for Job Card "${workOrder.job_card_number}".`
    )
  }
  const requestedPartCode = payloadText(input.payload, "partCode", "partNo")
  if (
    requestedPartCode &&
    !sameIdentifier(requestedPartCode, workOrder.part_code)
  ) {
    throw new Error(
      `RM receipt rejected: Part Code "${requestedPartCode}" does not match Work Order "${workOrder.part_code}" for Job Card "${workOrder.job_card_number}".`
    )
  }

  const receiptNumber = workOrder.rm_po_number
  const sourcePayload = {
    ...input.payload,
    jcNo: workOrder.job_card_number,
    rmPoNo: workOrder.rm_po_number,
    partCode: workOrder.part_code,
  }
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('production.raw-material'), hashtext(lower($1) || '|' || lower($2)))",
    [receiptNumber, workOrder.job_card_number]
  )
  const existing = await client.query<{ id: string }>(
    `
      SELECT id FROM manufacturing.raw_material_receipts
      WHERE organization_id = $1 AND lower(receipt_number) = lower($2)
        AND lower(job_card_number) = lower($3)
      FOR UPDATE
    `,
    [input.organizationId, receiptNumber, workOrder.job_card_number]
  )
  return existing.rows[0]
    ? (
        await client.query<{ id: string }>(
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
            sourcePayload,
            existing.rows[0].id,
          ]
        )
      ).rows[0]!
    : (
        await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.raw_material_receipts (
              organization_id, receipt_number, job_card_number,
              received_on, quantity_kg, remaining_quantity_kg,
              created_by_user_id, updated_by_user_id, source_system,
              source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3,
              COALESCE(migration.try_date($4), current_date),
              $5, $5, $6, $6, 'mrm-dashboard', 'rm_inward', $7, $8)
            RETURNING id
          `,
          [
            input.organizationId,
            receiptNumber,
            workOrder.job_card_number,
            input.receivedOn,
            input.quantityKg,
            input.actorUserId ?? null,
            randomUUID(),
            sourcePayload,
          ]
        )
      ).rows[0]!
}

async function workOrderContext(
  client: PoolClient,
  organizationId: string,
  jobCardNumber: string,
  productionFloorCode?: string
) {
  const result = await client.query<WorkOrderContext>(
    `
      SELECT work_order.id AS work_order_id, work_order.item_id,
        COALESCE(selection.route_option_id, automatic_route.route_option_id)
          AS route_option_id
      FROM manufacturing.work_orders work_order
      LEFT JOIN manufacturing.route_selections selection
        ON selection.work_order_id = work_order.id
        AND selection.reversed_at IS NULL
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1
          THEN (array_agg(route.id))[1]
          ELSE NULL
        END AS route_option_id
        FROM manufacturing.route_options route
        JOIN manufacturing.production_floors floor
          ON floor.id = route.production_floor_id
        WHERE route.organization_id = work_order.organization_id
          AND route.item_id = work_order.item_id
          AND route.active
          AND floor.code = $3
      ) automatic_route ON selection.route_option_id IS NULL
      WHERE work_order.organization_id = $1
        AND lower(work_order.job_card_number) = lower($2)
      FOR UPDATE OF work_order
    `,
    [
      organizationId,
      requiredText(jobCardNumber, "Job card"),
      normalizeProductionFloorCode(productionFloorCode),
    ]
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
  machineNumber: string | null | undefined,
  productionFloorCode: ProductionFloorCode
) {
  if (!machineNumber?.trim()) return null
  const result = await client.query<{ id: string }>(
    `
      SELECT machine.id FROM catalog.machines machine
      JOIN manufacturing.production_floors floor
        ON floor.id = machine.production_floor_id
      WHERE machine.organization_id = $1
        AND lower(machine.machine_number) = lower($2)
        AND floor.code = $3
        AND machine.active
      FOR UPDATE
    `,
    [organizationId, machineNumber.trim(), productionFloorCode]
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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function objectRows(value: unknown) {
  return Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row)
      )
    : []
}

async function requiredActiveEmployeeIdFor(
  client: PoolClient,
  organizationId: string,
  employeeCode: string,
  productionFloorCode: ProductionFloorCode,
  actorUserId?: string | null
) {
  const normalizedEmployeeCode = requiredText(employeeCode, "Operator code")
  const projected = await client.query<{ id: string }>(
    `
      WITH active_post AS MATERIALIZED (
        SELECT post.id, btrim(post.employee_code) AS employee_code,
          btrim(post.employee_name) AS employee_name,
          department.name AS department_name,
          department.code AS department_code,
          designation.name AS designation_name,
          post.joining_date, post.last_working_date
        FROM recruitment.posts post
        JOIN recruitment.departments department
          ON department.id = post.department_id AND department.active
        JOIN recruitment.designations designation
          ON designation.id = post.designation_id AND designation.active
        WHERE post.organization_id = $1
          AND lower(btrim(post.employee_code)) = lower($2)
          AND post.status = 'Occupied'
          AND upper(btrim(department.code)) = $3
          AND designation.name !~* '(^|[^a-z])(hod|manager|management)([^a-z]|$)'
          AND nullif(btrim(post.employee_name), '') IS NOT NULL
        ORDER BY post.updated_at DESC, post.id
        LIMIT 1
      ), projected AS (
        INSERT INTO workforce.employees (
          organization_id, employee_code, name, department, designation,
          active, joined_on, left_on, created_by_user_id,
          updated_by_user_id, source_system, source_table, source_id,
          source_payload
        )
        SELECT $1, employee_code, employee_name, department_name,
          designation_name, true, joining_date, last_working_date, $4, $4,
          'mrm-dashboard', 'recruitment.posts', id::text,
          jsonb_build_object(
            'postId', id,
            'departmentCode', department_code,
            'projectedFor', 'production_session'
          )
        FROM active_post
        ON CONFLICT (organization_id, lower(employee_code))
        DO UPDATE SET name = EXCLUDED.name,
          department = EXCLUDED.department,
          designation = EXCLUDED.designation,
          active = true,
          joined_on = EXCLUDED.joined_on,
          left_on = EXCLUDED.left_on,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          source_payload = EXCLUDED.source_payload,
          updated_at = now(),
          row_version = workforce.employees.row_version + 1
        WHERE ROW(
          workforce.employees.name,
          workforce.employees.department,
          workforce.employees.designation,
          workforce.employees.active,
          workforce.employees.joined_on,
          workforce.employees.left_on
        ) IS DISTINCT FROM ROW(
          EXCLUDED.name,
          EXCLUDED.department,
          EXCLUDED.designation,
          EXCLUDED.active,
          EXCLUDED.joined_on,
          EXCLUDED.left_on
        )
        RETURNING id
      )
      SELECT id FROM projected
      UNION ALL
      SELECT employee.id
      FROM workforce.employees employee
      WHERE employee.organization_id = $1
        AND lower(btrim(employee.employee_code)) = lower($2)
        AND employee.active
        AND EXISTS (SELECT 1 FROM active_post)
      LIMIT 1
    `,
    [
      organizationId,
      normalizedEmployeeCode,
      shopFloorDepartmentCode[productionFloorCode],
      actorUserId ?? null,
    ]
  )
  if (projected.rows[0]) return projected.rows[0].id

  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM workforce.employees
      WHERE organization_id = $1
        AND lower(employee_code) = lower($2)
        AND active
      LIMIT 1
      FOR UPDATE
    `,
    [organizationId, normalizedEmployeeCode]
  )
  if (!result.rows[0]) {
    throw new Error("The selected active Shop Floor operator was not found.")
  }
  return result.rows[0].id
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

export function createProductionShopFloorRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  async function upsertRawMaterialReceipts(inputs: RawMaterialReceiptInput[]) {
    return transaction(pool, async (client) => {
      const receipts = []
      for (const input of inputs) {
        receipts.push(await writeRawMaterialReceipt(client, input))
      }
      if (inputs[0]) {
        await queueDashboardRefresh(client, inputs[0].organizationId)
      }
      return receipts
    })
  }

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

    async upsertRawMaterialReceipt(input: RawMaterialReceiptInput) {
      return (await upsertRawMaterialReceipts([input]))[0]!
    },

    upsertRawMaterialReceipts,

    async startProductionSession(input: {
      actorUserId?: string | null
      cycleTimeSeconds?: number
      jobCardNumber: string
      machineNumber: string
      measurementMethod: string
      operationSetupCode: string
      operatorCode: string
      organizationId: string
      pieceWeightGrams: number
      productionDate?: string
      productionFloorCode?: string
      shift?: string
      sourcePayload?: Record<string, unknown>
      startCount?: number
      startedAt: string
    }) {
      return transaction(pool, async (client) => {
        const floorCode = normalizeProductionFloorCode(
          input.productionFloorCode
        )
        const measurementMethod = productionMeasurementMethod(
          input.measurementMethod
        )
        if (measurementMethod === "counter" && floorCode !== "cnc") {
          throw new Error("Machine-counter sessions are available only in CNC.")
        }
        const startedAt = requiredTimestamp(input.startedAt, "Session start")
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber,
          floorCode
        )
        if (!workOrder.route_option_id) {
          throw new Error("Select a route before starting production.")
        }
        const setupId = await operationSetupForCode(
          client,
          workOrder.route_option_id,
          input.operationSetupCode
        )
        if (!setupId) throw new Error("Production setup is required.")
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          floorCode
        )
        if (!machineId) throw new Error("Production machine is required.")
        const operatorId = await requiredActiveEmployeeIdFor(
          client,
          input.organizationId,
          input.operatorCode,
          floorCode,
          input.actorUserId
        )
        if (!(input.pieceWeightGrams > 0)) {
          throw new Error("Piece weight from Cycle Time Master is required.")
        }
        const shiftContext = productionShiftAt(floorCode, startedAt)
        if (!shiftContext) {
          throw new Error(
            "Session start is outside the configured production shift."
          )
        }

        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext('production.session'), hashtext($1))",
          [machineId]
        )
        const ready = await client.query<{ stage: string }>(
          `
            SELECT stage
            FROM manufacturing.shop_floor_setup_state
            WHERE organization_id = $1 AND work_order_id = $2
              AND route_option_id = $3 AND operation_setup_id = $4
              AND machine_id = $5 AND active
            FOR UPDATE
          `,
          [
            input.organizationId,
            workOrder.work_order_id,
            workOrder.route_option_id,
            setupId,
            machineId,
          ]
        )
        if (ready.rows[0]?.stage !== "operator_started") {
          throw new Error(
            "The machinist must finish setup and start the machine before a production session can begin."
          )
        }
        const open = await client.query<{ id: string }>(
          `
            SELECT id FROM manufacturing.production_sessions
            WHERE machine_id = $1 AND status = 'open' AND reversed_at IS NULL
            FOR UPDATE
          `,
          [machineId]
        )
        if (open.rows[0]) {
          throw new Error("This machine already has an open production session.")
        }

        const dailySequenceResult = await client.query<{ value: string }>(
          `
            SELECT (COALESCE(max(daily_sequence), 0) + 1)::text AS value
            FROM manufacturing.production_sessions
            WHERE machine_id = $1 AND production_date = $2
          `,
          [machineId, shiftContext.productionDate]
        )
        const dailySequence = Number(dailySequenceResult.rows[0]!.value)
        const snapshot = await client.query<{
          job_card_number: string
          machine_number: string
          operator_code: string
          operator_name: string
          option_number: string
          part_code: string
          setup_number: string
        }>(
          `
            SELECT work_order.job_card_number,
              machine.machine_number,
              employee.employee_code AS operator_code,
              employee.name AS operator_name,
              route.route_code AS option_number,
              item.uid AS part_code,
              setup.setup_number::text AS setup_number
            FROM manufacturing.work_orders work_order
            JOIN catalog.items item ON item.id = work_order.item_id
            JOIN manufacturing.route_options route ON route.id = $2
            JOIN manufacturing.operation_setups setup ON setup.id = $3
            JOIN catalog.machines machine ON machine.id = $4
            JOIN workforce.employees employee ON employee.id = $5
            WHERE work_order.id = $1
          `,
          [
            workOrder.work_order_id,
            workOrder.route_option_id,
            setupId,
            machineId,
            operatorId,
          ]
        )
        const sessionSnapshot = snapshot.rows[0]!
        const sessionReference = formatProductionSessionReference({
          dailySequence,
          machineNumber: sessionSnapshot.machine_number,
          productionDate: shiftContext.productionDate,
        })
        const requestedCycleTime = Number(
          input.cycleTimeSeconds ?? input.sourcePayload?.cycleTime ?? 0
        )
        const cycleTimeSeconds = Number.isFinite(requestedCycleTime)
          ? Math.max(requestedCycleTime, 0)
          : 0

        const previous = await client.query<{
          end_count: string | null
          id: string
          measurement_method: ProductionMeasurementMethod
          operation_setup_id: string
          route_option_id: string
          work_order_id: string
        }>(
          `
            SELECT id, work_order_id, route_option_id, operation_setup_id,
              measurement_method, end_count
            FROM manufacturing.production_sessions
            WHERE machine_id = $1 AND status = 'closed'
              AND reversed_at IS NULL
            ORDER BY ended_at DESC, created_at DESC
            LIMIT 1
            FOR UPDATE
          `,
          [machineId]
        )
        const prior = previous.rows[0]
        const canCarry = measurementMethod === "counter"
          && prior?.measurement_method === "counter"
          && prior.work_order_id === workOrder.work_order_id
          && prior.route_option_id === workOrder.route_option_id
          && prior.operation_setup_id === setupId
          && prior.end_count !== null
        const carriedFromSessionId = canCarry ? prior.id : null
        const startCount = measurementMethod === "counter"
          ? canCarry
            ? Number(prior.end_count)
            : nonNegativeWholeNumber(input.startCount, "Start count")
          : null
        const sourcePayload = {
          ...input.sourcePayload,
          carriedFromSessionId,
          cycleTime: cycleTimeSeconds,
          dailySequence,
          jobCard: input.jobCardNumber,
          jcNo: input.jobCardNumber,
          machine: input.machineNumber,
          measurementMethod,
          operatorId: input.operatorCode,
          outputQty: 0,
          actualQty: 0,
          prodDate: shiftContext.productionDate,
          rejectQty: 0,
          sessionReference,
          shift: shiftContext.shift,
          startCount,
          startTime: startedAt.toISOString(),
        }
        const created = await client.query<{
          carried_from_session_id: string | null
          id: string
          start_count: string | null
        }>(
          `
            INSERT INTO manufacturing.production_sessions (
              organization_id, work_order_id, route_option_id,
              operation_setup_id, machine_id, operator_employee_id,
              production_date, shift, measurement_method, started_at,
              start_count, carried_from_session_id, piece_weight_grams,
              started_by_user_id, source_payload, session_reference,
              daily_sequence, machine_number_snapshot,
              job_card_number_snapshot, part_code_snapshot,
              option_number_snapshot, setup_number_snapshot,
              operator_code_snapshot, operator_name_snapshot,
              cycle_time_seconds, started_by_role
            )
            VALUES ($1, $2, $3, $4, $5, $6,
              $7::date, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, $22, $23, $24,
              $25, 'shop_floor')
            RETURNING id, start_count, carried_from_session_id,
              session_reference
          `,
          [
            input.organizationId,
            workOrder.work_order_id,
            workOrder.route_option_id,
            setupId,
            machineId,
            operatorId,
            shiftContext.productionDate,
            shiftContext.shift,
            measurementMethod,
            startedAt.toISOString(),
            startCount,
            carriedFromSessionId,
            input.pieceWeightGrams,
            input.actorUserId ?? null,
            sourcePayload,
            sessionReference,
            dailySequence,
            sessionSnapshot.machine_number,
            sessionSnapshot.job_card_number,
            sessionSnapshot.part_code,
            sessionSnapshot.option_number,
            sessionSnapshot.setup_number,
            sessionSnapshot.operator_code,
            sessionSnapshot.operator_name,
            cycleTimeSeconds,
          ]
        )
        const productionEntry = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.production_entries (
              organization_id, work_order_id, route_option_id,
              operation_setup_id, machine_id, operator_employee_id,
              production_date, shift, quantity_good, quantity_rejected,
              started_at, recorded_by_user_id, source_system, source_table,
              source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6,
              $7::date,
              $9, 0, 0, $8, $10, 'mrm-dashboard',
              'production_session', $11, $12)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.work_order_id,
            workOrder.route_option_id,
            setupId,
            machineId,
            operatorId,
            shiftContext.productionDate,
            startedAt.toISOString(),
            shiftContext.shift,
            input.actorUserId ?? null,
            created.rows[0]!.id,
            sourcePayload,
          ]
        )
        await client.query(
          `
            UPDATE manufacturing.production_sessions
            SET production_entry_id = $1
            WHERE id = $2
          `,
          [productionEntry.rows[0]!.id, created.rows[0]!.id]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return {
          carriedFromSessionId: created.rows[0]!.carried_from_session_id,
          dailySequence,
          id: created.rows[0]!.id,
          productionDate: shiftContext.productionDate,
          sessionReference,
          shift: shiftContext.shift,
          startCount: created.rows[0]!.start_count === null
            ? null
            : Number(created.rows[0]!.start_count),
        }
      })
    },

    async recordProductionSessionDowntime(input: {
      actorUserId?: string | null
      endedAt: string
      enteredRole: string
      organizationId: string
      reasonCode: string
      reasonName: string
      sessionId: string
      startedAt: string
    }) {
      return transaction(pool, async (client) => {
        const enteredRole = productionEntryRole(input.enteredRole)
        const startedAt = requiredTimestamp(input.startedAt, "Downtime start")
        const endedAt = requiredTimestamp(input.endedAt, "Downtime end")
        const durationMinutes = Math.round(
          (endedAt.getTime() - startedAt.getTime()) / 60_000
        )
        if (durationMinutes <= 0) {
          throw new Error("Downtime end must be after downtime start.")
        }
        const session = await client.query<{
          ended_at: Date | null
          production_entry_id: string
          started_at: Date
        }>(
          `
            SELECT started_at, ended_at, production_entry_id
            FROM manufacturing.production_sessions
            WHERE id = $1 AND organization_id = $2 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [input.sessionId, input.organizationId]
        )
        const current = session.rows[0]
        if (!current) throw new Error("Production session was not found.")
        if (
          startedAt < current.started_at ||
          (current.ended_at && endedAt > current.ended_at)
        ) {
          throw new Error("Downtime must remain inside the production session.")
        }
        const overlap = await client.query<{ id: string }>(
          `
            SELECT id
            FROM manufacturing.production_session_downtime_events
            WHERE production_session_id = $1 AND reversed_at IS NULL
              AND started_at < $2
              AND COALESCE(ended_at, 'infinity'::timestamptz) > $3
            LIMIT 1
          `,
          [input.sessionId, endedAt.toISOString(), startedAt.toISOString()]
        )
        if (overlap.rows[0]) {
          throw new Error("Downtime entries cannot overlap.")
        }
        const sourcePayload = { ...input, durationMinutes, enteredRole }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.production_session_downtime_events (
              organization_id, production_session_id, reason_code,
              reason_name, started_at, ended_at, duration_minutes,
              entered_role, entered_by_user_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `,
          [
            input.organizationId,
            input.sessionId,
            requiredText(input.reasonCode, "Downtime code"),
            requiredText(input.reasonName, "Downtime reason"),
            startedAt.toISOString(),
            endedAt.toISOString(),
            durationMinutes,
            enteredRole,
            input.actorUserId ?? null,
            sourcePayload,
          ]
        )
        const totalDowntime = await client.query<{ minutes: string }>(
          `
            SELECT COALESCE(sum(duration_minutes), 0)::text AS minutes
            FROM manufacturing.production_session_downtime_events
            WHERE production_session_id = $1 AND reversed_at IS NULL
          `,
          [input.sessionId]
        )
        const downtimePayload = {
          downtimeCode: input.reasonCode,
          downtimeMinutes: Number(totalDowntime.rows[0]!.minutes),
          downtimeReason: input.reasonName,
        }
        await client.query(
          `
            UPDATE manufacturing.production_sessions
            SET source_payload = source_payload || $1::jsonb,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $2
          `,
          [downtimePayload, input.sessionId]
        )
        await client.query(
          `
            UPDATE manufacturing.production_entries
            SET source_payload = source_payload || $1::jsonb
            WHERE id = $2
          `,
          [downtimePayload, current.production_entry_id]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { durationMinutes, id: created.rows[0]!.id }
      })
    },

    async startProductionSessionDowntime(input: {
      actorUserId?: string | null
      enteredRole: string
      organizationId: string
      reasonCode: string
      reasonName: string
      sessionId: string
      startedAt: string
    }) {
      return transaction(pool, async (client) => {
        const enteredRole = productionEntryRole(input.enteredRole)
        const startedAt = requiredTimestamp(input.startedAt, "Downtime start")
        const session = await client.query<{ started_at: Date; status: string }>(
          `
            SELECT started_at, status
            FROM manufacturing.production_sessions
            WHERE id = $1 AND organization_id = $2 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [input.sessionId, input.organizationId]
        )
        const current = session.rows[0]
        if (!current) throw new Error("Production session was not found.")
        if (current.status !== "open") {
          throw new Error("Downtime can start only on a running session.")
        }
        if (startedAt < current.started_at) {
          throw new Error("Downtime must remain inside the production session.")
        }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.production_session_downtime_events (
              organization_id, production_session_id, reason_code,
              reason_name, started_at, entered_role,
              entered_by_user_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
          `,
          [
            input.organizationId,
            input.sessionId,
            requiredText(input.reasonCode, "Downtime code"),
            requiredText(input.reasonName, "Downtime reason"),
            startedAt.toISOString(),
            enteredRole,
            input.actorUserId ?? null,
            { ...input, enteredRole, startedAt: startedAt.toISOString() },
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, startedAt: startedAt.toISOString() }
      })
    },

    async endProductionSessionDowntime(input: {
      actorUserId?: string | null
      endedAt: string
      organizationId: string
      sessionId: string
    }) {
      return transaction(pool, async (client) => {
        const endedAt = requiredTimestamp(input.endedAt, "Downtime end")
        const event = await client.query<{ id: string; started_at: Date }>(
          `
            SELECT event.id, event.started_at
            FROM manufacturing.production_session_downtime_events event
            JOIN manufacturing.production_sessions session
              ON session.id = event.production_session_id
            WHERE event.production_session_id = $1
              AND session.organization_id = $2
              AND event.ended_at IS NULL
              AND event.reversed_at IS NULL
              AND session.reversed_at IS NULL
            FOR UPDATE OF event
          `,
          [input.sessionId, input.organizationId]
        )
        const current = event.rows[0]
        if (!current) throw new Error("No open downtime was found.")
        if (endedAt <= current.started_at) {
          throw new Error("Downtime end must be after downtime start.")
        }
        const durationMinutes = Math.max(
          Math.ceil((endedAt.getTime() - current.started_at.getTime()) / 60_000),
          1
        )
        await client.query(
          `
            UPDATE manufacturing.production_session_downtime_events
            SET ended_at = $1, duration_minutes = $2,
              ended_by_user_id = $3, updated_at = now(),
              source_payload = source_payload || $4::jsonb
            WHERE id = $5
          `,
          [
            endedAt.toISOString(),
            durationMinutes,
            input.actorUserId ?? null,
            { endedAt: endedAt.toISOString() },
            current.id,
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { durationMinutes, id: current.id }
      })
    },

    async recordProductionSessionRejection(input: {
      actorUserId?: string | null
      enteredRole: string
      organizationId: string
      quantity: number
      reasonCode: string
      reasonName: string
      remarkCode: string
      remarkName: string
      sessionId: string
      typeCode: string
      typeName: string
    }) {
      return transaction(pool, async (client) => {
        const enteredRole = productionEntryRole(input.enteredRole)
        if (enteredRole !== "quality") {
          throw new Error("Only Quality can record rejection entries.")
        }
        const quantity = positiveWholeNumber(input.quantity, "Rejected pieces")
        const session = await client.query<{
          production_entry_id: string | null
          status: "open" | "closed"
          total_pieces: string
        }>(
          `
            SELECT status, total_pieces, production_entry_id
            FROM manufacturing.production_sessions
            WHERE id = $1 AND organization_id = $2 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [input.sessionId, input.organizationId]
        )
        const current = session.rows[0]
        if (!current) throw new Error("Production session was not found.")
        const existing = await client.query<{ quantity: string }>(
          `
            SELECT COALESCE(sum(quantity), 0)::text AS quantity
            FROM manufacturing.production_session_rejection_events
            WHERE production_session_id = $1 AND reversed_at IS NULL
          `,
          [input.sessionId]
        )
        const rejectedPieces = Number(existing.rows[0]!.quantity) + quantity
        const totalPieces = Number(current.total_pieces)
        if (current.status === "closed" && rejectedPieces > totalPieces) {
          throw new Error("Rejected pieces cannot exceed total produced pieces.")
        }
        const sourcePayload = { ...input, enteredRole, quantity }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.production_session_rejection_events (
              organization_id, production_session_id, quantity,
              type_code, type_name, reason_code, reason_name,
              remark_code, remark_name, entered_role,
              entered_by_user_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `,
          [
            input.organizationId,
            input.sessionId,
            quantity,
            requiredText(input.typeCode, "Rejection type code"),
            requiredText(input.typeName, "Rejection type"),
            requiredText(input.reasonCode, "Rejection reason code"),
            requiredText(input.reasonName, "Rejection reason"),
            requiredText(input.remarkCode, "Rejection remark code"),
            requiredText(input.remarkName, "Rejection remark"),
            enteredRole,
            input.actorUserId ?? null,
            sourcePayload,
          ]
        )
        await client.query(
          `
            UPDATE manufacturing.production_sessions
            SET quantity_rejected = $1,
              quantity_good = CASE WHEN status = 'closed'
                THEN total_pieces - $1 ELSE quantity_good END,
              source_payload = source_payload || $2::jsonb,
              updated_at = now(), row_version = row_version + 1
            WHERE id = $3
          `,
          [
            rejectedPieces,
            {
              rejectQty: rejectedPieces,
              rejectionReason: input.reasonName,
              rejectionReasonCode: input.reasonCode,
              rejectionRemark: input.remarkName,
              rejectionRemarkCode: input.remarkCode,
              rejectionType: input.typeName,
              rejectionTypeCode: input.typeCode,
            },
            input.sessionId,
          ]
        )
        if (current.production_entry_id) {
          await client.query(
            `
              UPDATE manufacturing.production_entries
              SET quantity_rejected = $1, quantity_good = $2,
                source_payload = source_payload || $3::jsonb
              WHERE id = $4
            `,
            [
              rejectedPieces,
              current.status === "closed" ? totalPieces - rejectedPieces : 0,
              {
                outputQty: current.status === "closed"
                  ? totalPieces - rejectedPieces
                  : 0,
                rejectQty: rejectedPieces,
                rejectionReason: input.reasonName,
                rejectionReasonCode: input.reasonCode,
                rejectionRemark: input.remarkName,
                rejectionRemarkCode: input.remarkCode,
                rejectionType: input.typeName,
                rejectionTypeCode: input.typeCode,
              },
              current.production_entry_id,
            ]
          )
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, rejectedPieces }
      })
    },

    async closeProductionSession(input: {
      actorUserId?: string | null
      crateCount?: number
      crateWeightKg?: number
      endCount?: number
      endedAt: string
      endReason: string
      enteredRole?: string
      grossWeightKg?: number
      organizationId: string
      sessionId: string
    }) {
      return transaction(pool, async (client) => {
        const endedAt = requiredTimestamp(input.endedAt, "Session end")
        const endReason = productionSessionEndReason(input.endReason)
        const closedByRole = input.enteredRole
          ? productionEntryRole(input.enteredRole)
          : "shop_floor"
        if (closedByRole === "machinist") {
          throw new Error("Machinist cannot close a production session.")
        }
        const session = await client.query<{
          machine_id: string
          measurement_method: ProductionMeasurementMethod
          operation_setup_id: string
          operator_employee_id: string
          piece_weight_grams: string
          production_entry_id: string
          production_floor_code: ProductionFloorCode
          production_date: Date
          route_option_id: string
          shift: string
          source_payload: Record<string, unknown>
          start_count: string | null
          started_at: Date
          status: "open" | "closed"
          work_order_id: string
        }>(
          `
            SELECT session.work_order_id, session.route_option_id,
              session.operation_setup_id,
              machine_id, operator_employee_id, production_date, shift,
              measurement_method, started_at, start_count,
              piece_weight_grams, production_entry_id, session.source_payload,
              session.status, floor.code AS production_floor_code
            FROM manufacturing.production_sessions session
            JOIN catalog.machines machine ON machine.id = session.machine_id
            JOIN manufacturing.production_floors floor
              ON floor.id = machine.production_floor_id
            WHERE session.id = $1 AND session.organization_id = $2
              AND session.reversed_at IS NULL
            FOR UPDATE OF session
          `,
          [input.sessionId, input.organizationId]
        )
        const current = session.rows[0]
        if (!current) throw new Error("Production session was not found.")
        if (current.status !== "open") {
          throw new Error("Production session is already closed.")
        }
        if (closedByRole === "quality" && current.production_floor_code !== "cnc") {
          throw new Error("Quality can close production sessions only in CNC.")
        }
        if (endedAt < current.started_at) {
          throw new Error("Session end cannot be before session start.")
        }
        await client.query(
          `
            UPDATE manufacturing.production_session_downtime_events
            SET ended_at = $1,
              duration_minutes = GREATEST(
                ceil(extract(epoch FROM ($1::timestamptz - started_at)) / 60),
                1
              )::integer,
              ended_by_user_id = $2, updated_at = now(),
              source_payload = source_payload || $3::jsonb
            WHERE production_session_id = $4
              AND ended_at IS NULL AND reversed_at IS NULL
          `,
          [
            endedAt.toISOString(),
            input.actorUserId ?? null,
            { autoClosedAtSessionEnd: true, endedAt: endedAt.toISOString() },
            input.sessionId,
          ]
        )
        const laterDowntime = await client.query<{ id: string }>(
          `
            SELECT id
            FROM manufacturing.production_session_downtime_events
            WHERE production_session_id = $1 AND reversed_at IS NULL
              AND ended_at > $2
            LIMIT 1
          `,
          [input.sessionId, endedAt.toISOString()]
        )
        if (laterDowntime.rows[0]) {
          throw new Error("Session end cannot be before its downtime entries.")
        }
        const rejection = await client.query<{
          quantity: string
          reason_name: string | null
          remark_name: string | null
          type_name: string | null
        }>(
          `
            SELECT COALESCE(sum(quantity), 0)::text AS quantity,
              (array_agg(type_name ORDER BY recorded_at DESC))[1] AS type_name,
              (array_agg(reason_name ORDER BY recorded_at DESC))[1] AS reason_name,
              (array_agg(remark_name ORDER BY recorded_at DESC))[1] AS remark_name
            FROM manufacturing.production_session_rejection_events
            WHERE production_session_id = $1 AND reversed_at IS NULL
          `,
          [input.sessionId]
        )
        const rejectedPieces = Number(rejection.rows[0]!.quantity)
        const downtime = await client.query<{ minutes: string }>(
          `
            SELECT COALESCE(sum(duration_minutes), 0)::text AS minutes
            FROM manufacturing.production_session_downtime_events
            WHERE production_session_id = $1 AND reversed_at IS NULL
          `,
          [input.sessionId]
        )
        const downtimeMinutes = Number(downtime.rows[0]!.minutes)
        const elapsedMinutes = Math.max(
          Math.round((endedAt.getTime() - current.started_at.getTime()) / 60_000),
          0
        )
        const runtimeMinutes = Math.max(elapsedMinutes - downtimeMinutes, 0)
        const cycleTimeSeconds = Number(current.source_payload.cycleTime ?? 0)
        const output = current.measurement_method === "counter"
          ? calculateProductionSessionOutput({
              endCount: nonNegativeWholeNumber(input.endCount, "End count"),
              measurementMethod: "counter",
              rejectedPieces,
              startCount: Number(current.start_count),
            })
          : calculateProductionSessionOutput({
              crateCount: nonNegativeWholeNumber(input.crateCount, "Crates used"),
              crateWeightKg: input.crateWeightKg ?? 0,
              grossWeightKg: input.grossWeightKg ?? -1,
              measurementMethod: "weight",
              pieceWeightGrams: Number(current.piece_weight_grams),
              rejectedPieces,
            })
        const sourcePayload = {
          ...current.source_payload,
          ...input,
          actualQty: output.goodPieces,
          downtimeMinutes,
          endTime: endedAt.toISOString(),
          measurementMethod: current.measurement_method,
          outputQty: output.goodPieces,
          rejectQty: output.rejectedPieces,
          rejectionReason: rejection.rows[0]!.reason_name,
          rejectionRemark: rejection.rows[0]!.remark_name,
          rejectionType: rejection.rows[0]!.type_name,
          runtimeMinutes,
          targetQty: cycleTimeSeconds > 0
            ? Math.floor((runtimeMinutes * 60) / cycleTimeSeconds)
            : 0,
          totalPieces: output.totalPieces,
        }
        await client.query(
          `
            UPDATE manufacturing.production_entries
            SET quantity_good = $1, quantity_rejected = $2,
              completed_at = $3, recorded_by_user_id = $4,
              source_payload = $5
            WHERE id = $6
          `,
          [
            output.goodPieces,
            output.rejectedPieces,
            endedAt.toISOString(),
            input.actorUserId ?? null,
            sourcePayload,
            current.production_entry_id,
          ]
        )
        await client.query(
          `
            UPDATE manufacturing.production_sessions
            SET status = 'closed', ended_at = $1, end_reason = $2,
              end_count = $3, gross_weight_kg = $4, crate_count = $5,
              crate_weight_kg = $6, net_weight_kg = $7,
              total_pieces = $8, quantity_good = $9,
              quantity_rejected = $10, closed_by_user_id = $11,
              closed_by_role = $12, source_payload = $13, updated_at = now(),
              row_version = row_version + 1
            WHERE id = $14
          `,
          [
            endedAt.toISOString(),
            endReason,
            current.measurement_method === "counter" ? input.endCount : null,
            current.measurement_method === "weight" ? input.grossWeightKg : null,
            current.measurement_method === "weight" ? input.crateCount : null,
            current.measurement_method === "weight" ? input.crateWeightKg : null,
            output.netWeightKg,
            output.totalPieces,
            output.goodPieces,
            output.rejectedPieces,
            input.actorUserId ?? null,
            closedByRole,
            sourcePayload,
            input.sessionId,
          ]
        )
        if (endReason === "item_complete") {
          const setupState = await client.query<{ id: string; stage: string }>(
            `
              SELECT id, stage
              FROM manufacturing.shop_floor_setup_state
              WHERE work_order_id = $1 AND route_option_id = $2
                AND operation_setup_id = $3 AND machine_id = $4 AND active
              FOR UPDATE
            `,
            [
              current.work_order_id,
              current.route_option_id,
              current.operation_setup_id,
              current.machine_id,
            ]
          )
          if (setupState.rows[0]) {
            await client.query(
              `
                UPDATE manufacturing.shop_floor_setup_state
                SET stage = 'item_complete', active = false,
                  completed_at = $1, updated_by_user_id = $2,
                  source_payload = $3, updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $4
              `,
              [
                endedAt.toISOString(),
                input.actorUserId ?? null,
                sourcePayload,
                setupState.rows[0].id,
              ]
            )
            await client.query(
              `
                INSERT INTO manufacturing.shop_floor_stage_events (
                  organization_id, setup_state_id, from_stage, to_stage,
                  machine_id, occurred_at, actor_user_id, reason,
                  source_system, source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, 'item_complete', $4, $5, $6,
                  'Production session closed as item complete',
                  'mrm-dashboard', 'production_session', $7, $8)
              `,
              [
                input.organizationId,
                setupState.rows[0].id,
                setupState.rows[0].stage,
                current.machine_id,
                endedAt.toISOString(),
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
          }
        }
        await queueDashboardRefresh(client, input.organizationId)
        return {
          goodPieces: output.goodPieces,
          id: input.sessionId,
          rejectedPieces: output.rejectedPieces,
          totalPieces: output.totalPieces,
        }
      })
    },

    async readJobCardWorkspace(input: {
      jobCardNumber: string
      organizationId: string
      productionFloorCode?: string
    }) {
      const jobCardNumber = requiredText(input.jobCardNumber, "Job card")
      const floorCode = normalizeProductionFloorCode(input.productionFloorCode)
      const workOrderResult = await pool.query<Record<string, unknown>>(
        `
          SELECT work_order.id, work_order.job_card_number AS "jobCardNumber",
            work_order.work_order_number AS "workOrderNumber",
            work_order.ordered_quantity AS "orderedQuantity",
            work_order.completed_quantity AS "completedQuantity",
            work_order.order_date AS "orderDate", work_order.due_date AS "dueDate",
            work_order.status, work_order.source_payload AS "workOrderSource",
            item.id AS "itemId", item.uid AS "partCode",
            item.description, item.production_type AS "productionType",
            item.weight_100_pcs AS "weight100Pieces",
            item.pieces_per_kg AS "piecesPerKg",
            material.name AS "materialGrade", rod.name AS "rodType",
            item.rod_size AS "rodSize", item.source_payload AS "itemSource",
            selection.route_option_id AS "selectedRouteOptionId",
            selection.selected_at AS "routeSelectedAt",
            selection.reason AS "routeSelectionReason"
          FROM manufacturing.work_orders work_order
          JOIN catalog.items item ON item.id = work_order.item_id
          LEFT JOIN catalog.material_grades material ON material.id = item.material_grade_id
          LEFT JOIN catalog.rod_types rod ON rod.id = item.rod_type_id
          LEFT JOIN LATERAL (
            SELECT route_option_id, selected_at, reason
            FROM manufacturing.route_selections
            WHERE work_order_id = work_order.id AND reversed_at IS NULL
            ORDER BY selected_at DESC LIMIT 1
          ) selection ON true
          WHERE work_order.organization_id = $1
            AND lower(work_order.job_card_number) = lower($2)
          LIMIT 1
        `,
        [input.organizationId, jobCardNumber]
      )
      const jobCard = workOrderResult.rows[0]
      if (!jobCard) throw new Error("Job card was not found.")

      const routesResult = await pool.query<Record<string, unknown>>(
        `
          SELECT route.id, route.route_code AS "routeCode", route.name,
            route.revision, route.active, floor.code AS "productionFloorCode",
            route.source_payload AS "sourcePayload"
          FROM manufacturing.route_options route
          JOIN manufacturing.production_floors floor
            ON floor.id = route.production_floor_id
          WHERE route.organization_id = $1 AND route.item_id = $2
            AND floor.code = $3
          ORDER BY route.active DESC, route.revision DESC, route.route_code
        `,
        [input.organizationId, jobCard.itemId, floorCode]
      )
      const activeRoutes = routesResult.rows.filter((route) => route.active === true)
      const explicitRouteId = String(jobCard.selectedRouteOptionId ?? "")
      const selectedRoute = routesResult.rows.find((route) => route.id === explicitRouteId)
        ?? (activeRoutes.length === 1 ? activeRoutes[0] : undefined)

      const [setupsResult, sessionsResult, legacyEntriesResult, eventsResult, workflowResult, receiptsResult, snapshotResult] = await Promise.all([
        pool.query<Record<string, unknown>>(
          `
            SELECT setup.id, setup.setup_number::text AS "setupNumber",
              setup.sequence, setup.operation_code AS "operationCode",
              setup.operation_name AS "operationName", setup.active,
              machine_type.name AS "machineType",
              setup.source_payload AS "sourcePayload",
              cycle.cycle_time_seconds AS "cycleTimeSeconds",
              cycle.pieces_per_cycle AS "piecesPerCycle",
              cycle.setup_time_minutes AS "setupTimeMinutes",
              cycle.source_payload AS "cycleSource",
              COALESCE(tooling.rows, '[]'::jsonb) AS tooling,
              COALESCE(parameters.rows, '[]'::jsonb) AS "qualityParameters"
            FROM manufacturing.operation_setups setup
            LEFT JOIN catalog.machine_types machine_type
              ON machine_type.id = setup.machine_type_id
            LEFT JOIN LATERAL (
              SELECT standard.cycle_time_seconds, standard.pieces_per_cycle,
                standard.setup_time_minutes, standard.source_payload
              FROM manufacturing.operation_cycle_standards standard
              WHERE standard.operation_setup_id = setup.id
              ORDER BY standard.effective_from DESC NULLS LAST,
                standard.updated_at DESC LIMIT 1
            ) cycle ON true
            LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                'toolCode', tool.tool_code, 'description', tool.description,
                'quantity', tool.quantity, 'sourcePayload', tool.source_payload
              ) ORDER BY tool.tool_code) AS rows
              FROM manufacturing.operation_tooling tool
              WHERE tool.operation_setup_id = setup.id AND tool.active
            ) tooling ON true
            LEFT JOIN LATERAL (
              SELECT jsonb_agg(jsonb_build_object(
                'parameterCode', parameter.parameter_code,
                'name', parameter.name, 'dataType', parameter.data_type,
                'unit', parameter.unit, 'lowerLimit', parameter.lower_limit,
                'upperLimit', parameter.upper_limit,
                'nominalValue', parameter.nominal_value,
                'sourcePayload', parameter.source_payload
              ) ORDER BY parameter.sequence, parameter.parameter_code) AS rows
              FROM quality.parameter_definitions parameter
              WHERE parameter.operation_setup_id = setup.id AND parameter.active
            ) parameters ON true
            WHERE setup.route_option_id = $1::uuid
            ORDER BY setup.sequence, setup.setup_number
          `,
          [selectedRoute?.id ?? null]
        ),
        pool.query<Record<string, unknown>>(
          `SELECT * FROM reporting.production_session_summary
           WHERE organization_id = $1 AND production_floor_code = $2
             AND lower(job_card_number) = lower($3)
           ORDER BY started_at DESC`,
          [input.organizationId, floorCode, jobCardNumber]
        ),
        pool.query<Record<string, unknown>>(
          `SELECT entry.id, entry.production_date AS "productionDate",
              entry.shift, entry.quantity_good AS "goodPieces",
              entry.quantity_rejected AS "rejectedPieces",
              entry.started_at AS "startedAt", entry.completed_at AS "endedAt",
              entry.recorded_at AS "recordedAt",
              machine.machine_number AS "machineNumber",
              setup.setup_number::text AS "setupNumber",
              employee.employee_code AS "operatorCode",
              employee.name AS "operatorName", actor.name AS "enteredByName",
              route.route_code AS "optionNumber"
           FROM manufacturing.production_entries entry
           LEFT JOIN manufacturing.production_sessions session
             ON session.production_entry_id = entry.id AND session.reversed_at IS NULL
           LEFT JOIN manufacturing.route_options route ON route.id = entry.route_option_id
           LEFT JOIN manufacturing.production_floors route_floor
             ON route_floor.id = route.production_floor_id
           LEFT JOIN manufacturing.operation_setups setup
             ON setup.id = entry.operation_setup_id
           LEFT JOIN catalog.machines machine ON machine.id = entry.machine_id
           LEFT JOIN manufacturing.production_floors machine_floor
             ON machine_floor.id = machine.production_floor_id
           LEFT JOIN workforce.employees employee ON employee.id = entry.operator_employee_id
           LEFT JOIN identity.users actor ON actor.id = entry.recorded_by_user_id
           WHERE entry.organization_id = $1 AND entry.work_order_id = $2
             AND entry.reversed_at IS NULL AND session.id IS NULL
             AND (route_floor.code = $3 OR machine_floor.code = $3)
           ORDER BY entry.production_date DESC, entry.recorded_at DESC`,
          [input.organizationId, jobCard.id, floorCode]
        ),
        pool.query<Record<string, unknown>>(
          `SELECT production_session_id AS "sessionId",
              session_reference AS "sessionReference", event_type AS "eventType",
              event_time AS "eventTime", started_at AS "startedAt",
              ended_at AS "endedAt",
              COALESCE(duration_minutes, CASE WHEN event_type = 'downtime_started'
                THEN GREATEST(floor(extract(epoch FROM (now() - started_at)) / 60), 0)::integer
                ELSE NULL END) AS "durationMinutes",
              reason_code AS "reasonCode", reason_name AS "reasonName",
              quantity, entered_by_name AS "enteredByName",
              entered_role AS "enteredRole", setup_number AS "setupNumber",
              machine_number AS "machineNumber", operator_code AS "operatorCode"
           FROM reporting.production_event_log
           WHERE organization_id = $1 AND production_floor_code = $2
             AND lower(job_card_number) = lower($3)
           ORDER BY event_time DESC`,
          [input.organizationId, floorCode, jobCardNumber]
        ),
        pool.query<Record<string, unknown>>(
          `
            SELECT event_type AS "eventType", event_time AS "eventTime",
              "setupNumber", "machineNumber", "enteredByName", detail
            FROM (
              SELECT 'shop_floor_stage'::text AS event_type,
                event.occurred_at AS event_time,
                setup.setup_number::text AS "setupNumber",
                machine.machine_number AS "machineNumber",
                actor.name AS "enteredByName",
                concat_ws(' · ', event.from_stage, event.to_stage, event.reason) AS detail
              FROM manufacturing.shop_floor_stage_events event
              JOIN manufacturing.shop_floor_setup_state state
                ON state.id = event.setup_state_id
              JOIN manufacturing.operation_setups setup
                ON setup.id = state.operation_setup_id
              LEFT JOIN catalog.machines machine ON machine.id = event.machine_id
              LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
              WHERE state.work_order_id = $1 AND event.reversed_at IS NULL
              UNION ALL
              SELECT 'setup_completed', event.completed_at,
                setup.setup_number::text, machine.machine_number,
                actor.name, COALESCE(event.notes, 'Setup completed')
              FROM manufacturing.setup_completion_events event
              JOIN manufacturing.operation_setups setup ON setup.id = event.operation_setup_id
              LEFT JOIN catalog.machines machine ON machine.id = event.machine_id
              LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
              WHERE event.work_order_id = $1 AND event.reversed_at IS NULL
              UNION ALL
              SELECT 'dispatch_' || event.decision, event.occurred_at,
                NULL::text, NULL::text, actor.name,
                COALESCE(event.reason, 'Dispatch decision')
              FROM manufacturing.dispatch_approval_events event
              LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
              WHERE event.work_order_id = $1 AND event.reversed_at IS NULL
              UNION ALL
              SELECT 'production_card_' || event.event_type, event.event_at,
                setup.setup_number::text, machine.machine_number,
                actor.name,
                COALESCE(
                  event.details->>'remarks', event.details->>'remark',
                  event.details->>'reason', event.event_type
                )
              FROM manufacturing.production_card_events event
              JOIN manufacturing.production_cards card
                ON card.id = event.production_card_id
              LEFT JOIN manufacturing.operation_setups setup
                ON setup.id = event.operation_setup_id
              LEFT JOIN catalog.machines machine ON machine.id = event.machine_id
              LEFT JOIN identity.users actor ON actor.id = event.actor_user_id
              WHERE card.work_order_id = $1 AND event.reversed_at IS NULL
            ) workflow
            ORDER BY event_time DESC
          `,
          [jobCard.id]
        ),
        pool.query<Record<string, unknown>>(
          `SELECT receipt_number AS "receiptNumber", received_on AS "receivedOn",
              quantity_kg AS "quantityKg", remaining_quantity_kg AS "remainingQuantityKg",
              heat_number AS "heatNumber", supplier_name AS "supplierName",
              source_payload AS "sourcePayload"
           FROM manufacturing.raw_material_receipts
           WHERE organization_id = $1 AND lower(job_card_number) = lower($2)
           ORDER BY received_on, created_at`,
          [input.organizationId, jobCardNumber]
        ),
        pool.query<{ payload: Record<string, unknown> }>(
          `SELECT payload FROM derived.dashboard_read_models
           WHERE organization_id = $1 ORDER BY version DESC LIMIT 1`,
          [input.organizationId]
        ),
      ])

      const snapshot = objectRecord(snapshotResult.rows[0]?.payload)
      const floorSnapshots = objectRecord(snapshot.productionFloorSnapshots)
      const floorPayload = objectRecord(
        floorSnapshots[floorCode] ?? (floorCode === "conventional" ? snapshot : {})
      )
      const productionControl = objectRecord(floorPayload.productionControl)
      const matchesJobCard = (row: Record<string, unknown>) =>
        payloadText(row, "jcNo", "jobCardNumber", "JobCardNo", "jobCard").toLowerCase()
          === jobCardNumber.toLowerCase()
      const planRows = objectRows(productionControl.machinePlanDetailRows)
        .filter(matchesJobCard)
      const dashboardSummary = objectRows(productionControl.productionDashboardRows)
        .find(matchesJobCard) ?? null
      const sessionRows = sessionsResult.rows.map((row) => ({
        ...row,
        downtimeMinutes: Number(row.downtime_minutes ?? 0),
        endedAt: row.ended_at ? String(row.ended_at) : null,
        goodPieces: Number(row.quantity_good ?? 0),
        rejectedPieces: Number(row.quantity_rejected ?? 0),
        runtimeMinutes: Number(row.runtime_minutes ?? 0),
        setupNumber: String(row.setup_number ?? ""),
        startedAt: row.started_at ? String(row.started_at) : null,
        totalPieces: Number(row.total_pieces ?? 0),
      }))
      const legacySessionRows = legacyEntriesResult.rows.map((row) => ({
        downtimeMinutes: 0,
        endedAt: row.endedAt || row.recordedAt
          ? String(row.endedAt ?? row.recordedAt)
          : null,
        goodPieces: Number(row.goodPieces ?? 0),
        rejectedPieces: Number(row.rejectedPieces ?? 0),
        runtimeMinutes: 0,
        setupNumber: String(row.setupNumber ?? ""),
        startedAt: row.startedAt || row.productionDate || row.recordedAt
          ? String(row.startedAt ?? row.productionDate ?? row.recordedAt)
          : null,
        totalPieces: Number(row.goodPieces ?? 0) + Number(row.rejectedPieces ?? 0),
      }))
      const standardizedPlans = planRows.map((row) => ({
        plannedProductionEndDate: payloadText(row, "plannedProductionEndDate", "productionEndDate"),
        plannedProductionStartDate: payloadText(row, "plannedProductionStartDate", "productionStartDate"),
        setupNumber: payloadText(row, "setupNo", "setupNumber"),
      }))
      const analyticsSummary = buildJobCardAnalytics({
        downtimeEvents: eventsResult.rows
          .filter((row) => ["downtime", "downtime_started"].includes(String(row.eventType)))
          .map((row) => ({
            durationMinutes: Number(row.durationMinutes ?? 0),
            reasonCode: String(row.reasonCode ?? ""),
            reasonName: String(row.reasonName ?? ""),
            setupNumber: String(row.setupNumber ?? ""),
          })),
        orderedQuantity: Number(jobCard.orderedQuantity ?? 0),
        planRows: standardizedPlans,
        sessions: [...sessionRows, ...legacySessionRows],
      })
      const analytics = {
        ...analyticsSummary,
        legacyEntryCount: legacyEntriesResult.rows.length,
        sessionCount: sessionsResult.rows.length,
      }
      const legacyEntryEvents = legacyEntriesResult.rows.map((row) => ({
        detail: `Production entry · ${Number(row.rejectedPieces ?? 0)} rejected`,
        enteredByName: row.enteredByName,
        eventTime: row.endedAt ?? row.recordedAt,
        eventType: "production_entry",
        machineNumber: row.machineNumber,
        operatorCode: row.operatorCode,
        quantity: Number(row.goodPieces ?? 0) + Number(row.rejectedPieces ?? 0),
        setupNumber: row.setupNumber,
      }))
      const eventLog = [...eventsResult.rows, ...legacyEntryEvents, ...workflowResult.rows].sort((left, right) =>
        String(right.eventTime ?? "").localeCompare(String(left.eventTime ?? ""))
      )

      return {
        analytics,
        dashboardSummary,
        events: eventLog,
        jobCard: {
          ...jobCard,
          effectiveRouteSource: explicitRouteId && selectedRoute?.id === explicitRouteId
            ? "planner_selected"
            : selectedRoute
              ? "single_active_route"
              : "planner_required",
        },
        legacyProductionEntries: legacyEntriesResult.rows,
        planRows,
        productionFloorCode: floorCode,
        rawMaterialReceipts: receiptsResult.rows,
        routes: routesResult.rows.map((route) => ({
          ...route,
          selected: route.id === selectedRoute?.id,
        })),
        sessions: sessionsResult.rows,
        setups: setupsResult.rows,
      }
    },

    async readProductionSessions(input: {
      endDate?: string
      limit?: number
      offset?: number
      organizationId: string
      productionFloorCode?: string
      sessionId?: string
      startDate?: string
      status?: "closed" | "open"
    }) {
      const floorCode = normalizeProductionFloorCode(input.productionFloorCode)
      const limit = Math.min(Math.max(Math.trunc(input.limit ?? 500), 1), 500)
      const offset = Math.max(Math.trunc(input.offset ?? 0), 0)
      const result = await pool.query<Record<string, unknown>>(
        `
          SELECT session.id,
            session.session_reference AS "sessionReference",
            session.daily_sequence AS "dailySequence",
            session.status,
            session.production_date AS "productionDate",
            session.shift,
            session.measurement_method AS "measurementMethod",
            session.started_at AS "startedAt",
            session.ended_at AS "endedAt",
            session.end_reason AS "endReason",
            session.start_count AS "startCount",
            session.end_count AS "endCount",
            session.carried_from_session_id AS "carriedFromSessionId",
            session.gross_weight_kg AS "grossWeightKg",
            session.crate_count AS "crateCount",
            session.crate_weight_kg AS "crateWeightKg",
            session.net_weight_kg AS "netWeightKg",
            session.piece_weight_grams AS "pieceWeightGrams",
            session.cycle_time_seconds AS "cycleTimeSeconds",
            session.total_pieces AS "totalPieces",
            session.quantity_good AS "goodPieces",
            session.quantity_rejected AS "rejectedPieces",
            session.job_card_number_snapshot AS "jobCardNumber",
            session.part_code_snapshot AS "partCode",
            session.option_number_snapshot AS "optionNumber",
            session.setup_number_snapshot AS "setupNumber",
            session.machine_number_snapshot AS "machineNumber",
            session.operator_code_snapshot AS "operatorCode",
            session.operator_name_snapshot AS "operatorName",
            starter.name AS "startedByName",
            session.started_by_role AS "startedByRole",
            closer.name AS "closedByName",
            session.closed_by_role AS "closedByRole",
            GREATEST(
              floor(extract(epoch FROM (COALESCE(session.ended_at, now()) - session.started_at)) / 60),
              0
            )::integer AS "elapsedMinutes",
            GREATEST(
              floor(extract(epoch FROM (COALESCE(session.ended_at, now()) - session.started_at)) / 60)
                - COALESCE(downtime.minutes, 0),
              0
            )::integer AS "runtimeMinutes",
            COALESCE(downtime.minutes, 0) AS "downtimeMinutes",
            COALESCE(downtime.has_open, false) AS "hasOpenDowntime",
            COALESCE(downtime.rows, '[]'::jsonb) AS "downtimeEvents",
            COALESCE(rejection.rows, '[]'::jsonb) AS "rejectionEvents"
          FROM manufacturing.production_sessions session
          JOIN manufacturing.work_orders work_order
            ON work_order.id = session.work_order_id
          JOIN catalog.items item ON item.id = work_order.item_id
          JOIN manufacturing.route_options route
            ON route.id = session.route_option_id
          JOIN manufacturing.operation_setups setup
            ON setup.id = session.operation_setup_id
          JOIN catalog.machines machine ON machine.id = session.machine_id
          JOIN manufacturing.production_floors floor
            ON floor.id = machine.production_floor_id
          JOIN workforce.employees employee
            ON employee.id = session.operator_employee_id
          LEFT JOIN identity.users starter
            ON starter.id = session.started_by_user_id
          LEFT JOIN identity.users closer
            ON closer.id = session.closed_by_user_id
          LEFT JOIN LATERAL (
            SELECT COALESCE(sum(COALESCE(
                event.duration_minutes,
                GREATEST(
                  floor(extract(epoch FROM (now() - event.started_at)) / 60),
                  0
                )::integer
              )), 0) AS minutes,
              COALESCE(bool_or(event.ended_at IS NULL), false) AS has_open,
              jsonb_agg(jsonb_build_object(
                'id', event.id,
                'reasonCode', event.reason_code,
                'reasonName', event.reason_name,
                'startedAt', event.started_at,
                'endedAt', event.ended_at,
                'durationMinutes', event.duration_minutes,
                'enteredRole', event.entered_role,
                'isOpen', event.ended_at IS NULL
              ) ORDER BY event.started_at) AS rows
            FROM manufacturing.production_session_downtime_events event
            WHERE event.production_session_id = session.id
              AND event.reversed_at IS NULL
          ) downtime ON true
          LEFT JOIN LATERAL (
            SELECT jsonb_agg(jsonb_build_object(
              'id', event.id,
              'quantity', event.quantity,
              'typeCode', event.type_code,
              'typeName', event.type_name,
              'reasonCode', event.reason_code,
              'reasonName', event.reason_name,
              'remarkCode', event.remark_code,
              'remarkName', event.remark_name,
              'recordedAt', event.recorded_at
            ) ORDER BY event.recorded_at) AS rows
            FROM manufacturing.production_session_rejection_events event
            WHERE event.production_session_id = session.id
              AND event.reversed_at IS NULL
          ) rejection ON true
          WHERE session.organization_id = $1 AND floor.code = $2
            AND session.reversed_at IS NULL
            AND ($3::uuid IS NULL OR session.id = $3::uuid)
            AND ($4::date IS NULL OR session.production_date >= $4::date)
            AND ($5::date IS NULL OR session.production_date <= $5::date)
            AND ($6::text IS NULL OR session.status = $6)
          ORDER BY session.started_at DESC, machine.machine_number
          LIMIT $7 OFFSET $8
        `,
        [
          input.organizationId,
          floorCode,
          input.sessionId || null,
          input.startDate || null,
          input.endDate || null,
          input.status || null,
          limit,
          offset,
        ]
      )
      const numericKeys = [
        "startCount",
        "endCount",
        "grossWeightKg",
        "crateCount",
        "crateWeightKg",
        "netWeightKg",
        "pieceWeightGrams",
        "cycleTimeSeconds",
        "totalPieces",
        "goodPieces",
        "rejectedPieces",
        "downtimeMinutes",
        "elapsedMinutes",
        "runtimeMinutes",
      ] as const
      return {
        limit,
        offset,
        productionFloorCode: floorCode,
        rows: result.rows.map((row) => {
          const mapped = { ...row }
          for (const key of numericKeys) {
            mapped[key] = row[key] === null ? null : Number(row[key] ?? 0)
          }
          return mapped
        }),
      }
    },

    async readProductionSessionEvents(input: {
      endDate?: string
      limit?: number
      offset?: number
      organizationId: string
      productionFloorCode?: string
      sessionId?: string
      startDate?: string
    }) {
      const floorCode = normalizeProductionFloorCode(input.productionFloorCode)
      const limit = Math.min(Math.max(Math.trunc(input.limit ?? 250), 1), 500)
      const offset = Math.max(Math.trunc(input.offset ?? 0), 0)
      const result = await pool.query<Record<string, unknown>>(
        `
          SELECT production_session_id AS "sessionId",
            session_reference AS "sessionReference",
            production_date AS "productionDate", shift,
            machine_number AS "machineNumber",
            job_card_number AS "jobCardNumber",
            part_code AS "partCode",
            option_number AS "optionNumber",
            setup_number AS "setupNumber",
            operator_code AS "operatorCode",
            operator_name AS "operatorName",
            event_type AS "eventType", event_time AS "eventTime",
            started_at AS "startedAt", ended_at AS "endedAt",
            duration_minutes AS "durationMinutes",
            reason_code AS "reasonCode", reason_name AS "reasonName",
            quantity, entered_by_name AS "enteredByName",
            entered_role AS "enteredRole", recorded_at AS "recordedAt"
          FROM reporting.production_event_log
          WHERE organization_id = $1 AND production_floor_code = $2
            AND ($3::uuid IS NULL OR production_session_id = $3::uuid)
            AND ($4::date IS NULL OR production_date >= $4::date)
            AND ($5::date IS NULL OR production_date <= $5::date)
          ORDER BY event_time DESC, recorded_at DESC
          LIMIT $6 OFFSET $7
        `,
        [
          input.organizationId,
          floorCode,
          input.sessionId || null,
          input.startDate || null,
          input.endDate || null,
          limit,
          offset,
        ]
      )
      return { limit, offset, productionFloorCode: floorCode, rows: result.rows }
    },

    async upsertProductionCard(input: {
      actorUserId?: string | null
      cardNumber: string
      jobCardNumber: string
      organizationId: string
      payload: Record<string, unknown>
      productionFloorCode?: string
    }) {
      return transaction(pool, async (client) => {
        const cardNumber = requiredText(input.cardNumber, "Production card")
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.productionFloorCode
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
          String(payload.machine ?? ""),
          normalizeProductionFloorCode(input.productionFloorCode)
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
      productionFloorCode?: string
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
          input.jobCardNumber,
          input.productionFloorCode
        )
        const setupId = await operationSetupForCode(
          client,
          workOrder.route_option_id,
          input.operationSetupCode
        )
        const machineId = await machineIdFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
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
      productionFloorCode?: string
      stage: string
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.productionFloorCode
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
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        if (!machineId) throw new Error("Shop-floor machine is required.")
        const stage = canonicalStage(input.stage)
        const active = stageIsActive(stage)
        if (!active) {
          const openSession = await client.query<{ id: string }>(
            `
              SELECT id FROM manufacturing.production_sessions
              WHERE work_order_id = $1 AND operation_setup_id = $2
                AND machine_id = $3 AND status = 'open'
                AND reversed_at IS NULL
              LIMIT 1
              FOR UPDATE
            `,
            [workOrder.work_order_id, setupId, machineId]
          )
          if (openSession.rows[0]) {
            throw new Error(
              "Close the production session with Item Complete before finishing the setup."
            )
          }
        }
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
      productionFloorCode?: string
      remark?: string | null
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.productionFloorCode
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
      productionFloorCode?: string
      remark?: string | null
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderContext(
          client,
          input.organizationId,
          input.jobCardNumber,
          input.productionFloorCode
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
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
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
        if (machineId) {
          const openSession = await client.query<{ id: string }>(
            `
              SELECT id FROM manufacturing.production_sessions
              WHERE work_order_id = $1 AND operation_setup_id = $2
                AND machine_id = $3 AND status = 'open'
                AND reversed_at IS NULL
              LIMIT 1
              FOR UPDATE
            `,
            [workOrder.work_order_id, setupId, machineId]
          )
          if (openSession.rows[0]) {
            throw new Error(
              "Close the production session with Item Complete before finishing the setup."
            )
          }
        }
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

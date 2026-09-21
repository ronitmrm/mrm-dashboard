import { rejectDuplicateMaster } from "./master-duplicate"
import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  machineTypeForFamily,
  isActivePlannerDecision,
  validConfirmedPrioritySetupNumbers,
  workOrderIdentityMatches,
} from "./planning-rules"
import { plannerInterruptionRequirement } from "./planner-interruption-settlement"
import { rawMaterialRejectionBalance } from "./rejection-domain"
import {
  normalizeProductionFloorCode,
  ProductionUnitAccessError,
  productionFloorCodeForRecord,
  productionFloors,
  type ProductionFloorCode,
} from "./production-floors"


type InterruptedSetupInput = {
  jobCardNumber: string
  machineNumber: string
  setupNumber: number
}

type SettledInterruptedSetup = InterruptedSetupInput & {
  finishedQuantity: number
  hasOpenDowntime: boolean
  openSessionReference: string | null
  sessionReferences: string[]
  settledAt: string | null
}

type QueueBeforeSetupInput = {
  jobCardNumber: string
  machineNumber: string
  setupNumber: number
  targetSetupNumber?: number | null
}

type QueuePlacementInput = {
  queueBeforeSetups?: QueueBeforeSetupInput[]
  targetJobCardNumber: string
  targetMachineNumber: string
  targetPartCode?: string | null
  targetSetupNumber: number
  targetSourceMachineNumber?: string | null
}

type PlanOverrideAssignmentMode = "move" | "add_parallel_machine"

type RemainingSetupInput = {
  plan: boolean
  quantity: number
  remark?: string | null
  setupNumber: number
}

const requiredText = (value: string, label: string) => {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}

function sourcePayloadRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sourcePayloadNumber(value: unknown, ...keys: string[]) {
  const record = sourcePayloadRecord(value)
  const nested = sourcePayloadRecord(record.payload)
  for (const key of keys) {
    const raw = record[key] ?? nested[key]
    if (raw === undefined || raw === null || raw === "") continue
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}


async function businessKeyLock(
  client: PoolClient,
  namespace: string,
  key: string
) {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    [namespace, key.toLowerCase()]
  )
}

async function ensureProductionFloorId(
  client: PoolClient,
  organizationId: string,
  code: ProductionFloorCode
) {
  const floor = productionFloors.find((candidate) => candidate.code === code)!
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO manufacturing.production_floors (
        organization_id, code, name
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (organization_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        active = true,
        updated_at = now()
      RETURNING id
    `,
    [organizationId, floor.code, floor.label]
  )
  return result.rows[0]!.id
}

async function itemIdFor(
  client: PoolClient,
  organizationId: string,
  itemUid: string
) {
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM catalog.items
      WHERE organization_id = $1 AND lower(uid) = lower($2)
      FOR UPDATE
    `,
    [organizationId, requiredText(itemUid, "Item UID")]
  )
  if (!result.rows[0]) throw new Error("Planning item was not found.")
  return result.rows[0].id
}

async function ensureRouteItemId(
  client: PoolClient,
  organizationId: string,
  itemUid: string,
  actorUserId?: string | null
) {
  const uid = requiredText(itemUid, "Item UID")
  await client.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, description, created_by_user_id,
        updated_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      VALUES ($1, $2, $2, $3, $3, 'mrm-dashboard', 'route_master', $4,
        jsonb_build_object('generatedFrom', 'route_master', 'uid', $2::text))
      ON CONFLICT DO NOTHING
    `,
    [organizationId, uid, actorUserId ?? null, `${organizationId}:${uid.toLowerCase()}`]
  )
  const itemId = await itemIdFor(client, organizationId, uid)
  await client.query(
    `
      UPDATE catalog.items
      SET source_table = 'route_master',
        source_id = $3,
        source_payload = jsonb_build_object(
          'generatedFrom', 'route_master', 'uid', $2::text
        ),
        updated_by_user_id = $4,
        updated_at = now(),
        row_version = row_version + 1
      WHERE organization_id = $1 AND id = $5
        AND source_system = 'mrm-dashboard'
        AND source_table = 'work_order_readiness'
    `,
    [
      organizationId,
      uid,
      `${organizationId}:${uid.toLowerCase()}`,
      actorUserId ?? null,
      itemId,
    ]
  )
  await client.query(
    `
      UPDATE manufacturing.work_orders
      SET source_payload = source_payload ||
          jsonb_build_object('planningItemPending', false),
        updated_at = now(),
        row_version = row_version + 1
      WHERE organization_id = $1 AND item_id = $2
        AND source_payload ->> 'planningItemPending' = 'true'
    `,
    [organizationId, itemId]
  )
  return itemId
}

async function ensureWorkOrderItemId(
  client: PoolClient,
  organizationId: string,
  itemUid: string,
  actorUserId?: string | null
) {
  const uid = requiredText(itemUid, "Item UID")
  await client.query(
    `
      INSERT INTO catalog.items (
        organization_id, uid, description, created_by_user_id,
        updated_by_user_id, source_system, source_table, source_id,
        source_payload
      )
      VALUES ($1, $2, $2, $3, $3, 'mrm-dashboard',
        'work_order_readiness', $4,
        jsonb_build_object(
          'generatedFrom', 'work_order_readiness', 'uid', $2::text
        ))
      ON CONFLICT DO NOTHING
    `,
    [organizationId, uid, actorUserId ?? null, `${organizationId}:${uid.toLowerCase()}`]
  )
  const item = await client.query<{
    id: string
    planning_item_pending: boolean
  }>(
    `
      SELECT id,
        source_system = 'mrm-dashboard'
          AND source_table = 'work_order_readiness'
          AS planning_item_pending
      FROM catalog.items
      WHERE organization_id = $1 AND lower(uid) = lower($2)
      FOR UPDATE
    `,
    [organizationId, uid]
  )
  if (!item.rows[0]) throw new Error("Planning item could not be created.")
  return item.rows[0]
}

async function workOrderFor(
  client: PoolClient,
  organizationId: string,
  jobCardNumber: string
) {
  const result = await client.query<{
    id: string
    item_id: string
    status: string
  }>(
    `
      SELECT id, item_id, status FROM manufacturing.work_orders
      WHERE organization_id = $1 AND lower(job_card_number) = lower($2)
      FOR UPDATE
    `,
    [organizationId, requiredText(jobCardNumber, "Job card")]
  )
  if (!result.rows[0]) throw new Error("Planning work order was not found.")
  if (result.rows[0].status === "Cancelled") {
    throw new Error("Cancelled Work Order lines cannot receive planner actions.")
  }
  return result.rows[0]
}

async function optionalPlanningReference(
  client: PoolClient,
  organizationId: string,
  jobCardNumber: string,
  setupNumber: number
) {
  const result = await client.query<{
    operation_setup_id: string | null
    work_order_id: string
  }>(
    `
      SELECT work_order.id AS work_order_id,
        setup.id AS operation_setup_id
      FROM manufacturing.work_orders work_order
      LEFT JOIN manufacturing.route_selections selection
        ON selection.work_order_id = work_order.id
        AND selection.reversed_at IS NULL
      LEFT JOIN manufacturing.operation_setups setup
        ON setup.route_option_id = selection.route_option_id
        AND setup.setup_number = $3
        AND setup.active
      WHERE work_order.organization_id = $1
        AND lower(work_order.job_card_number) = lower($2)
      LIMIT 1
    `,
    [organizationId, jobCardNumber.trim(), setupNumber]
  )
  return result.rows[0] ?? null
}

async function plannerInterruptionState(
  client: PoolClient,
  organizationId: string,
  interruption: InterruptedSetupInput
) {
  const result = await client.query<{
    finished_quantity: string
    has_open_downtime: boolean | null
    measurement_method: "counter" | "weight" | null
    session_references: string[]
    session_reference: string | null
    settled_at: string | null
  }>(
    `
      WITH interruption_reference AS (
        SELECT work_order.id AS work_order_id,
          setup.id AS operation_setup_id,
          machine.id AS machine_id
        FROM manufacturing.work_orders work_order
        JOIN manufacturing.route_selections selection
          ON selection.work_order_id = work_order.id
          AND selection.reversed_at IS NULL
        JOIN manufacturing.operation_setups setup
          ON setup.route_option_id = selection.route_option_id
          AND setup.setup_number = $3
          AND setup.active
        JOIN catalog.machines machine
          ON machine.organization_id = work_order.organization_id
          AND lower(machine.machine_number) = lower($4)
          AND machine.active
        WHERE work_order.organization_id = $1
          AND lower(work_order.job_card_number) = lower($2)
        LIMIT 1
      )
      SELECT open_session.session_reference,
        open_session.measurement_method,
        CASE WHEN open_session.id IS NULL THEN NULL ELSE EXISTS (
          SELECT 1
          FROM manufacturing.production_session_downtime_events downtime
          WHERE downtime.production_session_id = open_session.id
            AND downtime.ended_at IS NULL
            AND downtime.reversed_at IS NULL
        ) END AS has_open_downtime,
        COALESCE(closed_sessions.finished_quantity, 0)::text AS finished_quantity,
        COALESCE(closed_sessions.session_references, ARRAY[]::text[])
          AS session_references,
        closed_sessions.settled_at::text AS settled_at
      FROM interruption_reference reference
      LEFT JOIN LATERAL (
        SELECT sum(closed.quantity_good) AS finished_quantity,
          array_agg(closed.session_reference ORDER BY closed.started_at)
            AS session_references,
          to_char(
            max(closed.ended_at) AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ) AS settled_at
          FROM manufacturing.production_sessions closed
          WHERE closed.organization_id = $1
            AND closed.work_order_id = reference.work_order_id
            AND closed.operation_setup_id = reference.operation_setup_id
            AND closed.machine_id = reference.machine_id
            AND closed.status = 'closed'
            AND closed.reversed_at IS NULL
      ) closed_sessions ON true
      LEFT JOIN LATERAL (
        SELECT session.id, session.session_reference,
          session.measurement_method
        FROM manufacturing.production_sessions session
        WHERE session.organization_id = $1
          AND session.work_order_id = reference.work_order_id
          AND session.operation_setup_id = reference.operation_setup_id
          AND session.machine_id = reference.machine_id
          AND session.status = 'open'
          AND session.reversed_at IS NULL
        LIMIT 1
      ) open_session ON true
    `,
    [
      organizationId,
      interruption.jobCardNumber.trim(),
      interruption.setupNumber,
      interruption.machineNumber.trim(),
    ]
  )
  return result.rows[0] ?? null
}

async function settledPlannerInterruptions(
  client: PoolClient,
  organizationId: string,
  interruptions: InterruptedSetupInput[],
  keepsWorkOnMachine = false
): Promise<SettledInterruptedSetup[]> {
  const settled: SettledInterruptedSetup[] = []
  for (const interruption of interruptions) {
    const state = await plannerInterruptionState(
      client,
      organizationId,
      interruption
    )
    const requirement = plannerInterruptionRequirement({
      keepsWorkOnMachine,
      session: state?.session_reference && state.measurement_method
        ? {
            hasOpenDowntime: state.has_open_downtime === true,
            measurementMethod: state.measurement_method,
            sessionReference: state.session_reference,
          }
        : null,
    })
    if (requirement.blocked) throw new Error(requirement.message)
    settled.push({
      ...interruption,
      finishedQuantity: Number(state?.finished_quantity ?? 0),
      hasOpenDowntime: state?.has_open_downtime === true,
      openSessionReference: state?.session_reference ?? null,
      sessionReferences: state?.session_references ?? [],
      settledAt: state?.settled_at ?? null,
    })
  }
  return settled
}

async function releasePlannerInterruptedSetups(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    decisionId: string
    decisionSource: "planOverrides" | "plannerPriorities" | "machineConstraints"
    interruptions: SettledInterruptedSetup[]
    organizationId: string
    reason: string
  }
) {
  for (const interruption of input.interruptions) {
    const current = await client.query<{
      id: string
      job_card_number: string
      machine_number: string
      option_number: string
      part_code: string
      setup_number: number
      source_payload: Record<string, unknown> | null
      stage: string
    }>(
      `
        SELECT state.id, state.stage, state.source_payload,
          work_order.job_card_number, item.uid AS part_code,
          route.route_code AS option_number, setup.setup_number,
          machine.machine_number
        FROM manufacturing.shop_floor_setup_state state
        JOIN manufacturing.work_orders work_order
          ON work_order.id = state.work_order_id
        JOIN catalog.items item ON item.id = work_order.item_id
        JOIN manufacturing.route_options route ON route.id = state.route_option_id
        JOIN manufacturing.operation_setups setup
          ON setup.id = state.operation_setup_id
        JOIN catalog.machines machine ON machine.id = state.machine_id
        WHERE state.organization_id = $1
          AND lower(work_order.job_card_number) = lower($2)
          AND setup.setup_number = $3
          AND lower(machine.machine_number) = lower($4)
          AND state.active
        FOR UPDATE OF state
      `,
      [
        input.organizationId,
        interruption.jobCardNumber.trim(),
        interruption.setupNumber,
        interruption.machineNumber.trim(),
      ]
    )
    const state = current.rows[0]
    if (!state) continue
    const sourcePayload = {
      ...(state.source_payload ?? {}),
      jcNo: state.job_card_number,
      jobCardNumber: state.job_card_number,
      machine: state.machine_number,
      machineNumber: state.machine_number,
      optionNumber: state.option_number,
      partCode: state.part_code,
      plannerDecisionId: input.decisionId,
      reason: input.reason,
      setupNo: String(state.setup_number),
      setupNumber: state.setup_number,
      stage: "planned",
      status: "stopped",
    }
    await client.query(
      `
        UPDATE manufacturing.shop_floor_setup_state
        SET stage = 'planned', active = false, completed_at = NULL,
          updated_by_user_id = $1, source_payload = $2,
          updated_at = now(), row_version = row_version + 1
        WHERE id = $3
      `,
      [input.actorUserId ?? null, sourcePayload, state.id]
    )
    await client.query(
      `
        INSERT INTO manufacturing.shop_floor_stage_events (
          organization_id, setup_state_id, from_stage, to_stage,
          machine_id, actor_user_id, reason, source_system, source_table,
          source_id, source_payload
        )
        SELECT $1, $2, $3, 'planned', machine_id, $4, $5,
          'mrm-dashboard', $6, $7, $8
        FROM manufacturing.shop_floor_setup_state
        WHERE id = $2
      `,
      [
        input.organizationId,
        state.id,
        state.stage,
        input.actorUserId ?? null,
        input.reason,
        input.decisionSource,
        randomUUID(),
        sourcePayload,
      ]
    )
  }
}

async function requireMachineSessionSettlement(
  client: PoolClient,
  organizationId: string,
  machineId: string,
  keepsWorkOnMachine: boolean
) {
  const result = await client.query<{
    has_open_downtime: boolean
    measurement_method: "counter" | "weight"
    session_reference: string
  }>(
    `
      SELECT session.session_reference, session.measurement_method,
        EXISTS (
          SELECT 1
          FROM manufacturing.production_session_downtime_events downtime
          WHERE downtime.production_session_id = session.id
            AND downtime.ended_at IS NULL
            AND downtime.reversed_at IS NULL
        ) AS has_open_downtime
      FROM manufacturing.production_sessions session
      WHERE session.organization_id = $1
        AND session.machine_id = $2
        AND session.status = 'open'
        AND session.reversed_at IS NULL
      LIMIT 1
      FOR UPDATE OF session
    `,
    [organizationId, machineId]
  )
  const session = result.rows[0]
  const requirement = plannerInterruptionRequirement({
    keepsWorkOnMachine,
    session: session
      ? {
          hasOpenDowntime: session.has_open_downtime,
          measurementMethod: session.measurement_method,
          sessionReference: session.session_reference,
        }
      : null,
  })
  if (requirement.blocked) throw new Error(requirement.message)
}

function interruptionMatches(
  interruption: InterruptedSetupInput,
  candidate: InterruptedSetupInput
) {
  return interruption.setupNumber === candidate.setupNumber
    && interruption.jobCardNumber.trim().toLowerCase()
      === candidate.jobCardNumber.trim().toLowerCase()
    && interruption.machineNumber.trim().toLowerCase()
      === candidate.machineNumber.trim().toLowerCase()
}

async function insertConstraintDetail(
  client: PoolClient,
  input: {
    evidence: unknown
    eventId: string
    impactType: string
    jobCardNumber: string
    organizationId: string
    setupNumber: number
  }
) {
  const reference = await optionalPlanningReference(
    client,
    input.organizationId,
    input.jobCardNumber,
    input.setupNumber
  )
  await client.query(
    `
      INSERT INTO manufacturing.machine_constraint_event_details (
        organization_id, machine_constraint_event_id, work_order_id,
        operation_setup_id, impact_type, evidence
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.organizationId,
      input.eventId,
      reference?.work_order_id ?? null,
      reference?.operation_setup_id ?? null,
      input.impactType,
      input.evidence,
    ]
  )
}

async function insertOverrideDetail(
  client: PoolClient,
  input: {
    details: unknown
    detailType: string
    eventId: string
    jobCardNumber: string
    organizationId: string
    sequence: number
    setupNumber: number
  }
) {
  const reference = await optionalPlanningReference(
    client,
    input.organizationId,
    input.jobCardNumber,
    input.setupNumber
  )
  await client.query(
    `
      INSERT INTO manufacturing.plan_override_event_details (
        organization_id, plan_override_event_id, detail_type,
        related_work_order_id, related_setup_id, sequence, details
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.organizationId,
      input.eventId,
      input.detailType,
      reference?.work_order_id ?? null,
      reference?.operation_setup_id ?? null,
      input.sequence,
      input.details,
    ]
  )
}

async function machineFor(
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
        AND machine.active
      FOR UPDATE
    `,
    [
      organizationId,
      requiredText(machineNumber, "Machine"),
      productionFloorCode,
    ]
  )
  if (!result.rows[0]) throw new Error("Physical machine was not found.")
  return result.rows[0].id
}

async function routeFor(
  client: PoolClient,
  organizationId: string,
  itemId: string,
  routeCode: string,
  productionFloorCode: ProductionFloorCode
) {
  const result = await client.query<{ id: string }>(
    `
      SELECT route.id FROM manufacturing.route_options route
      JOIN manufacturing.production_floors floor
        ON floor.id = route.production_floor_id
      WHERE route.organization_id = $1 AND route.item_id = $2
        AND (
          lower(route.route_code) = lower($3)
          OR lower(COALESCE(route.legacy_option_number, '')) = lower($3)
        )
        AND floor.code = $4
        AND route.active
      ORDER BY route.revision DESC
      LIMIT 1
      FOR UPDATE
    `,
    [
      organizationId,
      itemId,
      requiredText(routeCode, "Route option"),
      productionFloorCode,
    ]
  )
  if (!result.rows[0]) throw new Error("Route option was not found.")
  return result.rows[0].id
}

async function setupFor(
  client: PoolClient,
  organizationId: string,
  itemUid: string,
  routeCode: string,
  setupNumber: number,
  productionFloorCode: ProductionFloorCode
) {
  const itemId = await itemIdFor(client, organizationId, itemUid)
  const routeOptionId = await routeFor(
    client,
    organizationId,
    itemId,
    routeCode,
    productionFloorCode
  )
  const result = await client.query<{ id: string }>(
    `
      SELECT id FROM manufacturing.operation_setups
      WHERE route_option_id = $1 AND setup_number = $2 AND active
      FOR UPDATE
    `,
    [routeOptionId, setupNumber]
  )
  if (!result.rows[0]) throw new Error("Route setup was not found.")
  return result.rows[0].id
}

function priorityPosition(priority: string) {
  const positions: Record<string, number> = {
    critical: 0,
    high: 1,
    low: 3,
    normal: 2,
    urgent: 0,
  }
  return positions[priority.trim().toLowerCase()] ?? 2
}

type ToolingMasterInput = {
  rejectDuplicates?: boolean
  actorUserId?: string | null
  description?: string | null
  itemUid: string
  organizationId: string
  productionFloorCode?: string
  quantity?: number
  routeCode: string
  setupNumber: number
  sourcePayload?: unknown
  toolCode: string | null
}

async function upsertToolingClient(
  client: PoolClient,
  input: ToolingMasterInput
) {
  const operationSetupId = await setupFor(
    client,
    input.organizationId,
    input.itemUid,
    input.routeCode,
    input.setupNumber,
    normalizeProductionFloorCode(input.productionFloorCode)
  )
  const requestedToolCode = input.toolCode === null ? null : requiredText(input.toolCode, "Asset code")
  const toolingAsset = requestedToolCode === null ? null : await client.query<{ type_code: string }>(
    `
            SELECT type_code
            FROM store.item_types
            WHERE organization_id = $1
              AND lower(type_code) = lower($2)
              AND active
          `,
    [input.organizationId, requestedToolCode]
  )
  if (toolingAsset && !toolingAsset.rows[0]) {
    throw new Error(
      "Create the tooling Asset Code in Store first, then reference it in Tooling Master."
    )
  }
  const toolCode = toolingAsset?.rows[0]?.type_code ?? null
  const quantity = input.quantity ?? 1
  if (!(quantity > 0)) throw new Error("Tool quantity must be positive.")
  await businessKeyLock(
    client,
    "manufacturing.tooling",
    `${operationSetupId}:${toolCode}`
  )
  const existing = await client.query<{ id: string }>(
    `
            SELECT id FROM manufacturing.operation_tooling
            WHERE operation_setup_id = $1 AND lower(tool_code) IS NOT DISTINCT FROM lower($2::text)
            FOR UPDATE
          `,
    [operationSetupId, toolCode]
  )
  const sourcePayload = input.sourcePayload ?? input
  rejectDuplicateMaster(input.rejectDuplicates, !!existing.rows[0])
  const result = existing.rows[0]
    ? await client.query<{ id: string }>(
        `
                UPDATE manufacturing.operation_tooling
                SET description = $1, quantity = $2, active = true,
                  updated_by_user_id = $3, source_payload = $4,
                  updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $5 RETURNING id
              `,
        [
          input.description?.trim() || null,
          quantity,
          input.actorUserId ?? null,
          sourcePayload,
          existing.rows[0].id,
        ]
      )
    : await client.query<{ id: string }>(
        `
                INSERT INTO manufacturing.operation_tooling (
                  organization_id, operation_setup_id, tool_code,
                  description, quantity, active, created_by_user_id,
                  updated_by_user_id, source_system, source_table, source_id,
                  source_payload
                )
                VALUES ($1, $2, $3, $4, $5, true, $6, $6,
                  'mrm-dashboard', 'tooling', $7, $8)
                RETURNING id
              `,
        [
          input.organizationId,
          operationSetupId,
          toolCode,
          input.description?.trim() || null,
          quantity,
          input.actorUserId ?? null,
          randomUUID(),
          sourcePayload,
        ]
      )
  await queueDashboardRefresh(client, input.organizationId)
  return result.rows[0]!
}

export function createDashboardPlanningRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,

    async missingItemUids(organizationId: string, itemUids: string[]) {
      const requested = [
        ...new Set(itemUids.map((uid) => uid.trim()).filter(Boolean)),
      ]
      if (!requested.length) return []
      const result = await pool.query<{ uid: string }>(
        `
          SELECT requested.uid
          FROM unnest($2::text[]) WITH ORDINALITY requested(uid, position)
          WHERE NOT EXISTS (
            SELECT 1
            FROM catalog.items item
            WHERE item.organization_id = $1
              AND lower(item.uid) = lower(requested.uid)
          )
          ORDER BY requested.position
        `,
        [organizationId, requested]
      )
      return result.rows.map((row) => row.uid)
    },

    async organizationIdForCode(code: string) {
      const result = await pool.query<{ id: string }>(
        "SELECT id FROM core.organizations WHERE lower(code) = lower($1)",
        [requiredText(code, "Organization code")]
      )
      if (!result.rows[0]) throw new Error("Organization was not found.")
      return result.rows[0].id
    },

    async upsertMachine(input: {
      rejectDuplicates?: boolean
      actorUserId?: string | null
      machineNumber: string
      name?: string | null
      organizationId: string
      productionFloorCode?: string
      sourcePayload?: unknown
    }) {
      return transaction(pool, async (client) => {
        const machineNumber = requiredText(
          input.machineNumber,
          "Machine number"
        )
        const productionFloorCode = normalizeProductionFloorCode(
          input.productionFloorCode
        )
        const productionFloorId = await ensureProductionFloorId(
          client,
          input.organizationId,
          productionFloorCode
        )
        await businessKeyLock(
          client,
          "catalog.machine",
          `${input.organizationId}:${machineNumber}`
        )
        const existing = await client.query<{ id: string; production_floor_id: string }>(
          `
            SELECT machine.id, machine.production_floor_id FROM catalog.machines machine
            WHERE machine.organization_id = $1
              AND lower(machine.machine_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, machineNumber]
        )
        if (existing.rows[0] && existing.rows[0].production_floor_id !== productionFloorId) {
          throw new Error("This machine belongs to another Production Unit. Edit it in its existing unit.")
        }
        const sourcePayload = input.sourcePayload ?? input
        rejectDuplicateMaster(input.rejectDuplicates, !!existing.rows[0])
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE catalog.machines
                SET production_floor_id = $1,
                  name = $2, active = true, updated_by_user_id = $3,
                  source_payload = $4, updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $5
                RETURNING id
              `,
              [
                productionFloorId,
                input.name?.trim() || null,
                input.actorUserId ?? null,
                sourcePayload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO catalog.machines (
                  organization_id, production_floor_id, machine_number, name,
                  created_by_user_id, updated_by_user_id, source_system,
                  source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, $4, $5, $5, 'mrm-dashboard',
                  'machine_master', $6, $7)
                RETURNING id
              `,
              [
                input.organizationId,
                productionFloorId,
                machineNumber,
                input.name?.trim() || null,
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async upsertWorkOrder(input: {
      actorUserId?: string | null
      dueDate?: string | null
      itemUid: string
      jobCardNumber: string
      orderedQuantity: number
      organizationId: string
      requiredProductionFloorCode?: ProductionFloorCode
      sourcePayload?: unknown
      workOrderNumber: string
    }) {
      return transaction(pool, async (client) => {
        const jobCardNumber = requiredText(input.jobCardNumber, "Job card")
        if (input.orderedQuantity < 0) {
          throw new Error("Ordered quantity cannot be negative.")
        }
        await businessKeyLock(client, "manufacturing.work_order", jobCardNumber)
        const planningItem = await ensureWorkOrderItemId(
          client,
          input.organizationId,
          input.itemUid,
          input.actorUserId
        )
        const workOrderNumber = requiredText(
          input.workOrderNumber,
          "Work order number"
        )
        const existing = await client.query<{
          id: string
          item_id: string
          source_payload: unknown
          status: string
          work_order_number: string
        }>(
          `
            SELECT id, item_id, work_order_number, source_payload, status
            FROM manufacturing.work_orders
            WHERE organization_id = $1 AND lower(job_card_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, jobCardNumber]
        )
        if (
          existing.rows[0] && input.requiredProductionFloorCode &&
          productionFloorCodeForRecord({ sourcePayload: existing.rows[0].source_payload }) !== input.requiredProductionFloorCode
        ) {
          throw new ProductionUnitAccessError("This Job Card belongs to another Production Unit.")
        }
        if (existing.rows[0]?.status === "Cancelled") {
          throw new Error(
            "Cancelled Work Order lines cannot be updated or reimported."
          )
        }
        if (
          existing.rows[0] &&
          !workOrderIdentityMatches(
            {
              itemId: existing.rows[0].item_id,
              workOrderNumber: existing.rows[0].work_order_number,
            },
            { itemId: planningItem.id, workOrderNumber }
          )
        ) {
          throw new Error(
            "This Job Card already belongs to another FG PO Number and Part Code."
          )
        }
        const sourcePayload = {
          ...(typeof input.sourcePayload === "object" &&
          input.sourcePayload !== null &&
          !Array.isArray(input.sourcePayload)
            ? input.sourcePayload
            : input),
          planningItemPending: planningItem.planning_item_pending,
        }
        const values = [
          workOrderNumber,
          planningItem.id,
          input.orderedQuantity,
          input.dueDate ?? null,
          input.actorUserId ?? null,
        ]
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.work_orders
                SET work_order_number = $1, item_id = $2,
                  ordered_quantity = $3, due_date = migration.try_date($4),
                  updated_by_user_id = $5, source_payload = $6,
                  updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $7
                RETURNING id
              `,
              [...values, sourcePayload, existing.rows[0].id]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.work_orders (
                  organization_id, work_order_number, job_card_number,
                  item_id, ordered_quantity, due_date, created_by_user_id,
                  updated_by_user_id, source_system, source_table, source_id,
                  source_payload
                )
                VALUES ($1, $2, $3, $4, $5, migration.try_date($6), $7, $7,
                  'mrm-dashboard', 'work_order', $8, $9)
                RETURNING id
              `,
              [
                input.organizationId,
                values[0],
                jobCardNumber,
                values[1],
                values[2],
                values[3],
                values[4],
                randomUUID(),
                sourcePayload,
              ]
            )
        await queueDashboardRefresh(client, input.organizationId)
        return {
          ...result.rows[0]!,
          planningItemPending: planningItem.planning_item_pending,
        }
      })
    },

    async upsertRouteOption(input: {
      rejectDuplicates?: boolean
      recordId?: string
      actorUserId?: string | null
      itemUid: string
      organizationId: string
      productionFloorCode?: string
      replaceSetups?: boolean
      requireSetupNameMaster?: boolean
      machineFamily?: string
      routeCode: string
      sourcePayload?: unknown
      setups: Array<{
        legacySetupCode?: string | null
        operationCode: string
        operationName?: string | null
        sequence: number
        setupNumber: number
      }>
    }) {
      return transaction(pool, async (client) => {
        const routeCode = requiredText(input.routeCode, "Route code")
        const productionFloorCode = normalizeProductionFloorCode(
          input.productionFloorCode
        )
        const productionFloorId = await ensureProductionFloorId(
          client,
          input.organizationId,
          productionFloorCode
        )
        const itemId = await ensureRouteItemId(
          client,
          input.organizationId,
          input.itemUid,
          input.actorUserId
        )
        await businessKeyLock(
          client,
          "manufacturing.route",
          `${productionFloorCode}:${itemId}`
        )
        const existing = await client.query<{ id: string }>(
          `
            SELECT route.id FROM manufacturing.route_options route
            JOIN manufacturing.production_floors floor
              ON floor.id = route.production_floor_id
            WHERE route.item_id = $1
              AND (
                lower(route.route_code) = lower($2)
                OR lower(COALESCE(route.legacy_option_number, '')) = lower($2)
              )
              AND floor.code = $3
              AND route.revision = 1
            FOR UPDATE
          `,
          [itemId, routeCode, productionFloorCode]
        )
        const sourcePayload = {
          ...(typeof input.sourcePayload === "object" && input.sourcePayload !== null
            && !Array.isArray(input.sourcePayload) ? input.sourcePayload : input),
        }
        const previousSetups = existing.rows[0]
          ? await client.query<{ setup_number: number; sequence: number; source_payload: Record<string, unknown> | null }>(
              `SELECT setup_number, sequence, COALESCE(source_payload->'payload', source_payload) AS source_payload FROM manufacturing.operation_setups
               WHERE route_option_id = $1 AND active FOR UPDATE`, [existing.rows[0].id]
            )
          : { rows: [] }
        const used = existing.rows[0] ? await client.query<{ used: boolean }>(
          `SELECT EXISTS (SELECT 1 FROM manufacturing.route_selections WHERE route_option_id = $1)
             OR EXISTS (SELECT 1 FROM manufacturing.shop_floor_setup_state WHERE route_option_id = $1)
             OR EXISTS (SELECT 1 FROM manufacturing.production_entries WHERE route_option_id = $1)
             OR EXISTS (SELECT 1 FROM manufacturing.production_sessions WHERE route_option_id = $1) AS used`,
          [existing.rows[0].id]
        ) : { rows: [] }
        const declaredCount = Number((sourcePayload as Record<string, unknown>).numberOfSetups) || 0
        const previousCount = previousSetups.rows.map((row) => Number(row.source_payload?.numberOfSetups) || 0).find((count) => count > 0)
        const setupCount = declaredCount || previousCount || 0
        if ((previousCount && declaredCount && previousCount !== declaredCount)
          || (used.rows[0]?.used && !previousCount && declaredCount && declaredCount !== previousSetups.rows.length)
          || (setupCount && (!Number.isInteger(setupCount) || setupCount < Math.max(...input.setups.map((setup) => setup.setupNumber))))
          || input.setups.some((setup) => {
            const prior = previousSetups.rows.find((row) => row.setup_number === setup.setupNumber)
            return prior ? prior.sequence !== setup.sequence : used.rows[0]?.used
          })
          || (used.rows[0]?.used && input.replaceSetups !== false
            && previousSetups.rows.some((row) => !input.setups.some((setup) => setup.setupNumber === row.setup_number)))) {
          throw new Error("Changing setup sequence or number of setups requires a new route option.")
        }
        if (previousCount && !declaredCount) Object.assign(sourcePayload, { numberOfSetups: previousCount })
        if (!existing.rows[0]) {
          // Materialize the old automatic choice before introducing another option.
          const sole = await client.query<{ id: string; route_code: string }>(
            `SELECT id, route_code FROM manufacturing.route_options
             WHERE item_id = $1 AND production_floor_id = $2 AND active`, [itemId, productionFloorId]
          )
          if (sole.rows.length === 1) {
            const jobs = await client.query<{ id: string; job_card_number: string; source_payload: Record<string, unknown> | null }>(
              `SELECT id, job_card_number, source_payload FROM manufacturing.work_orders
               WHERE item_id = $1 AND organization_id = $2
                 AND status <> 'Cancelled'
               FOR UPDATE`, [itemId, input.organizationId]
            )
            for (const job of jobs.rows) {
              if (productionFloorCodeForRecord({ sourcePayload: job.source_payload }) !== productionFloorCode) continue
              await client.query(
                `INSERT INTO manufacturing.route_selections
                 (organization_id, work_order_id, route_option_id, selected_by_user_id, reason,
                  source_system, source_table, source_id, source_payload)
                 VALUES ($1, $2, $3, $4, 'Preserved automatic sole route option',
                   'mrm-dashboard', 'routeSelections', $5, $6)
                 ON CONFLICT (work_order_id) WHERE reversed_at IS NULL DO NOTHING`,
                [input.organizationId, job.id, sole.rows[0]!.id, input.actorUserId ?? null,
                  randomUUID(), { productionFloorCode, automatic: true,
                    jobCardNumber: job.job_card_number, routeCode: sole.rows[0]!.route_code }]
              )
            }
          }
        }
        if (input.machineFamily !== undefined) {
          const machineFamily = requiredText(input.machineFamily, "Machine Family")
          const machines = await client.query<{ machineFamily: string; machineType: string }>(
            `SELECT source_payload->>'machineFamily' AS "machineFamily",
                    source_payload->>'machineType' AS "machineType"
             FROM catalog.machines
             WHERE organization_id = $1 AND production_floor_id = $2 AND active
               AND lower(btrim(source_payload->>'machineFamily')) = lower($3)`,
            [input.organizationId, productionFloorId, machineFamily]
          )
          const machineType = machineTypeForFamily(machines.rows, machineFamily)
          if (!machineType) throw new Error(
            "Machine Family must have one consistent Machine Type in Machine Master for this Production Unit."
          )
          Object.assign(sourcePayload, { machineFamily, machineUsed: machineFamily, machineType })
        }
        const route = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.route_options
                SET active = true, updated_by_user_id = $1,
                  legacy_option_number = COALESCE(legacy_option_number, $2),
                  source_payload = $3, updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $4 RETURNING id
              `,
              [
                input.actorUserId ?? null,
                routeCode,
                sourcePayload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.route_options (
                  organization_id, production_floor_id, item_id, route_code,
                  legacy_option_number, revision, active, created_by_user_id,
                  updated_by_user_id, source_system, source_table, source_id,
                  source_payload
                )
                VALUES ($1, $2, $3, $4, $4, 1, true, $5, $5,
                  'mrm-dashboard', 'route', $6, $7)
                RETURNING id
              `,
              [
                input.organizationId,
                productionFloorId,
                itemId,
                routeCode,
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
        const routeOptionId = route.rows[0]!.id
        const retainedSetupNumbers: number[] = []
        for (const setup of input.setups) {
          if (!(setup.setupNumber > 0) || !(setup.sequence > 0)
            || !Number.isInteger(setup.setupNumber) || !Number.isInteger(setup.sequence)) {
            throw new Error(
              "Route setup and sequence numbers must be positive."
            )
          }
          const requestedSetupName =
            setup.operationName?.trim() || setup.operationCode.trim()
          const setupName = await client.query<{ id: string; name: string }>(
            `
              SELECT setup_name.id, setup_name.name
              FROM manufacturing.setup_names setup_name
              WHERE setup_name.organization_id = $1
                AND setup_name.production_floor_id = $2
                AND lower(btrim(setup_name.name)) = lower(btrim($3))
                AND setup_name.active
              LIMIT 1
            `,
            [input.organizationId, productionFloorId, requestedSetupName]
          )
          if (input.requireSetupNameMaster && !setupName.rows[0]) {
            throw new Error(
              "Select a Setup Name that exists in Setup Name Master."
            )
          }
          const canonicalSetupName =
            setupName.rows[0]?.name ?? setup.operationName?.trim() ?? null
          retainedSetupNumbers.push(setup.setupNumber)
          const current = await client.query<{ id: string; source_id: string; operation_name: string | null; source_payload: Record<string, unknown> | null }>(
            `
              SELECT id, source_id, operation_name, COALESCE(source_payload->'payload', source_payload) AS source_payload FROM manufacturing.operation_setups
              WHERE route_option_id = $1 AND setup_number = $2
              FOR UPDATE
            `,
            [routeOptionId, setup.setupNumber]
          )
          const prior = current.rows[0]
          if (input.recordId && (!prior || ![prior.id, prior.source_id].includes(input.recordId))) {
            throw new Error("Route setup identity cannot change. Create a new route option.")
          }
          rejectDuplicateMaster(input.rejectDuplicates && !input.recordId, !!prior)
          // Revise future planning only. Active assignments and session snapshots
          // stay untouched; the planner retains their physical-machine locks.
          if (current.rows[0]) {
            await client.query(
              `
                UPDATE manufacturing.operation_setups
                SET operation_code = $1, operation_name = $2, sequence = $3,
                  active = true, updated_by_user_id = $4,
                  legacy_setup_code = COALESCE($5, legacy_setup_code),
                  source_system = 'mrm-dashboard',
                  source_table = 'dataEntries', source_payload = CASE
                    WHEN jsonb_typeof(source_payload->'payload') = 'object'
                    THEN source_payload || jsonb_build_object('payload', (source_payload->'payload') || $6::jsonb)
                    ELSE COALESCE(source_payload, '{}'::jsonb) || $6::jsonb
                  END,
                  setup_name_id = $7, updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $8
              `,
              [
                requiredText(setup.operationCode, "Operation code"),
                canonicalSetupName,
                setup.sequence,
                input.actorUserId ?? null,
                setup.legacySetupCode?.trim() || String(setup.setupNumber),
                sourcePayload,
                setupName.rows[0]?.id ?? null,
                current.rows[0].id,
              ]
            )
          } else {
            await client.query(
              `
                INSERT INTO manufacturing.operation_setups (
                  organization_id, route_option_id, setup_number,
                  legacy_setup_code, operation_code, operation_name,
                  setup_name_id, sequence,
                  active, created_by_user_id, updated_by_user_id,
                  source_system, source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $9,
                  'mrm-dashboard', 'dataEntries', $10, $11)
              `,
              [
                input.organizationId,
                routeOptionId,
                setup.setupNumber,
                setup.legacySetupCode?.trim() || String(setup.setupNumber),
                requiredText(setup.operationCode, "Operation code"),
                canonicalSetupName,
                setupName.rows[0]?.id ?? null,
                setup.sequence,
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
          }
        }
        if (retainedSetupNumbers.length && input.replaceSetups !== false) {
          await client.query(
            `
              UPDATE manufacturing.operation_setups
              SET active = false, updated_by_user_id = $1,
                updated_at = now(), row_version = row_version + 1
              WHERE route_option_id = $2
                AND NOT (setup_number = ANY($3::integer[]))
            `,
            [input.actorUserId ?? null, routeOptionId, retainedSetupNumbers]
          )
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: routeOptionId }
      })
    },

    async upsertSetupName(input: {
      rejectDuplicates?: boolean
      actorUserId?: string | null
      name: string
      organizationId: string
      productionFloorCode?: string
      sourcePayload?: unknown
    }) {
      return transaction(pool, async (client) => {
        const name = requiredText(input.name, "Setup name")
        const productionFloorCode = normalizeProductionFloorCode(
          input.productionFloorCode
        )
        const productionFloorId = await ensureProductionFloorId(
          client,
          input.organizationId,
          productionFloorCode
        )
        await businessKeyLock(
          client,
          "manufacturing.setup_name",
          `${productionFloorCode}:${name}`
        )
        const existing = await client.query<{ id: string }>(
          `SELECT id
           FROM manufacturing.setup_names
           WHERE organization_id = $1
             AND production_floor_id = $2
             AND lower(btrim(name)) = lower(btrim($3))
           FOR UPDATE`,
          [input.organizationId, productionFloorId, name]
        )
        const sourcePayload = input.sourcePayload ?? {
          productionFloorCode,
          setupName: name,
        }
        rejectDuplicateMaster(input.rejectDuplicates, !!existing.rows[0])
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `UPDATE manufacturing.setup_names
               SET name = $1, active = true, updated_by_user_id = $2,
                 source_payload = $3, updated_at = now()
               WHERE id = $4
               RETURNING id`,
              [name, input.actorUserId ?? null, sourcePayload, existing.rows[0].id]
            )
          : await client.query<{ id: string }>(
              `INSERT INTO manufacturing.setup_names (
                 organization_id, production_floor_id, name, active,
                 created_by_user_id, updated_by_user_id, source_system,
                 source_table, source_id, source_payload
               ) VALUES ($1, $2, $3, true, $4, $4, 'mrm-dashboard',
                 'setup_name_master', $5, $6)
               RETURNING id`,
              [
                input.organizationId,
                productionFloorId,
                name,
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async upsertCycleStandard(input: {
      rejectDuplicates?: boolean
      recordId?: string
      actorUserId?: string | null
      cycleTimeSeconds: number
      itemUid: string
      organizationId: string
      piecesPerCycle?: number
      productionFloorCode?: string
      routeCode: string
      setupNumber: number
      setupTimeMinutes?: number
      sourcePayload?: unknown
    }) {
      return transaction(pool, async (client) => {
        if (!(input.cycleTimeSeconds > 0)) {
          throw new Error("Cycle time must be greater than zero.")
        }
        const operationSetupId = await setupFor(
          client,
          input.organizationId,
          input.itemUid,
          input.routeCode,
          input.setupNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        await businessKeyLock(client, "manufacturing.cycle", operationSetupId)
        const existing = await client.query<{
          id: string; source_id: string; pieces_per_cycle: string; setup_time_minutes: string
        }>(
          `
            SELECT id, source_id, pieces_per_cycle, setup_time_minutes
            FROM manufacturing.operation_cycle_standards
            WHERE operation_setup_id = $1 AND effective_to IS NULL
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            FOR UPDATE
          `,
          [operationSetupId]
        )
        const sourcePayload = input.sourcePayload ?? input
        const values = [
          input.cycleTimeSeconds,
          input.piecesPerCycle ?? existing.rows[0]?.pieces_per_cycle ?? 1,
          input.setupTimeMinutes ?? existing.rows[0]?.setup_time_minutes ?? 0,
          input.actorUserId ?? null,
        ]
        if (input.recordId && input.recordId !== existing.rows[0]?.id
          && input.recordId !== existing.rows[0]?.source_id) {
          throw new Error("The cycle time record to edit was not found for this route setup. Reload the master.")
        }
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.operation_cycle_standards
                SET cycle_time_seconds = $1, pieces_per_cycle = $2,
                  setup_time_minutes = $3, updated_by_user_id = $4,
                  source_payload = CASE
                    WHEN jsonb_typeof(source_payload->'payload') = 'object'
                    THEN source_payload || jsonb_build_object('payload', (source_payload->'payload') || $5::jsonb)
                    ELSE COALESCE(source_payload, '{}'::jsonb) || $5::jsonb
                  END, updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $6 RETURNING id
              `,
              [...values, sourcePayload, existing.rows[0].id]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.operation_cycle_standards (
                  organization_id, operation_setup_id, cycle_time_seconds,
                  pieces_per_cycle, setup_time_minutes, created_by_user_id,
                  updated_by_user_id, source_system, source_table, source_id,
                  source_payload
                )
                VALUES ($1, $2, $3, $4, $5, $6, $6,
                  'mrm-dashboard', 'cycle', $7, $8)
                RETURNING id
              `,
              [
                input.organizationId,
                operationSetupId,
                ...values,
                randomUUID(),
                sourcePayload,
              ]
            )
        // Closed sessions retain their original standard and production evidence.
        await client.query(
          `WITH updated_sessions AS (
             UPDATE manufacturing.production_sessions
             SET cycle_time_seconds = $3,
               updated_at = now(), row_version = row_version + 1,
               source_payload = COALESCE(source_payload, '{}'::jsonb)
                 || jsonb_build_object('cycleTime', $3::numeric)
             WHERE organization_id = $1 AND operation_setup_id = $2
               AND status = 'open' AND reversed_at IS NULL
             RETURNING production_entry_id
           )
           UPDATE manufacturing.production_entries entry
           SET source_payload = COALESCE(entry.source_payload, '{}'::jsonb)
             || jsonb_build_object('cycleTime', $3::numeric)
           FROM updated_sessions session
           WHERE entry.id = session.production_entry_id`,
          [input.organizationId, operationSetupId, input.cycleTimeSeconds]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async upsertTooling(input: ToolingMasterInput) {
      return transaction(pool, client => upsertToolingClient(client, input))
    },

    async upsertToolingBatch(inputs: ToolingMasterInput[]) {
      return transaction(pool, async client => {
        const results = []
        for (const input of inputs) results.push(await upsertToolingClient(client, input))
        return results
      })
    },

    async upsertPlanningCalendarException(input: {
      rejectDuplicates?: boolean
      actorUserId?: string | null
      exceptionDate: string
      exceptionType: string
      name: string
      organizationId: string
      sourcePayload?: unknown
      workingMinutes?: number | null
    }) {
      return transaction(pool, async (client) => {
        const exceptionType = requiredText(
          input.exceptionType,
          "Calendar exception type"
        )
        const date = requiredText(input.exceptionDate, "Calendar date")
        await businessKeyLock(
          client,
          "manufacturing.calendar",
          `${input.organizationId}:${date}:${exceptionType}`
        )
        const existing = await client.query<{ id: string; source_payload: unknown }>(
          `
            SELECT id, source_payload FROM manufacturing.planning_calendar_exceptions
            WHERE organization_id = $1
              AND exception_date = migration.try_date($2)
              AND lower(exception_type) = lower($3)
            FOR UPDATE
          `,
          [input.organizationId, date, exceptionType]
        )
        const sourcePayload = input.sourcePayload ?? input
        if (
          existing.rows[0] &&
          productionFloorCodeForRecord({ sourcePayload: existing.rows[0].source_payload }) !==
            productionFloorCodeForRecord({ sourcePayload })
        ) {
          throw new Error("A holiday for this date and scope already belongs to another Production Unit. Edit it in its existing unit.")
        }
        rejectDuplicateMaster(input.rejectDuplicates, !!existing.rows[0])
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.planning_calendar_exceptions
                SET name = $1, working_minutes = $2,
                  updated_by_user_id = $3, source_payload = $4,
                  updated_at = now(),
                  row_version = row_version + 1
                WHERE id = $5 RETURNING id
              `,
              [
                requiredText(input.name, "Calendar name"),
                input.workingMinutes ?? null,
                input.actorUserId ?? null,
                sourcePayload,
                existing.rows[0].id,
              ]
            )
          : await client.query<{ id: string }>(
              `
                INSERT INTO manufacturing.planning_calendar_exceptions (
                  organization_id, exception_date, exception_type, name,
                  working_minutes, created_by_user_id, updated_by_user_id,
                  source_system, source_table, source_id, source_payload
                )
                VALUES ($1, migration.try_date($2), $3, $4, $5, $6, $6,
                  'mrm-dashboard', 'planning_holiday', $7, $8)
                RETURNING id
              `,
              [
                input.organizationId,
                date,
                exceptionType,
                requiredText(input.name, "Calendar name"),
                input.workingMinutes ?? null,
                input.actorUserId ?? null,
                randomUUID(),
                sourcePayload,
              ]
            )
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async selectRoute(input: {
      actorUserId?: string | null
      jobCardNumber: string
      organizationId: string
      productionFloorCode?: string
      reason?: string | null
      routeCode: string
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderFor(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        const routeOptionId = await routeFor(
          client,
          input.organizationId,
          workOrder.item_id,
          input.routeCode,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const current = await client.query<{ id: string }>(
          `
            SELECT id FROM manufacturing.route_selections
            WHERE work_order_id = $1 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [workOrder.id]
        )
        if (current.rows[0]) {
          await client.query(
            "UPDATE manufacturing.route_selections SET reversed_at = now() WHERE id = $1",
            [current.rows[0].id]
          )
        }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.route_selections (
              organization_id, work_order_id, route_option_id,
              selected_by_user_id, reason, supersedes_selection_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'mrm-dashboard',
              'routeSelections', $7, $8)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.id,
            routeOptionId,
            input.actorUserId ?? null,
            input.reason?.trim() || null,
            current.rows[0]?.id ?? null,
            randomUUID(),
            input,
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, ok: true }
      })
    },

    async recordPlannerPriority(input: {
      actorUserId?: string | null
      approvalMode?: string | null
      confirmedSetupNumbers: string[]
      interruptedFinishedQuantity?: number | null
      interruptedJobCardNumber?: string | null
      interruptedMachineNumber?: string | null
      interruptedSetupNumber?: number | null
      interruptedSetups?: InterruptedSetupInput[]
      jobCardNumber: string
      organizationId: string
      partCode?: string | null
      priority: string
      productionFloorCode?: string
      queueBeforeSetups?: QueueBeforeSetupInput[]
      remark?: string | null
    }) {
      return transaction(pool, async (client) => {
        const confirmedSetupNumbers = validConfirmedPrioritySetupNumbers(
          input.confirmedSetupNumbers
        )
        if (!confirmedSetupNumbers) {
          throw new Error(
            "Confirm every priority setup in sequence before applying the priority."
          )
        }
        const workOrder = await workOrderFor(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        const interruptedSetups = await settledPlannerInterruptions(
          client,
          input.organizationId,
          input.interruptedSetups ?? []
        )
        const firstInterruption = interruptedSetups[0]
        const sourcePayload = {
          ...input,
          interruptedFinishedQuantity:
            firstInterruption?.finishedQuantity ?? null,
          interruptedSetups,
        }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.planner_priority_events (
              organization_id, planning_date, reason, actor_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, current_date, $2, $3, 'mrm-dashboard',
              'plannerPriorities', $4, $5)
            RETURNING id
          `,
          [
            input.organizationId,
            input.remark?.trim() || requiredText(input.priority, "Priority"),
            input.actorUserId ?? null,
            randomUUID(),
            { ...sourcePayload, confirmedSetupNumbers },
          ]
        )
        await client.query(
          `
            INSERT INTO manufacturing.planner_priority_event_details (
              organization_id, planner_priority_event_id, work_order_id,
              target_position, sequence
            )
            VALUES ($1, $2, $3, $4, 0)
          `,
          [
            input.organizationId,
            created.rows[0]!.id,
            workOrder.id,
            priorityPosition(input.priority),
          ]
        )
        await releasePlannerInterruptedSetups(client, {
          actorUserId: input.actorUserId,
          decisionId: created.rows[0]!.id,
          decisionSource: "plannerPriorities",
          interruptions: interruptedSetups,
          organizationId: input.organizationId,
          reason: input.remark?.trim() || input.priority,
        })
        let detailSequence = 1
        for (const interrupted of interruptedSetups) {
          const reference = await optionalPlanningReference(
            client,
            input.organizationId,
            interrupted.jobCardNumber,
            interrupted.setupNumber
          )
          if (reference) {
            await client.query(
              `
                INSERT INTO manufacturing.planner_priority_event_details (
                  organization_id, planner_priority_event_id, work_order_id,
                  operation_setup_id, target_position, blocker_code, sequence
                )
                VALUES ($1, $2, $3, $4, $5, 'interrupted-setup', $6)
                ON CONFLICT DO NOTHING
              `,
              [
                input.organizationId,
                created.rows[0]!.id,
                reference.work_order_id,
                reference.operation_setup_id,
                priorityPosition(input.priority),
                detailSequence,
              ]
            )
          }
          detailSequence += 1
        }
        for (const queued of input.queueBeforeSetups ?? []) {
          const reference = await optionalPlanningReference(
            client,
            input.organizationId,
            queued.jobCardNumber,
            queued.setupNumber
          )
          if (reference) {
            await client.query(
              `
                INSERT INTO manufacturing.planner_priority_event_details (
                  organization_id, planner_priority_event_id, work_order_id,
                  operation_setup_id, target_position, blocker_code, sequence
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT DO NOTHING
              `,
              [
                input.organizationId,
                created.rows[0]!.id,
                reference.work_order_id,
                reference.operation_setup_id,
                priorityPosition(input.priority),
                `queue-before-setup-${queued.targetSetupNumber ?? "unknown"}`,
                detailSequence,
              ]
            )
          }
          detailSequence += 1
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, ok: true }
      })
    },

    async recordMachineConstraint(input: {
      actorUserId?: string | null
      interruptedSetups?: InterruptedSetupInput[]
      machineNumber: string
      organizationId: string
      planningMode?: string | null
      productionFloorCode?: string
      queuePlacements?: QueuePlacementInput[]
      reason: string
      remark?: string | null
      rescheduleAction?: string | null
      unavailableFrom: string
      unavailableTo?: string | null
    }) {
      return transaction(pool, async (client) => {
        const machineId = await machineFor(
          client,
          input.organizationId,
          input.machineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        await client.query(
          `
            SELECT id FROM manufacturing.shop_floor_setup_state
            WHERE machine_id = $1 AND active
            FOR UPDATE
          `,
          [machineId]
        )
        const keepsWorkOnMachine = input.rescheduleAction?.trim().toLowerCase()
          === "delay"
        await requireMachineSessionSettlement(
          client,
          input.organizationId,
          machineId,
          keepsWorkOnMachine
        )
        const interruptedSetups = await settledPlannerInterruptions(
          client,
          input.organizationId,
          input.interruptedSetups ?? [],
          keepsWorkOnMachine
        )
        const sourcePayload = { ...input, interruptedSetups }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.machine_constraint_events (
              organization_id, machine_id, constraint_type, starts_at,
              ends_at, reason, actor_user_id, source_system, source_table,
              source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $3, $6, 'mrm-dashboard',
              'machineConstraints', $7, $8)
            RETURNING id
          `,
          [
            input.organizationId,
            machineId,
            requiredText(input.reason, "Constraint reason"),
            requiredText(input.unavailableFrom, "Unavailable from"),
            input.unavailableTo ?? null,
            input.actorUserId ?? null,
            randomUUID(),
            sourcePayload,
          ]
        )
        if (!keepsWorkOnMachine) {
          await releasePlannerInterruptedSetups(client, {
            actorUserId: input.actorUserId,
            decisionId: created.rows[0]!.id,
            decisionSource: "machineConstraints",
            interruptions: interruptedSetups,
            organizationId: input.organizationId,
            reason: input.reason,
          })
        }
        for (const interrupted of interruptedSetups) {
          await insertConstraintDetail(client, {
            evidence: interrupted,
            eventId: created.rows[0]!.id,
            impactType: "interrupted-setup",
            jobCardNumber: interrupted.jobCardNumber,
            organizationId: input.organizationId,
            setupNumber: interrupted.setupNumber,
          })
        }
        for (const placement of input.queuePlacements ?? []) {
          await insertConstraintDetail(client, {
            evidence: placement,
            eventId: created.rows[0]!.id,
            impactType: "queue-placement",
            jobCardNumber: placement.targetJobCardNumber,
            organizationId: input.organizationId,
            setupNumber: placement.targetSetupNumber,
          })
          for (const queued of placement.queueBeforeSetups ?? []) {
            await insertConstraintDetail(client, {
              evidence: {
                ...queued,
                targetJobCardNumber: placement.targetJobCardNumber,
                targetSetupNumber: placement.targetSetupNumber,
              },
              eventId: created.rows[0]!.id,
              impactType: "queue-before-setup",
              jobCardNumber: queued.jobCardNumber,
              organizationId: input.organizationId,
              setupNumber: queued.setupNumber,
            })
          }
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, ok: true }
      })
    },

    async recordRawMaterialRejection(input: {
      actorUserId?: string | null
      jobCardNumber: string
      organizationId: string
      planningAction: "continue_accepted_quantity" | "wait_for_replacement"
      productionFloorCode?: string
      reason: string
      rejectedKg: number
    }) {
      return transaction(pool, async (client) => {
        const jobCardNumber = requiredText(input.jobCardNumber, "Job card")
        const reason = requiredText(input.reason, "Rejection reason")
        const rejectedKg = Number(input.rejectedKg)
        if (!Number.isFinite(rejectedKg) || rejectedKg <= 0) {
          throw new Error("Rejected kilograms must be greater than zero.")
        }
        const productionFloorCode = normalizeProductionFloorCode(
          input.productionFloorCode
        )
        await businessKeyLock(
          client,
          "manufacturing.raw-material-rejection",
          `${input.organizationId}:${jobCardNumber}`
        )
        const workOrderResult = await client.query<{
          id: string
          item_uid: string
          source_payload: unknown
          status: string
        }>(
          `
            SELECT work_order.id, item.uid AS item_uid,
              work_order.source_payload, work_order.status
            FROM manufacturing.work_orders work_order
            JOIN catalog.items item ON item.id = work_order.item_id
            WHERE work_order.organization_id = $1
              AND lower(work_order.job_card_number) = lower($2)
            FOR UPDATE OF work_order
          `,
          [input.organizationId, jobCardNumber]
        )
        const workOrder = workOrderResult.rows[0]
        if (!workOrder) throw new Error("Planning work order was not found.")
        if (workOrder.status === "Cancelled") {
          throw new Error(
            "Cancelled Work Order lines cannot receive Raw Material rejection actions."
          )
        }
        if (
          productionFloorCodeForRecord({ sourcePayload: workOrder.source_payload })
          !== productionFloorCode
        ) {
          throw new ProductionUnitAccessError(
            "This Job Card belongs to another Production Unit."
          )
        }
        const openSession = await client.query<{ session_reference: string | null }>(
          `
            SELECT session_reference
            FROM manufacturing.production_sessions
            WHERE organization_id = $1 AND work_order_id = $2
              AND status = 'open' AND reversed_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
          `,
          [input.organizationId, workOrder.id]
        )
        if (openSession.rows[0]) {
          const reference = openSession.rows[0].session_reference
          throw new Error(
            `Close Production Session${reference ? ` ${reference}` : ""} before recording Raw Material rejection.`
          )
        }
        const balance = await client.query<{
          received_kg: string
          rejected_kg: string
        }>(
          `
            SELECT
              COALESCE((
                SELECT sum(receipt.quantity_kg)
                FROM manufacturing.raw_material_receipts receipt
                WHERE receipt.organization_id = $1
                  AND lower(receipt.job_card_number) = lower($2)
              ), 0)::text AS received_kg,
              COALESCE((
                SELECT sum(rejection.rejected_kg)
                FROM manufacturing.raw_material_rejection_events rejection
                WHERE rejection.organization_id = $1
                  AND rejection.work_order_id = $3
              ), 0)::text AS rejected_kg
          `,
          [input.organizationId, jobCardNumber, workOrder.id]
        )
        const receivedKg = Number(balance.rows[0]?.received_kg ?? 0)
        const previouslyRejectedKg = Number(balance.rows[0]?.rejected_kg ?? 0)
        const usableKgBefore = Math.max(receivedKg - previouslyRejectedKg, 0)
        if (rejectedKg > usableKgBefore + 0.00000001) {
          throw new Error(
            "Rejected kilograms cannot exceed the usable Raw Material balance."
          )
        }
        const orderedKg = sourcePayloadNumber(
          workOrder.source_payload,
          "orderKg",
          "ORD. KG."
        )
        const orderedPieces = sourcePayloadNumber(
          workOrder.source_payload,
          "orderPcs",
          "ORD. PCS."
        )
        const rejectionBalance = rawMaterialRejectionBalance({
          orderKg: orderedKg,
          orderPcs: orderedPieces,
          rejectedKg,
          usableKgBefore,
        })
        const { remainingKg: usableKgAfter } = rejectionBalance
        const rejectionScope = rejectionBalance.canContinueAcceptedQuantity
          ? "partial"
          : "full"
        const requestedAction = input.planningAction?.trim().toLowerCase()
        if (
          rejectionScope === "partial" &&
          requestedAction !== "continue_accepted_quantity" &&
          requestedAction !== "wait_for_replacement"
        ) {
          throw new Error(
            "Choose Continue Accepted Quantity or Wait For Replacement."
          )
        }
        const planningAction = rejectionScope === "full"
          ? "wait_for_replacement"
          : requestedAction as "continue_accepted_quantity" | "wait_for_replacement"
        const occurredAt = new Date().toISOString()
        const sourceId = randomUUID()
        const sourcePayload = {
          jcNo: jobCardNumber,
          orderedKg,
          partCode: workOrder.item_uid,
          planningAction,
          productionFloorCode,
          reason,
          receivedKg,
          rejectedKg,
          rejectionScope,
          usableKgAfter,
          usableKgBefore,
        }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.raw_material_rejection_events (
              organization_id, work_order_id, production_floor_code,
              rejected_kg, rejection_scope, planning_action, reason,
              occurred_at, actor_user_id, source_system, source_table,
              source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
              'mrm-dashboard', 'rawMaterialRejections', $10, $11)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.id,
            productionFloorCode,
            rejectedKg,
            rejectionScope,
            planningAction,
            reason,
            occurredAt,
            input.actorUserId ?? null,
            sourceId,
            sourcePayload,
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return {
          id: created.rows[0]!.id,
          ok: true,
          planningAction,
          rejectionScope,
          usableKgAfter,
        }
      })
    },

    async cancelWorkOrder(input: {
      actorUserId?: string | null
      jobCardNumber: string
      organizationId: string
      productionFloorCode: string
      reason: string
    }) {
      return transaction(pool, async (client) => {
        const jobCardNumber = requiredText(input.jobCardNumber, "Job card")
        const reason = requiredText(input.reason, "Cancellation reason")
        const productionFloorCode = normalizeProductionFloorCode(
          input.productionFloorCode
        )
        await businessKeyLock(
          client,
          "manufacturing.work_order_cancellation",
          jobCardNumber
        )
        const result = await client.query<{
          id: string
          source_payload: unknown
          status: string
          work_order_number: string
        }>(
          `
            SELECT id, source_payload, status, work_order_number
            FROM manufacturing.work_orders
            WHERE organization_id = $1
              AND lower(job_card_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, jobCardNumber]
        )
        const workOrder = result.rows[0]
        if (!workOrder) throw new Error("Planning work order was not found.")
        if (
          productionFloorCodeForRecord({
            sourcePayload: workOrder.source_payload,
          }) !== productionFloorCode
        ) {
          throw new ProductionUnitAccessError(
            "This Job Card belongs to another Production Unit."
          )
        }
        if (workOrder.status === "Cancelled") {
          throw new Error("This Work Order line is already cancelled.")
        }

        const openSession = await client.query<{
          session_reference: string | null
        }>(
          `
            SELECT session_reference
            FROM manufacturing.production_sessions
            WHERE organization_id = $1 AND work_order_id = $2
              AND status = 'open' AND reversed_at IS NULL
            ORDER BY started_at DESC
            LIMIT 1
          `,
          [input.organizationId, workOrder.id]
        )
        if (openSession.rows[0]) {
          const reference = openSession.rows[0].session_reference
          throw new Error(
            `Close Production Session${reference ? ` ${reference}` : ""} before cancelling the Work Order line.`
          )
        }

        const dispatched = await client.query<{ id: string }>(
          `
            SELECT id
            FROM manufacturing.dispatch_approval_events
            WHERE organization_id = $1 AND work_order_id = $2
              AND decision = 'approved' AND reversed_at IS NULL
            LIMIT 1
          `,
          [input.organizationId, workOrder.id]
        )
        if (dispatched.rows[0]) {
          throw new Error("A dispatched Work Order line cannot be cancelled.")
        }

        const cancelledAt = new Date().toISOString()
        const previousSourcePayload = sourcePayloadRecord(
          workOrder.source_payload
        )
        const cancellationPayload = {
          cancellationReason: reason,
          cancelledAt,
          cancelledByUserId: input.actorUserId ?? null,
          status: "Cancelled",
        }
        const sourcePayload = "payload" in previousSourcePayload
          ? {
              ...previousSourcePayload,
              ...cancellationPayload,
              payload: {
                ...sourcePayloadRecord(previousSourcePayload.payload),
                ...cancellationPayload,
              },
            }
          : { ...previousSourcePayload, ...cancellationPayload }
        await client.query(
          `
            UPDATE manufacturing.work_orders
            SET status = 'Cancelled', cancellation_reason = $1,
              cancelled_at = $2, cancelled_by_user_id = $3,
              updated_by_user_id = $3, updated_at = now(),
              row_version = row_version + 1, source_payload = $4
            WHERE id = $5
          `,
          [
            reason,
            cancelledAt,
            input.actorUserId ?? null,
            sourcePayload,
            workOrder.id,
          ]
        )
        const activeSetups = await client.query<{
          id: string
          machine_id: string | null
          source_payload: Record<string, unknown> | null
          stage: string
        }>(
          `
            SELECT id, machine_id, source_payload, stage
            FROM manufacturing.shop_floor_setup_state
            WHERE organization_id = $1 AND work_order_id = $2 AND active
            FOR UPDATE
          `,
          [input.organizationId, workOrder.id]
        )
        await client.query(
          `
            UPDATE manufacturing.shop_floor_setup_state
            SET stage = 'cancelled', active = false, completed_at = NULL,
              updated_by_user_id = $1, updated_at = now(),
              row_version = row_version + 1,
              source_payload = COALESCE(source_payload, '{}'::jsonb) ||
                jsonb_build_object(
                  'status', 'cancelled',
                  'cancellationReason', $2::text,
                  'cancelledAt', $3::text
                )
            WHERE organization_id = $4 AND work_order_id = $5 AND active
          `,
          [
            input.actorUserId ?? null,
            reason,
            cancelledAt,
            input.organizationId,
            workOrder.id,
          ]
        )
        for (const setup of activeSetups.rows) {
          await client.query(
            `
              INSERT INTO manufacturing.shop_floor_stage_events (
                organization_id, setup_state_id, from_stage, to_stage,
                machine_id, actor_user_id, reason, source_system,
                source_table, source_id, source_payload
              )
              VALUES ($1, $2, $3, 'cancelled', $4, $5, $6,
                'mrm-dashboard', 'work_order_cancellation', $7, $8)
            `,
            [
              input.organizationId,
              setup.id,
              setup.stage,
              setup.machine_id,
              input.actorUserId ?? null,
              reason,
              randomUUID(),
              {
                ...sourcePayloadRecord(setup.source_payload),
                cancellationReason: reason,
                cancelledAt,
                status: "cancelled",
              },
            ]
          )
        }
        await client.query(
          `
            INSERT INTO audit.events (
              organization_id, event_type, target_schema, target_table,
              target_id, actor_user_id, reason, before_state, after_state,
              source_system, source_table, source_id
            )
            VALUES ($1, 'manufacturing.work_order.cancelled',
              'manufacturing', 'work_orders', $2, $3, $4, $5, $6,
              'mrm-dashboard', 'work_order_cancellation', $7)
          `,
          [
            input.organizationId,
            workOrder.id,
            input.actorUserId ?? null,
            reason,
            {
              sourcePayload: sourcePayloadRecord(workOrder.source_payload),
              status: workOrder.status,
            },
            {
              cancellationReason: reason,
              cancelledAt,
              status: "Cancelled",
            },
            randomUUID(),
          ]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return {
          cancelledAt,
          id: workOrder.id,
          jobCardNumber,
          ok: true,
        }
      })
    },

    async reviewMachineConstraint(input: {
      organizationId: string
      actorUserId?: string | null
      productionFloorCode: string
      constraintId: string
      action: "available" | "extend"
      unavailableTo?: string
    }) {
      return transaction(pool, async (client) => {
        const result = await client.query<{
          id: string
          source_payload: Record<string, unknown>
          today: string
        }>(
          `SELECT id, source_payload,
             to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS today
           FROM manufacturing.machine_constraint_events
           WHERE organization_id = $1 AND (id::text = $2 OR source_id = $2)
             AND reversed_at IS NULL FOR UPDATE`,
          [input.organizationId, input.constraintId]
        )
        const row = result.rows[0]
        if (!row) throw new Error("Machine issue was not found or has been reversed.")
        if (productionFloorCodeForRecord({ sourcePayload: row.source_payload }) !== input.productionFloorCode) {
          throw new ProductionUnitAccessError("Machine issue belongs to another Production Unit.")
        }
        const previous = row.source_payload
        if (previous.availableOn || !isActivePlannerDecision(previous.status)) {
          throw new Error("Machine issue is already closed. Refresh the page.")
        }
        const newEnd = input.unavailableTo ?? ""
        if (input.action === "extend" && (
          !/^\d{4}-\d{2}-\d{2}$/.test(newEnd) ||
          !Number.isFinite(Date.parse(newEnd)) ||
          new Date(newEnd).toISOString().slice(0, 10) !== newEnd ||
          newEnd < row.today ||
          newEnd <= String(previous.unavailableTo || previous.unavailableFrom).slice(0, 10)
        )) throw new Error("Choose a valid end date later than the existing end date and not before today.")
        await client.query(
          `UPDATE manufacturing.machine_constraint_events SET
             ends_at = CASE WHEN $2 = 'extend' THEN $3::date::timestamptz ELSE ends_at END,
             source_payload = source_payload || $4::jsonb || jsonb_build_object(
               'availabilityReviews', COALESCE(source_payload->'availabilityReviews', '[]'::jsonb) ||
                 jsonb_build_array(jsonb_build_object('action', $2::text, 'at', now(),
                   'actorUserId', $5::text, 'previousTo', source_payload->'unavailableTo',
                   'newTo', $3::text)))
           WHERE id = $1`,
          [row.id, input.action, input.action === "extend" ? newEnd : null,
            input.action === "available"
              ? { status: "Available", availableOn: row.today, availableAt: new Date().toISOString(), availableBy: input.actorUserId ?? null }
              : { unavailableTo: newEnd },
            input.actorUserId ?? null]
        )
        await queueDashboardRefresh(client, input.organizationId)
        return { id: row.id, ok: true }
      })
    },

    async recordPlanOverride(input: {
      actorUserId?: string | null
      assignmentMode?: PlanOverrideAssignmentMode
      fromMachineNumber?: string | null
      interruptedSetups?: InterruptedSetupInput[]
      jobCardNumber: string
      organizationId: string
      productionFloorCode?: string
      queuePlacements?: QueuePlacementInput[]
      reason: string
      setupNumber?: number | null
      toMachineNumber: string
    }) {
      return transaction(pool, async (client) => {
        const assignmentMode = input.assignmentMode ?? "move"
        if (assignmentMode === "add_parallel_machine" && !input.setupNumber) {
          throw new Error("Setup number is required to add a parallel machine.")
        }
        const workOrder = await workOrderFor(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        const targetMachineId = await machineFor(
          client,
          input.organizationId,
          input.toMachineNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const sourceMachineId = input.fromMachineNumber
          ? await machineFor(
              client,
              input.organizationId,
              input.fromMachineNumber,
              normalizeProductionFloorCode(input.productionFloorCode)
            )
          : null
        const sourceInterruption = input.fromMachineNumber && input.setupNumber
          ? {
              jobCardNumber: input.jobCardNumber,
              machineNumber: input.fromMachineNumber,
              setupNumber: input.setupNumber,
            }
          : null
        const requestedInterruptions = [...(input.interruptedSetups ?? [])]
        if (
          sourceInterruption
          && !requestedInterruptions.some((interruption) =>
            interruptionMatches(interruption, sourceInterruption)
          )
        ) {
          requestedInterruptions.unshift(sourceInterruption)
        }
        const interruptedSetups = await settledPlannerInterruptions(
          client,
          input.organizationId,
          requestedInterruptions
        )
        const targetLock = await client.query<{
          job_card_number: string
          setup_number: number
          work_order_id: string
        }>(
          `
            SELECT state.work_order_id, work_order.job_card_number,
              setup.setup_number
            FROM manufacturing.shop_floor_setup_state state
            JOIN manufacturing.work_orders work_order
              ON work_order.id = state.work_order_id
            JOIN manufacturing.operation_setups setup
              ON setup.id = state.operation_setup_id
            WHERE state.machine_id = $1 AND state.active
            FOR UPDATE
          `,
          [targetMachineId]
        )
        if (assignmentMode === "add_parallel_machine" && targetLock.rows[0]) {
          throw new Error("Target machine is not idle. Finish or move its active setup first.")
        }
        if (
          targetLock.rows[0] &&
          targetLock.rows[0].work_order_id !== workOrder.id &&
          !interruptedSetups.some((interruption) =>
            interruptionMatches(interruption, {
              jobCardNumber: targetLock.rows[0]!.job_card_number,
              machineNumber: input.toMachineNumber,
              setupNumber: targetLock.rows[0]!.setup_number,
            })
          )
        ) {
          throw new Error("Target machine is locked by another active setup.")
        }
        const selectedRoute = await client.query<{ route_option_id: string }>(
          `
            SELECT route_option_id FROM manufacturing.route_selections
            WHERE work_order_id = $1 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [workOrder.id]
        )
        let operationSetupId: string | null = null
        if (input.setupNumber && selectedRoute.rows[0]) {
          const setup = await client.query<{ id: string }>(
            `
              SELECT id FROM manufacturing.operation_setups
              WHERE route_option_id = $1 AND setup_number = $2 AND active
              FOR UPDATE
            `,
            [selectedRoute.rows[0].route_option_id, input.setupNumber]
          )
          operationSetupId = setup.rows[0]?.id ?? null
        }
        const sourcePayload = { ...input, assignmentMode, interruptedSetups }
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.plan_override_events (
              organization_id, work_order_id, operation_setup_id,
              source_machine_id, target_machine_id, reason, actor_user_id,
              source_system, source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'mrm-dashboard',
              'planOverrides', $8, $9)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.id,
            operationSetupId,
            sourceMachineId,
            targetMachineId,
            requiredText(input.reason, "Override reason"),
            input.actorUserId ?? null,
            randomUUID(),
            sourcePayload,
          ]
        )
        await releasePlannerInterruptedSetups(client, {
          actorUserId: input.actorUserId,
          decisionId: created.rows[0]!.id,
          decisionSource: "planOverrides",
          interruptions: interruptedSetups,
          organizationId: input.organizationId,
          reason: requiredText(input.reason, "Override reason"),
        })
        let detailSequence = 0
        for (const interrupted of interruptedSetups) {
          await insertOverrideDetail(client, {
            details: interrupted,
            detailType: "interrupted-setup",
            eventId: created.rows[0]!.id,
            jobCardNumber: interrupted.jobCardNumber,
            organizationId: input.organizationId,
            sequence: detailSequence,
            setupNumber: interrupted.setupNumber,
          })
          detailSequence += 1
        }
        for (const placement of input.queuePlacements ?? []) {
          await insertOverrideDetail(client, {
            details: placement,
            detailType: "queue-placement",
            eventId: created.rows[0]!.id,
            jobCardNumber: placement.targetJobCardNumber,
            organizationId: input.organizationId,
            sequence: detailSequence,
            setupNumber: placement.targetSetupNumber,
          })
          detailSequence += 1
          for (const queued of placement.queueBeforeSetups ?? []) {
            await insertOverrideDetail(client, {
              details: {
                ...queued,
                targetJobCardNumber: placement.targetJobCardNumber,
                targetSetupNumber: placement.targetSetupNumber,
              },
              detailType: "queue-before-setup",
              eventId: created.rows[0]!.id,
              jobCardNumber: queued.jobCardNumber,
              organizationId: input.organizationId,
              sequence: detailSequence,
              setupNumber: queued.setupNumber,
            })
            detailSequence += 1
          }
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, ok: true }
      })
    },

    async recordRouteChange(input: {
      actorUserId?: string | null
      applyFromSetup?: number | null
      changeAfterSetup?: number | null
      jobCardNumber: string
      newRouteCode: string
      organizationId: string
      productionFloorCode?: string
      remainingSetups?: RemainingSetupInput[]
      reason: string
      wipQuantity?: number | null
    }) {
      return transaction(pool, async (client) => {
        const workOrder = await workOrderFor(
          client,
          input.organizationId,
          input.jobCardNumber
        )
        const current = await client.query<{ route_option_id: string }>(
          `
            SELECT route_option_id FROM manufacturing.route_selections
            WHERE work_order_id = $1 AND reversed_at IS NULL
            FOR UPDATE
          `,
          [workOrder.id]
        )
        const targetRouteId = await routeFor(
          client,
          input.organizationId,
          workOrder.item_id,
          input.newRouteCode,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const created = await client.query<{ id: string }>(
          `
            INSERT INTO manufacturing.route_change_events (
              organization_id, work_order_id, from_route_option_id,
              to_route_option_id, reason, actor_user_id, source_system,
              source_table, source_id, source_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'mrm-dashboard',
              'routeChanges', $7, $8)
            RETURNING id
          `,
          [
            input.organizationId,
            workOrder.id,
            current.rows[0]?.route_option_id ?? null,
            targetRouteId,
            requiredText(input.reason, "Route-change reason"),
            input.actorUserId ?? null,
            randomUUID(),
            input,
          ]
        )
        for (const [sequence, remaining] of (
          input.remainingSetups ?? []
        ).entries()) {
          const setup = await client.query<{ id: string }>(
            `
              SELECT id FROM manufacturing.operation_setups
              WHERE route_option_id = $1 AND setup_number = $2 AND active
            `,
            [targetRouteId, remaining.setupNumber]
          )
          await client.query(
            `
              INSERT INTO manufacturing.route_change_event_setups (
                organization_id, route_change_event_id, operation_setup_id,
                setup_number, disposition, sequence
              )
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              input.organizationId,
              created.rows[0]!.id,
              setup.rows[0]?.id ?? null,
              remaining.setupNumber,
              remaining.plan ? "plan" : "skip",
              sequence,
            ]
          )
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { id: created.rows[0]!.id, ok: true }
      })
    },
  }
}

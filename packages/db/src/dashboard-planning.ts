import { randomUUID } from "node:crypto"

import type { PoolClient } from "pg"

import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import {
  repositoryPool,
  withTransaction as transaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  validConfirmedPrioritySetupNumbers,
  workOrderIdentityMatches,
} from "./planning-rules"
import {
  normalizeProductionFloorCode,
  productionFloors,
  type ProductionFloorCode,
} from "./production-floors"


type InterruptedSetupInput = {
  finishedQuantity?: number | null
  jobCardNumber: string
  machineNumber: string
  setupNumber: number
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
  }>(
    `
      SELECT id, item_id FROM manufacturing.work_orders
      WHERE organization_id = $1 AND lower(job_card_number) = lower($2)
      FOR UPDATE
    `,
    [organizationId, requiredText(jobCardNumber, "Job card")]
  )
  if (!result.rows[0]) throw new Error("Planning work order was not found.")
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
          machineNumber
        )
        const existing = await client.query<{ id: string }>(
          `
            SELECT machine.id FROM catalog.machines machine
            WHERE machine.organization_id = $1
              AND lower(machine.machine_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, machineNumber]
        )
        const sourcePayload = input.sourcePayload ?? input
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
          work_order_number: string
        }>(
          `
            SELECT id, item_id, work_order_number
            FROM manufacturing.work_orders
            WHERE organization_id = $1 AND lower(job_card_number) = lower($2)
            FOR UPDATE
          `,
          [input.organizationId, jobCardNumber]
        )
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
      actorUserId?: string | null
      itemUid: string
      organizationId: string
      productionFloorCode?: string
      replaceSetups?: boolean
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
          `${productionFloorCode}:${itemId}:${routeCode}`
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
        const sourcePayload = input.sourcePayload ?? input
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
          if (!(setup.setupNumber > 0) || !(setup.sequence > 0)) {
            throw new Error(
              "Route setup and sequence numbers must be positive."
            )
          }
          retainedSetupNumbers.push(setup.setupNumber)
          const current = await client.query<{ id: string }>(
            `
              SELECT id FROM manufacturing.operation_setups
              WHERE route_option_id = $1 AND setup_number = $2
              FOR UPDATE
            `,
            [routeOptionId, setup.setupNumber]
          )
          if (current.rows[0]) {
            await client.query(
              `
                UPDATE manufacturing.operation_setups
                SET operation_code = $1, operation_name = $2, sequence = $3,
                  active = true, updated_by_user_id = $4,
                  legacy_setup_code = COALESCE($5, legacy_setup_code),
                  source_system = 'mrm-dashboard',
                  source_table = 'dataEntries', source_payload = $6,
                  updated_at = now(), row_version = row_version + 1
                WHERE id = $7
              `,
              [
                requiredText(setup.operationCode, "Operation code"),
                setup.operationName?.trim() || null,
                setup.sequence,
                input.actorUserId ?? null,
                setup.legacySetupCode?.trim() || String(setup.setupNumber),
                sourcePayload,
                current.rows[0].id,
              ]
            )
          } else {
            await client.query(
              `
                INSERT INTO manufacturing.operation_setups (
                  organization_id, route_option_id, setup_number,
                  legacy_setup_code, operation_code, operation_name, sequence,
                  active, created_by_user_id, updated_by_user_id,
                  source_system, source_table, source_id, source_payload
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $8,
                  'mrm-dashboard', 'dataEntries', $9, $10)
              `,
              [
                input.organizationId,
                routeOptionId,
                setup.setupNumber,
                setup.legacySetupCode?.trim() || String(setup.setupNumber),
                requiredText(setup.operationCode, "Operation code"),
                setup.operationName?.trim() || null,
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

    async upsertCycleStandard(input: {
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
        const existing = await client.query<{ id: string }>(
          `
            SELECT id FROM manufacturing.operation_cycle_standards
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
          input.piecesPerCycle ?? 1,
          input.setupTimeMinutes ?? 0,
          input.actorUserId ?? null,
        ]
        const result = existing.rows[0]
          ? await client.query<{ id: string }>(
              `
                UPDATE manufacturing.operation_cycle_standards
                SET cycle_time_seconds = $1, pieces_per_cycle = $2,
                  setup_time_minutes = $3, updated_by_user_id = $4,
                  source_payload = $5, updated_at = now(),
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
        await queueDashboardRefresh(client, input.organizationId)
        return result.rows[0]!
      })
    },

    async upsertTooling(input: {
      actorUserId?: string | null
      description?: string | null
      itemUid: string
      organizationId: string
      productionFloorCode?: string
      quantity?: number
      routeCode: string
      setupNumber: number
      sourcePayload?: unknown
      toolCode: string
    }) {
      return transaction(pool, async (client) => {
        const operationSetupId = await setupFor(
          client,
          input.organizationId,
          input.itemUid,
          input.routeCode,
          input.setupNumber,
          normalizeProductionFloorCode(input.productionFloorCode)
        )
        const toolCode = requiredText(input.toolCode, "Tool code")
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
            WHERE operation_setup_id = $1 AND lower(tool_code) = lower($2)
            FOR UPDATE
          `,
          [operationSetupId, toolCode]
        )
        const sourcePayload = input.sourcePayload ?? input
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
      })
    },

    async upsertPlanningCalendarException(input: {
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
          `${date}:${exceptionType}`
        )
        const existing = await client.query<{ id: string }>(
          `
            SELECT id FROM manufacturing.planning_calendar_exceptions
            WHERE organization_id = $1
              AND exception_date = migration.try_date($2)
              AND lower(exception_type) = lower($3)
            FOR UPDATE
          `,
          [input.organizationId, date, exceptionType]
        )
        const sourcePayload = input.sourcePayload ?? input
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
            { ...input, confirmedSetupNumbers },
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
        let detailSequence = 1
        for (const interrupted of input.interruptedSetups ?? []) {
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
            input,
          ]
        )
        for (const interrupted of input.interruptedSetups ?? []) {
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

    async recordPlanOverride(input: {
      actorUserId?: string | null
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
        const targetLock = await client.query<{ work_order_id: string }>(
          `
            SELECT work_order_id
            FROM manufacturing.shop_floor_setup_state
            WHERE machine_id = $1 AND active
            FOR UPDATE
          `,
          [targetMachineId]
        )
        if (
          targetLock.rows[0] &&
          targetLock.rows[0].work_order_id !== workOrder.id
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
            input,
          ]
        )
        let detailSequence = 0
        for (const interrupted of input.interruptedSetups ?? []) {
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

import type { PoolClient } from "pg"

import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import { productionFloorFromDepartment } from "./production-floors"
import {
  repositoryPool,
  withTransaction,
  type RepositoryPoolOptions,
} from "./postgres-runtime"
import {
  assertToolingTransferAvailable,
  lockToolingAllocation,
} from "./tooling-availability"

type StoreKind = "MAIN" | "QUALITY" | "PRODUCTION"
type HolderType = "DEPARTMENT" | "MACHINE" | "STORE" | "VENDOR"

type AccountableStore = {
  code: string
  defaultLocationId: string
  id: string
  kind: StoreKind
  name: string
  productionFloorCode: string | null
}

type MutationIdentity = {
  actorUserId?: string | null
  movedBy?: string | null
  organizationId: string
  requisitionId?: string | null
  remark?: string | null
}

async function storeTransferRequest(
  client: PoolClient,
  input: MutationIdentity & { destinationStoreCode: string }
) {
  if (!input.requisitionId) return null
  const result = await client.query<{
    destinationStoreCode: string
    issuedQuantity: string
    itemTypeId: string
    requestedAssetId: string | null
    requestedQuantity: string
    status: string
    trackingMode: "CONSUMABLE" | "SERIALIZED"
  }>(
    `SELECT destination.code AS "destinationStoreCode",
       request.item_type_id AS "itemTypeId",
       request.requested_asset_id AS "requestedAssetId",
       request.requested_quantity::text AS "requestedQuantity",
       request.issued_quantity::text AS "issuedQuantity",
       request.status, item.tracking_mode AS "trackingMode"
     FROM store.requisitions request
     JOIN store.requisition_headers header
       ON header.id = request.request_header_id
     JOIN store.locations source ON source.id = request.location_id
     JOIN store.accountable_stores source_store
       ON source_store.id = source.accountable_store_id
     JOIN store.accountable_stores destination
       ON destination.id = header.receiving_store_id
     JOIN store.item_types item ON item.id = request.item_type_id
     WHERE request.id = $1 AND request.organization_id = $2
       AND header.fulfillment_kind = 'STORE_TRANSFER'
       AND source_store.kind = 'MAIN'
     FOR UPDATE OF request`,
    [input.requisitionId, input.organizationId]
  )
  const request = result.rows[0]
  if (!request) throw new Error("Store transfer request was not found.")
  if (request.status !== "Pending" && request.status !== "Partially Issued") {
    throw new Error("This Store transfer request is closed.")
  }
  if (request.destinationStoreCode.toLowerCase() !==
    input.destinationStoreCode.toLowerCase()) {
    throw new Error("The receiving Store does not match the request.")
  }
  return request
}

async function completeStoreTransferRequest(
  client: PoolClient,
  input: MutationIdentity,
  quantity: number,
  request: NonNullable<Awaited<ReturnType<typeof storeTransferRequest>>>
) {
  const remaining = Number(request.requestedQuantity) - Number(request.issuedQuantity)
  if (quantity > remaining + 1e-8) {
    throw new Error(`Only ${remaining} remains on this Store transfer request.`)
  }
  await client.query(
    `UPDATE store.requisitions
     SET issued_quantity = issued_quantity + $2,
       status = CASE WHEN issued_quantity + $2 = requested_quantity
         THEN 'Fulfilled' ELSE 'Partially Issued' END,
       updated_at = now(), updated_by_user_id = $3
     WHERE id = $1`,
    [input.requisitionId, quantity, input.actorUserId ?? null]
  )
}

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim()
  if (!result) throw new Error(`${label} is required.`)
  return result
}

function positiveQuantity(value: number) {
  if (!Number.isFinite(value) || value <= 0 ||
    Math.abs(Math.round(value * 1000) - value * 1000) > 1e-8) {
    throw new Error("Quantity must be positive, with at most three decimal places.")
  }
  return value
}

async function findStore(
  client: PoolClient,
  organizationId: string,
  code: string,
  lock = false
) {
  const result = await client.query<AccountableStore>(
    `SELECT accountable.id, accountable.code, accountable.name,
      accountable.kind,
      accountable.production_floor_code AS "productionFloorCode",
      accountable.default_location_id AS "defaultLocationId"
     FROM store.accountable_stores accountable
     JOIN store.locations location
       ON location.id = accountable.default_location_id
       AND location.organization_id = accountable.organization_id
       AND location.accountable_store_id = accountable.id
       AND location.location_type = 'STORE' AND location.active
     WHERE accountable.organization_id = $1
       AND lower(accountable.code) = lower($2) AND accountable.active
     ${lock ? "FOR UPDATE" : ""}`,
    [organizationId, requiredText(code, "Store")]
  )
  if (!result.rows[0]) throw new Error("Accountable Store was not found.")
  return result.rows[0]
}

async function lockConsumable(
  client: PoolClient,
  organizationId: string,
  itemTypeId: string
) {
  const item = await client.query<{ id: string; typeCode: string }>(
    `SELECT id, type_code AS "typeCode" FROM store.item_types
     WHERE organization_id = $1 AND id = $2 AND active
       AND tracking_mode = 'CONSUMABLE' FOR UPDATE`,
    [organizationId, itemTypeId]
  )
  if (!item.rows[0]) throw new Error("Active consumable Asset Code was not found.")
  return item.rows[0]
}

async function availableLocations(
  client: PoolClient,
  organizationId: string,
  storeId: string,
  itemTypeId: string
) {
  const result = await client.query<{
    available: string
    code: string
    id: string
    name: string
  }>(
    `SELECT location.id, location.code, location.name,
      COALESCE(sum(movement.quantity), 0)::text AS available
     FROM store.locations location
     LEFT JOIN store.stock_movements movement
       ON movement.organization_id = location.organization_id
       AND movement.location_id = location.id
       AND movement.item_type_id = $3
       AND movement.asset_id IS NULL
     WHERE location.organization_id = $1
       AND location.accountable_store_id = $2
       AND location.location_type = 'STORE' AND location.active
     GROUP BY location.id, location.code, location.name
     ORDER BY COALESCE(sum(movement.quantity), 0) DESC, location.code`,
    [organizationId, storeId, itemTypeId]
  )
  return result.rows
}

async function insertQuantityMovement(
  client: PoolClient,
  input: {
    actorUserId?: string | null
    fromCode?: string | null
    fromName?: string | null
    itemTypeId: string
    locationId: string
    movementType: "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT" | "ISSUE"
    movedBy?: string | null
    operationId: string
    organizationId: string
    quantity: number
    requisitionId?: string | null
    remark?: string | null
    toCode?: string | null
    toName?: string | null
  }
) {
  await client.query(
    `INSERT INTO store.stock_movements (
       organization_id, item_type_id, location_id, movement_type,
       quantity, from_holder_type, from_holder_reference, from_holder_name,
       to_holder_type, to_holder_reference, to_holder_name, moved_by,
       remark, created_by_user_id, department_stock_operation_id,
       requisition_id
     ) VALUES ($1, $2, $3, $4, $5,
       'STORE', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      input.organizationId,
      input.itemTypeId,
      input.locationId,
      input.movementType,
      input.quantity,
      input.fromCode ?? null,
      input.fromName ?? null,
      input.toCode ? "STORE" : null,
      input.toCode ?? null,
      input.toName ?? null,
      input.movedBy?.trim() || null,
      input.remark?.trim() || null,
      input.actorUserId ?? null,
      input.operationId,
      input.requisitionId ?? null,
    ]
  )
}

async function writeDebits(
  client: PoolClient,
  input: MutationIdentity & {
    itemTypeId: string
    movementType: "TRANSFER_OUT" | "ISSUE" | "ADJUSTMENT"
    operationId: string
    quantity: number
    sourceStore: AccountableStore
    toStore?: AccountableStore
  }
) {
  const locations = await availableLocations(
    client, input.organizationId, input.sourceStore.id, input.itemTypeId
  )
  const availableUnits = locations.reduce(
    (total, location) => total + Math.round(Number(location.available) * 1000), 0
  )
  if (availableUnits < Math.round(input.quantity * 1000)) {
    throw new Error("Insufficient available quantity in the accountable Store.")
  }
  let remainingUnits = Math.round(input.quantity * 1000)
  for (const location of locations) {
    if (remainingUnits <= 0) break
    const deductionUnits = Math.min(
      remainingUnits, Math.round(Number(location.available) * 1000)
    )
    if (deductionUnits <= 0) continue
    await insertQuantityMovement(client, {
      ...input,
      fromCode: input.sourceStore.code,
      fromName: input.sourceStore.name,
      itemTypeId: input.itemTypeId,
      locationId: location.id,
      movementType: input.movementType,
      operationId: input.operationId,
      quantity: -deductionUnits / 1000,
      toCode: input.toStore?.code,
      toName: input.toStore?.name,
    })
    remainingUnits -= deductionUnits
  }
}

async function insertOperation(
  client: PoolClient,
  input: MutationIdentity & {
    destinationStoreId?: string | null
    itemTypeId: string
    operatedOn?: string | null
    operationType: "TRANSFER" | "CONSUMPTION"
    quantity: number
    sourceStoreId: string
  }
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO store.department_stock_operations (
       organization_id, operation_type, item_type_id, source_store_id,
       destination_store_id, quantity, operated_on, remark,
       created_by_user_id, requisition_id
     ) VALUES ($1, $2, $3, $4, $5, $6,
       COALESCE($7::date, current_date), $8, $9, $10)
     RETURNING id`,
    [
      input.organizationId, input.operationType, input.itemTypeId,
      input.sourceStoreId, input.destinationStoreId ?? null,
      input.quantity, input.operatedOn ?? null,
      input.remark?.trim() || null, input.actorUserId ?? null,
      input.requisitionId ?? null,
    ]
  )
  return result.rows[0]!.id
}

async function resolveDestination(
  client: PoolClient,
  input: {
    holderReference: string
    holderType: HolderType
    organizationId: string
    storeId: string
    vendorId?: string | null
  }
) {
  if (input.holderType === "STORE") {
    const result = await client.query<{
      code: string
      id: string
      name: string
    }>(
      `SELECT id, code, name FROM store.locations
       WHERE organization_id = $1 AND accountable_store_id = $2
         AND location_type = 'STORE' AND active
         AND (id::text = $3 OR lower(code) = lower($3))`,
      [input.organizationId, input.storeId,
        requiredText(input.holderReference, "Store location")]
    )
    const destination = result.rows[0]
    if (!destination) {
      throw new Error("Choose a location in the accountable Store.")
    }
    return {
      holderReference: destination.code, holderName: destination.name,
      locationId: destination.id, machineId: null, vendorId: null,
    }
  }
  if (input.holderType === "DEPARTMENT") {
    const result = await client.query<{ code: string; name: string }>(
      `SELECT code, name FROM recruitment.departments
       WHERE organization_id = $1 AND lower(code) = lower($2) AND active`,
      [input.organizationId,
        requiredText(input.holderReference, "Department")]
    )
    const destination = result.rows[0]
    if (!destination) throw new Error("Choose an active Department.")
    return {
      holderReference: destination.code, holderName: destination.name,
      locationId: null, machineId: null, vendorId: null,
    }
  }
  if (input.holderType === "MACHINE") {
    const result = await client.query<{
      id: string
      machineNumber: string
      name: string | null
    }>(
      `SELECT id, machine_number AS "machineNumber", name
       FROM catalog.machines
       WHERE organization_id = $1 AND active
         AND (id::text = $2 OR lower(machine_number) = lower($2))
       LIMIT 2`,
      [input.organizationId,
        requiredText(input.holderReference, "Machine")]
    )
    if (result.rows.length !== 1) {
      throw new Error("Choose one active Machine from Machine Master.")
    }
    const destination = result.rows[0]!
    return {
      holderReference: destination.machineNumber,
      holderName: destination.name?.trim() || destination.machineNumber,
      locationId: null, machineId: destination.id, vendorId: null,
    }
  }
  const result = await client.query<{ code: string; id: string; name: string }>(
    `SELECT id, code, name FROM store.vendors
     WHERE organization_id = $1 AND active AND id = $2`,
    [input.organizationId, input.vendorId ?? null]
  )
  const destination = result.rows[0]
  if (!destination) throw new Error("Choose an active Vendor.")
  return {
    holderReference: destination.code, holderName: destination.name,
    locationId: null, machineId: null, vendorId: destination.id,
  }
}

async function moveOwnedAsset(
  client: PoolClient,
  input: MutationIdentity & {
    assetCode: string
    gaugeSetMovementId?: string | null
    holderReference: string
    holderType: HolderType
    store: AccountableStore
    vendorId?: string | null
  }
) {
  const result = await client.query<{
    accountId: string
    currentHolderName: string | null
    currentHolderReference: string | null
    currentHolderType: string
    currentLocationId: string | null
    id: string
    itemTypeId: string
    status: string
  }>(
    `SELECT id, item_type_id AS "itemTypeId", status,
      accountable_store_id AS "accountId",
      current_holder_type AS "currentHolderType",
      current_holder_reference AS "currentHolderReference",
      current_holder_name AS "currentHolderName",
      current_location_id AS "currentLocationId"
     FROM store.assets
     WHERE organization_id = $1 AND lower(asset_code) = lower($2)
     FOR UPDATE`,
    [input.organizationId, requiredText(input.assetCode, "Unit ID")]
  )
  const asset = result.rows[0]
  if (!asset) throw new Error("Unit ID was not found.")
  const reservation = await client.query(
    `SELECT 1 FROM store.requisitions
     WHERE requested_asset_id = $1
       AND status IN ('Pending', 'Partially Issued') LIMIT 1`,
    [asset.id]
  )
  if (reservation.rows[0]) {
    throw new Error("This Unit ID is reserved for an open Store request.")
  }
  if (asset.accountId !== input.store.id) {
    throw new Error("This Unit ID is accountable to another Store.")
  }
  if (asset.status === "SCRAPPED" || asset.status === "LOST") {
    throw new Error("A scrapped or lost Unit ID cannot be moved.")
  }
  if (!input.gaugeSetMovementId) {
    const grouped = await client.query(
      `SELECT 1 FROM store.gauge_set_memberships member
       JOIN store.gauge_sets gauge_set ON gauge_set.id = member.gauge_set_id
       WHERE member.organization_id = $1 AND member.asset_id = $2
         AND member.removed_at IS NULL AND gauge_set.active LIMIT 1`,
      [input.organizationId, asset.id]
    )
    if (grouped.rows[0]) {
      throw new Error("Move this Unit ID with its gauge set.")
    }
  }
  const hold = await client.query(
    `SELECT 1 FROM store.repair_purchase_order_items repair
     JOIN store.purchase_orders purchase_order
       ON purchase_order.id = repair.purchase_order_id
     WHERE repair.organization_id = $1 AND repair.asset_id = $2
       AND repair.status = 'Open' AND purchase_order.status = 'Open'
     UNION ALL
     SELECT 1 FROM store.calibration_visits visit
     WHERE visit.organization_id = $1 AND visit.asset_id = $2
       AND (visit.status IN ('DISPATCHED', 'RETURNED')
         OR (visit.status = 'FAILED' AND NOT EXISTS (
           SELECT 1 FROM store.calibration_visits later
           WHERE later.schedule_id = visit.schedule_id
             AND later.asset_id = visit.asset_id
             AND later.status = 'PASSED'
             AND (later.created_at, later.id) >
               (visit.created_at, visit.id)
         )))
     LIMIT 1`,
    [input.organizationId, asset.id]
  )
  if (hold.rows[0]) {
    throw new Error("Complete the open service visit before moving this Unit ID.")
  }
  const destination = await resolveDestination(client, {
    holderReference: input.holderReference,
    holderType: input.holderType,
    organizationId: input.organizationId,
    storeId: input.store.id,
    vendorId: input.vendorId,
  })
  if (
    asset.currentHolderType === input.holderType &&
    asset.currentHolderReference === destination.holderReference &&
    asset.currentLocationId === destination.locationId
  ) {
    throw new Error("The Unit ID is already at that destination.")
  }
  const unavailableStatus = ["BROKEN", "UNDER_MAINTENANCE"].includes(asset.status)
    ? asset.status
    : null
  await client.query(
    `UPDATE store.assets SET
       status = CASE WHEN $1::text IS NOT NULL THEN $1
         WHEN $2 = 'STORE' THEN 'AVAILABLE' ELSE 'ASSIGNED' END,
       current_holder_type = $2, current_holder_reference = $3,
       current_holder_name = $4, current_location_id = $5,
       current_machine_id = $6, current_vendor_id = $7,
       current_supplier_id = NULL,
       updated_at = now(), updated_by_user_id = $8
     WHERE id = $9`,
    [unavailableStatus, input.holderType, destination.holderReference,
      destination.holderName, destination.locationId,
      destination.machineId, destination.vendorId,
      input.actorUserId ?? null, asset.id]
  )
  await client.query(
    `INSERT INTO store.stock_movements (
       organization_id, item_type_id, asset_id, location_id,
       movement_type, quantity, from_holder_type,
       from_holder_reference, from_holder_name, to_holder_type,
       to_holder_reference, to_holder_name, moved_by, remark,
       created_by_user_id, gauge_set_movement_id
     ) VALUES ($1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [input.organizationId, asset.itemTypeId, asset.id,
      asset.currentLocationId ?? input.store.defaultLocationId,
      input.holderType === "STORE" ? "RETURN" : "TRANSFER_OUT",
      input.holderType === "STORE" ? 1 : -1,
      asset.currentHolderType, asset.currentHolderReference,
      asset.currentHolderName, input.holderType,
      destination.holderReference, destination.holderName,
      input.movedBy?.trim() || null, input.remark?.trim() || null,
      input.actorUserId ?? null, input.gaugeSetMovementId ?? null]
  )
  await assertToolingTransferAvailable(client, input.organizationId, input.assetCode)
  return asset.id
}

export async function recordAssetLossInTransaction(
  client: PoolClient,
  input: MutationIdentity & { assetCode: string; storeCode?: string; allowOccupiedToolingLoss?: boolean }
) {
  const assetCode = requiredText(input.assetCode, "Unit ID")
  const remark = requiredText(input.remark, "Loss details")
  await lockToolingAllocation(client, input.organizationId)
  const result = await client.query<{
    assetName: string
    currentHolderName: string | null
    currentHolderReference: string | null
    currentHolderType: string
    currentLocationId: string | null
    defaultLocationId: string
    id: string
    itemTypeId: string
    status: string
    storeCode: string
    typeCode: string
  }>(
    `SELECT asset.id, asset.item_type_id AS "itemTypeId", asset.status,
       asset.current_holder_type AS "currentHolderType",
       asset.current_holder_reference AS "currentHolderReference",
       asset.current_holder_name AS "currentHolderName",
       asset.current_location_id AS "currentLocationId",
       accountable.code AS "storeCode",
       accountable.default_location_id AS "defaultLocationId",
       item.type_code AS "typeCode", item.asset_name AS "assetName"
     FROM store.assets asset
     JOIN store.accountable_stores accountable
       ON accountable.id = asset.accountable_store_id
       AND accountable.organization_id = asset.organization_id AND accountable.active
     JOIN store.locations default_location
       ON default_location.id = accountable.default_location_id
       AND default_location.organization_id = accountable.organization_id
       AND default_location.accountable_store_id = accountable.id
       AND default_location.location_type = 'STORE' AND default_location.active
     JOIN store.item_types item ON item.id = asset.item_type_id
     WHERE asset.organization_id = $1 AND lower(asset.asset_code) = lower($2)
     FOR UPDATE OF asset`,
    [input.organizationId, assetCode]
  )
  const unit = result.rows[0]
  if (!unit || (input.storeCode && unit.storeCode.toLowerCase() !== input.storeCode.toLowerCase())) {
    throw new Error("Unit ID is not accountable to this Store.")
  }
  if (unit.status === "SCRAPPED" || unit.status === "LOST") {
    throw new Error("This Unit ID has already left company stock.")
  }
  const hold = await client.query(
    `SELECT 1 FROM store.gauge_set_memberships member
     JOIN store.gauge_sets gauge_set ON gauge_set.id = member.gauge_set_id
     WHERE member.organization_id = $1 AND member.asset_id = $2
       AND member.removed_at IS NULL AND gauge_set.active
     UNION ALL
     SELECT 1 FROM store.repair_purchase_order_items repair
     JOIN store.purchase_orders purchase_order
       ON purchase_order.id = repair.purchase_order_id
     WHERE repair.organization_id = $1 AND repair.asset_id = $2
       AND repair.status = 'Open' AND purchase_order.status = 'Open'
     UNION ALL
     SELECT 1 FROM store.calibration_visits visit
     WHERE visit.organization_id = $1 AND visit.asset_id = $2
       AND visit.status IN ('OPEN', 'DISPATCHED', 'RETURNED')
     UNION ALL
     SELECT 1 FROM store.asset_breakdowns breakdown
     WHERE breakdown.organization_id = $1 AND breakdown.asset_id = $2
       AND breakdown.status = 'In Progress'
     LIMIT 1`,
    [input.organizationId, unit.id]
  )
  if (hold.rows[0]) {
    throw new Error("Finish the active set, service, or breakdown before recording loss.")
  }
  await client.query(
    `UPDATE store.assets SET status = 'LOST', current_machine_id = NULL,
       updated_at = now(), updated_by_user_id = $2 WHERE id = $1`,
    [unit.id, input.actorUserId ?? null]
  )
  await client.query(
    `INSERT INTO store.stock_movements (
       organization_id, item_type_id, asset_id, location_id,
       movement_type, quantity, from_holder_type,
       from_holder_reference, from_holder_name, moved_by, remark,
       created_by_user_id
     ) VALUES ($1, $2, $3, $4, 'LOSS', -1, $5, $6, $7, $8, $9, $10)`,
    [input.organizationId, unit.itemTypeId, unit.id,
      unit.currentLocationId ?? unit.defaultLocationId,
      unit.currentHolderType, unit.currentHolderReference,
      unit.currentHolderName, input.movedBy?.trim() || null,
      remark, input.actorUserId ?? null]
  )
  if (!input.allowOccupiedToolingLoss) {
    await assertToolingTransferAvailable(client, input.organizationId, assetCode)
  }
  return { assetCode, assetName: unit.assetName, typeCode: unit.typeCode }
}

export function createDepartmentStoreRepository(options: RepositoryPoolOptions) {
  const { close, pool } = repositoryPool(options)

  return {
    close,
    async getStoreByCode(organizationId: string, storeCode: string) {
      const client = await pool.connect()
      try {
        return await findStore(client, organizationId, storeCode)
      } finally {
        client.release()
      }
    },

    async getAssetAccountability(organizationId: string, assetCode: string) {
      const result = await pool.query<{
        accountableStoreCode: string
        accountableStoreId: string
        accountableStoreName: string
        assetId: string
      }>(
        `SELECT asset.id AS "assetId",
          accountable.id AS "accountableStoreId",
          accountable.code AS "accountableStoreCode",
          accountable.name AS "accountableStoreName"
         FROM store.assets asset
         JOIN store.accountable_stores accountable
           ON accountable.id = asset.accountable_store_id
         WHERE asset.organization_id = $1
           AND lower(asset.asset_code) = lower($2)`,
        [organizationId, requiredText(assetCode, "Unit ID")]
      )
      return result.rows[0] ?? null
    },

    async listAssetAccountabilityTransfers(input: {
      assetCode: string
      organizationId: string
    }) {
      const result = await pool.query<{
        fromStore: string
        remark: string | null
        toStore: string
        transferredAt: string
        transferredBy: string | null
      }>(
        `SELECT source.name AS "fromStore", destination.name AS "toStore",
          transfer.transferred_at::text AS "transferredAt",
          transfer.transferred_by AS "transferredBy", transfer.remark
         FROM store.asset_accountability_transfers transfer
         JOIN store.assets asset ON asset.id = transfer.asset_id
         JOIN store.accountable_stores source
           ON source.id = transfer.source_store_id
         JOIN store.accountable_stores destination
           ON destination.id = transfer.destination_store_id
         WHERE transfer.organization_id = $1
           AND lower(asset.asset_code) = lower($2)
         ORDER BY transfer.transferred_at DESC, transfer.id DESC`,
        [input.organizationId, requiredText(input.assetCode, "Unit ID")]
      )
      return result.rows
    },

    async listStoreWorkspace(input: {
      organizationId: string
      storeCode: string
    }) {
      const storeResult = await pool.query<AccountableStore>(
        `SELECT accountable.id, accountable.code, accountable.name,
          accountable.kind,
          accountable.production_floor_code AS "productionFloorCode",
          accountable.default_location_id AS "defaultLocationId"
         FROM store.accountable_stores accountable
         JOIN store.locations location
           ON location.id = accountable.default_location_id
           AND location.organization_id = accountable.organization_id
           AND location.accountable_store_id = accountable.id
           AND location.location_type = 'STORE' AND location.active
         WHERE accountable.organization_id = $1
           AND lower(accountable.code) = lower($2) AND accountable.active`,
        [input.organizationId, input.storeCode]
      )
      const store = storeResult.rows[0]
      if (!store) throw new Error("Accountable Store was not found.")
      const [stores, consumables, serializedTotals, assets, gaugeSets, movements] =
        await Promise.all([
        pool.query<AccountableStore>(
          `SELECT accountable.id, accountable.code, accountable.name,
            accountable.kind,
            accountable.production_floor_code AS "productionFloorCode",
            accountable.default_location_id AS "defaultLocationId"
           FROM store.accountable_stores accountable
           JOIN store.locations location
             ON location.id = accountable.default_location_id
             AND location.organization_id = accountable.organization_id
             AND location.accountable_store_id = accountable.id
             AND location.location_type = 'STORE' AND location.active
           WHERE accountable.organization_id = $1 AND accountable.active
           ORDER BY accountable.kind, accountable.name`,
          [input.organizationId]
        ),
        pool.query<{
          assetCategory: string
          assetName: string
          assetSubcategory: string
          availableQuantity: string
          companyQuantity: string
          itemTypeId: string
          makeModel: string
          typeCode: string
          unit: string
        }>(
          `SELECT item.id AS "itemTypeId", item.type_code AS "typeCode",
            item.asset_category AS "assetCategory",
            item.asset_subcategory AS "assetSubcategory",
            item.asset_name AS "assetName", make_model.name AS "makeModel",
            item.unit,
            trim_scale(COALESCE(sum(movement.quantity) FILTER (
              WHERE location.accountable_store_id = $2), 0))::text
              AS "availableQuantity",
            trim_scale(COALESCE(sum(movement.quantity), 0))::text
              AS "companyQuantity"
           FROM store.item_types item
           JOIN store.make_models make_model ON make_model.id = item.make_model_id
           LEFT JOIN store.stock_movements movement
             ON movement.organization_id = item.organization_id
             AND movement.item_type_id = item.id
             AND movement.asset_id IS NULL
           LEFT JOIN store.locations location ON location.id = movement.location_id
           WHERE item.organization_id = $1
             AND item.tracking_mode = 'CONSUMABLE' AND item.active
           GROUP BY item.id, make_model.name
           ORDER BY item.type_code`,
          [input.organizationId, store.id]
        ),
        pool.query<{
          accountableQuantity: string
          assetName: string
          availableQuantity: string
          companyQuantity: string
          itemTypeId: string
          typeCode: string
        }>(
          `SELECT item.id AS "itemTypeId", item.type_code AS "typeCode",
            item.asset_name AS "assetName",
            count(asset.id) FILTER (
              WHERE asset.status NOT IN ('SCRAPPED', 'LOST'))::text AS "companyQuantity",
            count(asset.id) FILTER (
              WHERE asset.accountable_store_id = $2
                AND asset.status NOT IN ('SCRAPPED', 'LOST'))::text AS "accountableQuantity",
            count(asset.id) FILTER (
              WHERE asset.accountable_store_id = $2
                AND asset.status = 'AVAILABLE'
                AND asset.current_holder_type = 'STORE'
                AND location.accountable_store_id = $2
                AND location.location_type = 'STORE' AND location.active)::text
              AS "availableQuantity"
           FROM store.item_types item
           LEFT JOIN store.assets asset ON asset.item_type_id = item.id
             AND asset.organization_id = item.organization_id
           LEFT JOIN store.locations location
             ON location.id = asset.current_location_id
           WHERE item.organization_id = $1
             AND item.tracking_mode = 'SERIALIZED' AND item.active
           GROUP BY item.id ORDER BY item.type_code`,
          [input.organizationId, store.id]
        ),
        pool.query<{
          accountableStoreCode: string
          assetCode: string
          assetCategory: string
          assetName: string
          assetSubcategory: string
          availableHere: boolean
          holderName: string | null
          holderType: string
          inGaugeSet: boolean
          isGauge: boolean
          itemTypeId: string
          makeModel: string
          manufacturerSerialNumber: string | null
          status: string
          typeCode: string
        }>(
          `SELECT asset.asset_code AS "assetCode", asset.item_type_id AS "itemTypeId",
            item.type_code AS "typeCode",
            item.asset_category AS "assetCategory",
            item.asset_subcategory AS "assetSubcategory",
            item.asset_name AS "assetName", make_model.name AS "makeModel",
            asset.status, asset.current_holder_type AS "holderType",
            asset.current_holder_name AS "holderName",
            COALESCE(asset.status = 'AVAILABLE' AND asset.current_holder_type = 'STORE'
              AND location.accountable_store_id = $2 AND location.active, false) AS "availableHere",
            asset.manufacturer_serial_number AS "manufacturerSerialNumber",
            (lower(concat_ws(' ', item.asset_category,
              item.asset_subcategory, item.asset_name)) LIKE '%gauge%') AS "isGauge",
            EXISTS (
              SELECT 1 FROM store.gauge_set_memberships member
              WHERE member.asset_id = asset.id AND member.removed_at IS NULL
            ) AS "inGaugeSet",
            accountable.code AS "accountableStoreCode"
           FROM store.assets asset
           JOIN store.item_types item ON item.id = asset.item_type_id
           JOIN store.make_models make_model ON make_model.id = item.make_model_id
           JOIN store.accountable_stores accountable
             ON accountable.id = asset.accountable_store_id
           LEFT JOIN store.locations location ON location.id = asset.current_location_id
           WHERE asset.organization_id = $1 AND asset.accountable_store_id = $2
           ORDER BY asset.asset_code`,
          [input.organizationId, store.id]
        ),
        pool.query<{
          assetCodes: string[]
          id: string
          name: string
          setCode: string
          status: "COMPLETE" | "INCOMPLETE"
        }>(
          `SELECT gauge_set.id, gauge_set.name,
            gauge_set.set_code AS "setCode",
            array_agg(asset.asset_code ORDER BY asset.asset_code) AS "assetCodes",
            CASE WHEN count(*) = 2
              AND bool_and(asset.accountable_store_id = gauge_set.accountable_store_id)
              AND bool_and(asset.status IN ('AVAILABLE', 'ASSIGNED'))
              AND bool_and(NOT EXISTS (
                SELECT 1 FROM store.calibration_visits visit
                WHERE visit.asset_id = asset.id AND visit.status = 'FAILED'
                  AND NOT EXISTS (
                    SELECT 1 FROM store.calibration_visits later
                    WHERE later.schedule_id = visit.schedule_id
                      AND later.asset_id = asset.id AND later.status = 'PASSED'
                      AND (later.created_at, later.id) >
                        (visit.created_at, visit.id)
                  )
              ))
              AND count(DISTINCT (asset.current_holder_type,
                asset.current_holder_reference, asset.current_location_id)) = 1
              THEN 'COMPLETE' ELSE 'INCOMPLETE' END AS status
           FROM store.gauge_sets gauge_set
           JOIN store.gauge_set_memberships member
             ON member.gauge_set_id = gauge_set.id AND member.removed_at IS NULL
           JOIN store.assets asset ON asset.id = member.asset_id
           WHERE gauge_set.organization_id = $1
             AND gauge_set.accountable_store_id = $2 AND gauge_set.active
           GROUP BY gauge_set.id ORDER BY gauge_set.set_code`,
          [input.organizationId, store.id]
        ),
        pool.query<{
          from: string | null
          kind: string
          occurredAt: string
          performedBy: string | null
          quantity: string
          remark: string | null
          subjectCode: string
          to: string | null
          typeCode: string
          unitId: string | null
        }>(
          `SELECT movement.moved_at::text AS "occurredAt",
            COALESCE(asset.asset_code, item.type_code) AS "subjectCode",
            item.type_code AS "typeCode", asset.asset_code AS "unitId",
            trim_scale(movement.quantity)::text AS quantity,
            concat_ws(' / ', movement.from_holder_type,
              movement.from_holder_name) AS "from",
            concat_ws(' / ', movement.to_holder_type,
              movement.to_holder_name) AS "to",
            movement.movement_type AS kind,
            movement.moved_by AS "performedBy", movement.remark
           FROM store.stock_movements movement
           JOIN store.locations location ON location.id = movement.location_id
           JOIN store.item_types item ON item.id = movement.item_type_id
           LEFT JOIN store.assets asset ON asset.id = movement.asset_id
           WHERE movement.organization_id = $1
             AND movement.department_stock_operation_id IS NULL
             AND (location.accountable_store_id = $2
               OR asset.accountable_store_id = $2)
           UNION ALL
           SELECT operation.created_at::text, item.type_code,
             item.type_code, NULL::text,
             trim_scale(operation.quantity)::text,
             source.name, destination.name, operation.operation_type,
             movement.moved_by, operation.remark
           FROM store.department_stock_operations operation
           JOIN store.item_types item ON item.id = operation.item_type_id
           JOIN store.accountable_stores source
             ON source.id = operation.source_store_id
           LEFT JOIN store.accountable_stores destination
             ON destination.id = operation.destination_store_id
           LEFT JOIN LATERAL (
             SELECT moved_by FROM store.stock_movements
             WHERE department_stock_operation_id = operation.id
             ORDER BY moved_at LIMIT 1
           ) movement ON true
           WHERE operation.organization_id = $1
             AND (operation.source_store_id = $2
               OR operation.destination_store_id = $2)
           UNION ALL
           SELECT transfer.transferred_at::text, asset.asset_code,
             item.type_code, asset.asset_code, '1',
             source.name, destination.name, 'ACCOUNTABILITY_TRANSFER',
             transfer.transferred_by, transfer.remark
           FROM store.asset_accountability_transfers transfer
           JOIN store.assets asset ON asset.id = transfer.asset_id
           JOIN store.item_types item ON item.id = asset.item_type_id
           JOIN store.accountable_stores source
             ON source.id = transfer.source_store_id
           JOIN store.accountable_stores destination
             ON destination.id = transfer.destination_store_id
           WHERE transfer.organization_id = $1
             AND (transfer.source_store_id = $2
               OR transfer.destination_store_id = $2)
           ORDER BY "occurredAt" DESC LIMIT 300`,
          [input.organizationId, store.id]
        ),
      ])
      return {
        store,
        stores: stores.rows,
        consumables: consumables.rows,
        serializedTotals: serializedTotals.rows,
        assets: assets.rows,
        gaugeSets: gaugeSets.rows,
        movements: movements.rows,
      }
    },

    async listCompanyMovements(input: {
      organizationId: string
      code?: string
      page?: number
    }) {
      const page = Math.max(1, Math.trunc(input.page ?? 1))
      const pageSize = 100
      const result = await pool.query<{
        from: string | null
        kind: string
        occurredAt: string
        performedBy: string | null
        quantity: string
        remark: string | null
        storeName: string
        subjectCode: string
        to: string | null
        typeCode: string
        unitId: string | null
        usedOn: string | null
      }>(
        `WITH events AS (
           SELECT movement.id, movement.moved_at AS occurred_at,
             COALESCE(asset.asset_code, item.type_code) AS subject_code,
             item.type_code, asset.asset_code AS unit_id,
             CASE WHEN movement.asset_id IS NULL
               THEN CASE WHEN movement.quantity > 0 THEN '+' ELSE '' END ||
                 trim_scale(movement.quantity)::text
               ELSE '1' END AS quantity,
             concat_ws(' / ', movement.from_holder_type,
               movement.from_holder_name) AS from_holder,
             concat_ws(' / ', movement.to_holder_type,
               movement.to_holder_name) AS to_holder,
             CASE WHEN operation.operation_type = 'CONSUMPTION'
               THEN 'CONSUMPTION' ELSE movement.movement_type END AS kind,
             movement.moved_by AS performed_by, movement.remark,
             accountable.name AS store_name,
             CASE WHEN operation.operation_type = 'CONSUMPTION'
               THEN operation.operated_on::text ELSE NULL END AS used_on
           FROM store.stock_movements movement
           JOIN store.locations location ON location.id = movement.location_id
           JOIN store.accountable_stores accountable
             ON accountable.id = location.accountable_store_id
           JOIN store.item_types item ON item.id = movement.item_type_id
           LEFT JOIN store.assets asset ON asset.id = movement.asset_id
           LEFT JOIN store.department_stock_operations operation
             ON operation.id = movement.department_stock_operation_id
           WHERE movement.organization_id = $1
           UNION ALL
           SELECT transfer.id, transfer.transferred_at,
             asset.asset_code, item.type_code, asset.asset_code, '1',
             source.name, destination.name, 'ACCOUNTABILITY_TRANSFER',
             transfer.transferred_by, transfer.remark, source.name, NULL::text
           FROM store.asset_accountability_transfers transfer
           JOIN store.assets asset ON asset.id = transfer.asset_id
           JOIN store.item_types item ON item.id = asset.item_type_id
           JOIN store.accountable_stores source
             ON source.id = transfer.source_store_id
           JOIN store.accountable_stores destination
             ON destination.id = transfer.destination_store_id
           WHERE transfer.organization_id = $1
         )
         SELECT occurred_at::text AS "occurredAt",
           subject_code AS "subjectCode", type_code AS "typeCode",
           unit_id AS "unitId", quantity,
           from_holder AS "from", to_holder AS "to", kind,
           performed_by AS "performedBy", remark,
           store_name AS "storeName", used_on AS "usedOn"
         FROM events
         WHERE $2::text IS NULL
           OR lower(subject_code) = lower($2)
           OR lower(type_code) = lower($2)
         ORDER BY occurred_at DESC, id DESC
         LIMIT $3 OFFSET $4`,
        [input.organizationId, input.code?.trim() || null,
          pageSize + 1, (page - 1) * pageSize]
      )
      return {
        movements: result.rows.slice(0, pageSize),
        hasMore: result.rows.length > pageSize,
      }
    },

    async listDepartmentAllocations(input: {
      organizationId: string
      productionFloorCode: string
    }) {
      const result = await pool.query<{
        accountableStoreCode: string
        accountableStoreName: string
        assetCode: string
        assetCategory: string
        assetName: string
        assetSubcategory: string
        departmentName: string
        holderReference: string | null
        makeModel: string
        status: string
        typeCode: string
      }>(
        `SELECT asset.asset_code AS "assetCode", item.type_code AS "typeCode",
           item.asset_category AS "assetCategory",
           item.asset_subcategory AS "assetSubcategory",
           item.asset_name AS "assetName", make_model.name AS "makeModel",
           asset.current_holder_reference AS "holderReference",
           COALESCE(asset.current_holder_name, asset.current_holder_reference, 'Unknown')
             AS "departmentName",
           accountable.code AS "accountableStoreCode",
           accountable.name AS "accountableStoreName", asset.status
         FROM store.assets asset
         JOIN store.item_types item ON item.id = asset.item_type_id
         JOIN store.make_models make_model ON make_model.id = item.make_model_id
         JOIN store.accountable_stores accountable
           ON accountable.id = asset.accountable_store_id
         WHERE asset.organization_id = $1
           AND asset.current_holder_type = 'DEPARTMENT'
           AND asset.status NOT IN ('SCRAPPED', 'LOST')
         ORDER BY "departmentName", asset.asset_code`,
        [input.organizationId]
      )
      // Store issues may record a Department name; direct moves record its code.
      return result.rows.filter((asset) => productionFloorFromDepartment(
        asset.departmentName, asset.holderReference
      ) === input.productionFloorCode)
    },

    async transferQuantity(input: MutationIdentity & {
      destinationStoreCode: string
      itemTypeId: string
      quantity: number
      sourceStoreCode: string
    }) {
      const quantity = positiveQuantity(input.quantity)
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
        const request = await storeTransferRequest(client, input)
        if (request && (input.sourceStoreCode !== "MAIN" ||
          request.trackingMode !== "CONSUMABLE" ||
          request.itemTypeId !== input.itemTypeId)) {
          throw new Error("This request is not for the selected consumable and source Store.")
        }
        if (request && quantity > Number(request.requestedQuantity) - Number(request.issuedQuantity) + 1e-8) {
          throw new Error("Transfer quantity exceeds the request remainder.")
        }
        const source = await findStore(client, input.organizationId, input.sourceStoreCode)
        const destination = await findStore(
          client, input.organizationId, input.destinationStoreCode
        )
        if (source.id === destination.id) {
          throw new Error("Choose a different destination Store.")
        }
        if (source.kind !== "MAIN" && destination.kind !== "MAIN") {
          throw new Error("Transfer through Main Store before sending stock to another Store.")
        }
        await lockConsumable(client, input.organizationId, input.itemTypeId)
        const operationId = await insertOperation(client, {
          ...input,
          destinationStoreId: destination.id,
          operationType: "TRANSFER",
          quantity,
          sourceStoreId: source.id,
        })
        await writeDebits(client, {
          ...input, itemTypeId: input.itemTypeId,
          movementType: "TRANSFER_OUT", operationId, quantity,
          sourceStore: source, toStore: destination,
        })
        await insertQuantityMovement(client, {
          ...input,
          fromCode: source.code,
          fromName: source.name,
          itemTypeId: input.itemTypeId,
          locationId: destination.defaultLocationId,
          movementType: "TRANSFER_IN",
          operationId,
          quantity,
          toCode: destination.code,
          toName: destination.name,
        })
        if (request) {
          await completeStoreTransferRequest(client, input, quantity, request)
          await queueDashboardRefresh(client, input.organizationId)
        }
        return { operationId }
      })
    },

    async consumeQuantities(input: MutationIdentity & {
      consumedOn: string
      items: Array<{ itemTypeId: string; quantity: number }>
      storeCode: string
    }) {
      if (!input.items.length || new Set(input.items.map((item) => item.itemTypeId)).size !== input.items.length) {
        throw new Error("Select one or more distinct consumable Asset Codes.")
      }
      return withTransaction(pool, async (client) => {
        const store = await findStore(client, input.organizationId, input.storeCode)
        const operationIds: string[] = []
        for (const item of input.items) {
          const quantity = positiveQuantity(item.quantity)
          await lockConsumable(client, input.organizationId, item.itemTypeId)
          const operationId = await insertOperation(client, {
            ...input,
            itemTypeId: item.itemTypeId,
            operatedOn: input.consumedOn,
            operationType: "CONSUMPTION",
            quantity,
            sourceStoreId: store.id,
          })
          await writeDebits(client, {
            ...input, itemTypeId: item.itemTypeId,
            movementType: "ISSUE", operationId, quantity,
            sourceStore: store,
          })
          operationIds.push(operationId)
        }
        return { operationIds }
      })
    },

    async recordAssetLoss(input: MutationIdentity & {
      assetCode: string
      storeCode: string
    }) {
      return withTransaction(pool, async (client) => {
        const { assetCode } = await recordAssetLossInTransaction(client, input)
        await queueDashboardRefresh(client, input.organizationId)
        return { assetCode }
      })
    },

    async transferAssetAccountability(input: MutationIdentity & {
      assetCode: string
      destinationStoreCode: string
      sourceStoreCode: string
    }, transactionClient?: PoolClient) {
      const transfer = async (client: PoolClient) => {
        await lockToolingAllocation(client, input.organizationId)
        const request = await storeTransferRequest(client, input)
        if (request && (input.sourceStoreCode !== "MAIN" ||
          request.trackingMode !== "SERIALIZED")) {
          throw new Error("This request is not for a Main Store Unit ID.")
        }
        const asset = await client.query<{
          accountableStoreId: string
          currentHolderName: string | null
          currentHolderReference: string | null
          currentHolderType: string
          currentLocationId: string | null
          id: string
          itemTypeId: string
          status: string
        }>(
          `SELECT id, item_type_id AS "itemTypeId", status,
            accountable_store_id AS "accountableStoreId",
            current_holder_type AS "currentHolderType",
            current_holder_reference AS "currentHolderReference",
            current_holder_name AS "currentHolderName",
            current_location_id AS "currentLocationId"
           FROM store.assets
           WHERE organization_id = $1 AND lower(asset_code) = lower($2)
           FOR UPDATE`,
          [input.organizationId, requiredText(input.assetCode, "Unit ID")]
        )
        const unit = asset.rows[0]
        if (!unit) throw new Error("Unit ID was not found.")
        const reservedByAnotherRequest = await client.query(
          `SELECT 1 FROM store.requisitions
           WHERE requested_asset_id = $1
             AND status IN ('Pending', 'Partially Issued')
             AND id IS DISTINCT FROM $2::uuid LIMIT 1`,
          [unit.id, input.requisitionId ?? null]
        )
        if (reservedByAnotherRequest.rows[0]) {
          throw new Error("This Unit ID is reserved for another open Store request.")
        }
        if (request && (request.requestedAssetId !== unit.id ||
          request.itemTypeId !== unit.itemTypeId ||
          Number(request.requestedQuantity) - Number(request.issuedQuantity) !== 1)) {
          throw new Error("Transfer the exact Unit ID named in the request.")
        }
        if (unit.status === "SCRAPPED" || unit.status === "LOST") {
          throw new Error("A scrapped or lost Unit ID cannot change accountable Store.")
        }
        const source = await findStore(client, input.organizationId, input.sourceStoreCode)
        const destination = await findStore(
          client, input.organizationId, input.destinationStoreCode
        )
        if (source.id !== unit.accountableStoreId) {
          throw new Error("This Unit ID is accountable to another Store.")
        }
        if (source.id === destination.id) {
          throw new Error("Choose a different destination Store.")
        }
        if (source.kind !== "MAIN" && destination.kind !== "MAIN") {
          throw new Error("Transfer through Main Store before assigning this Unit ID to another Store.")
        }
        const grouped = await client.query(
          `SELECT 1 FROM store.gauge_set_memberships member
           JOIN store.gauge_sets gauge_set ON gauge_set.id = member.gauge_set_id
           WHERE member.organization_id = $1 AND member.asset_id = $2
             AND member.removed_at IS NULL AND gauge_set.active LIMIT 1`,
          [input.organizationId, unit.id]
        )
        if (grouped.rows[0]) {
          throw new Error("Remove this Unit ID from its gauge set before transferring accountability.")
        }
        const openService = await client.query(
          `SELECT 1 FROM store.repair_purchase_order_items repair
           JOIN store.purchase_orders purchase_order
             ON purchase_order.id = repair.purchase_order_id
           WHERE repair.organization_id = $1 AND repair.asset_id = $2
             AND repair.status = 'Open' AND purchase_order.status = 'Open'
           UNION ALL
           SELECT 1 FROM store.calibration_visits visit
           WHERE visit.organization_id = $1 AND visit.asset_id = $2
             AND visit.status IN ('OPEN', 'DISPATCHED', 'RETURNED')
           LIMIT 1`,
          [input.organizationId, unit.id]
        )
        if (openService.rows[0]) {
          throw new Error("Finish the open repair or calibration visit before transferring accountability.")
        }
        await client.query(
          `INSERT INTO store.asset_accountability_transfers (
             organization_id, asset_id, source_store_id,
             destination_store_id, transferred_by, remark, created_by_user_id,
             requisition_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [input.organizationId, unit.id, source.id, destination.id,
            input.movedBy?.trim() || null, input.remark?.trim() || null,
            input.actorUserId ?? null, input.requisitionId ?? null]
        )
        // A machine or department can keep using the unit while custody changes.
        // Only a unit physically in the source Store needs a physical handover.
        const physicalHandover = unit.currentHolderType === "STORE"
        if (physicalHandover && unit.currentLocationId) {
          const sourceLocation = await client.query(
            `SELECT 1 FROM store.locations WHERE organization_id = $1
               AND id = $2 AND accountable_store_id = $3`,
            [input.organizationId, unit.currentLocationId, source.id]
          )
          if (!sourceLocation.rows[0]) {
            throw new Error("Unit ID is not physically in its accountable Store.")
          }
        }
        const destinationLocation = physicalHandover
          ? await client.query<{ code: string; name: string }>(
            `SELECT code, name FROM store.locations
             WHERE organization_id = $1 AND id = $2
               AND accountable_store_id = $3 AND active`,
            [input.organizationId, destination.defaultLocationId, destination.id]
          )
          : null
        if (physicalHandover && !destinationLocation?.rows[0]) {
          throw new Error("Destination Store location was not found.")
        }
        await client.query(
          `UPDATE store.assets SET accountable_store_id = $1,
            current_location_id = CASE WHEN $2 THEN $3 ELSE current_location_id END,
            current_holder_type = CASE WHEN $2 THEN 'STORE' ELSE current_holder_type END,
            current_holder_reference = CASE WHEN $2 THEN $4 ELSE current_holder_reference END,
            current_holder_name = CASE WHEN $2 THEN $5 ELSE current_holder_name END,
            updated_at = now(), updated_by_user_id = $6
           WHERE id = $7`,
          [destination.id, physicalHandover, destination.defaultLocationId,
            destinationLocation?.rows[0]?.code ?? null,
            destinationLocation?.rows[0]?.name ?? null,
            input.actorUserId ?? null,
            unit.id]
        )
        if (physicalHandover) {
          for (const movement of [
            { locationId: unit.currentLocationId ?? source.defaultLocationId,
              movementType: "TRANSFER_OUT", quantity: -1 },
            { locationId: destination.defaultLocationId,
              movementType: "TRANSFER_IN", quantity: 1 },
          ]) {
            await client.query(
              `INSERT INTO store.stock_movements (
                 organization_id, item_type_id, asset_id, location_id,
                 movement_type, quantity, from_holder_type,
                 from_holder_reference, from_holder_name, to_holder_type,
                 to_holder_reference, to_holder_name, moved_by, remark,
                 created_by_user_id, requisition_id
               ) VALUES ($1, $2, $3, $4, $5, $6, 'STORE', $7, $8,
                 'STORE', $9, $10, $11, $12, $13, $14)`,
              [input.organizationId, unit.itemTypeId, unit.id,
                movement.locationId, movement.movementType, movement.quantity,
                unit.currentHolderReference, unit.currentHolderName,
                destinationLocation?.rows[0]?.code,
                destinationLocation?.rows[0]?.name,
                input.movedBy?.trim() || null, input.remark?.trim() || null,
                input.actorUserId ?? null, input.requisitionId ?? null]
            )
          }
        }
        await assertToolingTransferAvailable(client, input.organizationId, input.assetCode)
        if (request) {
          await completeStoreTransferRequest(client, input, 1, request)
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { assetCode: input.assetCode, destinationStoreCode: destination.code }
      }
      return transactionClient ? transfer(transactionClient) : withTransaction(pool, transfer)
    },

    async transferRequestedAssetsBatch(input: MutationIdentity & {
      destinationStoreCode: string
      lines: Array<{ assetCode: string; requisitionId: string }>
    }) {
      if (!input.lines.length || input.lines.length > 500) {
        throw new Error("Select 1 to 500 requested physical units.")
      }
      const requestIds = input.lines.map((line) => requiredText(line.requisitionId, "Request line"))
      const codes = input.lines.map((line) => requiredText(line.assetCode, "Unit ID"))
      if (new Set(requestIds).size !== requestIds.length ||
        new Set(codes.map((code) => code.toLowerCase())).size !== codes.length) {
        throw new Error("Select each request line and physical Unit ID only once.")
      }
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
        const requests = await client.query<{
          headerId: string
          id: string
          itemTypeId: string
          requestedAssetId: string | null
          status: string
        }>(
          `SELECT request.id, request.request_header_id AS "headerId",
             request.item_type_id AS "itemTypeId",
             request.requested_asset_id AS "requestedAssetId", request.status
           FROM store.requisitions request
           JOIN store.requisition_headers header
             ON header.id = request.request_header_id
           JOIN store.item_types item ON item.id = request.item_type_id
           WHERE request.organization_id = $1 AND request.id = ANY($2::uuid[])
             AND header.fulfillment_kind = 'STORE_TRANSFER'
             AND item.tracking_mode = 'SERIALIZED'
           ORDER BY request.id FOR UPDATE OF request`,
          [input.organizationId, requestIds]
        )
        if (requests.rows.length !== requestIds.length ||
          requests.rows.some((request) => request.status !== "Pending" ||
            !request.requestedAssetId ||
            request.headerId !== requests.rows[0]!.headerId)) {
          throw new Error("Select all open physical units from one Store request.")
        }
        const openCount = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM store.requisitions request
           JOIN store.item_types item ON item.id = request.item_type_id
           WHERE request.request_header_id = $1
             AND request.status IN ('Pending', 'Partially Issued')
             AND item.tracking_mode = 'SERIALIZED'`,
          [requests.rows[0]!.headerId]
        )
        if (openCount.rows[0]!.count !== requestIds.length) {
          throw new Error("Confirm every open physical Unit ID on this request together.")
        }
        const assets = await client.query<{
          assetCode: string
          id: string
          itemTypeId: string
        }>(
          `SELECT asset.id, asset.asset_code AS "assetCode",
             asset.item_type_id AS "itemTypeId"
           FROM store.assets asset
           JOIN store.accountable_stores accountable
             ON accountable.id = asset.accountable_store_id
             AND accountable.organization_id = asset.organization_id
             AND accountable.kind = 'MAIN'
           JOIN store.locations location
             ON location.id = asset.current_location_id
             AND location.accountable_store_id = accountable.id
             AND location.location_type = 'STORE' AND location.active
           WHERE asset.organization_id = $1
             AND lower(asset.asset_code) = ANY($2::text[])
             AND asset.status = 'AVAILABLE' AND asset.current_holder_type = 'STORE'
           ORDER BY asset.id FOR UPDATE OF asset`,
          [input.organizationId, codes.map((code) => code.toLowerCase())]
        )
        if (assets.rows.length !== codes.length) {
          throw new Error("A selected Unit ID is no longer available in Main Store.")
        }
        const requestById = new Map(requests.rows.map((request) => [request.id, request]))
        const assetByCode = new Map(assets.rows.map((asset) => [asset.assetCode.toLowerCase(), asset]))
        for (const [index, requestId] of requestIds.entries()) {
          if (requestById.get(requestId)!.itemTypeId !==
            assetByCode.get(codes[index]!.toLowerCase())?.itemTypeId) {
            throw new Error("Select a Unit ID belonging to the requested Asset Code.")
          }
        }
        const heldElsewhere = await client.query(
          `SELECT 1 FROM store.requisitions
           WHERE requested_asset_id = ANY($1::uuid[])
             AND status IN ('Pending', 'Partially Issued')
             AND id <> ALL($2::uuid[]) LIMIT 1`,
          [assets.rows.map((asset) => asset.id), requestIds]
        )
        if (heldElsewhere.rows[0]) {
          throw new Error("A selected Unit ID is reserved for another request.")
        }
        await client.query(
          `UPDATE store.requisitions SET requested_asset_id = NULL
           WHERE id = ANY($1::uuid[])`, [requestIds]
        )
        for (const [index, requestId] of requestIds.entries()) {
          await client.query(
            `UPDATE store.requisitions SET requested_asset_id = $2,
               updated_at = now(), updated_by_user_id = $3 WHERE id = $1`,
            [requestId, assetByCode.get(codes[index]!.toLowerCase())!.id,
              input.actorUserId ?? null]
          )
        }
        for (const [index, requestId] of requestIds.entries()) {
          await this.transferAssetAccountability({
            ...input,
            assetCode: codes[index]!,
            requisitionId: requestId,
            sourceStoreCode: "MAIN",
          }, client)
        }
        return { transferred: requestIds.length }
      })
    },

    async moveAsset(input: MutationIdentity & {
      assetCode: string
      holderReference: string
      holderType: HolderType
      storeCode: string
      vendorId?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
        const store = await findStore(client, input.organizationId, input.storeCode)
        const assetId = await moveOwnedAsset(client, { ...input, store })
        await queueDashboardRefresh(client, input.organizationId)
        return { assetId }
      })
    },

    async createGaugeSet(input: {
      actorUserId?: string | null
      assetCodes: [string, string]
      name: string
      organizationId: string
      storeCode: string
    }) {
      const [first, second] = input.assetCodes.map((code) =>
        requiredText(code, "Gauge Unit ID")
      )
      if (first!.toLowerCase() === second!.toLowerCase()) {
        throw new Error("Choose two different gauge Unit IDs.")
      }
      return withTransaction(pool, async (client) => {
        const store = await findStore(client, input.organizationId, input.storeCode)
        if (store.kind !== "QUALITY") {
          throw new Error("Gauge sets are managed by Quality Store.")
        }
        const gauges = await client.query<{
          assetCode: string
          currentHolderReference: string | null
          currentHolderType: string
          currentLocationId: string | null
          id: string
          status: string
        }>(
          `SELECT asset.id, asset.asset_code AS "assetCode", asset.status,
            asset.current_holder_type AS "currentHolderType",
            asset.current_holder_reference AS "currentHolderReference",
            asset.current_location_id AS "currentLocationId"
           FROM store.assets asset
           JOIN store.item_types item ON item.id = asset.item_type_id
           WHERE asset.organization_id = $1
             AND asset.accountable_store_id = $2
             AND lower(asset.asset_code) IN (lower($3), lower($4))
             AND lower(concat_ws(' ', item.asset_category,
               item.asset_subcategory, item.asset_name)) LIKE '%gauge%'
           ORDER BY asset.id FOR UPDATE OF asset`,
          [input.organizationId, store.id, first, second]
        )
        if (gauges.rows.length !== 2) {
          throw new Error("Choose two gauges accountable to Quality Store.")
        }
        if (gauges.rows.some((gauge) =>
          gauge.status !== "AVAILABLE" ||
          gauge.currentHolderType !== "STORE" ||
          gauge.currentLocationId === null
        )) {
          throw new Error("Both gauges must be available in Quality Store.")
        }
        if (gauges.rows[0]!.currentLocationId !== gauges.rows[1]!.currentLocationId) {
          throw new Error("Both gauges must be at one Quality Store location.")
        }
        const location = await client.query(
          `SELECT 1 FROM store.locations WHERE organization_id = $1
             AND id = $2 AND accountable_store_id = $3 AND active`,
          [input.organizationId, gauges.rows[0]!.currentLocationId, store.id]
        )
        if (!location.rows[0]) {
          throw new Error("Both gauges must be physically in Quality Store.")
        }
        const activeMembership = await client.query(
          `SELECT 1 FROM store.gauge_set_memberships
           WHERE organization_id = $1 AND asset_id = ANY($2::uuid[])
             AND removed_at IS NULL LIMIT 1`,
          [input.organizationId, gauges.rows.map((gauge) => gauge.id)]
        )
        if (activeMembership.rows[0]) {
          throw new Error("One of these gauges is already in an active set.")
        }
        const counter = await client.query<{ current_value: number }>(
          `INSERT INTO store.number_counters (
             organization_id, counter_key, counter_year, current_value
           ) VALUES ($1, 'GAUGE_SET', 0, 1)
           ON CONFLICT (organization_id, counter_key, counter_year)
           DO UPDATE SET current_value = store.number_counters.current_value + 1
           RETURNING current_value`,
          [input.organizationId]
        )
        const setCode = `GS${String(counter.rows[0]!.current_value).padStart(5, "0")}`
        const set = await client.query<{ id: string }>(
          `INSERT INTO store.gauge_sets (
             organization_id, set_code, name, accountable_store_id,
             created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [input.organizationId, setCode, requiredText(input.name, "Set name"),
            store.id, input.actorUserId ?? null]
        )
        for (const gauge of gauges.rows) {
          await client.query(
            `INSERT INTO store.gauge_set_memberships (
               organization_id, gauge_set_id, asset_id, created_by_user_id
             ) VALUES ($1, $2, $3, $4)`,
            [input.organizationId, set.rows[0]!.id, gauge.id,
              input.actorUserId ?? null]
          )
        }
        return { id: set.rows[0]!.id, setCode }
      })
    },

    async moveGaugeSet(input: MutationIdentity & {
      holderReference: string
      holderType: HolderType
      setId: string
      storeCode: string
      vendorId?: string | null
    }) {
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
        const store = await findStore(client, input.organizationId, input.storeCode)
        if (store.kind !== "QUALITY") {
          throw new Error("Gauge sets are managed by Quality Store.")
        }
        const set = await client.query<{ id: string }>(
          `SELECT id FROM store.gauge_sets
           WHERE organization_id = $1 AND id = $2
             AND accountable_store_id = $3 AND active FOR UPDATE`,
          [input.organizationId, input.setId, store.id]
        )
        if (!set.rows[0]) throw new Error("Active gauge set was not found.")
        const gauges = await client.query<{
          assetCode: string
          holderReference: string | null
          holderType: string
          locationId: string | null
          status: string
        }>(
          `SELECT asset.asset_code AS "assetCode", asset.status,
            asset.current_holder_type AS "holderType",
            asset.current_holder_reference AS "holderReference",
            asset.current_location_id AS "locationId"
           FROM store.gauge_set_memberships member
           JOIN store.assets asset ON asset.id = member.asset_id
           WHERE member.organization_id = $1 AND member.gauge_set_id = $2
             AND member.removed_at IS NULL
             AND asset.accountable_store_id = $3
           ORDER BY asset.id FOR UPDATE OF asset`,
          [input.organizationId, set.rows[0].id, store.id]
        )
        if (gauges.rows.length !== 2 ||
          gauges.rows.some((gauge) => !["AVAILABLE", "ASSIGNED"].includes(gauge.status)) ||
          gauges.rows[0]!.holderType !== gauges.rows[1]!.holderType ||
          gauges.rows[0]!.holderReference !== gauges.rows[1]!.holderReference ||
          gauges.rows[0]!.locationId !== gauges.rows[1]!.locationId
        ) {
          throw new Error("The gauge set is incomplete; bring both usable gauges together first.")
        }
        const failed = await client.query(
          `SELECT 1 FROM store.calibration_visits visit
           JOIN store.gauge_set_memberships member ON member.asset_id = visit.asset_id
             AND member.gauge_set_id = $2 AND member.removed_at IS NULL
           WHERE visit.organization_id = $1 AND visit.status = 'FAILED'
             AND NOT EXISTS (
               SELECT 1 FROM store.calibration_visits later
               WHERE later.schedule_id = visit.schedule_id
                 AND later.asset_id = visit.asset_id
                 AND later.status = 'PASSED'
                 AND (later.created_at, later.id) > (visit.created_at, visit.id)
             ) LIMIT 1`,
          [input.organizationId, set.rows[0].id]
        )
        if (failed.rows[0]) {
          throw new Error("A failed gauge needs passing calibration before set movement.")
        }
        const movement = await client.query<{ id: string }>(
          `INSERT INTO store.gauge_set_movements (
             organization_id, gauge_set_id, created_by_user_id
           ) VALUES ($1, $2, $3) RETURNING id`,
          [input.organizationId, set.rows[0].id, input.actorUserId ?? null]
        )
        for (const gauge of gauges.rows) {
          await moveOwnedAsset(client, {
            ...input, assetCode: gauge.assetCode,
            gaugeSetMovementId: movement.rows[0]!.id, store,
          })
        }
        await queueDashboardRefresh(client, input.organizationId)
        return { movementId: movement.rows[0]!.id }
      })
    },

    async replaceGaugeSetMember(input: {
      actorUserId?: string | null
      newAssetCode: string
      oldAssetCode: string
      organizationId: string
      setId: string
      storeCode: string
    }) {
      return withTransaction(pool, async (client) => {
        const store = await findStore(client, input.organizationId, input.storeCode)
        if (store.kind !== "QUALITY") {
          throw new Error("Gauge sets are managed by Quality Store.")
        }
        const set = await client.query<{ id: string }>(
          `SELECT id FROM store.gauge_sets WHERE organization_id = $1
             AND id = $2 AND accountable_store_id = $3 AND active FOR UPDATE`,
          [input.organizationId, input.setId, store.id]
        )
        if (!set.rows[0]) throw new Error("Active gauge set was not found.")
        const members = await client.query<{
          assetCode: string
          assetId: string
          holderReference: string | null
          holderType: string
          locationId: string | null
          membershipId: string
          status: string
        }>(
          `SELECT member.id AS "membershipId", asset.id AS "assetId",
            asset.asset_code AS "assetCode", asset.status,
            asset.current_holder_type AS "holderType",
            asset.current_holder_reference AS "holderReference",
            asset.current_location_id AS "locationId"
           FROM store.gauge_set_memberships member
           JOIN store.assets asset ON asset.id = member.asset_id
           WHERE member.organization_id = $1 AND member.gauge_set_id = $2
             AND member.removed_at IS NULL
           ORDER BY asset.id FOR UPDATE OF asset`,
          [input.organizationId, set.rows[0].id]
        )
        const old = members.rows.find((member) =>
          member.assetCode.toLowerCase() === input.oldAssetCode.trim().toLowerCase()
        )
        const retained = members.rows.find((member) => member.assetId !== old?.assetId)
        if (members.rows.length !== 2 || !old || !retained) {
          throw new Error("Choose an active member of this two-gauge set.")
        }
        const replacement = await client.query<{
          assetCode: string
          holderReference: string | null
          holderType: string
          id: string
          locationId: string | null
          status: string
        }>(
          `SELECT asset.id, asset.asset_code AS "assetCode", asset.status,
            asset.current_holder_type AS "holderType",
            asset.current_holder_reference AS "holderReference",
            asset.current_location_id AS "locationId"
           FROM store.assets asset
           JOIN store.item_types item ON item.id = asset.item_type_id
           WHERE asset.organization_id = $1 AND
             asset.accountable_store_id = $2
             AND lower(asset.asset_code) = lower($3)
             AND lower(concat_ws(' ', item.asset_category,
               item.asset_subcategory, item.asset_name)) LIKE '%gauge%'
           FOR UPDATE OF asset`,
          [input.organizationId, store.id,
            requiredText(input.newAssetCode, "Replacement Unit ID")]
        )
        const next = replacement.rows[0]
        if (!next || next.status !== "AVAILABLE" && next.status !== "ASSIGNED") {
          throw new Error("Choose a usable replacement gauge accountable to Quality Store.")
        }
        if (
          next.holderType !== retained.holderType ||
          next.holderReference !== retained.holderReference ||
          next.locationId !== retained.locationId
        ) {
          throw new Error("Move the replacement gauge beside the retained member first.")
        }
        const alreadyMember = await client.query(
          `SELECT 1 FROM store.gauge_set_memberships
           WHERE organization_id = $1 AND asset_id = $2
             AND removed_at IS NULL LIMIT 1`,
          [input.organizationId, next.id]
        )
        if (alreadyMember.rows[0]) {
          throw new Error("The replacement gauge already belongs to a set.")
        }
        await client.query(
          `UPDATE store.gauge_set_memberships SET removed_at = now()
           WHERE id = $1`,
          [old.membershipId]
        )
        await client.query(
          `INSERT INTO store.gauge_set_memberships (
             organization_id, gauge_set_id, asset_id, created_by_user_id
           ) VALUES ($1, $2, $3, $4)`,
          [input.organizationId, set.rows[0].id, next.id,
            input.actorUserId ?? null]
        )
        return { setId: set.rows[0].id }
      })
    },

    async disbandGaugeSet(input: {
      actorUserId?: string | null
      organizationId: string
      setId: string
      storeCode: string
    }) {
      return withTransaction(pool, async (client) => {
        const store = await findStore(client, input.organizationId, input.storeCode)
        if (store.kind !== "QUALITY") {
          throw new Error("Gauge sets are managed by Quality Store.")
        }
        const set = await client.query<{ id: string }>(
          `UPDATE store.gauge_sets SET active = false
           WHERE organization_id = $1 AND id = $2
             AND accountable_store_id = $3 AND active RETURNING id`,
          [input.organizationId, input.setId, store.id]
        )
        if (!set.rows[0]) throw new Error("Active gauge set was not found.")
        await client.query(
          `UPDATE store.gauge_set_memberships SET removed_at = now()
           WHERE organization_id = $1 AND gauge_set_id = $2
             AND removed_at IS NULL`,
          [input.organizationId, set.rows[0].id]
        )
        return { setId: set.rows[0].id }
      })
    },
  }
}

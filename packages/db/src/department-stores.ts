import type { PoolClient } from "pg"

import { queueDashboardRefresh } from "./dashboard-refresh-queue"
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
  remark?: string | null
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
    `SELECT id, code, name, kind,
      production_floor_code AS "productionFloorCode",
      default_location_id AS "defaultLocationId"
     FROM store.accountable_stores
     WHERE organization_id = $1 AND lower(code) = lower($2) AND active
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
       remark, created_by_user_id, department_stock_operation_id
     ) VALUES ($1, $2, $3, $4, $5,
       'STORE', $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
    jobCardReference?: string | null
    machineReference?: string | null
    operatedOn?: string | null
    operationType: "TRANSFER" | "CONSUMPTION" | "LOSS" | "DAMAGE"
    operatorName?: string | null
    quantity: number
    sourceStoreId: string
  }
) {
  const result = await client.query<{ id: string }>(
    `INSERT INTO store.department_stock_operations (
       organization_id, operation_type, item_type_id, source_store_id,
       destination_store_id, quantity, machine_reference,
       job_card_reference, operator_name, operated_on, remark,
       created_by_user_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
       COALESCE($10::date, current_date), $11, $12)
     RETURNING id`,
    [
      input.organizationId, input.operationType, input.itemTypeId,
      input.sourceStoreId, input.destinationStoreId ?? null,
      input.quantity, input.machineReference?.trim() || null,
      input.jobCardReference?.trim() || null,
      input.operatorName?.trim() || null, input.operatedOn ?? null,
      input.remark?.trim() || null, input.actorUserId ?? null,
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
  if (asset.accountId !== input.store.id) {
    throw new Error("This Unit ID is accountable to another Store.")
  }
  if (asset.status === "SCRAPPED") {
    throw new Error("A scrapped Unit ID cannot be moved.")
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
       AND visit.status IN ('DISPATCHED', 'RETURNED')
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
  const broken = asset.status === "BROKEN"
  await client.query(
    `UPDATE store.assets SET
       status = CASE WHEN $1 THEN 'BROKEN'
         WHEN $2 = 'STORE' THEN 'AVAILABLE' ELSE 'ASSIGNED' END,
       current_holder_type = $2, current_holder_reference = $3,
       current_holder_name = $4, current_location_id = $5,
       current_machine_id = $6, current_vendor_id = $7,
       current_supplier_id = NULL,
       updated_at = now(), updated_by_user_id = $8
     WHERE id = $9`,
    [broken, input.holderType, destination.holderReference,
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
        `SELECT id, code, name, kind,
          production_floor_code AS "productionFloorCode",
          default_location_id AS "defaultLocationId"
         FROM store.accountable_stores
         WHERE organization_id = $1 AND lower(code) = lower($2) AND active`,
        [input.organizationId, input.storeCode]
      )
      const store = storeResult.rows[0]
      if (!store) throw new Error("Accountable Store was not found.")
      const [stores, consumables, serializedTotals, assets, gaugeSets, movements] =
        await Promise.all([
        pool.query<AccountableStore>(
          `SELECT id, code, name, kind,
            production_floor_code AS "productionFloorCode",
            default_location_id AS "defaultLocationId"
           FROM store.accountable_stores
           WHERE organization_id = $1 AND active ORDER BY kind, name`,
          [input.organizationId]
        ),
        pool.query<{
          assetName: string
          availableQuantity: string
          companyQuantity: string
          itemTypeId: string
          typeCode: string
          unit: string
        }>(
          `SELECT item.id AS "itemTypeId", item.type_code AS "typeCode",
            item.asset_name AS "assetName", item.unit,
            trim_scale(COALESCE(sum(movement.quantity) FILTER (
              WHERE location.accountable_store_id = $2), 0))::text
              AS "availableQuantity",
            trim_scale(COALESCE(sum(movement.quantity), 0))::text
              AS "companyQuantity"
           FROM store.item_types item
           LEFT JOIN store.stock_movements movement
             ON movement.organization_id = item.organization_id
             AND movement.item_type_id = item.id
             AND movement.asset_id IS NULL
           LEFT JOIN store.locations location ON location.id = movement.location_id
           WHERE item.organization_id = $1
             AND item.tracking_mode = 'CONSUMABLE' AND item.active
           GROUP BY item.id
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
              WHERE asset.status <> 'SCRAPPED')::text AS "companyQuantity",
            count(asset.id) FILTER (
              WHERE asset.accountable_store_id = $2
                AND asset.status <> 'SCRAPPED')::text AS "accountableQuantity",
            count(asset.id) FILTER (
              WHERE asset.accountable_store_id = $2
                AND asset.status = 'AVAILABLE'
                AND asset.current_holder_type = 'STORE'
                AND location.accountable_store_id = $2)::text
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
          assetName: string
          holderName: string | null
          holderType: string
          isGauge: boolean
          itemTypeId: string
          manufacturerSerialNumber: string | null
          status: string
          typeCode: string
        }>(
          `SELECT asset.asset_code AS "assetCode", asset.item_type_id AS "itemTypeId",
            item.type_code AS "typeCode", item.asset_name AS "assetName",
            asset.status, asset.current_holder_type AS "holderType",
            asset.current_holder_name AS "holderName",
            asset.manufacturer_serial_number AS "manufacturerSerialNumber",
            (lower(concat_ws(' ', item.asset_category,
              item.asset_subcategory, item.asset_name)) LIKE '%gauge%') AS "isGauge",
            accountable.code AS "accountableStoreCode"
           FROM store.assets asset
           JOIN store.item_types item ON item.id = asset.item_type_id
           JOIN store.accountable_stores accountable
             ON accountable.id = asset.accountable_store_id
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
                    WHERE later.asset_id = asset.id AND later.status = 'PASSED'
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
          subjectCode: string
          to: string | null
        }>(
          `SELECT movement.moved_at::text AS "occurredAt",
            COALESCE(asset.asset_code, item.type_code) AS "subjectCode",
            trim_scale(movement.quantity)::text AS quantity,
            concat_ws(' / ', movement.from_holder_type,
              movement.from_holder_name) AS "from",
            concat_ws(' / ', movement.to_holder_type,
              movement.to_holder_name) AS "to",
            movement.movement_type AS kind,
            movement.moved_by AS "performedBy"
           FROM store.stock_movements movement
           JOIN store.locations location ON location.id = movement.location_id
           JOIN store.item_types item ON item.id = movement.item_type_id
           LEFT JOIN store.assets asset ON asset.id = movement.asset_id
           WHERE movement.organization_id = $1
             AND (location.accountable_store_id = $2
               OR asset.accountable_store_id = $2)
           UNION ALL
           SELECT transfer.transferred_at::text, asset.asset_code, '1',
             source.name, destination.name, 'ACCOUNTABILITY_TRANSFER',
             transfer.transferred_by
           FROM store.asset_accountability_transfers transfer
           JOIN store.assets asset ON asset.id = transfer.asset_id
           JOIN store.accountable_stores source
             ON source.id = transfer.source_store_id
           JOIN store.accountable_stores destination
             ON destination.id = transfer.destination_store_id
           WHERE transfer.organization_id = $1
             AND (transfer.source_store_id = $2
               OR transfer.destination_store_id = $2)
           ORDER BY "occurredAt" DESC LIMIT 100`,
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

    async transferQuantity(input: MutationIdentity & {
      destinationStoreCode: string
      itemTypeId: string
      quantity: number
      sourceStoreCode: string
    }) {
      const quantity = positiveQuantity(input.quantity)
      return withTransaction(pool, async (client) => {
        const source = await findStore(client, input.organizationId, input.sourceStoreCode)
        const destination = await findStore(
          client, input.organizationId, input.destinationStoreCode
        )
        if (source.id === destination.id) {
          throw new Error("Choose a different destination Store.")
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
        return { operationId }
      })
    },

    async consumeQuantity(input: MutationIdentity & {
      consumedOn?: string | null
      itemTypeId: string
      jobCardReference?: string | null
      machineReference?: string | null
      operatorName: string
      quantity: number
      storeCode: string
    }) {
      const quantity = positiveQuantity(input.quantity)
      const operatorName = requiredText(input.operatorName, "Operator")
      if (!input.machineReference?.trim() && !input.jobCardReference?.trim()) {
        throw new Error("Machine or Job Card is required for consumption.")
      }
      return withTransaction(pool, async (client) => {
        const store = await findStore(client, input.organizationId, input.storeCode)
        await lockConsumable(client, input.organizationId, input.itemTypeId)
        const operationId = await insertOperation(client, {
          ...input,
          operatedOn: input.consumedOn,
          operationType: "CONSUMPTION",
          operatorName,
          quantity,
          sourceStoreId: store.id,
        })
        await writeDebits(client, {
          ...input, itemTypeId: input.itemTypeId,
          movementType: "ISSUE", operationId, quantity,
          sourceStore: store,
        })
        return { operationId }
      })
    },

    async adjustQuantity(input: MutationIdentity & {
      itemTypeId: string
      quantity: number
      reason: "LOSS" | "DAMAGE"
      storeCode: string
    }) {
      const quantity = positiveQuantity(input.quantity)
      return withTransaction(pool, async (client) => {
        const store = await findStore(client, input.organizationId, input.storeCode)
        await lockConsumable(client, input.organizationId, input.itemTypeId)
        const operationId = await insertOperation(client, {
          ...input, operationType: input.reason,
          quantity, sourceStoreId: store.id,
        })
        await writeDebits(client, {
          ...input, itemTypeId: input.itemTypeId,
          movementType: "ADJUSTMENT", operationId, quantity,
          sourceStore: store,
        })
        return { operationId }
      })
    },

    async transferAssetAccountability(input: MutationIdentity & {
      assetCode: string
      destinationStoreCode: string
      sourceStoreCode: string
    }) {
      return withTransaction(pool, async (client) => {
        await lockToolingAllocation(client, input.organizationId)
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
        if (unit.status === "SCRAPPED") {
          throw new Error("A scrapped Unit ID cannot change accountable Store.")
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
             destination_store_id, transferred_by, remark, created_by_user_id
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [input.organizationId, unit.id, source.id, destination.id,
            input.movedBy?.trim() || null, input.remark?.trim() || null,
            input.actorUserId ?? null]
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
                 created_by_user_id
               ) VALUES ($1, $2, $3, $4, $5, $6, 'STORE', $7, $8,
                 'STORE', $9, $10, $11, $12, $13)`,
              [input.organizationId, unit.itemTypeId, unit.id,
                movement.locationId, movement.movementType, movement.quantity,
                unit.currentHolderReference, unit.currentHolderName,
                destinationLocation?.rows[0]?.code,
                destinationLocation?.rows[0]?.name,
                input.movedBy?.trim() || null, input.remark?.trim() || null,
                input.actorUserId ?? null]
            )
          }
        }
        await assertToolingTransferAvailable(client, input.organizationId, input.assetCode)
        await queueDashboardRefresh(client, input.organizationId)
        return { assetCode: input.assetCode, destinationStoreCode: destination.code }
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
               WHERE later.asset_id = visit.asset_id
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

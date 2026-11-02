import { createHash } from "node:crypto"
import type { Pool, PoolClient } from "pg"
import { storeUnitId } from "./store-item-codes"
import { warrantyEndDate, warrantyPeriodDays } from "./store-warranty"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"

export type ExistingStockInput = {
  organizationId: string
  actorUserId?: string | null
  recordedBy: string
  entryKey: string
  itemTypeId: string
  locationId: string
  quantity: number
  purchasedOn?: string | null
  supplierId?: string | null
  unitPrice?: string | null
  billNumber?: string | null
  billDate?: string | null
  manufacturerMake?: string | null
  serialNumbers?: string[]
  installedOn?: string | null
  warrantyPeriod?: string | null
  warrantyUntil?: string | null
  condition: string
  remark?: string | null
}

function optional(value?: string | null) {
  return value?.trim() || null
}

function date(
  value: string | null | undefined,
  label: string,
  historical = true
) {
  const result = optional(value)
  if (!result) return null
  const parsed = new Date(`${result}T00:00:00Z`)
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(new Date())
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result ||
    (historical && result > today)
  ) {
    throw new Error(
      `${label} must be a valid${historical ? " past or current" : ""} date.`
    )
  }
  return result
}

export async function recordExistingStock(
  client: PoolClient,
  input: ExistingStockInput
) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(input.entryKey)) {
    throw new Error(
      "Existing stock entry reference is invalid. Reload the form."
    )
  }
  if (
    !Number.isFinite(input.quantity) ||
    input.quantity <= 0 ||
    input.quantity > 999999999 ||
    Math.abs(input.quantity * 1000 - Math.round(input.quantity * 1000)) >
      0.00001
  ) {
    throw new Error(
      "Quantity must be positive, with at most three decimal places."
    )
  }
  if (!["AVAILABLE", "BROKEN"].includes(input.condition))
    throw new Error("Choose the current condition.")
  const unitPrice = optional(input.unitPrice)
  if (unitPrice && !/^\d{1,12}(?:\.\d{1,2})?$/.test(unitPrice)) {
    throw new Error(
      "Purchase price must be zero or greater, with at most two decimal places."
    )
  }
  const purchasedOn = date(input.purchasedOn, "Purchase date")
  const installedOn = date(input.installedOn, "Installation date")
  const billDate = date(input.billDate, "Bill date")
  const warrantyDays = warrantyPeriodDays(input.warrantyPeriod)
  const warrantyUntil =
    date(input.warrantyUntil, "Warranty expiry", false) ||
    warrantyEndDate(installedOn, warrantyDays)
  if (purchasedOn && installedOn && installedOn < purchasedOn)
    throw new Error("Installation cannot precede purchase.")
  if (purchasedOn && warrantyUntil && warrantyUntil < purchasedOn)
    throw new Error("Warranty expiry cannot precede purchase.")
  const serialNumbers = (input.serialNumbers ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
  if (
    new Set(serialNumbers.map((value) => value.toLowerCase())).size !==
    serialNumbers.length
  ) {
    throw new Error("Each physical unit must have a different serial number.")
  }
  const details = {
    itemTypeId: input.itemTypeId,
    locationId: input.locationId,
    quantity: input.quantity,
    purchasedOn,
    supplierId: optional(input.supplierId),
    unitPrice,
    billNumber: optional(input.billNumber),
    billDate,
    manufacturerMake: optional(input.manufacturerMake),
    serialNumbers,
    installedOn,
    warrantyPeriod: warrantyDays?.toString() ?? null,
    warrantyUntil,
    condition: input.condition,
    remark: optional(input.remark),
  }
  const checksum = createHash("sha256")
    .update(JSON.stringify(details))
    .digest("hex")
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('store.existing-stock'), hashtext($1))",
    [`${input.organizationId}|${input.entryKey}`]
  )
  const previous = await client.query<{ id: string; input_checksum: string }>(
    "SELECT id, input_checksum FROM store.existing_stock_entries WHERE organization_id = $1 AND entry_key = $2",
    [input.organizationId, input.entryKey]
  )
  const codes = async (entryId: string) =>
    (
      await client.query<{ assetCode: string }>(
        'SELECT asset_code AS "assetCode" FROM store.assets WHERE organization_id = $1 AND existing_stock_entry_id = $2 ORDER BY asset_code',
        [input.organizationId, entryId]
      )
    ).rows.map((row) => row.assetCode)
  if (previous.rows[0]) {
    if (previous.rows[0].input_checksum !== checksum)
      throw new Error(
        "This entry was already saved with different details. Start a new entry."
      )
    return {
      entryId: previous.rows[0].id,
      assetCodes: await codes(previous.rows[0].id),
      alreadySaved: true,
    }
  }
  const item = (
    await client.query<{
      id: string
      type_code: string
      identification_name: string
      tracking_mode: string
      next_asset_number: number
    }>(
      "SELECT id, type_code, identification_name, tracking_mode, next_asset_number FROM store.item_types WHERE organization_id = $1 AND id = $2 AND active FOR UPDATE",
      [input.organizationId, input.itemTypeId]
    )
  ).rows[0]
  if (!item) throw new Error("Select an active Asset Code.")
  if (
    item.tracking_mode === "SERIALIZED" &&
    (!Number.isInteger(input.quantity) || input.quantity > 500)
  ) {
    throw new Error(
      "Non Consumable quantity must be a whole number, up to 500 units per entry."
    )
  }
  if (
    serialNumbers.length &&
    (item.tracking_mode !== "SERIALIZED" ||
      serialNumbers.length !== input.quantity)
  ) {
    throw new Error(
      "Enter one serial number per physical unit, or leave all serial numbers blank."
    )
  }
  if (item.tracking_mode !== "SERIALIZED" && input.condition !== "AVAILABLE") {
    throw new Error(
      "The condition selection applies to Non Consumable units only."
    )
  }
  if (
    serialNumbers.length &&
    (
      await client.query(
        "SELECT 1 FROM store.assets WHERE organization_id = $1 AND item_type_id = $2 AND lower(manufacturer_serial_number) = ANY($3::text[]) LIMIT 1",
        [
          input.organizationId,
          item.id,
          serialNumbers.map((value) => value.toLowerCase()),
        ]
      )
    ).rowCount
  ) {
    throw new Error(
      "A unit with one of these serial numbers is already recorded for this Asset Code."
    )
  }
  const location = (
    await client.query<{
      id: string
      code: string
      name: string
      store_id: string
    }>(
      `
    SELECT location.id, location.code, location.name, accountable.id AS store_id
    FROM store.locations location JOIN store.accountable_stores accountable ON accountable.id = location.accountable_store_id
    WHERE location.id = $2 AND location.organization_id = $1 AND location.active AND location.location_type = 'STORE'
      AND accountable.organization_id = $1 AND accountable.kind = 'MAIN' AND accountable.active`,
      [input.organizationId, input.locationId]
    )
  ).rows[0]
  if (!location)
    throw new Error("Choose an active Main Store storage location.")
  if (
    details.supplierId &&
    !(
      await client.query(
        "SELECT 1 FROM store.suppliers WHERE organization_id = $1 AND id = $2 AND active",
        [input.organizationId, details.supplierId]
      )
    ).rowCount
  )
    throw new Error("Choose an active supplier from this company.")
  const entry = (
    await client.query<{ id: string }>(
      `
    INSERT INTO store.existing_stock_entries (organization_id, entry_key, input_checksum, item_type_id, location_id,
      quantity, purchased_on, supplier_id, unit_price, bill_number, bill_date, manufacturer_make, serial_numbers,
      installed_on, warranty_period, warranty_until, condition, remark, recorded_by, created_by_user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [
        input.organizationId,
        input.entryKey,
        checksum,
        item.id,
        location.id,
        input.quantity,
        purchasedOn,
        details.supplierId,
        unitPrice,
        details.billNumber,
        billDate,
        details.manufacturerMake,
        JSON.stringify(serialNumbers),
        installedOn,
        details.warrantyPeriod,
        warrantyUntil,
        input.condition,
        details.remark,
        input.recordedBy,
        input.actorUserId,
      ]
    )
  ).rows[0]!
  const movement = async (assetId: string | null, quantity: number) =>
    client.query(
      `
    INSERT INTO store.stock_movements (organization_id, item_type_id, asset_id, location_id, existing_stock_entry_id,
      movement_type, quantity, to_holder_type, to_holder_reference, to_holder_name, moved_by, remark, created_by_user_id)
    VALUES ($1,$2,$3,$4,$5,'ADJUSTMENT',$6,'STORE',$7,$8,$9,$10,$11)`,
      [
        input.organizationId,
        item.id,
        assetId,
        location.id,
        entry.id,
        quantity,
        location.code,
        location.name,
        input.recordedBy,
        `Existing stock entry${details.remark ? `: ${details.remark}` : ""}`,
        input.actorUserId,
      ]
    )
  if (item.tracking_mode === "SERIALIZED") {
    for (let index = 0; index < input.quantity; index++) {
      const asset = (
        await client.query<{ id: string }>(
          `
        INSERT INTO store.assets (organization_id, item_type_id, asset_code, identification_name,
          existing_stock_entry_id, manufacturer_serial_number, manufacturer_make, current_location_id,
          accountable_store_id, status, acquired_on, installed_on, warranty_period, warranty_until,
          acquisition_supplier_id, acquisition_unit_price, acquisition_recorded_at, acquisition_recorded_by_user_id,
          created_by_user_id, updated_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),$17,$17,$17) RETURNING id`,
          [
            input.organizationId,
            item.id,
            storeUnitId(item.type_code, item.next_asset_number + index),
            item.identification_name,
            entry.id,
            serialNumbers[index] ?? null,
            details.manufacturerMake,
            location.id,
            location.store_id,
            input.condition,
            purchasedOn,
            installedOn,
            details.warrantyPeriod,
            warrantyUntil,
            details.supplierId,
            unitPrice,
            input.actorUserId,
          ]
        )
      ).rows[0]!
      await movement(asset.id, 1)
    }
    await client.query(
      "UPDATE store.item_types SET next_asset_number = next_asset_number + $1, updated_at = now() WHERE id = $2",
      [input.quantity, item.id]
    )
  } else await movement(null, input.quantity)
  await queueDashboardRefresh(client, input.organizationId)
  return {
    entryId: entry.id,
    assetCodes: await codes(entry.id),
    alreadySaved: false,
  }
}

export async function listExistingStockEntries(
  database: Pool,
  organizationId: string
) {
  return (
    await database.query<{
      id: string
      assetCode: string
      assetName: string
      identification: string
      quantity: string
      unit: string
      purchasedOn: string | null
      supplierName: string | null
      unitPrice: string | null
      billNumber: string | null
      billDate: string | null
      locationName: string
      condition: string
      recordedAt: Date
      recordedBy: string
      remark: string | null
    }>(
      `SELECT entry.id, item.type_code AS "assetCode", item.asset_name AS "assetName",
      item.identification_name AS identification, entry.quantity::text, item.unit, entry.purchased_on::text AS "purchasedOn",
      supplier.name AS "supplierName", entry.unit_price::text AS "unitPrice", entry.bill_number AS "billNumber",
      entry.bill_date::text AS "billDate", location.name AS "locationName", entry.condition,
      entry.created_at AS "recordedAt", entry.recorded_by AS "recordedBy", entry.remark
    FROM store.existing_stock_entries entry JOIN store.item_types item ON item.id = entry.item_type_id
    JOIN store.locations location ON location.id = entry.location_id
    LEFT JOIN store.suppliers supplier ON supplier.id = entry.supplier_id
    WHERE entry.organization_id = $1 ORDER BY entry.created_at DESC LIMIT 100`,
      [organizationId]
    )
  ).rows
}

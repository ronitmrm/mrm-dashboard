import { randomUUID } from "node:crypto"
import type { PoolClient } from "pg"
import { queueDashboardRefresh } from "./dashboard-refresh-queue"
import {
  prepareExistingStock,
  type ExistingStockInput,
} from "./store-existing-stock"
import { storeUnitId } from "./store-item-codes"

export async function recordExistingStockBatch(
  client: PoolClient,
  inputs: ExistingStockInput[]
) {
  if (!inputs.length || inputs.length > 2000)
    throw new Error("Upload between 1 and 2,000 rows at a time.")
  const organizationId = inputs[0]!.organizationId
  function fail(index: number, message: string): never {
    throw new Error(`CSV row ${index + 2}: ${message}`)
  }
  const prepared = inputs.map((input, index) => {
    if (input.organizationId !== organizationId)
      fail(index, "All entries must belong to the same company.")
    try {
      return { input, index, ...prepareExistingStock(input) }
    } catch (error) {
      return fail(
        index,
        error instanceof Error ? error.message : "Invalid stock entry."
      )
    }
  })
  const keys = prepared.map(({ input }) => input.entryKey.toLowerCase())
  if (new Set(keys).size !== keys.length)
    throw new Error("Entry References must be unique within the file.")
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('store.existing-stock'), hashtext($1 || '|' || entry_key::text))
    FROM unnest($2::uuid[]) entry_key ORDER BY entry_key`,
    [organizationId, keys]
  )
  const previous = await client.query<{
    entry_key: string
    input_checksum: string
  }>(
    "SELECT entry_key::text, input_checksum FROM store.existing_stock_entries WHERE organization_id = $1 AND entry_key = ANY($2::uuid[])",
    [organizationId, keys]
  )
  const saved = new Map(
    previous.rows.map((row) => [row.entry_key, row.input_checksum])
  )
  const pending = prepared.filter(({ input, checksum, index }) => {
    const prior = saved.get(input.entryKey.toLowerCase())
    if (prior && prior !== checksum)
      fail(
        index,
        "This entry was already saved with different details. Start a new entry."
      )
    return !prior
  })
  if (!pending.length) return { imported: 0, alreadySaved: prepared.length }

  const items = await client.query<{
    id: string
    type_code: string
    identification_name: string
    tracking_mode: string
    next_asset_number: number
  }>(
    `SELECT id, type_code, identification_name, tracking_mode, next_asset_number FROM store.item_types
    WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND active ORDER BY id FOR UPDATE`,
    [organizationId, [...new Set(pending.map((row) => row.input.itemTypeId))]]
  )
  const locations = await client.query<{
    id: string
    code: string
    name: string
    store_id: string
  }>(
    `SELECT location.id, location.code, location.name, accountable.id AS store_id FROM store.locations location
     JOIN store.accountable_stores accountable ON accountable.id = location.accountable_store_id
     WHERE location.organization_id = $1 AND location.id = ANY($2::uuid[]) AND location.active AND location.location_type = 'STORE'
       AND accountable.organization_id = $1 AND accountable.kind = 'MAIN' AND accountable.active
     ORDER BY location.id FOR SHARE OF location, accountable`,
    [organizationId, [...new Set(pending.map((row) => row.input.locationId))]]
  )
  const suppliers = await client.query<{ id: string }>(
    "SELECT id FROM store.suppliers WHERE organization_id = $1 AND id = ANY($2::uuid[]) AND active ORDER BY id FOR SHARE",
    [
      organizationId,
      [
        ...new Set(
          pending.flatMap((row) =>
            row.details.supplierId ? [row.details.supplierId] : []
          )
        ),
      ],
    ]
  )
  const itemById = new Map(items.rows.map((row) => [row.id, row]))
  const locationById = new Map(locations.rows.map((row) => [row.id, row]))
  const supplierIds = new Set(suppliers.rows.map((row) => row.id))
  const serials = new Set<string>()
  let physicalUnits = 0
  for (const { input, details, index } of prepared) {
    // Previously saved rows retain their original masters; only new rows need current active masters.
    if (saved.has(input.entryKey.toLowerCase())) continue
    const item = itemById.get(input.itemTypeId)
    if (!item) fail(index, "Select an active Asset Code.")
    if (!locationById.has(input.locationId))
      fail(index, "Choose an active Main Store storage location.")
    if (details.supplierId && !supplierIds.has(details.supplierId))
      fail(index, "Choose an active supplier from this company.")
    if (item.tracking_mode === "SERIALIZED") {
      if (!Number.isInteger(input.quantity) || input.quantity > 500)
        fail(
          index,
          "Non Consumable quantity must be a whole number, up to 500 units per entry."
        )
      physicalUnits += input.quantity
      if (physicalUnits > 2000)
        fail(index, "Upload at most 2,000 physical units at a time.")
    } else if (input.condition !== "AVAILABLE")
      fail(
        index,
        "The condition selection applies to Non Consumable units only."
      )
    if (
      details.serialNumbers.length &&
      (item.tracking_mode !== "SERIALIZED" ||
        details.serialNumbers.length !== input.quantity)
    )
      fail(
        index,
        "Enter one serial number per physical unit, or leave all serial numbers blank."
      )
    for (const serial of details.serialNumbers) {
      const key = `${item.id}|${serial.toLowerCase()}`
      if (serials.has(key))
        fail(
          index,
          "A unit with one of these serial numbers is repeated in this file for this Asset Code."
        )
      serials.add(key)
    }
  }
  if (serials.size) {
    const existing = await client.query<{
      item_type_id: string
      serial: string
    }>(
      `SELECT item_type_id, lower(manufacturer_serial_number) AS serial FROM store.assets
       WHERE organization_id = $1 AND item_type_id = ANY($2::uuid[]) AND lower(manufacturer_serial_number) = ANY($3::text[])`,
      [
        organizationId,
        items.rows.map((row) => row.id),
        pending.flatMap((row) =>
          row.details.serialNumbers.map((serial) => serial.toLowerCase())
        ),
      ]
    )
    const used = new Set(
      existing.rows.map((row) => `${row.item_type_id}|${row.serial}`)
    )
    for (const { input, details, index } of pending) {
      if (
        details.serialNumbers.some((serial) =>
          used.has(`${input.itemTypeId}|${serial.toLowerCase()}`)
        )
      )
        fail(
          index,
          "A unit with one of these serial numbers is already recorded for this Asset Code."
        )
    }
  }
  const entries = pending.map(({ input, details, checksum }) => ({
    id: randomUUID(),
    entry_key: input.entryKey,
    input_checksum: checksum,
    item_type_id: input.itemTypeId,
    location_id: input.locationId,
    quantity: input.quantity,
    purchased_on: details.purchasedOn,
    supplier_id: details.supplierId,
    unit_price: details.unitPrice,
    bill_number: details.billNumber,
    bill_date: details.billDate,
    manufacturer_make: details.manufacturerMake,
    serial_numbers: details.serialNumbers,
    installed_on: details.installedOn,
    warranty_period: details.warrantyPeriod,
    warranty_until: details.warrantyUntil,
    condition: input.condition,
    remark: details.remark,
    recorded_by: input.recordedBy,
    created_by_user_id: input.actorUserId ?? null,
  }))
  const nextNumbers = new Map(
    items.rows.map((item) => [item.id, item.next_asset_number])
  )
  const assets = entries.flatMap((entry) => {
    const item = itemById.get(entry.item_type_id)!
    if (item.tracking_mode !== "SERIALIZED") return []
    const start = nextNumbers.get(item.id)!
    nextNumbers.set(item.id, start + entry.quantity)
    return Array.from({ length: entry.quantity }, (_, index) => ({
      id: randomUUID(),
      item_type_id: item.id,
      asset_code: storeUnitId(item.type_code, start + index),
      identification_name: item.identification_name,
      existing_stock_entry_id: entry.id,
      manufacturer_serial_number: entry.serial_numbers[index] ?? null,
      manufacturer_make: entry.manufacturer_make,
      current_location_id: entry.location_id,
      accountable_store_id: locationById.get(entry.location_id)!.store_id,
      status: entry.condition,
      acquired_on: entry.purchased_on,
      installed_on: entry.installed_on,
      warranty_period: entry.warranty_period,
      warranty_until: entry.warranty_until,
      acquisition_supplier_id: entry.supplier_id,
      acquisition_unit_price: entry.unit_price,
      actor_user_id: entry.created_by_user_id,
    }))
  })
  await client.query(
    `INSERT INTO store.existing_stock_entries (id, organization_id, entry_key, input_checksum, item_type_id,
    location_id, quantity, purchased_on, supplier_id, unit_price, bill_number, bill_date, manufacturer_make, serial_numbers,
    installed_on, warranty_period, warranty_until, condition, remark, recorded_by, created_by_user_id)
    SELECT row.id, $1, row.entry_key, row.input_checksum, row.item_type_id, row.location_id, row.quantity, row.purchased_on,
    row.supplier_id, row.unit_price, row.bill_number, row.bill_date, row.manufacturer_make, row.serial_numbers,
    row.installed_on, row.warranty_period, row.warranty_until, row.condition, row.remark, row.recorded_by, row.created_by_user_id
    FROM jsonb_to_recordset($2::jsonb) AS row(id uuid, entry_key uuid, input_checksum text, item_type_id uuid,
      location_id uuid, quantity numeric, purchased_on date, supplier_id uuid, unit_price numeric, bill_number text,
      bill_date date, manufacturer_make text, serial_numbers jsonb, installed_on date, warranty_period integer,
      warranty_until date, condition text, remark text, recorded_by text, created_by_user_id uuid)`,
    [organizationId, JSON.stringify(entries)]
  )
  if (assets.length) {
    await client.query(
      `INSERT INTO store.assets (id, organization_id, item_type_id, asset_code, identification_name,
      existing_stock_entry_id, manufacturer_serial_number, manufacturer_make, current_location_id, accountable_store_id,
      status, acquired_on, installed_on, warranty_period, warranty_until, acquisition_supplier_id, acquisition_unit_price,
      acquisition_recorded_at, acquisition_recorded_by_user_id, created_by_user_id, updated_by_user_id)
      SELECT row.id, $1, row.item_type_id, row.asset_code, row.identification_name, row.existing_stock_entry_id,
      row.manufacturer_serial_number, row.manufacturer_make, row.current_location_id, row.accountable_store_id,
      row.status, row.acquired_on, row.installed_on, row.warranty_period, row.warranty_until,
      row.acquisition_supplier_id, row.acquisition_unit_price, now(), row.actor_user_id, row.actor_user_id, row.actor_user_id
      FROM jsonb_to_recordset($2::jsonb) AS row(id uuid, item_type_id uuid, asset_code text, identification_name text,
        existing_stock_entry_id uuid, manufacturer_serial_number text, manufacturer_make text, current_location_id uuid,
        accountable_store_id uuid, status text, acquired_on date, installed_on date, warranty_period integer,
        warranty_until date, acquisition_supplier_id uuid, acquisition_unit_price numeric, actor_user_id uuid)`,
      [organizationId, JSON.stringify(assets)]
    )
    await client.query(
      `UPDATE store.item_types item SET next_asset_number = bump.next_number, updated_at = now()
      FROM jsonb_to_recordset($2::jsonb) AS bump(id uuid, next_number integer) WHERE item.organization_id = $1 AND item.id = bump.id`,
      [
        organizationId,
        JSON.stringify(
          [...nextNumbers]
            .filter(
              ([id, next]) => next !== itemById.get(id)!.next_asset_number
            )
            .map(([id, next_number]) => ({ id, next_number }))
        ),
      ]
    )
  }
  const unitsByEntry = new Map<string, string[]>()
  for (const asset of assets) {
    const unitIds = unitsByEntry.get(asset.existing_stock_entry_id) ?? []
    unitIds.push(asset.id)
    unitsByEntry.set(asset.existing_stock_entry_id, unitIds)
  }
  const movements = entries.flatMap((entry) => {
    const location = locationById.get(entry.location_id)!
    const unitIds = unitsByEntry.get(entry.id) ?? [null]
    return unitIds.map((assetId) => ({
      item_type_id: entry.item_type_id,
      asset_id: assetId,
      location_id: location.id,
      existing_stock_entry_id: entry.id,
      quantity: assetId ? 1 : entry.quantity,
      to_holder_reference: location.code,
      to_holder_name: location.name,
      moved_by: entry.recorded_by,
      remark: `Existing stock entry${entry.remark ? `: ${entry.remark}` : ""}`,
      created_by_user_id: entry.created_by_user_id,
    }))
  })
  await client.query(
    `INSERT INTO store.stock_movements (organization_id, item_type_id, asset_id, location_id,
    existing_stock_entry_id, movement_type, quantity, to_holder_type, to_holder_reference, to_holder_name, moved_by, remark, created_by_user_id)
    SELECT $1, row.item_type_id, row.asset_id, row.location_id, row.existing_stock_entry_id, 'ADJUSTMENT', row.quantity,
    'STORE', row.to_holder_reference, row.to_holder_name, row.moved_by, row.remark, row.created_by_user_id
    FROM jsonb_to_recordset($2::jsonb) AS row(item_type_id uuid, asset_id uuid, location_id uuid, existing_stock_entry_id uuid,
      quantity numeric, to_holder_reference text, to_holder_name text, moved_by text, remark text, created_by_user_id uuid)`,
    [organizationId, JSON.stringify(movements)]
  )
  await queueDashboardRefresh(client, organizationId)
  return {
    imported: entries.length,
    alreadySaved: prepared.length - entries.length,
  }
}

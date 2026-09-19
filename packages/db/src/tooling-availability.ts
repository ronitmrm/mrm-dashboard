import type { PoolClient } from "pg"
import { productionFloorFromDepartment, type ProductionFloorCode } from "./production-floors"

export function requiredToolingCodes(row: Record<string, unknown>) {
  return [...new Set([
    row.fixture ?? row.FIXTURE,
    row.tooling ?? row.TOOLING,
    row.foamTool ?? row["FOAM TOOL"],
  ].map(value => String(value ?? "").trim().toUpperCase())
    .filter(value => value && !["-", "NA", "N/A", "NONE", "NOT REQUIRED", "NO"].includes(value)))]
}

export async function lockToolingAllocation(client: PoolClient, organizationId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('production.tooling'), hashtext($1))", [organizationId])
}

export async function readToolingOccupancy(client: Pick<PoolClient, "query">, organizationId: string) {
  return (await client.query<{ assetCode: string; floorCode: ProductionFloorCode; occupiedQuantity: number }>(`
    SELECT upper(trim(tool.tool_code)) AS "assetCode", floor.code AS "floorCode", count(DISTINCT state.id)::integer AS "occupiedQuantity"
    FROM manufacturing.shop_floor_setup_state state
    JOIN manufacturing.operation_tooling tool ON tool.operation_setup_id=state.operation_setup_id AND tool.active AND tool.tool_code IS NOT NULL
    JOIN catalog.machines machine ON machine.id=state.machine_id
    JOIN manufacturing.production_floors floor ON floor.id=machine.production_floor_id
    WHERE state.organization_id=$1 AND state.active
      AND state.stage IN ('presetting','setting','quality_approval','operator_started')
    GROUP BY upper(trim(tool.tool_code)), floor.code
  `, [organizationId])).rows
}

export async function assertToolingTransferAvailable(client: PoolClient, organizationId: string, unitId: string) {
  const item = await client.query<{ code: string }>(`SELECT upper(trim(item.type_code)) AS code FROM store.assets asset
    JOIN store.item_types item ON item.id=asset.item_type_id WHERE asset.organization_id=$1 AND lower(asset.asset_code)=lower($2)`, [organizationId, unitId])
  const code = item.rows[0]?.code
  if (!code) return
  const allocations = await readToolingAllocations(client, organizationId)
  const usage = await readToolingOccupancy(client, organizationId)
  if (usage.some(row => row.assetCode === code && row.occupiedQuantity > (allocations.get(code)?.floors.get(row.floorCode) ?? 0))) {
    throw new Error(`Tooling ${code} is still required by active setups. Stop or complete them before transferring its allocated units.`)
  }
}

// Physical Store units are the quantity source. A unit assigned to a machine
// belongs to that machine's production department, not to every department.
export async function readToolingAllocations(client: Pick<PoolClient, "query">, organizationId: string) {
  const result = await client.query<{
    assetCode: string; holderType: string; holderReference: string | null;
    holderName: string | null; floorCode: ProductionFloorCode | null;
  }>(`
    SELECT item.type_code AS "assetCode", asset.current_holder_type AS "holderType",
      asset.current_holder_reference AS "holderReference", asset.current_holder_name AS "holderName",
      floor.code AS "floorCode"
    FROM store.assets asset
    JOIN store.item_types item ON item.id = asset.item_type_id AND item.active
    LEFT JOIN catalog.machines machine ON machine.id = asset.current_machine_id
    LEFT JOIN manufacturing.production_floors floor ON floor.id = machine.production_floor_id
    WHERE asset.organization_id = $1 AND asset.status IN ('AVAILABLE', 'ASSIGNED')
      AND item.tracking_mode = 'SERIALIZED'
  `, [organizationId])
  const totals = new Map<string, { assetCode: string; totalQuantity: number; storeQuantity: number; floors: Map<ProductionFloorCode, number> }>()
  for (const asset of result.rows) {
    const assetCode = asset.assetCode.trim().toUpperCase()
    const total = totals.get(assetCode) ?? { assetCode, totalQuantity: 0, storeQuantity: 0, floors: new Map() }
    total.totalQuantity++
    if (asset.holderType === "STORE") total.storeQuantity++
    const floor = asset.holderType === "MACHINE" ? asset.floorCode
      : asset.holderType === "DEPARTMENT" || asset.holderType === "UNIT"
        ? productionFloorFromDepartment(asset.holderName, asset.holderReference)
          ?? productionFloorFromDepartment(asset.holderReference, asset.holderReference)
        : null
    if (floor) total.floors.set(floor, (total.floors.get(floor) ?? 0) + 1)
    totals.set(assetCode, total)
  }
  return totals
}

export async function assertToolingAvailable(client: PoolClient, input: {
  organizationId: string; setupId: string; workOrderId: string; machineId: string; floorCode: ProductionFloorCode;
}) {
  // Serialize competing starts across different machines before reading occupancy.
  await lockToolingAllocation(client, input.organizationId)
  const required = await client.query<{ code: string }>(`
    SELECT DISTINCT upper(trim(tool_code)) AS code FROM manufacturing.operation_tooling
    WHERE organization_id=$1 AND operation_setup_id=$2 AND active AND tool_code IS NOT NULL
  `, [input.organizationId, input.setupId])
  if (!required.rows.length) return
  const allocations = await readToolingAllocations(client, input.organizationId)
  const occupied = await client.query<{ code: string; quantity: string }>(`
    SELECT upper(trim(tool.tool_code)) AS code, count(DISTINCT state.id)::text AS quantity
    FROM manufacturing.shop_floor_setup_state state
    JOIN manufacturing.operation_tooling tool ON tool.operation_setup_id=state.operation_setup_id AND tool.active
    JOIN catalog.machines machine ON machine.id=state.machine_id
    JOIN manufacturing.production_floors floor ON floor.id=machine.production_floor_id
    WHERE state.organization_id=$1 AND state.active AND floor.code=$2
      AND state.stage IN ('presetting','setting','quality_approval','operator_started')
      AND NOT (state.work_order_id=$3 AND state.operation_setup_id=$4 AND state.machine_id=$5)
    GROUP BY upper(trim(tool.tool_code))
  `, [input.organizationId, input.floorCode, input.workOrderId, input.setupId, input.machineId])
  for (const { code } of required.rows) {
    const quantity = allocations.get(code)?.floors.get(input.floorCode) ?? 0
    const busy = Number(occupied.rows.find(row => row.code === code)?.quantity ?? 0)
    if (quantity <= busy) throw new Error(`Tooling ${code}: ${quantity} allocated to this department, ${busy} occupied. Stop/complete the holding setup or request another usable unit from Store.`)
  }
}

import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { migrateDatabase } from "./migrate"
import { createDashboardPlanningRepository } from "./dashboard-planning"
import { createProductionShopFloorRepository } from "./production-shop-floor"
import { createProductionOpeningRepository } from "./production-opening-balances"
import { readCanonicalDashboardSource } from "./dashboard-read-model"

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const planning = createDashboardPlanningRepository({ connectionString })
const shop = createProductionShopFloorRepository({ connectionString })
const opening = createProductionOpeningRepository({ connectionString })
let organizationId: string
beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const result = await pool.query<{ id: string }>("INSERT INTO core.organizations (code, name) VALUES ($1, 'Opening test') RETURNING id", [`OPEN-${randomUUID()}`])
  organizationId = result.rows[0]!.id
  await pool.query(`INSERT INTO catalog.items (organization_id, uid, description, source_system, source_table, source_id)
    VALUES ($1, 'PART', 'Opening part', 'test', 'items', $2)`, [organizationId, randomUUID()])
  await planning.upsertMachine({ organizationId, machineNumber: `CNC-${organizationId}`, productionFloorCode: "cnc" })
  await planning.upsertWorkOrder({ organizationId, jobCardNumber: "JC", workOrderNumber: "WO", itemUid: "PART", orderedQuantity: 10000,
    sourcePayload: { jcNo: "JC", partCode: "PART", orderPcs: 10000, productionFloorCode: "cnc" } })
  await planning.upsertRouteOption({ organizationId, itemUid: "PART", routeCode: "1", productionFloorCode: "cnc",
    setups: [{ setupNumber: 1, operationCode: "TURN", sequence: 1 }, { setupNumber: 2, operationCode: "DRILL", sequence: 2 }] })
  await planning.selectRoute({ organizationId, jobCardNumber: "JC", routeCode: "1", productionFloorCode: "cnc" })
  await pool.query(`INSERT INTO workforce.employees (organization_id, employee_code, name, department, designation, source_system, source_table, source_id)
    VALUES ($1, 'OP', 'Real operator', 'Shop Floor', 'Worker', 'test', 'employees', $2)`, [organizationId, randomUUID()])
})
afterAll(async () => { await opening.close(); await shop.close(); await planning.close(); await pool.end() })

test("previews, atomically imports and replays an opening, then counts only new output as production", async () => {
  const batch = { cutoffAt: "2026-09-18T22:00:00+05:30", rows: [
    { jobCardNumber: "JC", partCode: "PART", optionNumber: "1", setupNumber: 1, machineNumber: null, goodPieces: 10000, rejectedPieces: 8, status: "completed" },
    { jobCardNumber: "JC", partCode: "PART", optionNumber: "1", setupNumber: 2, machineNumber: `CNC-${organizationId}`, goodPieces: 5000, rejectedPieces: 20, status: "running" },
  ] }
  expect(await opening.importBatch({ organizationId, batch })).toMatchObject({ status: "preview", rows: [
    { pendingGoodPieces: 0 }, { pendingGoodPieces: 5000 },
  ] })
  expect((await pool.query("SELECT 1 FROM manufacturing.production_opening_batches WHERE organization_id = $1", [organizationId])).rowCount).toBe(0)
  expect(await opening.importBatch({ organizationId, batch, commit: true })).toMatchObject({ status: "imported" })
  expect(await opening.importBatch({ organizationId, batch, commit: true })).toMatchObject({ status: "already_imported" })
  await expect(opening.importBatch({ organizationId, batch: { ...batch, cutoffAt: "2026-09-18T21:00:00+05:30" }, commit: true })).rejects.toThrow("different contents")
  const client = await pool.connect()
  try {
    const source = await readCanonicalDashboardSource(client, organizationId)
    expect(source.allDataEntries.filter((row) => row.entryType === "production_opening_balance")).toHaveLength(2)
    expect(source.productionEntries).toHaveLength(0)
  } finally { client.release() }
  const input = { organizationId, productionFloorCode: "cnc", jobCardNumber: "JC", operationSetupCode: "2",
    machineNumber: `CNC-${organizationId}`, operatorCode: "", productionDate: "2026-09-19", quantityGood: 100, quantityRejected: 3, payload: {} }
  await expect(shop.recordProductionEntry({ ...input, productionDate: "2026-09-18" })).rejects.toThrow("overlaps")
  await shop.recordProductionEntry(input)
  const sessionInput = { organizationId, productionFloorCode: "cnc", jobCardNumber: "JC", machineNumber: `CNC-${organizationId}`,
    operationSetupCode: "2", operatorCode: "OP", measurementMethod: "counter", pieceWeightGrams: 10, startCount: 0 }
  await expect(shop.startProductionSession({ ...sessionInput, startedAt: "2026-09-18T21:00:00+05:30" })).rejects.toThrow("overlaps")
  const session = await shop.startProductionSession({ ...sessionInput, startedAt: "2026-09-19T06:00:00+05:30" })
  await shop.closeProductionSession({ organizationId, sessionId: session.id, endedAt: "2026-09-19T14:00:00+05:30", endCount: 100, endReason: "shift_end" })
  const workspace = await shop.readJobCardWorkspace({ organizationId, productionFloorCode: "cnc", jobCardNumber: "JC" })
  expect(workspace.openingBalances).toHaveLength(2)
  expect(workspace.analytics).toMatchObject({ actualGoodPieces: 5200, sessionCount: 1, legacyEntryCount: 1, setupPerformance: [
    { actualGoodPieces: 10000 }, { actualGoodPieces: 5200 },
  ] })
})

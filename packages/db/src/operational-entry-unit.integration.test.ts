import { randomUUID } from "node:crypto"

import { Client, Pool } from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"

import { createDashboardPlanningRepository } from "./dashboard-planning"
import { migrateDatabase } from "./migrate"
import { createProductionShopFloorRepository } from "./production-shop-floor"

const adminConnectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const testUrl = new URL(adminConnectionString)
const preparedDatabase = /^mrmpl_test_entries_[a-f0-9]{32}$/.test(
  testUrl.pathname.slice(1)
)
const databaseName = preparedDatabase
  ? testUrl.pathname.slice(1)
  : `mrmpl_test_entries_${randomUUID().replaceAll("-", "")}`
testUrl.pathname = `/${databaseName}`
const connectionString = testUrl.toString()
const pool = new Pool({ connectionString, max: 1 })
const planning = createDashboardPlanningRepository({ pool })
const production = createProductionShopFloorRepository({ pool })
let databaseCreated = false
let organizationId = ""
const jobCardNumber = "ENTRY-UNIT-JC"
const itemUid = "ENTRY-UNIT-ITEM"
const workOrderNumber = "ENTRY-UNIT-WO"
const receiptNumber = "ENTRY-UNIT-RM"

beforeAll(async () => {
  if (!preparedDatabase) {
    const admin = new Client({ connectionString: adminConnectionString })
    try {
      await admin.connect()
      await admin.query(`CREATE DATABASE "${databaseName}"`)
      databaseCreated = true
    } finally {
      await admin.end()
    }
  }
  await migrateDatabase({
    connectionString,
    through: "0121_rod_size_master_lifecycle.sql",
  })
  const organization = await pool.query<{ id: string }>(
    "INSERT INTO core.organizations (code, name) VALUES ('ENTRY-UNIT', 'Entry unit test') RETURNING id"
  )
  organizationId = organization.rows[0]!.id
  await planning.upsertWorkOrder({
    organizationId,
    itemUid,
    workOrderNumber,
    jobCardNumber,
    orderedQuantity: 100,
    requiredProductionFloorCode: "forging",
    sourcePayload: {
      productionFloorCode: "forging",
      jcNo: jobCardNumber,
      partCode: itemUid,
      rmPoNo: receiptNumber,
    },
  })
}, 180_000)

afterAll(async () => {
  await pool.end()
  if (!databaseCreated) return
  // Only this run's generated database can be removed; never the configured DB.
  if (!/^mrmpl_test_entries_[a-f0-9]{32}$/.test(databaseName)) {
    throw new Error("Refusing to remove an unrecognized test database")
  }
  const admin = new Client({ connectionString: adminConnectionString })
  try {
    await admin.connect()
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`)
  } finally {
    await admin.end()
  }
}, 30_000)

test("a CNC entry cannot overwrite a Forging work order", async () => {
  await expect(
    planning.upsertWorkOrder({
      organizationId,
      itemUid,
      workOrderNumber,
      jobCardNumber,
      orderedQuantity: 999,
      requiredProductionFloorCode: "cnc",
      sourcePayload: { productionFloorCode: "cnc" },
    })
  ).rejects.toThrow("another Production Unit")
  const workspace = await production.readJobCardWorkspace({
    organizationId,
    jobCardNumber,
    productionFloorCode: "forging",
  })
  const jobCard: Record<string, unknown> = workspace.jobCard
  expect(Number(jobCard.orderedQuantity)).toBe(100)
})

test("raw-material entry accepts its work order's unit and rejects another unit", async () => {
  const input = {
    organizationId,
    quantityKg: 15,
    receiptNumber,
    receivedOn: "2026-09-09",
    payload: { jcNo: jobCardNumber, productionFloorCode: "forging" },
  }
  const receipt = await production.upsertRawMaterialReceipt({
    ...input,
    requiredProductionFloorCode: "forging",
  })
  expect(receipt.id).toBeTruthy()
  await expect(
    production.upsertRawMaterialReceipt({
      ...input,
      quantityKg: 999,
      requiredProductionFloorCode: "cnc",
      payload: { ...input.payload, productionFloorCode: "cnc" },
    })
  ).rejects.toThrow("another Production Unit")
  const workspace = await production.readJobCardWorkspace({
    organizationId,
    jobCardNumber,
    productionFloorCode: "forging",
  })
  expect(workspace.rawMaterialReceipts).toHaveLength(1)
  expect(Number(workspace.rawMaterialReceipts[0]?.quantityKg)).toBe(15)
})

test("software raw entry accepts its work order's unit and rejects another unit", async () => {
  const input = {
    organizationId,
    jobCardNumber,
    productionDate: "2026-09-09",
    quantityGood: 5,
    quantityRejected: 0,
    sourceId: "ENTRY-UNIT-PRODUCTION",
    payload: { productionFloorCode: "forging", outputQty: 5 },
  }
  const entry = await production.recordProductionEntry({
    ...input,
    productionFloorCode: "forging",
    requiredProductionFloorCode: "forging",
  })
  expect(entry.id).toBeTruthy()
  await expect(
    production.recordProductionEntry({
      ...input,
      productionFloorCode: "cnc",
      requiredProductionFloorCode: "cnc",
      payload: { ...input.payload, productionFloorCode: "cnc", outputQty: 999 },
    })
  ).rejects.toThrow("another Production Unit")
})

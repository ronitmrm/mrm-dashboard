import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { migrateDatabase } from "./migrate"
import { createMaintenanceRepository } from "./maintenance"
import { createStoreRepository } from "./store"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const store = createStoreRepository({ connectionString })
const maintenance = createMaintenanceRepository({ connectionString })
const suffix = randomUUID().slice(0, 8)
let organizationId: string

beforeAll(async () => {
  await migrateDatabase({ connectionString })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ('MRMPL', 'MRM Private Limited')
      ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
  )
  organizationId = organization.rows[0]!.id
})

afterAll(async () => {
  await store.close()
  await maintenance.close()
  await pool.end()
})

describe("Store requests", () => {
  test("generates request numbers and shows every department the live shared stock", async () => {
    const location = await store.createLocation({
      code: `MAIN-${suffix}`,
      name: "Main Store",
      organizationId,
    })
    const itemType = await store.createItemType({
      assetCategory: "Cutting Tools",
      assetName: `Carbide Insert ${suffix}`,
      assetSubcategory: "Inserts",
      assetType: "Tool",
      identificationName: "CNMG Insert",
      organizationId,
      trackingMode: "CONSUMABLE",
      typeCode: `CT-${suffix}`,
      unit: "Nos",
    })
    await store.receiveStock({
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 5,
      unitPrice: "125.00",
    })

    const production = await store.createRequisition({
      department: "Production",
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "Production Supervisor",
    })
    const quality = await store.createRequisition({
      department: "Quality Control",
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "QC Inspector",
    })

    expect(production.requestNumber).toMatch(/^STR-REQ-\d{4}-\d{6}$/)
    expect(quality.requestNumber).not.toBe(production.requestNumber)

    const beforeIssue = await store.listRequisitions({ organizationId })
    expect(
      beforeIssue.rows.find((row) => row.id === production.id)?.availableStock
    ).toBe("5")
    expect(
      beforeIssue.rows.find((row) => row.id === quality.id)?.availableStock
    ).toBe("5")

    await store.issueRequisition({
      organizationId,
      quantity: 1,
      requisitionId: production.id,
    })

    const afterIssue = await store.listRequisitions({ organizationId })
    expect(
      afterIssue.rows.find((row) => row.id === quality.id)?.availableStock
    ).toBe("4")
    expect(
      afterIssue.rows.find((row) => row.id === production.id)?.status
    ).toBe("Fulfilled")
  })

  test("keeps movement and maintenance history on each numbered physical asset", async () => {
    const location = await store.createLocation({
      code: `ASSET-${suffix}`,
      name: "Asset Store",
      organizationId,
    })
    const itemType = await store.createItemType({
      assetCategory: "Furniture",
      assetName: `Operator Chair ${suffix}`,
      assetSubcategory: "Chairs",
      assetType: "Asset",
      identificationName: "CNC Operator Chair",
      organizationId,
      trackingMode: "SERIALIZED",
      typeCode: `N41-${suffix}`,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 2,
      unitPrice: "4500.00",
    })
    expect(receipt.assetCodes).toEqual([
      `N41-${suffix}-00001`,
      `N41-${suffix}-00002`,
    ])

    const request = await store.createRequisition({
      department: "Production",
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "Production Supervisor",
    })
    await store.issueRequisition({
      assetCode: receipt.assetCodes[0],
      holderName: "Production Department",
      holderReference: "PROD",
      holderType: "DEPARTMENT",
      organizationId,
      quantity: 1,
      requisitionId: request.id,
    })
    await store.moveAsset({
      assetCode: receipt.assetCodes[0]!,
      holderName: "Quality Inspector",
      holderReference: "EMP-QC-01",
      holderType: "PERSON",
      organizationId,
    })

    const definitionCode = `AM-${suffix}`
    await maintenance.upsertDefinition({
      active: true,
      code: definitionCode,
      frequencyDays: 30,
      items: [],
      name: "Monthly asset inspection",
      organizationId,
      payload: {},
    })
    const schedule = await store.scheduleAssetMaintenance({
      assetCode: receipt.assetCodes[0]!,
      definitionCode,
      firstDueOn: "2026-08-20",
      organizationId,
    })
    const completion = await store.completeAssetMaintenance({
      assetCode: receipt.assetCodes[0]!,
      completedBy: "Maintenance Technician",
      completedOn: "2026-08-20",
      maintenanceType: "CALIBRATION",
      organizationId,
      scheduleId: schedule.id,
    })
    expect(completion.nextDueOn).toBe("2026-09-19")

    await store.setAssetLifecycleStatus({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
      status: "BROKEN",
    })
    const replacement = await store.receiveStock({
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      unitPrice: "4750.00",
    })
    expect(replacement.assetCodes).toEqual([`N41-${suffix}-00003`])

    const workspace = await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
    })
    expect(workspace?.asset.status).toBe("BROKEN")
    expect(
      workspace?.movements.map((movement) => movement.movementType)
    ).toEqual(
      expect.arrayContaining(["RECEIPT", "ISSUE", "TRANSFER_OUT", "ADJUSTMENT"])
    )
    expect(workspace?.maintenance[0]?.maintenanceType).toBe("CALIBRATION")
    expect(workspace?.schedules[0]?.nextDueOn).toBe("2026-09-19")
  })
})

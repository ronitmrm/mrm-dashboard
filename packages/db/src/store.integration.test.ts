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
let legacyItemTypeId: string

beforeAll(async () => {
  await migrateDatabase({
    connectionString,
    through: "0068_store_module.sql",
  })
  const organization = await pool.query<{ id: string }>(
    `
      INSERT INTO core.organizations (code, name)
      VALUES ('MRMPL', 'MRM Private Limited')
      ON CONFLICT (lower(code)) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `
  )
  organizationId = organization.rows[0]!.id
  const legacyItemType = await pool.query<{ id: string }>(
    `
      INSERT INTO store.item_types (
        organization_id, type_code, asset_type, asset_category,
        asset_subcategory, asset_name, identification_name,
        tracking_mode, unit
      ) VALUES ($1, 'N41', 'Asset', 'Furniture', 'Chairs',
        'Operator Chair', 'Legacy Operator Chair', 'SERIALIZED', 'Nos')
      RETURNING id
    `,
    [organizationId]
  )
  legacyItemTypeId = legacyItemType.rows[0]!.id
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await store.close()
  await maintenance.close()
  await pool.end()
})

async function createClassification(label: string) {
  const category = await store.createAssetCategory({
    name: `${label} Category ${suffix}`,
    organizationId,
  })
  const subcategory = await store.createAssetSubcategory({
    categoryId: category.id,
    name: `${label} Subcategory ${suffix}`,
    organizationId,
  })
  const assetName = await store.createAssetName({
    name: `${label} Asset ${suffix}`,
    organizationId,
    subcategoryId: subcategory.id,
  })
  return {
    assetCategoryId: category.id,
    assetNameId: assetName.id,
    assetSubcategoryId: subcategory.id,
  }
}

describe("Store requests", () => {
  test("uses classification masters and generates immutable Type Codes", async () => {
    const category = await store.createAssetCategory({
      name: `Safety ${suffix}`,
      organizationId,
    })
    const subcategory = await store.createAssetSubcategory({
      categoryId: category.id,
      name: `Eye Protection ${suffix}`,
      organizationId,
    })
    const assetName = await store.createAssetName({
      name: `Safety Glasses ${suffix}`,
      organizationId,
      subcategoryId: subcategory.id,
    })

    const first = await store.createItemType({
      assetCategoryId: category.id,
      assetNameId: assetName.id,
      assetSubcategoryId: subcategory.id,
      assetType: "PPE",
      identificationName: `Clear Safety Glasses ${suffix}`,
      organizationId,
      trackingMode: "SERIALIZED",
      unit: "Nos",
    })
    const second = await store.createItemType({
      assetCategoryId: category.id,
      assetNameId: assetName.id,
      assetSubcategoryId: subcategory.id,
      assetType: "PPE Spare",
      identificationName: `Tinted Safety Glasses ${suffix}`,
      organizationId,
      trackingMode: "SERIALIZED",
      unit: "Nos",
    })

    expect(first.typeCode).toMatch(/^ST\d{3,}$/)
    expect(Number(second.typeCode.slice(2))).toBe(
      Number(first.typeCode.slice(2)) + 1
    )

    const masters = await store.listAssetClassificationMasters(organizationId)
    expect(masters.assetNames).toContainEqual(
      expect.objectContaining({
        categoryId: category.id,
        id: assetName.id,
        subcategoryId: subcategory.id,
      })
    )
    expect(masters.assetNames).toContainEqual(
      expect.objectContaining({
        categoryName: "Furniture",
        name: "Operator Chair",
        subcategoryName: "Chairs",
      })
    )
    expect(await store.listItemTypes(organizationId)).toContainEqual(
      expect.objectContaining({ id: legacyItemTypeId, typeCode: "N41" })
    )
  })

  test("generates request numbers and shows every department the live shared stock", async () => {
    const location = await store.createLocation({
      code: `MAIN-${suffix}`,
      name: "Main Store",
      organizationId,
    })
    const classification = await createClassification("Carbide Insert")
    const itemType = await store.createItemType({
      ...classification,
      assetType: "Tool",
      identificationName: "CNMG Insert",
      organizationId,
      trackingMode: "CONSUMABLE",
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
    const classification = await createClassification("Operator Chair")
    const itemType = await store.createItemType({
      ...classification,
      assetType: "Asset",
      identificationName: "CNC Operator Chair",
      organizationId,
      trackingMode: "SERIALIZED",
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
      `${itemType.typeCode}-00001`,
      `${itemType.typeCode}-00002`,
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
    expect(replacement.assetCodes).toEqual([`${itemType.typeCode}-00003`])

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

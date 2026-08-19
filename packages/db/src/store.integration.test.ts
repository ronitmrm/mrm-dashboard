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
let legacyAssetId: string

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
  const legacyAsset = await pool.query<{ id: string }>(
    `
      INSERT INTO store.assets (
        organization_id, item_type_id, asset_code, identification_name
      ) VALUES ($1, $2, 'N41-00001', 'Legacy Operator Chair Unit')
      RETURNING id
    `,
    [organizationId, legacyItemTypeId]
  )
  legacyAssetId = legacyAsset.rows[0]!.id
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

async function createPurchaseOrder(
  itemTypeId: string,
  quantity: number,
  unitPrice: string
) {
  const supplierName = `Store Test Supplier ${suffix}`
  const supplier =
    (await store.listSuppliers(organizationId)).find(
      (candidate) => candidate.name === supplierName
    ) ??
    (await store.createSupplier({
      name: supplierName,
      organizationId,
    }))
  return store.createPurchaseOrder({
    itemTypeId,
    orderDate: "2026-08-17",
    organizationId,
    quantity,
    supplierId: supplier.id,
    unitPrice,
  })
}

describe("Store requests", () => {
  test("auto-generates Supplier codes and rejects duplicate names and GST numbers", async () => {
    const supplier = await store.createSupplier({
      address: "Industrial Area, Pune",
      gstNumber: `27AAAC${suffix.slice(0, 4).toUpperCase()}1Z5`,
      name: `  Precision   Supply ${suffix}  `,
      organizationId,
    })

    expect(supplier.code).toMatch(/^SUP-\d{3,}$/)
    await expect(
      store.createSupplier({
        name: `precision supply ${suffix}`,
        organizationId,
      })
    ).rejects.toThrow("Supplier name already exists")
    await expect(
      store.createSupplier({
        gstNumber: `27aaac${suffix.slice(0, 4)}1z5`,
        name: `Another Supplier ${suffix}`,
        organizationId,
      })
    ).rejects.toThrow("GST number already belongs")
  })

  test("keeps price revisions and defaults to the cheapest active Supplier", async () => {
    const preferredSupplier = await store.createSupplier({
      name: `Lowest Quote Supplier ${suffix}`,
      organizationId,
    })
    const alternateSupplier = await store.createSupplier({
      name: `Alternate Quote Supplier ${suffix}`,
      organizationId,
    })
    const item = await store.createItemType({
      ...(await createClassification("Price Revision")),
      assetType: "CONSUMABLE",
      identificationName: `Price Revision Item ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    await store.createSupplierPrice({
      itemTypeId: item.id,
      organizationId,
      supplierId: preferredSupplier.id,
      unitPrice: "120.00",
      validFrom: "2026-08-01",
    })
    await store.createSupplierPrice({
      itemTypeId: item.id,
      organizationId,
      supplierId: preferredSupplier.id,
      unitPrice: "100.00",
      validFrom: "2026-08-10",
    })
    await store.createSupplierPrice({
      itemTypeId: item.id,
      organizationId,
      supplierId: alternateSupplier.id,
      unitPrice: "110.00",
      validFrom: "2026-08-10",
    })

    const prices = (await store.listSupplierPrices(organizationId)).filter(
      (price) => price.itemTypeId === item.id
    )
    expect(prices).toHaveLength(3)
    expect(
      prices.filter(
        (price) => price.supplierId === preferredSupplier.id && price.active
      )
    ).toHaveLength(1)
    expect(
      (await store.listItemTypes(organizationId)).find(
        (candidate) => candidate.id === item.id
      )
    ).toEqual(
      expect.objectContaining({
        currentSupplierId: preferredSupplier.id,
        currentUnitPrice: "100.00",
      })
    )

    const override = await store.createPurchaseOrdersFromSelection({
      items: [
        {
          itemTypeId: item.id,
          quantity: 2,
          supplierId: alternateSupplier.id,
        },
      ],
      orderDate: "2026-08-17",
      organizationId,
    })
    const overrideLines = (
      await store.listPurchaseOrders(organizationId)
    ).filter((line) => line.purchaseOrderId === override.orders[0]?.id)
    expect(overrideLines).toContainEqual(
      expect.objectContaining({
        supplierId: alternateSupplier.id,
        unitPrice: "110.00",
      })
    )
  })

  test("creates one multi-line Purchase Order per current Supplier Price", async () => {
    const firstSupplier = await store.createSupplier({
      name: `Grouped PO Supplier A ${suffix}`,
      organizationId,
    })
    const secondSupplier = await store.createSupplier({
      name: `Grouped PO Supplier B ${suffix}`,
      organizationId,
    })
    const firstItem = await store.createItemType({
      ...(await createClassification("Grouped PO First")),
      assetType: "CONSUMABLE",
      identificationName: "Grouped PO First Item",
      organizationId,
      unit: "Nos",
    })
    const secondItem = await store.createItemType({
      ...(await createClassification("Grouped PO Second")),
      assetType: "CONSUMABLE",
      identificationName: "Grouped PO Second Item",
      organizationId,
      unit: "Nos",
    })
    const thirdItem = await store.createItemType({
      ...(await createClassification("Grouped PO Third")),
      assetType: "CONSUMABLE",
      identificationName: "Grouped PO Third Item",
      organizationId,
      unit: "Nos",
    })
    await store.createSupplierPrice({
      itemTypeId: firstItem.id,
      organizationId,
      supplierId: firstSupplier.id,
      unitPrice: "11.50",
      validFrom: "2026-08-01",
    })
    await store.createSupplierPrice({
      itemTypeId: secondItem.id,
      organizationId,
      supplierId: firstSupplier.id,
      unitPrice: "22.75",
      validFrom: "2026-08-01",
    })
    await store.createSupplierPrice({
      itemTypeId: thirdItem.id,
      organizationId,
      supplierId: secondSupplier.id,
      unitPrice: "33.25",
      validFrom: "2026-08-01",
    })

    const created = await store.createPurchaseOrdersFromSelection({
      items: [
        { itemTypeId: firstItem.id, quantity: 2 },
        { itemTypeId: secondItem.id, quantity: 3 },
        { itemTypeId: thirdItem.id, quantity: 4 },
      ],
      orderDate: "2026-08-17",
      organizationId,
    })

    expect(created.orders).toHaveLength(2)
    const register = await store.listPurchaseOrders(organizationId)
    const createdNumbers = new Set(
      created.orders.map((order) => order.orderNumber)
    )
    const lines = register.filter((line) =>
      createdNumbers.has(line.orderNumber)
    )
    expect(lines).toHaveLength(3)
    expect(new Set(lines.map((line) => line.orderNumber)).size).toBe(2)
    expect(
      lines.filter((line) => line.supplierId === firstSupplier.id)
    ).toHaveLength(2)
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemTypeId: firstItem.id,
          orderedQuantity: "2",
          supplierId: firstSupplier.id,
          unitPrice: "11.50",
        }),
        expect.objectContaining({
          itemTypeId: secondItem.id,
          orderedQuantity: "3",
          supplierId: firstSupplier.id,
          unitPrice: "22.75",
        }),
        expect.objectContaining({
          itemTypeId: thirdItem.id,
          orderedQuantity: "4",
          supplierId: secondSupplier.id,
          unitPrice: "33.25",
        }),
      ])
    )
  })

  test("creates one numbered Store Request containing multiple coded item lines", async () => {
    const location = await store.createLocation({
      code: `GROUP-${suffix}`,
      name: "Grouped Request Store",
      organizationId,
    })
    const firstClassification = await createClassification("Grouped Gloves")
    const secondClassification = await createClassification("Grouped Inserts")
    const gloves = await store.createItemType({
      ...firstClassification,
      assetType: "CONSUMABLE",
      identificationName: "Grouped Safety Gloves",
      organizationId,
      unit: "Pairs",
    })
    const inserts = await store.createItemType({
      ...secondClassification,
      assetType: "CONSUMABLE",
      identificationName: "Grouped Carbide Inserts",
      organizationId,
      unit: "Nos",
    })

    const request = await store.createRequisitionBatch({
      department: "Production",
      items: [
        { itemTypeId: gloves.id, quantity: 3 },
        { itemTypeId: inserts.id, quantity: 6 },
      ],
      locationId: location.id,
      organizationId,
      requestedBy: "Production Supervisor",
    })

    expect(request.requestNumber).toMatch(/^STR-REQ-\d{4}-\d{6}$/)
    const listed = await store.listRequisitions({ organizationId })
    const lines = listed.rows.filter(
      (line) => line.requestNumber === request.requestNumber
    )
    expect(lines).toHaveLength(2)
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemTypeId: gloves.id,
          requestedQuantity: "3",
        }),
        expect.objectContaining({
          itemTypeId: inserts.id,
          requestedQuantity: "6",
        }),
      ])
    )
  })

  test("receives stock only against the remaining Purchase Order quantity", async () => {
    const location = await store.createLocation({
      code: `PO-${suffix}`,
      name: "Purchase Receipt Store",
      organizationId,
    })
    const supplier = await store.createSupplier({
      name: `Test Supplier ${suffix}`,
      organizationId,
    })
    const classification = await createClassification("Purchase Order")
    const itemType = await store.createItemType({
      ...classification,
      assetType: "CONSUMABLE",
      identificationName: "Purchase Order Test Item",
      organizationId,
      unit: "Nos",
    })
    const order = await store.createPurchaseOrder({
      itemTypeId: itemType.id,
      orderDate: "2026-08-17",
      organizationId,
      quantity: 5,
      supplierId: supplier.id,
      unitPrice: "125.00",
    })

    await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: order.id,
      quantity: 2,
    })

    await expect(
      store.receiveStock({
        locationId: location.id,
        organizationId,
        purchaseOrderLineId: order.id,
        quantity: 4,
      })
    ).rejects.toThrow("remaining Purchase Order quantity")
    expect(await store.listPurchaseOrders(organizationId)).toContainEqual(
      expect.objectContaining({
        id: order.id,
        orderedQuantity: "5",
        receivedQuantity: "2",
        status: "Partially Received",
      })
    )
    expect(await store.listItemTypes(organizationId)).toContainEqual(
      expect.objectContaining({
        id: itemType.id,
        storageLocations: "Purchase Receipt Store",
      })
    )
  })

  test("uses classification masters and generates immutable Asset Codes", async () => {
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
      assetType: "NON_CONSUMABLE",
      identificationName: `Clear Safety Glasses ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const second = await store.createItemType({
      assetCategoryId: category.id,
      assetNameId: assetName.id,
      assetSubcategoryId: subcategory.id,
      assetType: "CONSUMABLE",
      identificationName: `Tinted Safety Glasses ${suffix}`,
      organizationId,
      unit: "Nos",
    })

    expect(first.typeCode).toMatch(/^NC\d{3,}$/)
    expect(second.typeCode).toMatch(/^C\d{3,}$/)

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
    const items = await store.listItemTypes(organizationId)
    const migratedLegacyItem = items.find(
      (item) => item.id === legacyItemTypeId
    )
    expect(migratedLegacyItem?.typeCode).toMatch(/^NC\d{3,}$/)
    const migratedLegacyAsset = await pool.query<{
      asset_code: string
      next_asset_number: number
    }>(
      `SELECT asset.asset_code, item.next_asset_number
       FROM store.assets asset
       JOIN store.item_types item ON item.id = asset.item_type_id
       WHERE asset.id = $1`,
      [legacyAssetId]
    )
    expect(migratedLegacyAsset.rows[0]?.asset_code).toBe(
      `${migratedLegacyItem?.typeCode}-0001`
    )
    expect(migratedLegacyAsset.rows[0]?.next_asset_number).toBe(2)
  })

  test("reuses the Asset Code for an existing Store Item combination", async () => {
    const classification = await createClassification("Idempotent Store Item")
    const first = await store.createItemType({
      ...classification,
      assetType: "NON_CONSUMABLE",
      identificationName: `Existing Drill ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const repeated = await store.createItemType({
      ...classification,
      assetType: "NON_CONSUMABLE",
      identificationName: `Repeated Drill ${suffix}`,
      organizationId,
      unit: "Nos",
    })

    expect(repeated).toEqual(first)
    const matchingItems = (await store.listItemTypes(organizationId)).filter(
      (item) =>
        item.assetType === "NON_CONSUMABLE" &&
        item.assetCategoryId === classification.assetCategoryId &&
        item.assetSubcategoryId === classification.assetSubcategoryId &&
        item.assetNameId === classification.assetNameId
    )
    expect(matchingItems).toHaveLength(1)
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
      assetType: "CONSUMABLE",
      identificationName: "CNMG Insert",
      organizationId,
      unit: "Nos",
    })
    const order = await createPurchaseOrder(itemType.id, 5, "125.00")
    await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: order.id,
      quantity: 5,
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
      assetType: "NON_CONSUMABLE",
      identificationName: "CNC Operator Chair",
      organizationId,
      unit: "Nos",
    })
    const order = await createPurchaseOrder(itemType.id, 2, "4500.00")
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: order.id,
      quantity: 2,
    })
    expect(receipt.assetCodes).toEqual([
      `${itemType.typeCode}-0001`,
      `${itemType.typeCode}-0002`,
    ])
    expect(
      (await store.listItemTypes(organizationId)).find(
        (item) => item.id === itemType.id
      )?.availableUnitIds
    ).toEqual(receipt.assetCodes)

    const itemWorkspace = await store.getItemTypeWorkspace({
      organizationId,
      typeCode: itemType.typeCode,
    })
    expect(itemWorkspace?.item.typeCode).toBe(itemType.typeCode)
    expect(itemWorkspace?.assets.map((asset) => asset.assetCode)).toEqual(
      receipt.assetCodes
    )
    expect(itemWorkspace?.supplierPrices).toContainEqual(
      expect.objectContaining({
        supplierName: expect.any(String),
        unitPrice: "4500.00",
      })
    )

    const request = await store.createRequisition({
      department: "Production",
      itemTypeId: itemType.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "Production Supervisor",
    })
    expect(
      (await store.listRequisitions({ organizationId })).rows.find(
        (row) => row.id === request.id
      )?.availableUnitIds
    ).toEqual(receipt.assetCodes)
    await store.issueRequisition({
      assetCode: receipt.assetCodes[0],
      holderType: "DEPARTMENT",
      issuedBy: "store.manager@mayankrawmint.com",
      organizationId,
      quantity: 1,
      requisitionId: request.id,
    })
    expect(
      (await store.listRequisitions({ organizationId })).rows.find(
        (row) => row.id === request.id
      )?.availableUnitIds
    ).toEqual([receipt.assetCodes[1]])
    expect(
      (await store.listRecentStockMovements(organizationId)).find(
        (movement) => movement.assetCode === receipt.assetCodes[0]
      )
    ).toEqual(
      expect.objectContaining({
        movedBy: "store.manager@mayankrawmint.com",
        toHolder: expect.stringContaining("Production"),
      })
    )
    const vendor = await store.createVendor({
      code: `REPAIR-${suffix}`,
      name: "Approved Repair Vendor",
      organizationId,
    })
    await store.moveAsset({
      assetCode: receipt.assetCodes[0]!,
      holderType: "VENDOR",
      organizationId,
      vendorId: vendor.id,
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
    const replacementOrder = await createPurchaseOrder(
      itemType.id,
      1,
      "4750.00"
    )
    const replacement = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: replacementOrder.id,
      quantity: 1,
    })
    expect(replacement.assetCodes).toEqual([`${itemType.typeCode}-0003`])

    const workspace = await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
    })
    expect(workspace?.asset.status).toBe("BROKEN")
    expect(workspace?.asset.holderType).toBe("VENDOR")
    expect(workspace?.asset.holderName).toBe("Approved Repair Vendor")
    expect(
      workspace?.movements.map((movement) => movement.movementType)
    ).toEqual(
      expect.arrayContaining(["RECEIPT", "ISSUE", "TRANSFER_OUT", "ADJUSTMENT"])
    )
    expect(workspace?.maintenance[0]?.maintenanceType).toBe("CALIBRATION")
    expect(workspace?.schedules[0]?.nextDueOn).toBe("2026-09-19")
  })

  test("creates a Repair PO against one Physical Asset and keeps its drawing", async () => {
    const location = await store.createLocation({
      code: `REPAIR-STORE-${suffix}`,
      name: `Repair Store ${suffix}`,
      organizationId,
    })
    const item = await store.createItemType({
      ...(await createClassification("Repair PO")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Repairable Gauge ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 1, "5000.00"))
        .id,
      quantity: 1,
    })
    const repairSupplier = await store.createSupplier({
      name: `Repair Service Supplier ${suffix}`,
      organizationId,
    })
    const repairOrder = await store.createRepairPurchaseOrder({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
      orderDate: "2026-08-19",
      serviceDescription: "Replace bearing and recalibrate",
      servicePrice: "850.00",
      supplierId: repairSupplier.id,
    })
    await expect(
      store.createRepairPurchaseOrder({
        assetCode: receipt.assetCodes[0]!,
        organizationId,
        serviceDescription: "Duplicate open repair",
        servicePrice: "900.00",
        supplierId: repairSupplier.id,
      })
    ).rejects.toThrow("already has an open Repair PO")
    const drawing = await store.recordItemTypeDrawing({
      fileName: "gauge-drawing.pdf",
      itemTypeId: item.id,
      organizationId,
      storageKey: `store/drawings/${suffix}-gauge.pdf`,
    })

    expect(
      (await store.listPurchaseOrders(organizationId)).find(
        (order) => order.purchaseOrderId === repairOrder.id
      )
    ).toEqual(
      expect.objectContaining({
        orderType: "REPAIR",
        supplierId: repairSupplier.id,
        typeCode: receipt.assetCodes[0],
      })
    )
    const workspace = await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
    })
    expect(workspace?.asset.holderType).toBe("SUPPLIER")
    expect(workspace?.asset.holderName).toBe(
      `Repair Service Supplier ${suffix}`
    )
    expect(workspace?.repairOrders).toContainEqual(
      expect.objectContaining({ id: repairOrder.id })
    )
    await store.completeRepairPurchaseOrder({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
      purchaseOrderId: repairOrder.id,
    })
    expect(
      await store.getItemTypeDrawing({
        documentId: drawing.id,
        itemTypeId: item.id,
        organizationId,
      })
    ).toEqual({
      fileName: "gauge-drawing.pdf",
      storageKey: `store/drawings/${suffix}-gauge.pdf`,
    })
  })
})

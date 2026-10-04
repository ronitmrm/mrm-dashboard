import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { resetTestDatabase } from "../../../scripts/test-database-safety"
import {
  createArtifactService,
  type ArtifactStorageProvider,
} from "./artifacts"
import { createDepartmentStoreRepository } from "./department-stores"
import { migrateDatabase } from "./migrate"
import { createMaintenanceRepository } from "./maintenance"
import {
  authorizeStoreItemTypeArtifactTarget,
  authorizeStorePurchaseOrderArtifactTarget,
  authorizeStoreReceiptArtifactTarget,
  createStoreRepository,
  storePurchaseOrderPdfArtifactPurpose,
} from "./store"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"

const pool = new Pool({ connectionString })
const store = createStoreRepository({ connectionString })
const departmentStore = createDepartmentStoreRepository({ pool })
const suffix = randomUUID().slice(0, 8)
let organizationId: string
let mainAccountableStoreId: string
let legacyItemTypeId: string
let legacyAssetId: string
let legacyAssetCode: string

class StoreArtifactProvider implements ArtifactStorageProvider {
  readonly identifier = "uploadthing"
  readonly uploads: Array<{ bytes: Buffer; name: string }> = []

  async delete() {}

  async read() {
    return Buffer.alloc(0)
  }

  async resolveLegacyPublicUrl({ key }: { key: string }) {
    return `https://files.example.test/${key}`
  }

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    this.uploads.push({ bytes: input.bytes, name: input.name })
    const key = `store-artifact-${randomUUID()}`
    return { key, url: `https://files.example.test/${key}` }
  }
}

const issuanceProvider = new StoreArtifactProvider()
const issuanceArtifacts = createArtifactService({
  connectionString,
  provider: issuanceProvider,
})
const storeIssuedPdf: Parameters<
  ReturnType<typeof createStoreRepository>["createPurchaseOrdersFromSelection"]
>[0]["storeIssuedPdf"] = async ({
  document,
  organizationId: targetOrganizationId,
  purchaseOrderId,
}) => {
  await issuanceArtifacts.store({
    actorUserId: null,
    authorizeTarget: (client, { isRetry }) =>
      authorizeStorePurchaseOrderArtifactTarget(
        client,
        {
          organizationId: targetOrganizationId,
          purchaseOrderId,
        },
        { requirePendingState: !isRetry }
      ),
    bytes: Buffer.from(`%PDF-1.7\n${document.order.orderNumber}`),
    fileName: `${document.order.orderNumber}.pdf`,
    idempotencyKey: `issued-store-po-pdf:${purchaseOrderId}`,
    mediaType: "application/pdf",
    organizationId: targetOrganizationId,
    origin: "generated",
    purpose: storePurchaseOrderPdfArtifactPurpose,
    target: {
      id: purchaseOrderId,
      schema: "store",
      table: "purchase_orders",
    },
  })
}

beforeAll(async () => {
  await resetTestDatabase(pool, connectionString)
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
  const mainAccountableStore = await pool.query<{ id: string }>(
    `SELECT id FROM store.accountable_stores
     WHERE organization_id = $1 AND kind = 'MAIN'`,
    [organizationId]
  )
  mainAccountableStoreId = mainAccountableStore.rows[0]!.id
  const migratedAsset = await pool.query<{ assetCode: string }>(
    `SELECT asset_code AS "assetCode" FROM store.assets WHERE id = $1`,
    [legacyAssetId]
  )
  legacyAssetCode = migratedAsset.rows[0]!.assetCode
})

afterAll(async () => {
  await issuanceArtifacts.close()
  await departmentStore.close()
  await store.close()
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
  await store.createSupplierPrice({
    itemTypeId,
    organizationId,
    supplierId: supplier.id,
    unitPrice,
    validFrom: "2026-08-17",
  })
  const created = await store.createPurchaseOrdersFromSelection({
    issuanceId: randomUUID(),
    items: [{ itemTypeId, quantity, supplierId: supplier.id }],
    orderDate: "2026-08-17",
    organizationId,
    storeIssuedPdf,
  })
  const purchaseOrderId = created.orders[0]!.id
  const line = (await store.listPurchaseOrders(organizationId)).find(
    (candidate) => candidate.purchaseOrderId === purchaseOrderId
  )!
  return {
    id: line.id,
    orderNumber: created.orders[0]!.orderNumber,
    purchaseOrderId,
  }
}

describe("Store requests", () => {
  test("keeps new classification text on an uncoded item request", async () => {
    const request = await store.createCodeRequest({
      assetCategory: `New Category ${suffix}`,
      assetName: `New Asset ${suffix}`,
      assetSubcategory: `New Subcategory ${suffix}`,
      assetType: "NON_CONSUMABLE",
      department: "Test",
      identificationName: `New Identification ${suffix}`,
      organizationId,
      requestedBy: "store.integration@example.com",
    })
    const saved = await pool.query<{
      requested_asset_name: string
      requested_category_id: string | null
      resolved_item_type_id: string | null
      status: string
    }>(
      `SELECT requested_asset_name, requested_category_id, resolved_item_type_id, status
       FROM store.code_requests WHERE id = $1`,
      [request.id]
    )

    expect(saved.rows[0]).toEqual({
      requested_asset_name: `New Asset ${suffix}`,
      requested_category_id: null,
      resolved_item_type_id: null,
      status: "Pending",
    })

    const wrongType = await store.createItemType({
      ...(await createClassification("Wrong request type")),
      assetType: "CONSUMABLE",
      organizationId,
      unit: "Nos",
    })
    await expect(
      store.resolveCodeRequest({
        codeRequestId: request.id,
        itemTypeId: wrongType.id,
        organizationId,
        resolution: "Code Created",
      })
    ).rejects.toThrow("requested type")

    const matchingType = await store.createItemType({
      ...(await createClassification("Matching request type")),
      assetType: "NON_CONSUMABLE",
      organizationId,
      unit: "Nos",
    })
    await store.resolveCodeRequest({
      codeRequestId: request.id,
      itemTypeId: matchingType.id,
      organizationId,
      resolution: "Code Created",
    })
    expect(
      (await store.listCodeRequests(organizationId)).find(
        (row) => row.id === request.id
      )
    ).toMatchObject({
      linkedAssetCode: matchingType.typeCode,
      status: "Code Created",
    })
  })

  test("creates, edits and receives an item without Identification", async () => {
    const input = {
      ...(await createClassification("Optional Identification")),
      assetType: "NON_CONSUMABLE" as const,
      organizationId,
      unit: "No.",
    }
    const item = await store.createItemType(input)
    await store.updateItemType({
      ...input,
      id: item.id,
      identificationName: " ",
      manufacturerMake: "Kaishan",
      modelNumber: "APPM 15",
      ratedLoad: "15 kW",
    })
    const order = await createPurchaseOrder(item.id, 1, "100.00")
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: order.id,
      quantity: 1,
      receivedBy: "store.integration@example.com",
      unitDetails: {
        installedOn: "2026-09-20",
        manufacturerSerialNumber: "COMP-001",
      },
      warrantyPeriod: "365",
    })
    const result = await pool.query<{ identification_name: string }>(
      "SELECT identification_name FROM store.assets WHERE asset_code = $1 AND organization_id = $2",
      [receipt.assetCodes[0], organizationId]
    )
    expect(result.rows[0]?.identification_name).toBe("")
    expect((await store.listItemTypes(organizationId)).find((row) => row.id === item.id)).toMatchObject({
      manufacturerMake: "Kaishan",
      modelNumber: "APPM 15",
      ratedLoad: "15 kW",
    })
    expect((await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[0]!, organizationId,
    }))?.asset).toMatchObject({
      installedOn: "2026-09-20",
      manufacturerSerialNumber: "COMP-001",
      mcbNumber: null,
      warrantyPeriod: "365",
      warrantyUntil: "2027-09-20",
    })

    await expect(store.updateAssetEquipmentDetails({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
      stabilizerUnitId: "MISSING-STABILIZER",
    })).rejects.toThrow("Stabiliser Unit ID MISSING-STABILIZER was not found")

    await expect(store.updateAssetEquipmentDetails({
      assetCode: receipt.assetCodes[0]!,
      mcbNumber: "MISSING-MCB",
      organizationId,
    })).rejects.toThrow("MCB Unit ID MISSING-MCB was not found")

    const stabilizer = await store.createItemType({
      ...(await createClassification("Connected Stabilizer")),
      assetType: "NON_CONSUMABLE",
      organizationId,
      unit: "Nos",
    })
    const stabilizerOrder = await createPurchaseOrder(stabilizer.id, 1, "50.00")
    const stabilizerReceipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: stabilizerOrder.id,
      quantity: 1,
    })
    const mcb = await store.createItemType({
      ...(await createClassification("Connected MCB")),
      assetType: "NON_CONSUMABLE",
      organizationId,
      unit: "Nos",
    })
    const mcbOrder = await createPurchaseOrder(mcb.id, 1, "20.00")
    const mcbReceipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: mcbOrder.id,
      quantity: 1,
    })
    await store.updateAssetEquipmentDetails({
      assetCode: receipt.assetCodes[0]!,
      installedOn: "2026-09-21",
      manufacturerSerialNumber: "COMP-001",
      mcbNumber: mcbReceipt.assetCodes[0]!,
      organizationId,
      stabilizerUnitId: stabilizerReceipt.assetCodes[0]!,
      warrantyPeriod: "365",
    })
    expect((await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[0]!, organizationId,
    }))?.asset).toMatchObject({
      installedOn: "2026-09-21",
      mcbNumber: mcbReceipt.assetCodes[0],
      stabilizerUnitId: stabilizerReceipt.assetCodes[0],
      warrantyUntil: "2027-09-21",
    })
  })

  test("keeps current and superseded Item drawings while reusing Organization bytes", async () => {
    const firstItem = await store.createItemType({
      ...(await createClassification("Artifact Drawing One")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Artifact Drawing One ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const secondItem = await store.createItemType({
      ...(await createClassification("Artifact Drawing Two")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Artifact Drawing Two ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const provider = new StoreArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })
    const sharedBytes = Buffer.from("%PDF-1.7\nshared Store drawing")
    const replacementBytes = Buffer.from("%PDF-1.7\nreplacement Store drawing")
    const target = (itemTypeId: string) => ({
      id: itemTypeId,
      schema: "store",
      table: "item_types",
    })
    const saveDrawing = (input: {
      bytes: Buffer
      fileName: string
      idempotencyKey: string
      itemTypeId: string
    }) =>
      artifacts.store({
        actorUserId: null,
        authorizeTarget: (client) =>
          authorizeStoreItemTypeArtifactTarget(client, {
            itemTypeId: input.itemTypeId,
            organizationId,
          }),
        bytes: input.bytes,
        fileName: input.fileName,
        idempotencyKey: input.idempotencyKey,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "asset_drawing",
        target: target(input.itemTypeId),
      })

    try {
      const first = await saveDrawing({
        bytes: sharedBytes,
        fileName: "drawing-v1.pdf",
        idempotencyKey: `store-drawing:${firstItem.id}:v1`,
        itemTypeId: firstItem.id,
      })
      const duplicate = await saveDrawing({
        bytes: sharedBytes,
        fileName: "drawing-copy.pdf",
        idempotencyKey: `store-drawing:${secondItem.id}:v1`,
        itemTypeId: secondItem.id,
      })
      const replacement = await saveDrawing({
        bytes: replacementBytes,
        fileName: "drawing-v2.pdf",
        idempotencyKey: `store-drawing:${firstItem.id}:v2`,
        itemTypeId: firstItem.id,
      })

      expect(first.id).not.toBe(duplicate.id)
      expect(first.providerKey).toBe(duplicate.providerKey)
      expect(provider.uploads).toHaveLength(2)
      await expect(
        artifacts.listHistory({
          organizationId,
          purpose: "asset_drawing",
          target: target(firstItem.id),
        })
      ).resolves.toMatchObject([
        {
          fileName: "drawing-v2.pdf",
          isCurrent: true,
          lifecycleState: "current",
          version: 2,
        },
        {
          fileName: "drawing-v1.pdf",
          isCurrent: false,
          lifecycleState: "superseded",
          version: 1,
        },
      ])
      await expect(
        store.getItemTypeDrawing({
          documentId: replacement.id,
          itemTypeId: firstItem.id,
          organizationId,
        })
      ).resolves.toMatchObject({
        fileName: "drawing-v2.pdf",
        physicalObjectId: expect.any(String),
        provider: "uploadthing",
        providerKey: replacement.providerKey,
        storageKey: replacement.providerKey,
      })
      const drawings = await store.listItemTypeDrawings(organizationId)
      expect(drawings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fileName: "drawing-v2.pdf",
            id: replacement.id,
            itemTypeId: firstItem.id,
          }),
          expect.objectContaining({
            fileName: "drawing-copy.pdf",
            id: duplicate.id,
            itemTypeId: secondItem.id,
          }),
        ])
      )
      const independentRows = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM store.documents
         WHERE item_type_id = ANY($1::uuid[])`,
        [[firstItem.id, secondItem.id]]
      )
      expect(independentRows.rows[0]?.count).toBe("0")
    } finally {
      await artifacts.close()
    }
  })

  test("shows canonical Guarantee Cards in Asset Workspace and keeps legacy Store files readable", async () => {
    const item = await store.createItemType({
      ...(await createClassification("Artifact Guarantee")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Artifact Guarantee ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const purchaseOrder = await createPurchaseOrder(item.id, 1, "200.00")
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const received = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: purchaseOrder.id,
      quantity: 1,
      receivedBy: "store.integration@example.com",
    })
    const assetCode = received.assetCodes[0]!
    const provider = new StoreArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })
    const target = {
      id: received.receiptId,
      schema: "store",
      table: "receipts",
    }

    try {
      const drawing = await artifacts.store({
        actorUserId: null,
        authorizeTarget: (client) =>
          authorizeStoreItemTypeArtifactTarget(client, {
            itemTypeId: item.id,
            organizationId,
          }),
        bytes: Buffer.from("%PDF-1.7\nphysical asset drawing"),
        fileName: "physical-asset-drawing.pdf",
        idempotencyKey: `store-drawing:${item.id}:physical-asset`,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "asset_drawing",
        target: { id: item.id, schema: "store", table: "item_types" },
      })
      const first = await artifacts.store({
        actorUserId: null,
        authorizeTarget: (client) =>
          authorizeStoreReceiptArtifactTarget(client, {
            organizationId,
            receiptId: received.receiptId,
          }),
        bytes: Buffer.from("%PDF-1.7\nfirst guarantee card"),
        fileName: "guarantee-v1.pdf",
        idempotencyKey: `store-guarantee:${received.receiptId}:v1`,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "guarantee_card",
        target,
      })
      const replacement = await artifacts.store({
        actorUserId: null,
        authorizeTarget: (client) =>
          authorizeStoreReceiptArtifactTarget(client, {
            organizationId,
            receiptId: received.receiptId,
          }),
        bytes: Buffer.from("%PDF-1.7\nreplacement guarantee card"),
        fileName: "guarantee-v2.pdf",
        idempotencyKey: `store-guarantee:${received.receiptId}:v2`,
        mediaType: "application/pdf",
        organizationId,
        origin: "uploaded",
        purpose: "guarantee_card",
        target,
      })

      await expect(
        artifacts.listHistory({
          organizationId,
          purpose: "guarantee_card",
          target,
        })
      ).resolves.toMatchObject([
        { fileName: "guarantee-v2.pdf", isCurrent: true, version: 2 },
        {
          fileName: "guarantee-v1.pdf",
          isCurrent: false,
          lifecycleState: "superseded",
          version: 1,
        },
      ])
      const workspace = await store.getAssetWorkspace({
        assetCode,
        organizationId,
      })
      expect(workspace?.documents).toContainEqual(
        expect.objectContaining({
          documentType: "GUARANTEE_CARD",
          fileName: "guarantee-v2.pdf",
          id: replacement.id,
        })
      )
      expect(workspace?.documents).toContainEqual(
        expect.objectContaining({
          documentType: "ASSET_DRAWING",
          fileName: "physical-asset-drawing.pdf",
          id: drawing.id,
        })
      )
      await expect(
        store.getAssetDocument({
          assetCode,
          documentId: replacement.id,
          organizationId,
        })
      ).resolves.toMatchObject({
        fileName: "guarantee-v2.pdf",
        physicalObjectId: expect.any(String),
        provider: "uploadthing",
        providerKey: replacement.providerKey,
        storageKey: replacement.providerKey,
      })
      const independentRows = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM store.documents
         WHERE receipt_id = $1 AND document_type = 'GUARANTEE_CARD'`,
        [received.receiptId]
      )
      expect(independentRows.rows[0]?.count).toBe("0")

      const legacyDrawing = await store.recordItemTypeDrawing({
        fileName: "legacy-drawing.pdf",
        itemTypeId: legacyItemTypeId,
        organizationId,
        storageKey: "store/drawings/legacy-drawing.pdf",
      })
      await expect(
        store.getItemTypeDrawing({
          documentId: legacyDrawing.id,
          itemTypeId: legacyItemTypeId,
          organizationId,
        })
      ).resolves.toMatchObject({
        byteSize: null,
        fileName: "legacy-drawing.pdf",
        physicalObjectId: null,
        provider: null,
        providerKey: null,
        storageKey: "store/drawings/legacy-drawing.pdf",
      })
      const legacyGuarantee = await pool.query<{ id: string }>(
        `INSERT INTO store.documents (
           organization_id, asset_id, document_type, file_name, storage_key
         ) VALUES ($1, $2, 'GUARANTEE_CARD', $3, $4)
         RETURNING id`,
        [
          organizationId,
          legacyAssetId,
          "legacy-guarantee.pdf",
          "store/legacy-guarantee.pdf",
        ]
      )
      await expect(
        store.getAssetDocument({
          assetCode: legacyAssetCode,
          documentId: legacyGuarantee.rows[0]!.id,
          organizationId,
        })
      ).resolves.toMatchObject({
        byteSize: null,
        fileName: "legacy-guarantee.pdf",
        physicalObjectId: null,
        provider: null,
        providerKey: null,
        storageKey: "store/legacy-guarantee.pdf",
      })
      expect(first.id).not.toBe(replacement.id)
    } finally {
      await artifacts.close()
    }
  })

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
      issuanceId: randomUUID(),
      items: [
        {
          itemTypeId: item.id,
          quantity: 2,
          supplierId: alternateSupplier.id,
        },
      ],
      orderDate: "2026-08-17",
      organizationId,
      storeIssuedPdf,
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
      issuanceId: randomUUID(),
      items: [
        { itemTypeId: firstItem.id, quantity: 2 },
        { itemTypeId: secondItem.id, quantity: 3 },
        { itemTypeId: thirdItem.id, quantity: 4 },
      ],
      orderDate: "2026-08-17",
      organizationId,
      storeIssuedPdf,
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
    await store.createSupplierPrice({
      itemTypeId: itemType.id,
      organizationId,
      supplierId: supplier.id,
      unitPrice: "125.00",
      validFrom: "2026-08-17",
    })
    const createdOrder = await store.createPurchaseOrdersFromSelection({
      issuanceId: randomUUID(),
      items: [{ itemTypeId: itemType.id, quantity: 5 }],
      orderDate: "2026-08-17",
      organizationId,
      storeIssuedPdf,
    })
    const order = (await store.listPurchaseOrders(organizationId)).find(
      (candidate) => candidate.purchaseOrderId === createdOrder.orders[0]!.id
    )!

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

  test("bulk receives selected lines from one Purchase Order under shared receipt details", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const supplier = await store.createSupplier({
      name: `Bulk Receipt Supplier ${suffix}`,
      organizationId,
    })
    const firstItem = await store.createItemType({
      ...(await createClassification("Bulk Receipt One")),
      assetType: "CONSUMABLE",
      identificationName: `Bulk Receipt One ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const secondItem = await store.createItemType({
      ...(await createClassification("Bulk Receipt Two")),
      assetType: "CONSUMABLE",
      identificationName: `Bulk Receipt Two ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    await store.createSupplierPrice({
      itemTypeId: firstItem.id,
      organizationId,
      supplierId: supplier.id,
      unitPrice: "25.00",
      validFrom: "2026-08-17",
    })
    await store.createSupplierPrice({
      itemTypeId: secondItem.id,
      organizationId,
      supplierId: supplier.id,
      unitPrice: "50.00",
      validFrom: "2026-08-17",
    })
    const created = await store.createPurchaseOrdersFromSelection({
      issuanceId: randomUUID(),
      items: [
        { itemTypeId: firstItem.id, quantity: 3 },
        { itemTypeId: secondItem.id, quantity: 4 },
      ],
      orderDate: "2026-08-17",
      organizationId,
      storeIssuedPdf,
    })
    const orderLines = (await store.listPurchaseOrders(organizationId)).filter(
      (line) => line.purchaseOrderId === created.orders[0]!.id
    )
    expect(orderLines).toHaveLength(2)
    const firstOrderLine = orderLines.find(
      (line) => line.itemTypeId === firstItem.id
    )!
    const secondOrderLine = orderLines.find(
      (line) => line.itemTypeId === secondItem.id
    )!
    await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: firstOrderLine.id,
      quantity: 1,
    })

    const result = await store.receiveRemainingStockBatch({
      billDate: "2026-09-20",
      billNumber: "BULK-BILL-100",
      locationId: location.id,
      organizationId,
      purchaseOrderId: created.orders[0]!.id,
      purchaseOrderLineIds: orderLines.map((line) => line.id),
      warrantyUntil: "2027-09-20",
    })

    const receipt = await pool.query<{
      billDate: string
      billNumber: string
      lineCount: number
      purchaseOrderId: string
      warrantyDates: string[]
    }>(
      `SELECT receipt.purchase_order_id AS "purchaseOrderId",
        receipt.bill_number AS "billNumber", receipt.bill_date::text AS "billDate",
        count(line.id)::int AS "lineCount",
        array_agg(line.warranty_until::text ORDER BY line.id) AS "warrantyDates"
       FROM store.receipts receipt
       JOIN store.receipt_lines line ON line.receipt_id = receipt.id
       WHERE receipt.id = $1
       GROUP BY receipt.id`,
      [result.receiptId]
    )
    expect(receipt.rows[0]).toEqual({
      billDate: "2026-09-20",
      billNumber: "BULK-BILL-100",
      lineCount: 2,
      purchaseOrderId: created.orders[0]!.id,
      warrantyDates: ["2027-09-20", "2027-09-20"],
    })
    expect(await store.listPurchaseOrders(organizationId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstOrderLine.id,
          orderedQuantity: "3",
          receivedQuantity: "3",
          status: "Received",
        }),
        expect.objectContaining({
          id: secondOrderLine.id,
          orderedQuantity: "4",
          receivedQuantity: "4",
          status: "Received",
        }),
      ])
    )
  })

  test("bulk receipt rejects lines from different Purchase Orders", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const firstItem = await store.createItemType({
      ...(await createClassification("Mixed Receipt One")),
      assetType: "CONSUMABLE",
      identificationName: `Mixed Receipt One ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const secondItem = await store.createItemType({
      ...(await createClassification("Mixed Receipt Two")),
      assetType: "CONSUMABLE",
      identificationName: `Mixed Receipt Two ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const firstOrder = await createPurchaseOrder(firstItem.id, 3, "25.00")
    const secondOrder = await createPurchaseOrder(secondItem.id, 4, "50.00")

    await expect(
      store.receiveRemainingStockBatch({
        locationId: location.id,
        organizationId,
        purchaseOrderId: firstOrder.purchaseOrderId,
        purchaseOrderLineIds: [firstOrder.id, secondOrder.id],
      })
    ).rejects.toThrow("one Purchase Order")
  })

  test("bulk allocates one Department with explicitly selected Unit IDs", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const consumable = await store.createItemType({
      ...(await createClassification("Bulk Allocation Consumable")),
      assetType: "CONSUMABLE",
      identificationName: `Bulk Allocation Consumable ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const serialized = await store.createItemType({
      ...(await createClassification("Bulk Allocation Serialized")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Bulk Allocation Serialized ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (
        await createPurchaseOrder(consumable.id, 3, "10.00")
      ).id,
      quantity: 3,
    })
    await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (
        await createPurchaseOrder(serialized.id, 2, "100.00")
      ).id,
      quantity: 2,
    })
    const consumableRequest = await store.createRequisition({
      department: "Quality Control",
      itemTypeId: consumable.id,
      locationId: location.id,
      organizationId,
      quantity: 3,
      requestedBy: "QC Supervisor",
    })
    const serializedRequest = await store.createRequisition({
      department: "Quality Control",
      itemTypeId: serialized.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "QC Inspector",
    })
    const serializedRow = (
      await store.listRequisitions({ organizationId })
    ).rows.find((request) => request.id === serializedRequest.id)!
    const selectedUnitId = serializedRow.availableUnitIds.at(-1)!
    const unselectedUnitId = serializedRow.availableUnitIds.find(
      (unitId) => unitId !== selectedUnitId
    )!

    const result = await store.issueRemainingRequisitionBatch({
      issuedBy: "store.manager@mayankrawmint.com",
      lines: [
        { requisitionId: consumableRequest.id },
        {
          assetCodes: [selectedUnitId],
          requisitionId: serializedRequest.id,
        },
      ],
      organizationId,
    })

    expect(result.allocations).toHaveLength(2)
    const requests = await store.listRequisitions({ organizationId })
    expect(
      requests.rows
        .filter((request) =>
          [consumableRequest.id, serializedRequest.id].includes(request.id)
        )
        .map((request) => request.status)
    ).toEqual(["Fulfilled", "Fulfilled"])
    expect(
      (await store.listAssets({ organizationId }))
        .filter((asset) => asset.itemTypeId === serialized.id)
        .map((asset) => ({
          assetCode: asset.assetCode,
          holderName: asset.holderName,
          status: asset.status,
        }))
    ).toEqual(
      expect.arrayContaining([
        {
          assetCode: selectedUnitId,
          holderName: "Quality Control",
          status: "ASSIGNED",
        },
        expect.objectContaining({
          assetCode: unselectedUnitId,
          status: "AVAILABLE",
        }),
      ])
    )
  })

  test("issues only the exact Unit ID named in a Store request", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const item = await store.createItemType({
      ...(await createClassification("Exact Unit Request")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Exact Unit Request ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 2, "100.00")).id,
      quantity: 2,
    })
    const requestedCode = receipt.assetCodes[0]!
    const otherCode = receipt.assetCodes[1]!
    const requestedUnit = (await store.listAssets({ organizationId })).find(
      (asset) => asset.assetCode === requestedCode
    )!
    const request = await store.createRequisitionBatch({
      department: "Production",
      items: [
        { itemTypeId: item.id, quantity: 1, requestedUnitId: requestedUnit.id },
      ],
      locationId: location.id,
      organizationId,
      requestedBy: "Production Supervisor",
    })
    const lineId = request.lineIds[0]!
    const listed = (await store.listRequisitions({ organizationId })).rows.find(
      (line) => line.id === lineId
    )!
    expect(listed).toEqual(
      expect.objectContaining({
        requestedUnitCode: requestedCode,
        requestedUnitId: requestedUnit.id,
        availableUnitIds: [requestedCode],
      })
    )

    await expect(
      store.issueRemainingRequisitionBatch({
        lines: [{ assetCodes: [otherCode], requisitionId: lineId }],
        organizationId,
      })
    ).rejects.toThrow("exact Unit ID")
    expect(
      (await store.listRequisitions({ organizationId })).rows.find(
        (line) => line.id === lineId
      )?.status
    ).toBe("Pending")

    await store.issueRemainingRequisitionBatch({
      lines: [{ assetCodes: [requestedCode], requisitionId: lineId }],
      organizationId,
    })
    expect(
      (await store.listRequisitions({ organizationId })).rows.find(
        (line) => line.id === lineId
      )?.status
    ).toBe("Fulfilled")
    expect(
      (await store.listAssets({ organizationId }))
        .filter((asset) => [requestedCode, otherCode].includes(asset.assetCode))
        .map((asset) => ({ code: asset.assetCode, status: asset.status }))
    ).toEqual(
      expect.arrayContaining([
        { code: requestedCode, status: "ASSIGNED" },
        { code: otherCode, status: "AVAILABLE" },
      ])
    )
  })

  test("Store can cancel an open request line and prevent later issue", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const item = await store.createItemType({
      ...(await createClassification("Cancelled Request")),
      assetType: "CONSUMABLE",
      identificationName: `Cancelled Request ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const request = await store.createRequisition({
      department: "Production",
      itemTypeId: item.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "Production Supervisor",
    })

    await store.cancelRequisition({ organizationId, requisitionId: request.id })
    expect(
      (await store.listRequisitions({ organizationId })).rows.find(
        (row) => row.id === request.id
      )?.status
    ).toBe("Cancelled")
    await expect(
      store.issueRequisition({
        organizationId,
        quantity: 1,
        requisitionId: request.id,
      })
    ).rejects.toThrow("already closed")
  })

  test("bulk allocation rejects request lines for different Departments", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const item = await store.createItemType({
      ...(await createClassification("Mixed Department Allocation")),
      assetType: "CONSUMABLE",
      identificationName: `Mixed Department Allocation ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 2, "10.00")).id,
      quantity: 2,
    })
    const productionRequest = await store.createRequisition({
      department: "Production",
      itemTypeId: item.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "Production Supervisor",
    })
    const qualityRequest = await store.createRequisition({
      department: "Quality Control",
      itemTypeId: item.id,
      locationId: location.id,
      organizationId,
      quantity: 1,
      requestedBy: "QC Inspector",
    })

    await expect(
      store.issueRemainingRequisitionBatch({
        lines: [
          { requisitionId: productionRequest.id },
          { requisitionId: qualityRequest.id },
        ],
        organizationId,
      })
    ).rejects.toThrow("one Department")
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
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drawingNumber: first.typeCode,
          id: first.id,
        }),
        expect.objectContaining({
          drawingNumber: second.typeCode,
          id: second.id,
        }),
      ])
    )
    const migratedLegacyItem = items.find(
      (item) => item.id === legacyItemTypeId
    )
    expect(migratedLegacyItem?.typeCode).toMatch(/^NC\d{3,}$/)
    expect(migratedLegacyItem?.drawingNumber).toBe(migratedLegacyItem?.typeCode)
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
    const locationCode = `ASSET-${suffix}`
    const location = await store.createLocation({
      code: locationCode,
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
      billDate: "2026-08-17",
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: order.id,
      quantity: 1,
    })
    const maintenanceCode = `MM-${suffix}`
    const definition = await pool.query<{ id: string }>(
      `INSERT INTO maintenance.definitions (
        organization_id, code, name, frequency_unit, frequency_value,
        source_system, source_table, source_id
      ) VALUES ($1, $2, 'Quarterly inspection', 'day', 90,
        'store-test', 'maintenance_master', $3)
      RETURNING id`,
      [organizationId, maintenanceCode, randomUUID()]
    )
    await store.scheduleAssetMaintenanceMaster({
      assetCode: receipt.assetCodes[0]!,
      definitionId: definition.rows[0]!.id,
      firstDueOn: "2026-08-22",
      organizationId,
    })
    const firstMasterSchedule = (
      await store.getAssetWorkspace({
        assetCode: receipt.assetCodes[0]!,
        organizationId,
      })
    )?.schedules.find((schedule) => schedule.code === maintenanceCode)
    expect(firstMasterSchedule).toEqual(
      expect.objectContaining({
        frequencyDays: 90,
        name: "Quarterly inspection",
        nextDueOn: "2026-08-22",
        scheduleType: "MAINTENANCE",
      })
    )

    const secondReceipt = await store.receiveStock({
      billDate: "2026-09-01",
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: order.id,
      quantity: 1,
    })
    const assetCodes: [string, string] = [
      receipt.assetCodes[0]!,
      secondReceipt.assetCodes[0]!,
    ]
    expect(assetCodes).toEqual([
      `${itemType.typeCode}-0001`,
      `${itemType.typeCode}-0002`,
    ])
    const inheritedSecondSchedule = (
      await store.getAssetWorkspace({
        assetCode: assetCodes[1],
        organizationId,
      })
    )?.schedules.find((schedule) => schedule.code === maintenanceCode)
    expect(inheritedSecondSchedule).toBeUndefined()
    await store.scheduleAssetMaintenanceMaster({
      assetCode: assetCodes[1],
      definitionId: definition.rows[0]!.id,
      firstDueOn: "2026-11-30",
      organizationId,
    })
    const secondMasterSchedule = (
      await store.getAssetWorkspace({
        assetCode: assetCodes[1],
        organizationId,
      })
    )?.schedules.find((schedule) => schedule.code === maintenanceCode)
    expect(secondMasterSchedule).toEqual(
      expect.objectContaining({
        frequencyDays: 90,
        nextDueOn: "2026-11-30",
        scheduleType: "MAINTENANCE",
      })
    )
    expect(
      (await store.listItemTypes(organizationId)).find(
        (item) => item.id === itemType.id
      )?.availableUnitIds
    ).toEqual(assetCodes)
    const qualityStore = await departmentStore.getStoreByCode(
      organizationId,
      "QUALITY"
    )
    await expect(
      store.moveAsset({
        assetCode: assetCodes[0],
        holderReference: qualityStore.defaultLocationId,
        holderType: "STORE",
        organizationId,
      })
    ).rejects.toThrow("Destination Store location was not found.")

    const itemWorkspace = await store.getItemTypeWorkspace({
      organizationId,
      typeCode: itemType.typeCode,
    })
    expect(itemWorkspace?.item.typeCode).toBe(itemType.typeCode)
    expect(itemWorkspace?.assets.map((asset) => asset.assetCode)).toEqual(
      assetCodes
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
    ).toEqual(assetCodes)
    await store.issueRequisition({
      assetCode: assetCodes[0],
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
    ).toEqual([assetCodes[1]])
    expect(
      (await store.listRecentStockMovements(organizationId)).find(
        (movement) => movement.assetCode === assetCodes[0]
      )
    ).toEqual(
      expect.objectContaining({
        movedBy: "store.manager@mayankrawmint.com",
        toHolder: expect.stringContaining("Production"),
      })
    )
    const holderRows = await pool.query<{
      from_holder_name: string | null
      from_holder_reference: string | null
      movement_type: string
      to_holder_name: string | null
      to_holder_reference: string | null
    }>(
      `SELECT movement_type, from_holder_reference, from_holder_name,
        to_holder_reference, to_holder_name
       FROM store.stock_movements movement
       JOIN store.assets asset ON asset.id = movement.asset_id
       WHERE asset.organization_id = $1 AND asset.asset_code = $2`,
      [organizationId, assetCodes[0]]
    )
    expect(holderRows.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        movement_type: "RECEIPT",
        to_holder_reference: locationCode,
        to_holder_name: "Asset Store",
      }),
      expect.objectContaining({
        movement_type: "ISSUE",
        from_holder_reference: locationCode,
        from_holder_name: "Asset Store",
      }),
    ]))
    const assetMovements = await store.listRecentAssetMovements(organizationId)
    expect(assetMovements.find((movement) =>
      movement.assetCode === assetCodes[0] && movement.movementType === "ISSUE"
    )).toEqual(expect.objectContaining({
      department: "Production",
      fromHolder: "STORE / Asset Store",
      toHolder: "DEPARTMENT / Production",
    }))
    const departmentCode = `MOVE-${suffix}`
    const departmentName = `Movement Department ${suffix}`
    await pool.query(
      `INSERT INTO recruitment.departments
        (organization_id, code, name, source_system, source_table, source_id)
       VALUES ($1, $2, $3, 'test', 'store_movement', $4)`,
      [organizationId, departmentCode, departmentName, randomUUID()]
    )
    expect(await store.listMovementDepartments(organizationId)).toContainEqual(
      expect.objectContaining({ code: departmentCode, name: departmentName })
    )
    await store.moveAsset({
      assetCode: assetCodes[0],
      holderReference: departmentCode.toLowerCase(),
      holderType: "DEPARTMENT",
      organizationId,
    })
    expect(
      (
        await store.getAssetWorkspace({
          assetCode: assetCodes[0],
          organizationId,
        })
      )?.asset
    ).toEqual(
      expect.objectContaining({
        holderName: departmentName,
        holderReference: departmentCode,
      })
    )
    await expect(
      store.moveAsset({
        assetCode: assetCodes[0],
        holderReference: `MISSING-${suffix}`,
        holderType: "DEPARTMENT",
        organizationId,
      })
    ).rejects.toThrow("Select a Department from Department Master.")
    const floor = await pool.query<{ id: string }>(
      `INSERT INTO manufacturing.production_floors (organization_id, code, name)
       VALUES ($1, 'cnc', 'CNC Production Floor')
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [organizationId]
    )
    const machineNumber = `CNC-${suffix}`
    const machineName = `Movement Machine ${suffix}`
    await pool.query(
      `INSERT INTO catalog.machines
        (organization_id, production_floor_id, machine_number, name,
         source_system, source_table, source_id)
       VALUES ($1, $2, $3, $4, 'test', 'store_movement', $5)`,
      [
        organizationId,
        floor.rows[0]!.id,
        machineNumber,
        machineName,
        randomUUID(),
      ]
    )
    expect(await store.listMovementMachines(organizationId)).toContainEqual({
      machineNumber,
      name: machineName,
    })
    await store.moveAsset({
      assetCode: assetCodes[0],
      holderReference: machineNumber.toLowerCase(),
      holderType: "MACHINE",
      organizationId,
    })
    expect(
      (
        await store.getAssetWorkspace({
          assetCode: assetCodes[0],
          organizationId,
        })
      )?.asset
    ).toEqual(
      expect.objectContaining({
        holderName: machineName,
        holderReference: machineNumber,
      })
    )
    const vendor = await store.createVendor({
      code: `REPAIR-${suffix}`,
      name: "Approved Repair Vendor",
      organizationId,
    })
    await store.moveAsset({
      assetCode: assetCodes[0],
      holderType: "VENDOR",
      organizationId,
      vendorId: vendor.id,
    })

    const schedule = await store.scheduleAssetMaintenance({
      assetCode: assetCodes[0],
      firstDueOn: "2026-08-20",
      frequencyDays: 30,
      name: "Monthly calibration",
      organizationId,
      scheduleType: "CALIBRATION",
    })
    expect(
      (
        await store.getAssetWorkspace({
          assetCode: assetCodes[0],
          organizationId,
        })
      )?.schedules.map(({ name, scheduleType }) => ({ name, scheduleType }))
    ).toEqual([
      { name: "Monthly calibration", scheduleType: "CALIBRATION" },
      { name: "Quarterly inspection", scheduleType: "MAINTENANCE" },
    ])
    const completion = await store.completeAssetMaintenance({
      assetCode: assetCodes[0],
      completedBy: "Maintenance Technician",
      completedOn: "2026-08-20",
      maintenanceType: "CALIBRATION",
      organizationId,
      scheduleId: schedule.id,
    })
    expect(completion.nextDueOn).toBe("2026-09-19")

    const maintenanceCompletion = await store.completeAssetMaintenance({
      assetCode: assetCodes[0],
      completedBy: "Maintenance Technician",
      completedOn: "2026-08-22",
      maintenanceType: "MAINTENANCE",
      organizationId,
      scheduleId: firstMasterSchedule!.id,
    })
    expect(maintenanceCompletion.nextDueOn).toBe("2026-11-20")
    const updatedFirstSchedule = (
      await store.getAssetWorkspace({ assetCode: assetCodes[0], organizationId })
    )?.schedules.find((entry) => entry.code === maintenanceCode)
    const unchangedSecondSchedule = (
      await store.getAssetWorkspace({ assetCode: assetCodes[1], organizationId })
    )?.schedules.find((entry) => entry.code === maintenanceCode)
    expect(updatedFirstSchedule?.nextDueOn).toBe("2026-11-20")
    expect(unchangedSecondSchedule?.nextDueOn).toBe(secondMasterSchedule?.nextDueOn)

    const maintenance = createMaintenanceRepository({ connectionString })
    try {
      const planned = {
        changedItems: ["Bearing"],
        checklistSteps: [],
        completedBy: "Maintenance Technician",
        completedByEmployeeCode: null,
        dueOn: "2026-11-20",
        organizationId,
        scheduleId: firstMasterSchedule!.id,
        startedAt: "2026-11-20T09:00:00+05:30",
        workDone: "Serviced",
      }
      const draft = await store.saveAssetMaintenanceTask({
        ...planned,
        status: "In Progress",
      })
      expect((await store.listAssetMaintenanceWork(organizationId))
        .find((row) => row.scheduleId === firstMasterSchedule!.id)?.taskStatus)
        .toBe("In Progress")
      await store.saveAssetMaintenanceTask({
        ...planned,
        endedAt: "2026-11-20T10:00:00+05:30",
        status: "Completed",
      })
      expect((await maintenance.listAssetMaintenancePlan(organizationId, "2026-11-01", "2026-11-30"))
        .find((row) => row.id === draft.id)).toMatchObject({
          assetCode: assetCodes[0], dueOn: "2026-11-20", status: "Completed",
        })
      expect((await maintenance.listCompletedAssetMaintenance(organizationId))
        .some((row) => row.assetCode === assetCodes[0] && row.workDone === "Serviced"))
        .toBe(true)
    } finally {
      await maintenance.close()
    }

    await store.setAssetLifecycleStatus({
      assetCode: assetCodes[0],
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
      assetCode: assetCodes[0],
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
    expect(workspace?.maintenance.map((record) => record.maintenanceType)).toContain("CALIBRATION")
    expect(workspace?.schedules.find((entry) => entry.id === schedule.id)?.nextDueOn).toBe("2026-09-19")
  })

  test("issues a calibration PO before QC dispatch and returns to its accountable store", async () => {
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const item = await store.createItemType({
      ...(await createClassification("Calibration service")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Calibration gauge ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 1, "1000.00")).id,
      quantity: 1,
    })
    const assetCode = receipt.assetCodes[0]!
    const schedule = await store.scheduleAssetMaintenance({
      assetCode,
      firstDueOn: "2026-10-01",
      frequencyDays: 365,
      name: "Yearly calibration",
      organizationId,
      scheduleType: "CALIBRATION",
    })
    const visit = await store.openCalibrationVisit({
      assetCode,
      organizationId,
      scheduleId: schedule.id,
      scope: "Gauge calibration",
    })
    const supplier = await store.createSupplier({
      name: `Calibration Supplier ${suffix}`,
      organizationId,
    })
    const offer = await store.addCalibrationOffer({
      accountableStoreId: mainAccountableStoreId,
      organizationId,
      quotedPrice: "250.00",
      supplierId: supplier.id,
      visitId: visit.id,
    })
    const prepared = await store.prepareCalibrationDispatch({
      accountableStoreId: mainAccountableStoreId,
      offerId: offer.id,
      organizationId,
      visitId: visit.id,
    })
    expect(prepared.alreadyIssued).toBe(false)
    await storeIssuedPdf({
      document: prepared.document,
      organizationId,
      purchaseOrderId: prepared.purchaseOrderId,
    })
    await store.issueCalibrationServiceOrder({
      accountableStoreId: mainAccountableStoreId,
      organizationId,
      visitId: visit.id,
    })
    expect((await store.getAssetWorkspace({ assetCode, organizationId }))?.asset.holderType)
      .toBe("STORE")
    await store.finalizeCalibrationDispatch({ organizationId, visitId: visit.id })
    expect((await store.getAssetWorkspace({ assetCode, organizationId }))?.asset.holderType)
      .toBe("SUPPLIER")
    const qualityLocation = await pool.query<{ id: string }>(
      `SELECT default_location_id AS id FROM store.accountable_stores
       WHERE organization_id = $1 AND code = 'QUALITY'`,
      [organizationId]
    )
    await expect(store.returnCalibrationVisit({
      locationId: qualityLocation.rows[0]!.id,
      organizationId,
      visitId: visit.id,
    })).rejects.toThrow("originating accountable store")
    await store.returnCalibrationVisit({ organizationId, visitId: visit.id })
    const returned = await store.getAssetWorkspace({ assetCode, organizationId })
    expect(returned?.asset).toMatchObject({
      accountableStoreCode: "MAIN",
      holderType: "STORE",
      status: "UNDER_MAINTENANCE",
    })
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
      accountableStoreId: mainAccountableStoreId,
      assetCode: receipt.assetCodes[0]!,
      issuanceId: randomUUID(),
      organizationId,
      orderDate: "2026-08-19",
      serviceDescription: "Replace bearing and recalibrate",
      servicePrice: "850.00",
      storeIssuedPdf,
      supplierId: repairSupplier.id,
    })
    await expect(
      store.createRepairPurchaseOrder({
        accountableStoreId: mainAccountableStoreId,
        assetCode: receipt.assetCodes[0]!,
        issuanceId: randomUUID(),
        organizationId,
        serviceDescription: "Duplicate open repair",
        servicePrice: "900.00",
        storeIssuedPdf,
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
      accountableStoreId: mainAccountableStoreId,
      assetCode: receipt.assetCodes[0]!,
      organizationId,
      purchaseOrderId: repairOrder.id,
      storeLocationId: location.id,
    })
    expect(
      await store.getItemTypeDrawing({
        documentId: drawing.id,
        itemTypeId: item.id,
        organizationId,
      })
    ).toEqual({
      byteSize: null,
      fileName: "gauge-drawing.pdf",
      mediaType: null,
      physicalObjectId: null,
      provider: null,
      providerKey: null,
      sha256: null,
      storageKey: `store/drawings/${suffix}-gauge.pdf`,
    })
  })

  test("issues one Repair PO for selected Unit IDs and tracks each completion", async () => {
    const location = await store.createLocation({
      code: `MULTI-REPAIR-${suffix}`,
      name: `Multi Repair Store ${suffix}`,
      organizationId,
    })
    const receivingLocation = await store.createLocation({
      code: `REPAIRED-${suffix}`,
      name: `Repaired Store ${suffix}`,
      organizationId,
    })
    const item = await store.createItemType({
      ...(await createClassification("Multi Repair PO")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Repairable Tool ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 3, "5000.00"))
        .id,
      quantity: 3,
    })
    const repairAssetCodes = receipt.assetCodes.slice(0, 2)
    const departmentCode = `REPAIR-DEPT-${suffix}`
    const departmentName = `Repair Department ${suffix}`
    const department = await pool.query<{ id: string }>(
      `INSERT INTO recruitment.departments
         (organization_id, code, name, source_system, source_table, source_id)
       VALUES ($1, $2, $3, 'test', 'repair_reassignment', $4)
       RETURNING id`,
      [organizationId, departmentCode, departmentName, randomUUID()]
    )
    await store.moveAsset({
      assetCode: repairAssetCodes[0]!,
      holderReference: departmentCode,
      holderType: "DEPARTMENT",
      organizationId,
    })
    const supplier = await store.createSupplier({
      name: `Multi Repair Supplier ${suffix}`,
      organizationId,
    })
    const order = await store.createRepairPurchaseOrderFromSelection({
      accountableStoreId: mainAccountableStoreId,
      issuanceId: randomUUID(),
      items: repairAssetCodes.map((assetCode, index) => ({
        assetCode,
        reassignmentDepartmentId: department.rows[0]!.id,
        serviceDescription: `Repair task ${index + 1}`,
        servicePrice: index === 0 ? "100.00" : "200.00",
      })),
      organizationId,
      storeIssuedPdf,
      supplierId: supplier.id,
    })
    const document = await store.getPurchaseOrder({
      organizationId,
      purchaseOrderId: order.id,
    })
    expect(document?.lines).toHaveLength(2)
    expect(document?.lines.map((line) => line.unitPrice).sort()).toEqual([
      "100.00",
      "200.00",
    ])
    await expect(
      store.createRepairPurchaseOrderFromSelection({
        accountableStoreId: mainAccountableStoreId,
        issuanceId: randomUUID(),
        items: [{
          assetCode: receipt.assetCodes[0]!,
          serviceDescription: "Overlapping repair",
          servicePrice: "50.00",
        }],
        organizationId,
        storeIssuedPdf,
        supplierId: supplier.id,
      })
    ).rejects.toThrow("already has an open Repair PO")
    for (const assetCode of repairAssetCodes) {
      const workspace = await store.getAssetWorkspace({
        assetCode,
        organizationId,
      })
      expect(workspace?.asset.holderType).toBe("SUPPLIER")
      expect(workspace?.repairOrders).toContainEqual(
        expect.objectContaining({ id: order.id })
      )
    }
    const dispatched = await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[0]!,
      organizationId,
    })
    expect(dispatched?.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        movementType: "RETURN",
        fromHolder: expect.stringContaining(departmentName),
        toHolder: `STORE / Multi Repair Store ${suffix}`,
      }),
      expect.objectContaining({
        movementType: "TRANSFER_OUT",
        fromHolder: `STORE / Multi Repair Store ${suffix}`,
      }),
    ]))
    const linkedRequest = async (assetCode: string) => (await pool.query<{
      department: string
      headerLocationId: string
      id: string
      locationId: string
      purpose: string | null
      requestedAssetId: string | null
      status: string
    }>(
      `SELECT request.id, request.location_id AS "locationId",
         header.location_id AS "headerLocationId",
         request.requested_asset_id AS "requestedAssetId",
         request.status, header.department, header.purpose
       FROM store.repair_purchase_order_items repair_item
       JOIN store.assets asset ON asset.id = repair_item.asset_id
       JOIN store.requisitions request
         ON request.id = repair_item.reassignment_requisition_id
       JOIN store.requisition_headers header
         ON header.id = request.request_header_id
       WHERE repair_item.purchase_order_id = $1
         AND asset.asset_code = $2`,
      [order.id, assetCode]
    )).rows[0]
    expect(await linkedRequest(repairAssetCodes[0]!)).toEqual(expect.objectContaining({
      department: departmentName,
      locationId: location.id,
      purpose: expect.stringContaining(order.orderNumber),
      requestedAssetId: null,
      status: "Pending",
    }))
    expect(await linkedRequest(repairAssetCodes[1]!)).toEqual(
      expect.objectContaining({ locationId: location.id, requestedAssetId: null })
    )
    await expect(
      store.moveAsset({
        assetCode: receipt.assetCodes[0]!,
        holderReference: `MULTI-REPAIR-${suffix}`,
        holderType: "STORE",
        organizationId,
      })
    ).rejects.toThrow("Repair PO line")
    await store.issueRequisition({
      assetCode: receipt.assetCodes[2]!,
      organizationId,
      quantity: 1,
      requisitionId: (await linkedRequest(repairAssetCodes[0]!))!.id,
    })
    expect((await store.getAssetWorkspace({
      assetCode: receipt.assetCodes[2]!,
      organizationId,
    }))?.asset).toEqual(expect.objectContaining({
      holderReference: departmentCode,
      holderType: "DEPARTMENT",
      status: "ASSIGNED",
    }))
    expect(await linkedRequest(repairAssetCodes[0]!)).toEqual(
      expect.objectContaining({ status: "Fulfilled" })
    )
    await store.completeRepairPurchaseOrder({
      accountableStoreId: mainAccountableStoreId,
      assetCode: repairAssetCodes[0]!,
      organizationId,
      purchaseOrderId: order.id,
      storeLocationId: receivingLocation.id,
    })
    const returned = await store.getAssetWorkspace({
      assetCode: repairAssetCodes[0]!,
      organizationId,
    })
    expect(returned?.asset).toEqual(
      expect.objectContaining({
        holderType: "STORE",
        locationName: `Repaired Store ${suffix}`,
        status: "AVAILABLE",
      })
    )
    expect(
      returned?.movements.filter((movement) => movement.movementType === "RETURN")
    ).toHaveLength(2)
    expect(await linkedRequest(repairAssetCodes[0]!)).toEqual(
      expect.objectContaining({ locationId: location.id, status: "Fulfilled" })
    )
    expect(
      (await store.getAssetWorkspace({
        assetCode: receipt.assetCodes[1]!,
        organizationId,
      }))?.asset.holderType
    ).toBe("SUPPLIER")
    expect(
      (
        await store.getPurchaseOrder({
          organizationId,
          purchaseOrderId: order.id,
        })
      )?.order.status
    ).toBe("Open")
    await store.completeRepairPurchaseOrder({
      accountableStoreId: mainAccountableStoreId,
      assetCode: repairAssetCodes[1]!,
      organizationId,
      purchaseOrderId: order.id,
      storeLocationId: receivingLocation.id,
    })
    const pendingRequest = await linkedRequest(repairAssetCodes[1]!)
    expect(pendingRequest).toEqual(
      expect.objectContaining({
        headerLocationId: receivingLocation.id,
        locationId: receivingLocation.id,
        status: "Pending",
      })
    )
    expect((await store.listRequisitions({ organizationId })).rows.find(
      (request) => request.id === pendingRequest?.id
    )?.availableUnitIds).toEqual(expect.arrayContaining(repairAssetCodes))
    expect(
      (
        await store.getPurchaseOrder({
          organizationId,
          purchaseOrderId: order.id,
        })
      )?.order.status
    ).toBe("Completed")
  })

  test("creates separate Repair POs for selected Units with different Suppliers", async () => {
    const location = await store.createLocation({
      code: `SPLIT-REPAIR-${suffix}`,
      name: `Split Repair Store ${suffix}`,
      organizationId,
    })
    const item = await store.createItemType({
      ...(await createClassification("Split Repair PO")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Split Repair Tool ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 2, "5000.00"))
        .id,
      quantity: 2,
    })
    const supplierNames = [
      `First Repair Supplier ${suffix}`,
      `Second Repair Supplier ${suffix}`,
    ]
    const suppliers = await Promise.all([
      store.createSupplier({
        name: supplierNames[0]!,
        organizationId,
      }),
      store.createSupplier({
        name: supplierNames[1]!,
        organizationId,
      }),
    ])
    const selection = {
      accountableStoreId: mainAccountableStoreId,
      issuanceId: randomUUID(),
      items: receipt.assetCodes.map((assetCode, index) => ({
        assetCode,
        serviceDescription: `Repair task ${index + 1}`,
        servicePrice: index === 0 ? "100.00" : "200.00",
        supplierId: suppliers[index]!.id,
      })),
      organizationId,
      storeIssuedPdf,
    }
    const created = await store.createRepairPurchaseOrdersFromSelection(
      selection
    )
    expect(created.orders).toHaveLength(2)
    const documents = await Promise.all(
      created.orders.map((order) =>
        store.getPurchaseOrder({ organizationId, purchaseOrderId: order.id })
      )
    )
    expect(
      documents.map((document) => ({
        supplier: document?.order.supplierName,
        scope: document?.lines[0]?.itemName,
        price: document?.lines[0]?.unitPrice,
        lines: document?.lines.length,
      }))
    ).toEqual(
      expect.arrayContaining([
        {
          supplier: supplierNames[0],
          scope: "Repair task 1",
          price: "100.00",
          lines: 1,
        },
        {
          supplier: supplierNames[1],
          scope: "Repair task 2",
          price: "200.00",
          lines: 1,
        },
      ])
    )
    expect(
      await store.createRepairPurchaseOrdersFromSelection(selection)
    ).toEqual(created)
  })

  test("returns overview metrics equivalent to the existing Store lists", async () => {
    const istToday = "9999-12-31"
    const [items, requests, assets, locations, metrics] = await Promise.all([
      store.listItemTypes(organizationId),
      store.listRequisitions({ organizationId }),
      store.listAssets({ organizationId }),
      store.listLocations(organizationId),
      store.overviewMetrics({ istToday, organizationId }),
    ])

    expect(metrics).toEqual({
      itemTypes: items.length,
      locations: locations.length,
      lowStock: items.filter(
        (item) => Number(item.availableStock) <= Number(item.minimumStock)
      ).length,
      maintenanceDue: assets.filter(
        (asset) => asset.nextDueOn && asset.nextDueOn <= istToday
      ).length,
      openRequests: requests.rows.filter(({ status }) =>
        ["Pending", "Partially Issued"].includes(status)
      ).length,
      physicalAssets: assets.length,
    })
  })

  test("keeps an unavailable Unit ID unavailable when returned to Store", async () => {
    const location = await store.createLocation({
      code: `SERVICE-RETURN-${suffix}`,
      name: `Service Return Store ${suffix}`,
      organizationId,
    })
    await pool.query(
      `UPDATE store.assets SET status = 'UNDER_MAINTENANCE',
         current_holder_type = 'DEPARTMENT',
         current_holder_reference = 'QUALITY',
         current_holder_name = 'Quality', current_location_id = NULL
       WHERE id = $1`,
      [legacyAssetId]
    )

    await departmentStore.moveAsset({
      assetCode: legacyAssetCode,
      holderReference: location.id,
      holderType: "STORE",
      organizationId,
      storeCode: "MAIN",
    })

    const asset = await pool.query<{
      holderType: string
      locationId: string | null
      status: string
    }>(
      `SELECT status, current_holder_type AS "holderType",
         current_location_id AS "locationId"
       FROM store.assets WHERE id = $1`,
      [legacyAssetId]
    )
    expect(asset.rows[0]).toEqual({
      holderType: "STORE",
      locationId: location.id,
      status: "UNDER_MAINTENANCE",
    })
  })

  test("requires an active gauge set to move together", async () => {
    const location = await store.createLocation({
      code: `SET-SOURCE-${suffix}`,
      name: `Gauge Source Store ${suffix}`,
      organizationId,
    })
    const item = await store.createItemType({
      ...(await createClassification("Gauge Set Movement")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Gauge Set Movement ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 2, "100.00")).id,
      quantity: 2,
    })
    for (const assetCode of receipt.assetCodes) {
      await departmentStore.transferAssetAccountability({
        assetCode,
        destinationStoreCode: "QUALITY",
        organizationId,
        sourceStoreCode: "MAIN",
      })
    }
    await departmentStore.createGaugeSet({
      assetCodes: [receipt.assetCodes[0]!, receipt.assetCodes[1]!],
      name: `Gauge Set ${suffix}`,
      organizationId,
      storeCode: "QUALITY",
    })
    const quality = await departmentStore.getStoreByCode(organizationId, "QUALITY")
    const destination = await pool.query<{ id: string }>(
      `INSERT INTO store.locations (
         organization_id, code, name, location_type, accountable_store_id
       ) VALUES ($1, $2, $3, 'STORE', $4) RETURNING id`,
      [organizationId, `QUALITY-TEST-${suffix}`, "Quality Test Location", quality.id]
    )

    await expect(departmentStore.moveAsset({
      assetCode: receipt.assetCodes[0]!,
      holderReference: destination.rows[0]!.id,
      holderType: "STORE",
      organizationId,
      storeCode: "QUALITY",
    })).rejects.toThrow("Move this Unit ID with its gauge set.")
  })

  test("fulfills a one-unit Store responsibility request for its exact Unit ID", async () => {
    await pool.query(
      `INSERT INTO manufacturing.production_floors (organization_id, code, name)
       VALUES ($1, 'cnc', 'CNC Production Floor')
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [organizationId]
    )
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const item = await store.createItemType({
      ...(await createClassification("Store Responsibility Request")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Store Request Gauge ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 2, "100.00")).id,
      quantity: 2,
    })
    const units = await store.listStockPhysicalUnits(organizationId, "COMPANY")
    const requestedUnit = units.find((unit) => unit.assetCode === receipt.assetCodes[0])!
    const otherUnit = receipt.assetCodes[1]!
    const request = await store.createRequisitionBatch({
      department: "CNC Store",
      fulfillmentKind: "STORE_TRANSFER",
      items: [{ itemTypeId: item.id, quantity: 1, requestedUnitId: requestedUnit.id }],
      locationId: location.id,
      organizationId,
      receivingStoreCode: "cnc",
      requestedBy: "CNC Store Representative",
    })
    await expect(departmentStore.transferAssetAccountability({
      assetCode: otherUnit,
      destinationStoreCode: "cnc",
      organizationId,
      requisitionId: request.lineIds[0],
      sourceStoreCode: "MAIN",
    })).rejects.toThrow("exact Unit ID")
    await departmentStore.transferAssetAccountability({
      assetCode: requestedUnit.assetCode,
      destinationStoreCode: "cnc",
      organizationId,
      requisitionId: request.lineIds[0],
      sourceStoreCode: "MAIN",
    })
    const line = (await store.listRequisitions({ organizationId })).rows.find(
      (candidate) => candidate.id === request.lineIds[0]
    )
    expect(line).toMatchObject({ issuedQuantity: "1", status: "Fulfilled" })
    const transfer = await pool.query<{ code: string; requisition_id: string }>(
      `SELECT destination.code, transfer.requisition_id
       FROM store.asset_accountability_transfers transfer
       JOIN store.accountable_stores destination
         ON destination.id = transfer.destination_store_id
       WHERE transfer.asset_id = $1 AND transfer.requisition_id = $2`,
      [requestedUnit.id, request.lineIds[0]]
    )
    expect(transfer.rows[0]).toEqual({ code: "cnc", requisition_id: request.lineIds[0] })
  })

  test("routes a Unit ID between department Stores through Main", async () => {
    await pool.query(
      `INSERT INTO manufacturing.production_floors (organization_id, code, name)
       VALUES ($1, 'cnc', 'CNC Production Floor')
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [organizationId]
    )
    const location = await store.ensurePrimaryStoreLocation({ organizationId })
    const item = await store.createItemType({
      ...(await createClassification("Store Transfer Route")),
      assetType: "NON_CONSUMABLE",
      identificationName: `Transfer Route ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const receipt = await store.receiveStock({
      locationId: location.id,
      organizationId,
      purchaseOrderLineId: (await createPurchaseOrder(item.id, 1, "100.00")).id,
      quantity: 1,
    })
    const assetCode = receipt.assetCodes[0]!
    await departmentStore.transferAssetAccountability({
      assetCode, destinationStoreCode: "QUALITY", organizationId, sourceStoreCode: "MAIN",
    })
    await expect(departmentStore.transferAssetAccountability({
      assetCode, destinationStoreCode: "cnc", organizationId, sourceStoreCode: "QUALITY",
    })).rejects.toThrow("through Main Store")
    await departmentStore.transferAssetAccountability({
      assetCode, destinationStoreCode: "MAIN", organizationId, sourceStoreCode: "QUALITY",
    })
    await departmentStore.transferAssetAccountability({
      assetCode, destinationStoreCode: "cnc", organizationId, sourceStoreCode: "MAIN",
    })
    expect((await departmentStore.getAssetAccountability(organizationId, assetCode))?.accountableStoreCode)
      .toBe("cnc")
  })

  test("shows Main-accountable units held by CNC in its allocation list", async () => {
    await pool.query(
      `INSERT INTO manufacturing.production_floors (organization_id, code, name)
       VALUES ($1, 'cnc', 'CNC Production Floor')
       ON CONFLICT (organization_id, code) DO NOTHING`,
      [organizationId]
    )
    const departmentName = "Ppac Cnc-01"
    const assetCode = `ALLOC-${suffix}`
    await pool.query(
      `INSERT INTO store.assets (organization_id, item_type_id, asset_code,
         identification_name, status, current_holder_type,
         current_holder_reference, current_holder_name, accountable_store_id)
       VALUES ($1, $2, $3, 'CNC fixture', 'ASSIGNED', 'DEPARTMENT',
         $4, $5, $6)`,
      [organizationId, legacyItemTypeId, assetCode, departmentName,
        departmentName, mainAccountableStoreId]
    )

    const allocations = await departmentStore.listDepartmentAllocations({
      organizationId, productionFloorCode: "cnc",
    })
    expect(allocations).toContainEqual(expect.objectContaining({
      accountableStoreCode: "MAIN", assetCode, departmentName,
    }))
    const cncStock = await departmentStore.listStoreWorkspace({ organizationId, storeCode: "cnc" })
    expect(cncStock.assets.some((asset) => asset.assetCode === assetCode)).toBe(false)
  })
})

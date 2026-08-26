import { randomUUID } from "node:crypto"

import {
  authorizeStorePurchaseOrderArtifactTarget,
  createArtifactService,
  createStoreRepository,
  migrateDatabase,
  storePurchaseOrderPdfArtifactPurpose,
  type ArtifactStorageProvider,
} from "@workspace/db"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { buildStorePurchaseOrderPdf } from "./purchase-order-pdf"

const connectionString =
  process.env.TEST_DATABASE_URL ??
  "postgresql://mrmpl:mrmpl@127.0.0.1:5434/mrmpl_test"
const pool = new Pool({ connectionString })
const store = createStoreRepository({ connectionString })

class StorePurchaseOrderArtifactProvider implements ArtifactStorageProvider {
  readonly bytesByUrl = new Map<string, Buffer>()
  readonly deleted: string[] = []
  readonly uploads: Array<{ bytes: Buffer; url: string }> = []
  failNextUpload = false

  async delete({ key }: { key: string }) {
    this.deleted.push(key)
    this.bytesByUrl.delete(`https://files.example.test/${key}`)
  }

  async upload(input: Parameters<ArtifactStorageProvider["upload"]>[0]) {
    if (this.failNextUpload) {
      this.failNextUpload = false
      throw new Error("Store PO upload failed")
    }
    const key = `issued-store-po-${randomUUID()}`
    const url = `https://files.example.test/${key}`
    const bytes = Buffer.from(input.bytes)
    this.uploads.push({ bytes, url })
    this.bytesByUrl.set(url, bytes)
    return { key, url }
  }
}

type StoreRepository = ReturnType<typeof createStoreRepository>
type StorePurchaseOrderDocument = NonNullable<
  Awaited<ReturnType<StoreRepository["getPurchaseOrder"]>>
>

function issuedPdfWriter(
  artifacts: ReturnType<typeof createArtifactService>,
  provider: StorePurchaseOrderArtifactProvider,
  actorUserId: string | null = null
) {
  return async (input: {
    document: StorePurchaseOrderDocument
    organizationId: string
    purchaseOrderId: string
  }) => {
    const bytes = Buffer.from(
      await buildStorePurchaseOrderPdf({
        lines: input.document.lines,
        orderDate: input.document.order.orderDate,
        orderNumber: input.document.order.orderNumber,
        orderType: input.document.order.orderType,
        remark: input.document.order.remark,
        supplierAddress: input.document.order.supplierAddress,
        supplierCode: input.document.order.supplierCode,
        supplierGstNumber: input.document.order.supplierGstNumber,
        supplierName: input.document.order.supplierName,
      })
    )
    await artifacts.store({
      actorUserId,
      authorizeTarget: (client, { isRetry }) =>
        authorizeStorePurchaseOrderArtifactTarget(
          client,
          {
            organizationId: input.organizationId,
            purchaseOrderId: input.purchaseOrderId,
          },
          { requirePendingState: !isRetry }
        ),
      bytes,
      fileName: `${input.document.order.orderNumber}.pdf`,
      idempotencyKey: `issued-store-po-pdf:${input.purchaseOrderId}`,
      mediaType: "application/pdf",
      organizationId: input.organizationId,
      origin: "generated",
      purpose: storePurchaseOrderPdfArtifactPurpose,
      target: {
        id: input.purchaseOrderId,
        schema: "store",
        table: "purchase_orders",
      },
    })
    return provider.uploads.at(-1)?.bytes ?? bytes
  }
}

async function createClassification(label: string, organizationId: string) {
  const category = await store.createAssetCategory({
    name: `${label} Category`,
    organizationId,
  })
  const subcategory = await store.createAssetSubcategory({
    categoryId: category.id,
    name: `${label} Subcategory`,
    organizationId,
  })
  const assetName = await store.createAssetName({
    name: `${label} Asset`,
    organizationId,
    subcategoryId: subcategory.id,
  })
  return {
    assetCategoryId: category.id,
    assetNameId: assetName.id,
    assetSubcategoryId: subcategory.id,
  }
}

async function createOrganization(label: string) {
  const suffix = randomUUID()
  const result = await pool.query<{ id: string }>(
    `INSERT INTO core.organizations (code, name)
     VALUES ($1, $2) RETURNING id`,
    [`STORE-PO-${suffix}`, `${label} Organization`]
  )
  return { organizationId: result.rows[0]!.id, suffix }
}

beforeAll(async () => {
  await migrateDatabase({ connectionString })
})

afterAll(async () => {
  await store.close()
  await pool.end()
})

describe("Store Purchase Order PDF issuance", () => {
  test("issues a multi-line goods order with immutable stored PDF bytes", async () => {
    const { organizationId, suffix } = await createOrganization("Goods PO")
    const supplier = await store.createSupplier({
      address: "Original supplier address",
      name: `Goods Supplier ${suffix}`,
      organizationId,
    })
    const firstItem = await store.createItemType({
      ...(await createClassification(`Goods First ${suffix}`, organizationId)),
      assetType: "CONSUMABLE",
      identificationName: `Original First Item ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const secondItem = await store.createItemType({
      ...(await createClassification(`Goods Second ${suffix}`, organizationId)),
      assetType: "CONSUMABLE",
      identificationName: `Original Second Item ${suffix}`,
      organizationId,
      unit: "Kg",
    })
    for (const [itemTypeId, unitPrice] of [
      [firstItem.id, "12.50"],
      [secondItem.id, "23.75"],
    ] as const) {
      await store.createSupplierPrice({
        itemTypeId,
        organizationId,
        supplierId: supplier.id,
        unitPrice,
        validFrom: "2026-08-23",
      })
    }
    const provider = new StorePurchaseOrderArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })

    try {
      const result = await store.createPurchaseOrdersFromSelection({
        issuanceId: randomUUID(),
        items: [
          { itemTypeId: firstItem.id, quantity: 2 },
          { itemTypeId: secondItem.id, quantity: 3 },
        ],
        orderDate: "2026-08-23",
        organizationId,
        storeIssuedPdf: issuedPdfWriter(artifacts, provider),
      })
      expect(result.orders).toHaveLength(1)
      const purchaseOrderId = result.orders[0]!.id
      const issuedDocument = await store.getPurchaseOrder({
        organizationId,
        purchaseOrderId,
      })
      expect(issuedDocument?.lines).toHaveLength(2)
      const artifact = await store.getPurchaseOrderPdfArtifact({
        organizationId,
        purchaseOrderId,
      })
      const issuedBytes = provider.bytesByUrl.get(artifact!.publicUrl)
      expect(issuedBytes?.subarray(0, 5).toString()).toBe("%PDF-")

      const registerLine = (
        await store.listPurchaseOrders(organizationId)
      ).find((line) => line.purchaseOrderId === purchaseOrderId)!
      const location = await store.ensurePrimaryStoreLocation({
        organizationId,
      })
      await store.receiveStock({
        locationId: location.id,
        organizationId,
        purchaseOrderLineId: registerLine.id,
        quantity: 1,
      })
      await pool.query(
        `UPDATE store.suppliers SET name = 'Changed Supplier', address = 'Changed address'
         WHERE id = $1`,
        [supplier.id]
      )
      await pool.query(
        `UPDATE store.item_types SET identification_name = 'Changed Item'
         WHERE id = $1`,
        [firstItem.id]
      )

      const afterChanges = await store.getPurchaseOrderPdfArtifact({
        organizationId,
        purchaseOrderId,
      })
      expect(afterChanges).toEqual(artifact)
      expect(provider.bytesByUrl.get(afterChanges!.publicUrl)).toEqual(
        issuedBytes
      )
    } finally {
      await artifacts.close()
    }
  })

  test("issues a Repair Purchase Order through the same Artifact contract", async () => {
    const { organizationId, suffix } = await createOrganization("Repair PO")
    const item = await store.createItemType({
      ...(await createClassification(`Repair Item ${suffix}`, organizationId)),
      assetType: "NON_CONSUMABLE",
      identificationName: `Repairable Gauge ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    const goodsSupplier = await store.createSupplier({
      name: `Goods Supplier ${suffix}`,
      organizationId,
    })
    await store.createSupplierPrice({
      itemTypeId: item.id,
      organizationId,
      supplierId: goodsSupplier.id,
      unitPrice: "5000.00",
      validFrom: "2026-08-23",
    })
    const provider = new StorePurchaseOrderArtifactProvider()
    const artifacts = createArtifactService({ connectionString, provider })

    try {
      const goods = await store.createPurchaseOrdersFromSelection({
        issuanceId: randomUUID(),
        items: [{ itemTypeId: item.id, quantity: 1 }],
        organizationId,
        storeIssuedPdf: issuedPdfWriter(artifacts, provider),
      })
      const goodsLine = (await store.listPurchaseOrders(organizationId)).find(
        (line) => line.purchaseOrderId === goods.orders[0]!.id
      )!
      const location = await store.ensurePrimaryStoreLocation({
        organizationId,
      })
      const receipt = await store.receiveStock({
        locationId: location.id,
        organizationId,
        purchaseOrderLineId: goodsLine.id,
        quantity: 1,
      })
      const repairSupplier = await store.createSupplier({
        name: `Repair Supplier ${suffix}`,
        organizationId,
      })
      const repairIssuanceId = randomUUID()
      const repairInput = {
        assetCode: receipt.assetCodes[0]!,
        issuanceId: repairIssuanceId,
        organizationId,
        serviceDescription: "Replace bearing and recalibrate",
        servicePrice: "850.00",
        storeIssuedPdf: issuedPdfWriter(artifacts, provider),
        supplierId: repairSupplier.id,
      }
      provider.failNextUpload = true
      await expect(store.createRepairPurchaseOrder(repairInput)).rejects.toThrow(
        "Store PO upload failed"
      )
      await expect(
        store.getAssetWorkspace({
          assetCode: receipt.assetCodes[0]!,
          organizationId,
        })
      ).resolves.toMatchObject({
        asset: { holderType: "STORE" },
        repairOrders: [],
      })

      const repair = await store.createRepairPurchaseOrder(repairInput)

      await expect(
        store.getPurchaseOrderPdfArtifact({
          organizationId,
          purchaseOrderId: repair.id,
        })
      ).resolves.toMatchObject({ available: true })
      expect(
        (await store.listPurchaseOrders(organizationId)).find(
          (line) => line.purchaseOrderId === repair.id
        )
      ).toMatchObject({ orderType: "REPAIR" })
    } finally {
      await artifacts.close()
    }
  })

  test("keeps failed creation hidden and retries without duplicate issuance or bytes", async () => {
    const { organizationId, suffix } = await createOrganization("Retry PO")
    const supplier = await store.createSupplier({
      name: `Retry Supplier ${suffix}`,
      organizationId,
    })
    const item = await store.createItemType({
      ...(await createClassification(`Retry Item ${suffix}`, organizationId)),
      assetType: "CONSUMABLE",
      identificationName: `Retry Item ${suffix}`,
      organizationId,
      unit: "Nos",
    })
    await store.createSupplierPrice({
      itemTypeId: item.id,
      organizationId,
      supplierId: supplier.id,
      unitPrice: "10.00",
      validFrom: "2026-08-23",
    })
    const provider = new StorePurchaseOrderArtifactProvider()
    provider.failNextUpload = true
    const artifacts = createArtifactService({ connectionString, provider })
    const issuanceId = randomUUID()
    const input = {
      issuanceId,
      items: [{ itemTypeId: item.id, quantity: 2 }],
      organizationId,
      storeIssuedPdf: issuedPdfWriter(artifacts, provider),
    }

    try {
      await expect(
        store.createPurchaseOrdersFromSelection(input)
      ).rejects.toThrow("Store PO upload failed")
      expect(
        (await store.listPurchaseOrders(organizationId)).filter(
          (line) => line.itemTypeId === item.id
        )
      ).toHaveLength(0)

      await expect(
        store.createPurchaseOrdersFromSelection({
          ...input,
          storeIssuedPdf: issuedPdfWriter(
            artifacts,
            provider,
            "invalid-actor-uuid"
          ),
        })
      ).rejects.toThrow()
      expect(
        (await store.listPurchaseOrders(organizationId)).filter(
          (line) => line.itemTypeId === item.id
        )
      ).toHaveLength(0)
      expect(provider.deleted).toHaveLength(1)
      expect(provider.bytesByUrl).toHaveLength(0)

      const retried = await store.createPurchaseOrdersFromSelection(input)
      const repeated = await store.createPurchaseOrdersFromSelection(input)
      expect(repeated).toEqual(retried)
      expect(provider.uploads).toHaveLength(2)
      expect(provider.bytesByUrl).toHaveLength(1)
      await expect(
        artifacts.listHistory({
          organizationId,
          purpose: storePurchaseOrderPdfArtifactPurpose,
          target: {
            id: retried.orders[0]!.id,
            schema: "store",
            table: "purchase_orders",
          },
        })
      ).resolves.toHaveLength(1)
      expect(
        (await store.listPurchaseOrders(organizationId)).filter(
          (line) => line.itemTypeId === item.id
        )
      ).toHaveLength(1)
    } finally {
      await artifacts.close()
    }
  })
})

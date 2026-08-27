"use server"

import { createHash } from "node:crypto"

import {
  authorizeStoreItemTypeArtifactTarget,
  authorizeStorePurchaseOrderArtifactTarget,
  authorizeStoreReceiptArtifactTarget,
  authorizeStoreSupplierPriceArtifactTarget,
  createArtifactService,
  createMasterDataLifecycleRepository,
  createStoreRepository,
  type MasterDataKind,
  type StoreAssetType,
  type StoreHolderType,
  storePurchaseOrderPdfArtifactPurpose,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import {
  isStoreActionCapability,
  requireStoreAction,
  type StoreActionCapability,
} from "@/lib/auth/store-action-access"
import {
  resolveStoreRequestDepartment,
  storeRequestFormPolicy,
} from "@/lib/store-request-policy"
import { validateUserAttachment } from "@/lib/user-attachment-security"
import { createUploadThingArtifactProvider } from "@/lib/uploadthing-artifact-provider"
import { buildStorePurchaseOrderPdf } from "@/lib/store/purchase-order-pdf"

const storePath = "/store"
const holderTypes = [
  "DEPARTMENT",
  "MACHINE",
  "PERSON",
  "STORE",
  "UNIT",
  "VENDOR",
] as const satisfies readonly StoreHolderType[]

function requiredText(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim()
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`)
  return value
}

function optionalText(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() || null
}

function positiveNumber(formData: FormData, key: string) {
  const value = Number(requiredText(formData, key))
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key.replaceAll("_", " ")} must be greater than zero.`)
  }
  return value
}

function assetType(formData: FormData): StoreAssetType {
  const value = requiredText(formData, "asset_type")
  if (value !== "CONSUMABLE" && value !== "NON_CONSUMABLE") {
    throw new Error("Asset type must be Consumable or Non Consumable.")
  }
  return value
}

function holderType(formData: FormData) {
  const value = requiredText(formData, "holder_type")
  if (!holderTypes.includes(value as (typeof holderTypes)[number])) {
    throw new Error("Holder type is invalid.")
  }
  return value as StoreHolderType
}

async function withStore<T>(
  capability: StoreActionCapability | "store.masters.write",
  operation: (
    repository: ReturnType<typeof createStoreRepository>,
    actorUserId: string,
    organizationId: string,
    actorEmail: string
  ) => Promise<T>
) {
  const session = isStoreActionCapability(capability)
    ? await requireStoreAction(capability, storePath)
    : await requireCapability(capability, storePath)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await operation(
      repository,
      session.user.id,
      organizationId,
      session.user.email
    )
  } finally {
    await repository.close()
  }
}

function revalidateStore() {
  revalidatePath("/")
  revalidatePath("/store")
  revalidatePath("/store/items")
  revalidatePath("/store/masters")
  revalidatePath("/store/orders")
  revalidatePath("/store/stock")
  revalidatePath("/store/requests")
  revalidatePath("/store/requests/new")
  revalidatePath("/store/new-item-requests")
  revalidatePath("/store/assets")
}

function storeIssuedPurchaseOrderPdf(
  artifacts: ReturnType<typeof createArtifactService>,
  actorUserId: string
) {
  return async (input: {
    document: NonNullable<
      Awaited<
        ReturnType<ReturnType<typeof createStoreRepository>["getPurchaseOrder"]>
      >
    >
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
    const safeNumber = input.document.order.orderNumber
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
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
      fileName: `${safeNumber || "store-po"}.pdf`,
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
  }
}

export async function createStoreLocationAction(formData: FormData) {
  await withStore(
    "store.masters.write",
    (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      return masterId
        ? repository.updateLocation({
            actorUserId,
            id: masterId,
            locationType: requiredText(formData, "location_type") as
              | "DEPARTMENT"
              | "STORE"
              | "UNIT",
            name: requiredText(formData, "location_name"),
            organizationId,
          })
        : repository.createLocation({
            actorUserId,
            code: requiredText(formData, "location_code"),
            locationType: requiredText(formData, "location_type") as
              | "DEPARTMENT"
              | "STORE"
              | "UNIT",
            name: requiredText(formData, "location_name"),
            organizationId,
          })
    }
  )
  revalidateStore()
}

export async function createStoreSupplierAction(formData: FormData) {
  await withStore(
    "store.masters.write",
    (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      return masterId
        ? repository.updateSupplier({
            actorUserId,
            address: optionalText(formData, "supplier_address"),
            contactDetails: optionalText(formData, "contact_details"),
            email: optionalText(formData, "supplier_email"),
            gstNumber: optionalText(formData, "gst_number"),
            id: masterId,
            name: requiredText(formData, "supplier_name"),
            organizationId,
          })
        : repository.createSupplier({
            actorUserId,
            address: optionalText(formData, "supplier_address"),
            contactDetails: optionalText(formData, "contact_details"),
            email: optionalText(formData, "supplier_email"),
            gstNumber: optionalText(formData, "gst_number"),
            name: requiredText(formData, "supplier_name"),
            organizationId,
          })
    }
  )
  revalidateStore()
}

async function saveSupplierQuote(upload: FormDataEntryValue | null) {
  if (!(upload instanceof File) || upload.size === 0) return null
  if (upload.size > 10 * 1024 * 1024) {
    throw new Error("Supplier quote must be 10 MB or smaller.")
  }
  const bytes = Buffer.from(await upload.arrayBuffer())
  const validated = validateUserAttachment({
    bytes,
    fileName: upload.name,
    purpose: "supplier-quote",
  })
  return { bytes, fileName: validated.fileName, mediaType: "application/pdf" }
}

async function storeSupplierQuoteArtifact(input: {
  actorUserId: string
  bytes: Buffer
  fileName: string
  mediaType: string
  organizationId: string
  supplierPriceId: string
}) {
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createUploadThingArtifactProvider(),
  })
  try {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex")
    await artifacts.store({
      actorUserId: input.actorUserId,
      authorizeTarget: (client) =>
        authorizeStoreSupplierPriceArtifactTarget(client, input),
      bytes: input.bytes,
      fileName: input.fileName,
      idempotencyKey: [
        "store-supplier-quote",
        input.supplierPriceId,
        input.fileName,
        sha256,
      ].join(":"),
      mediaType: input.mediaType,
      organizationId: input.organizationId,
      origin: "uploaded",
      purpose: "supplier_quote",
      target: {
        id: input.supplierPriceId,
        schema: "store",
        table: "supplier_prices",
      },
    })
  } finally {
    await artifacts.close()
  }
}

export async function createStoreSupplierPriceAction(formData: FormData) {
  const savedQuote = await saveSupplierQuote(formData.get("supplier_quote"))
  await withStore(
    "store.masters.write",
    async (repository, actorUserId, organizationId) => {
      const price = await repository.createSupplierPrice({
        actorUserId,
        itemTypeId: requiredText(formData, "item_type_id"),
        organizationId,
        quoteReference: optionalText(formData, "quote_reference"),
        supplierId: requiredText(formData, "supplier_id"),
        unitPrice: requiredText(formData, "unit_price"),
        validFrom: optionalText(formData, "valid_from"),
      })
      if (savedQuote) {
        await storeSupplierQuoteArtifact({
          ...savedQuote,
          actorUserId,
          organizationId,
          supplierPriceId: price.id,
        })
      }
    }
  )
  revalidateStore()
}

export async function uploadStoreSupplierQuoteAction(formData: FormData) {
  const savedQuote = await saveSupplierQuote(formData.get("supplier_quote"))
  if (!savedQuote) throw new Error("Select a Supplier quote PDF to upload.")
  await withStore(
    "store.masters.write",
    (_repository, actorUserId, organizationId) =>
      storeSupplierQuoteArtifact({
        ...savedQuote,
        actorUserId,
        organizationId,
        supplierPriceId: requiredText(formData, "supplier_price_id"),
      })
  )
  revalidatePath("/store/assets/[assetCode]", "page")
  revalidateStore()
}

export async function createStoreVendorAction(formData: FormData) {
  await withStore(
    "store.masters.write",
    (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      return masterId
        ? repository.updateVendor({
            actorUserId,
            contactDetails: optionalText(formData, "contact_details"),
            id: masterId,
            name: requiredText(formData, "vendor_name"),
            organizationId,
          })
        : repository.createVendor({
            actorUserId,
            code: requiredText(formData, "vendor_code"),
            contactDetails: optionalText(formData, "contact_details"),
            name: requiredText(formData, "vendor_name"),
            organizationId,
          })
    }
  )
  revalidateStore()
}

export async function createStoreAssetCategoryAction(formData: FormData) {
  await withStore(
    "store.masters.write",
    (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      return masterId
        ? repository.updateAssetCategory({
            actorUserId,
            id: masterId,
            name: requiredText(formData, "asset_category_name"),
            organizationId,
          })
        : repository.createAssetCategory({
            actorUserId,
            name: requiredText(formData, "asset_category_name"),
            organizationId,
          })
    }
  )
  revalidateStore()
}

export async function createStoreAssetSubcategoryAction(formData: FormData) {
  await withStore(
    "store.masters.write",
    (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      return masterId
        ? repository.updateAssetSubcategory({
            actorUserId,
            categoryId: requiredText(formData, "asset_category_id"),
            id: masterId,
            name: requiredText(formData, "asset_subcategory_name"),
            organizationId,
          })
        : repository.createAssetSubcategory({
            actorUserId,
            categoryId: requiredText(formData, "asset_category_id"),
            name: requiredText(formData, "asset_subcategory_name"),
            organizationId,
          })
    }
  )
  revalidateStore()
}

export async function createStoreAssetNameAction(formData: FormData) {
  await withStore(
    "store.masters.write",
    (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      return masterId
        ? repository.updateAssetName({
            actorUserId,
            id: masterId,
            name: requiredText(formData, "asset_name"),
            organizationId,
            subcategoryId: requiredText(formData, "asset_subcategory_id"),
          })
        : repository.createAssetName({
            actorUserId,
            name: requiredText(formData, "asset_name"),
            organizationId,
            subcategoryId: requiredText(formData, "asset_subcategory_id"),
          })
    }
  )
  revalidateStore()
}

export async function createStoreItemTypeAction(formData: FormData) {
  const savedDrawing = await saveAssetDrawing(formData.get("asset_drawing"))
  await withStore(
    "store.masters.write",
    async (repository, actorUserId, organizationId) => {
      const masterId = optionalText(formData, "master_id")
      const input = {
        actorUserId,
        assetCategoryId: requiredText(formData, "asset_category_id"),
        assetNameId: requiredText(formData, "asset_name_id"),
        assetSubcategoryId: requiredText(formData, "asset_subcategory_id"),
        assetType: assetType(formData),
        applicableItemCode: optionalText(formData, "applicable_item_code"),
        identificationName: requiredText(formData, "identification_name"),
        minimumStock: Number(optionalText(formData, "minimum_stock") ?? 0),
        organizationId,
        unit: requiredText(formData, "unit"),
      }
      const item = masterId
        ? await repository.updateItemType({ ...input, id: masterId })
        : await repository.createItemType(input)
      if (savedDrawing) {
        await storeItemDrawingArtifact({
          ...savedDrawing,
          actorUserId,
          itemTypeId: item.id,
          organizationId,
        })
      }
    }
  )
  revalidateStore()
}

async function saveAssetDrawing(upload: FormDataEntryValue | null) {
  if (!(upload instanceof File) || upload.size === 0) return null
  if (upload.size > 10 * 1024 * 1024) {
    throw new Error("Asset drawing must be 10 MB or smaller.")
  }
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"])
  if (!allowedTypes.has(upload.type)) {
    throw new Error("Asset drawing must be a PDF, JPG, or PNG file.")
  }
  const bytes = Buffer.from(await upload.arrayBuffer())
  const validated = validateUserAttachment({
    bytes,
    fileName: upload.name,
    purpose: "drawing",
  })
  return { bytes, fileName: validated.fileName, mediaType: validated.mediaType }
}

async function storeItemDrawingArtifact(input: {
  actorUserId: string
  bytes: Buffer
  fileName: string
  itemTypeId: string
  mediaType: string
  organizationId: string
}) {
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createUploadThingArtifactProvider(),
  })
  try {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex")
    await artifacts.store({
      actorUserId: input.actorUserId,
      authorizeTarget: (client) =>
        authorizeStoreItemTypeArtifactTarget(client, input),
      bytes: input.bytes,
      fileName: input.fileName,
      idempotencyKey: [
        "store-item-drawing",
        input.itemTypeId,
        input.fileName,
        sha256,
      ].join(":"),
      mediaType: input.mediaType,
      organizationId: input.organizationId,
      origin: "uploaded",
      purpose: "asset_drawing",
      target: {
        id: input.itemTypeId,
        schema: "store",
        table: "item_types",
      },
    })
  } finally {
    await artifacts.close()
  }
}

export async function uploadStoreItemDrawingAction(formData: FormData) {
  const savedDrawing = await saveAssetDrawing(formData.get("asset_drawing"))
  if (!savedDrawing) throw new Error("Select an Asset drawing to upload.")
  await withStore(
    "store.masters.write",
    (_repository, actorUserId, organizationId) =>
      storeItemDrawingArtifact({
        ...savedDrawing,
        actorUserId,
        itemTypeId: requiredText(formData, "item_type_id"),
        organizationId,
      })
  )
  revalidateStore()
}

const storeMasterKinds = new Set<MasterDataKind>([
  "store_asset_name",
  "store_category",
  "store_item_type",
  "store_location",
  "store_subcategory",
  "store_supplier",
  "store_supplier_price",
  "store_vendor",
])

export async function deleteStoreMasterAction(formData: FormData) {
  const kind = requiredText(formData, "master_kind") as MasterDataKind
  if (!storeMasterKinds.has(kind)) throw new Error("Store master is invalid.")
  const session = await requireCapability("store.masters.write", storePath)
  const connectionString = readAuthEnvironment().connectionString
  const store = createStoreRepository({ connectionString })
  const lifecycle = createMasterDataLifecycleRepository({ connectionString })
  try {
    const organizationId = await store.organizationIdForCode("MRMPL")
    await lifecycle.deleteMaster({
      actorUserId: session.user.id,
      kind,
      organizationId,
      reason: requiredText(formData, "deletion_reason"),
      recordId: requiredText(formData, "master_id"),
      replacementRecordId: optionalText(formData, "replacement_master_id"),
    })
  } finally {
    await lifecycle.close()
    await store.close()
  }
  revalidateStore()
}

export async function requestMissingStoreCodeAction(formData: FormData) {
  await withStore(
    "store.new_item_requests.submit",
    async (repository, actorUserId, organizationId) => {
      const policy = storeRequestFormPolicy(
        await repository.requisitionRequestContext({
          organizationId,
          userId: actorUserId,
        })
      )
      return repository.createCodeRequest({
        actorUserId,
        assetCategoryId: requiredText(formData, "asset_category_id"),
        assetNameId: requiredText(formData, "asset_name_id"),
        assetSubcategoryId: requiredText(formData, "asset_subcategory_id"),
        assetType: assetType(formData),
        department: resolveStoreRequestDepartment(
          policy,
          optionalText(formData, "department")
        ),
        identificationName: requiredText(formData, "identification_name"),
        organizationId,
        reason: optionalText(formData, "reason"),
        requestedBy: policy.requestedBy,
      })
    }
  )
  revalidateStore()
}

export async function resolveMissingStoreCodeAction(formData: FormData) {
  await withStore(
    "store.new_item_requests.resolve",
    (repository, actorUserId, organizationId) =>
      repository.resolveCodeRequest({
        actorUserId,
        codeRequestId: requiredText(formData, "code_request_id"),
        itemTypeId: requiredText(formData, "item_type_id"),
        organizationId,
        resolution:
          requiredText(formData, "resolution") === "Existing Code Found"
            ? "Existing Code Found"
            : "Code Created",
      })
  )
  revalidateStore()
}

export async function createStoreRequisitionBatchAction(formData: FormData) {
  const itemTypeIds = formData
    .getAll("item_type_id")
    .map((value) => value.toString().trim())
  const quantities = formData
    .getAll("quantity")
    .map((value) => Number(value.toString()))
  if (!itemTypeIds.length || itemTypeIds.length !== quantities.length) {
    throw new Error(
      "Select at least one coded Store item and enter its quantity."
    )
  }
  await withStore(
    "store.requests.submit",
    async (repository, actorUserId, organizationId) => {
      const policy = storeRequestFormPolicy(
        await repository.requisitionRequestContext({
          organizationId,
          userId: actorUserId,
        })
      )
      const department = resolveStoreRequestDepartment(
        policy,
        optionalText(formData, "department")
      )
      const location = await repository.ensurePrimaryStoreLocation({
        actorUserId,
        organizationId,
      })
      return repository.createRequisitionBatch({
        actorUserId,
        department,
        items: itemTypeIds.map((itemTypeId, index) => ({
          itemTypeId,
          quantity: quantities[index]!,
        })),
        locationId: location.id,
        organizationId,
        purpose: optionalText(formData, "purpose"),
        requestedBy: policy.requestedBy,
        requiredOn: optionalText(formData, "required_on"),
      })
    }
  )
  revalidateStore()
  redirect("/store/requests")
}

export async function issueStoreRequisitionAction(formData: FormData) {
  await withStore(
    "store.requests.issue",
    async (repository, actorUserId, organizationId, actorEmail) =>
      repository.issueRequisition({
        actorUserId,
        assetCode: optionalText(formData, "asset_code"),
        holderType: "DEPARTMENT",
        issuedBy: actorEmail,
        organizationId,
        quantity: positiveNumber(formData, "issue_quantity"),
        remark: optionalText(formData, "remark"),
        requisitionId: requiredText(formData, "requisition_id"),
      })
  )
  revalidateStore()
}

async function saveGuaranteeCard(upload: FormDataEntryValue | null) {
  if (!(upload instanceof File) || upload.size === 0) return null
  if (upload.size > 10 * 1024 * 1024) {
    throw new Error("Guarantee card must be 10 MB or smaller.")
  }
  const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"])
  if (!allowedTypes.has(upload.type)) {
    throw new Error("Guarantee card must be a PDF, JPG, or PNG file.")
  }
  const bytes = Buffer.from(await upload.arrayBuffer())
  const validated = validateUserAttachment({
    bytes,
    fileName: upload.name,
    purpose: "purchase-order",
  })
  return { bytes, fileName: validated.fileName, mediaType: validated.mediaType }
}

export async function receiveStoreStockAction(formData: FormData) {
  const savedFile = await saveGuaranteeCard(formData.get("guarantee_card"))
  await withStore(
    "store.receipts.receive",
    async (repository, actorUserId, organizationId) => {
      const [requestContext, location] = await Promise.all([
        repository.requisitionRequestContext({
          organizationId,
          userId: actorUserId,
        }),
        repository.ensurePrimaryStoreLocation({
          actorUserId,
          organizationId,
        }),
      ])
      const received = await repository.receiveStock({
        actorUserId,
        billDate: optionalText(formData, "bill_date"),
        billNumber: optionalText(formData, "bill_number"),
        locationId: location.id,
        organizationId,
        purchaseOrderLineId: requiredText(
          formData,
          "purchase_order_line_id"
        ),
        quantity: positiveNumber(formData, "quantity"),
        receivedBy: requestContext.requesterEmail,
        warrantyUntil: optionalText(formData, "warranty_until"),
      })
      if (savedFile) {
        const artifacts = createArtifactService({
          connectionString: readAuthEnvironment().connectionString,
          provider: createUploadThingArtifactProvider(),
        })
        try {
          const sha256 = createHash("sha256")
            .update(savedFile.bytes)
            .digest("hex")
          await artifacts.store({
            actorUserId,
            authorizeTarget: (client) =>
              authorizeStoreReceiptArtifactTarget(client, {
                organizationId,
                receiptId: received.receiptId,
              }),
            bytes: savedFile.bytes,
            fileName: savedFile.fileName,
            idempotencyKey: [
              "store-guarantee-card",
              received.receiptId,
              savedFile.fileName,
              sha256,
            ].join(":"),
            mediaType: savedFile.mediaType,
            organizationId,
            origin: "uploaded",
            purpose: "guarantee_card",
            target: {
              id: received.receiptId,
              schema: "store",
              table: "receipts",
            },
          })
        } finally {
          await artifacts.close()
        }
      }
      return received
    }
  )
  revalidateStore()
}

export async function createStorePurchaseOrdersAction(formData: FormData) {
  const itemTypeIds = formData
    .getAll("item_type_id")
    .map((value) => value.toString().trim())
  if (!itemTypeIds.length) {
    throw new Error("Select at least one Store item to order.")
  }
  await withStore("store.purchase_orders.create", async (
    repository,
    actorUserId,
    organizationId
  ) => {
    const artifacts = createArtifactService({
      connectionString: readAuthEnvironment().connectionString,
      provider: createUploadThingArtifactProvider(),
    })
    try {
      return await repository.createPurchaseOrdersFromSelection({
        actorUserId,
        issuanceId: requiredText(formData, "issuance_id"),
        items: itemTypeIds.map((itemTypeId) => ({
          itemTypeId,
          quantity: positiveNumber(formData, `quantity_${itemTypeId}`),
          supplierId: optionalText(formData, `supplier_${itemTypeId}`),
        })),
        orderDate: optionalText(formData, "order_date"),
        organizationId,
        remark: optionalText(formData, "remark"),
        storeIssuedPdf: storeIssuedPurchaseOrderPdf(artifacts, actorUserId),
      })
    } finally {
      await artifacts.close()
    }
  })
  revalidateStore()
  redirect("/store/orders")
}

export async function createStoreRepairPurchaseOrderAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore("store.asset_repair.write", async (
    repository,
    actorUserId,
    organizationId
  ) => {
    const artifacts = createArtifactService({
      connectionString: readAuthEnvironment().connectionString,
      provider: createUploadThingArtifactProvider(),
    })
    try {
      return await repository.createRepairPurchaseOrder({
        actorUserId,
        assetCode,
        issuanceId: requiredText(formData, "issuance_id"),
        orderDate: optionalText(formData, "order_date"),
        organizationId,
        remark: optionalText(formData, "remark"),
        serviceDescription: requiredText(formData, "service_description"),
        servicePrice: requiredText(formData, "service_price"),
        storeIssuedPdf: storeIssuedPurchaseOrderPdf(artifacts, actorUserId),
        supplierId: requiredText(formData, "supplier_id"),
      })
    } finally {
      await artifacts.close()
    }
  })
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
  redirect(`/store/assets/${encodeURIComponent(assetCode)}`)
}

export async function completeStoreRepairPurchaseOrderAction(
  formData: FormData
) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore(
    "store.asset_repair.write",
    (repository, actorUserId, organizationId) =>
      repository.completeRepairPurchaseOrder({
        actorUserId,
        assetCode,
        organizationId,
        purchaseOrderId: requiredText(formData, "purchase_order_id"),
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}

export async function moveStoreAssetAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore(
    "store.asset_movement.write",
    (repository, actorUserId, organizationId) =>
      repository.moveAsset({
        actorUserId,
        assetCode,
        holderName: optionalText(formData, "holder_name"),
        holderReference: optionalText(formData, "holder_reference"),
        holderType: holderType(formData),
        movedBy: optionalText(formData, "moved_by"),
        organizationId,
        remark: optionalText(formData, "remark"),
        vendorId: optionalText(formData, "vendor_id"),
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}

export async function scheduleStoreAssetMaintenanceAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore(
    "store.asset_maintenance.write",
    (repository, actorUserId, organizationId) =>
      repository.scheduleAssetMaintenance({
        actorUserId,
        assetCode,
        definitionCode: requiredText(formData, "definition_code"),
        firstDueOn: requiredText(formData, "first_due_on"),
        organizationId,
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}

export async function setStoreAssetLifecycleAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  const status = requiredText(formData, "asset_status")
  if (!["BROKEN", "SCRAPPED", "UNDER_MAINTENANCE"].includes(status)) {
    throw new Error("Asset status is invalid.")
  }
  await withStore(
    "store.asset_lifecycle.write",
    (repository, actorUserId, organizationId) =>
      repository.setAssetLifecycleStatus({
        actorUserId,
        assetCode,
        changedBy: optionalText(formData, "changed_by"),
        organizationId,
        remark: optionalText(formData, "status_remark"),
        status: status as "BROKEN" | "SCRAPPED" | "UNDER_MAINTENANCE",
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}

export async function completeStoreAssetMaintenanceAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  const type = requiredText(formData, "maintenance_type")
  if (!["MAINTENANCE", "CALIBRATION", "BREAKDOWN"].includes(type)) {
    throw new Error("Maintenance type is invalid.")
  }
  await withStore(
    "store.asset_maintenance.write",
    (repository, actorUserId, organizationId) =>
      repository.completeAssetMaintenance({
        actorUserId,
        assetCode,
        certificateNumber: optionalText(formData, "certificate_number"),
        completedBy: requiredText(formData, "completed_by"),
        completedOn: requiredText(formData, "completed_on"),
        cost: optionalText(formData, "cost"),
        maintenanceType: type as "BREAKDOWN" | "CALIBRATION" | "MAINTENANCE",
        organizationId,
        result: optionalText(formData, "result"),
        scheduleId: optionalText(formData, "schedule_id"),
        supplierName: optionalText(formData, "supplier_name"),
        workDone: optionalText(formData, "work_done"),
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}

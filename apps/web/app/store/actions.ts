"use server"

import { withMasterSaveFeedback } from "@/lib/master-save-feedback"

import { createHash } from "node:crypto"

import {
  authorizeStoreItemTypeArtifactTarget,
  authorizeStoreReceiptArtifactTarget,
  authorizeStoreSupplierPriceArtifactTarget,
  createArtifactService,
  createDepartmentStoreRepository,
  createMasterDataLifecycleRepository,
  createStoreRepository,
  type MasterDataKind,
  type StoreAssetType,
  type StoreHolderType,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { signedInPerformer } from "@/lib/auth/signed-in-machinist"
import { masterCapability } from "@/lib/auth/master-capabilities"
import { listGrantedCapabilities, requireCapability } from "@/lib/auth/require-capability"
import { accountableStoreHref, accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import {
  isStoreActionCapability,
  requireStoreAction,
} from "@/lib/auth/store-action-access"
import {
  resolveStoreRequestDepartment,
  storeRequestFormPolicy,
} from "@/lib/store-request-policy"
import { storePurchaseOrderIssuanceId } from "@/lib/store-purchase-order-input"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import { storeIssuedPurchaseOrderPdf } from "@/lib/store/issued-purchase-order-pdf"
import type { PendingUploadIntent } from "@/lib/artifact-upload-contract"
import {
  consumePendingArtifactUpload,
  pendingUploadAuthorizationForUser,
  pendingUploadId,
  preparePendingArtifactUploadForFinalAction,
} from "@/lib/pending-artifact-upload-server"

const storePath = "/store"
const holderTypes = [
  "DEPARTMENT",
  "MACHINE",
  "STORE",
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
  return value as (typeof holderTypes)[number]
}

async function withStore<T>(
  capability: string,
  operation: (
    repository: ReturnType<typeof createStoreRepository>,
    actorUserId: string,
    organizationId: string,
    actorEmail: string,
    actorUserName: string
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
      session.user.email,
      session.user.name
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
  revalidatePath("/store/stock/repair")
  revalidatePath("/store/movement")
  revalidatePath("/store/requests")
  revalidatePath("/store/requests/new")
  revalidatePath("/store/new-item-requests")
  revalidatePath("/store/assets")
}

async function retainStoreReceiptGuaranteeCard(input: {
  actorUserId: string
  expectedIntent: PendingUploadIntent
  organizationId: string
  pendingAuthorization: Awaited<
    ReturnType<typeof pendingUploadAuthorizationForUser>
  >
  receiptId: string
  uploadId: string
}) {
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createGoogleCloudArtifactProvider(),
  })
  try {
    await consumePendingArtifactUpload({
      authorization: input.pendingAuthorization,
      expectedIntent: input.expectedIntent,
      finalize: async (source) => {
        const sha256 = createHash("sha256").update(source.bytes).digest("hex")
        const artifact = await artifacts.store({
          actorUserId: input.actorUserId,
          authorizeTarget: (client) =>
            authorizeStoreReceiptArtifactTarget(client, {
              organizationId: input.organizationId,
              receiptId: input.receiptId,
            }),
          bytes: source.bytes,
          fileName: source.fileName,
          idempotencyKey: [
            "store-guarantee-card",
            input.receiptId,
            source.fileName,
            sha256,
          ].join(":"),
          mediaType: source.mediaType,
          organizationId: input.organizationId,
          origin: "uploaded",
          pendingUploadId: source.pendingUploadId,
          purpose: "guarantee_card",
          target: {
            id: input.receiptId,
            schema: "store",
            table: "receipts",
          },
        })
        return {
          binding: {
            artifactId: artifact.id,
            purpose: "guarantee_card",
            target: {
              id: input.receiptId,
              schema: "store",
              table: "receipts",
            },
          },
          value: undefined,
        }
      },
      recover: () => undefined,
      uploadId: input.uploadId,
    })
  } finally {
    await artifacts.close()
  }
}

export async function createStoreLocationAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await withStore(
      masterCapability("LOCATION", "save"),
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
              rejectDuplicates: true,
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
  })
}

export async function createStoreSupplierAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await withStore(
      masterCapability("SUPPLIER", "save"),
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
  })
}

async function storeSupplierQuoteArtifact(input: {
  actorUserId: string
  bytes: Buffer
  fileName: string
  mediaType: string
  organizationId: string
  pendingUploadId?: string
  supplierPriceId: string
}) {
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createGoogleCloudArtifactProvider(),
  })
  try {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex")
    return await artifacts.store({
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
      pendingUploadId: input.pendingUploadId,
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
  return withMasterSaveFeedback(async () => {
    await requireCapability(
      masterCapability("SUPPLIER_PRICE", "save"),
      storePath
    )
    const quoteUploadId = pendingUploadId(formData, "supplier_quote")
    const quoteIntent = {
      itemTypeId: requiredText(formData, "item_type_id"),
      kind: "store-supplier-quote" as const,
      supplierId: requiredText(formData, "supplier_id"),
    }
    await withStore(
      masterCapability("SUPPLIER_PRICE", "save"),
      async (repository, actorUserId, organizationId) => {
        const pendingAuthorization = quoteUploadId
          ? await pendingUploadAuthorizationForUser(actorUserId)
          : null
        if (quoteUploadId && pendingAuthorization) {
          await preparePendingArtifactUploadForFinalAction({
            authorization: pendingAuthorization,
            expectedIntent: quoteIntent,
            uploadId: quoteUploadId,
          })
        }
        const price = await repository.createSupplierPrice({
          rejectDuplicates: true,
          actorUserId,
          itemTypeId: requiredText(formData, "item_type_id"),
          organizationId,
          quoteReference: optionalText(formData, "quote_reference"),
          supplierId: requiredText(formData, "supplier_id"),
          unitPrice: requiredText(formData, "unit_price"),
          validFrom: optionalText(formData, "valid_from"),
        })
        if (quoteUploadId && pendingAuthorization) {
          await consumePendingArtifactUpload({
            authorization: pendingAuthorization,
            expectedIntent: quoteIntent,
            finalize: async (source) => {
              const artifact = await storeSupplierQuoteArtifact({
                ...source,
                actorUserId,
                organizationId,
                supplierPriceId: price.id,
              })
              return {
                binding: {
                  artifactId: artifact.id,
                  purpose: "supplier_quote",
                  target: {
                    id: price.id,
                    schema: "store",
                    table: "supplier_prices",
                  },
                },
                value: undefined,
              }
            },
            recover: () => undefined,
            uploadId: quoteUploadId,
          })
        }
      }
    )
    revalidateStore()
  })
}

export async function uploadStoreSupplierQuoteAction(formData: FormData) {
  await requireCapability(masterCapability("SUPPLIER_PRICE", "save"), storePath)
  const quoteUploadId = pendingUploadId(formData, "supplier_quote")
  if (!quoteUploadId) {
    throw new Error("Select a Supplier quote PDF to upload.")
  }
  await withStore(
    masterCapability("SUPPLIER_PRICE", "save"),
    async (_repository, actorUserId, organizationId) => {
      const supplierPriceId = requiredText(formData, "supplier_price_id")
      const authorization = await pendingUploadAuthorizationForUser(actorUserId)
      await consumePendingArtifactUpload({
        authorization,
        expectedIntent: {
          kind: "store-supplier-quote",
          supplierPriceId,
        },
        finalize: async (source) => {
          const artifact = await storeSupplierQuoteArtifact({
            ...source,
            actorUserId,
            organizationId,
            supplierPriceId,
          })
          return {
            binding: {
              artifactId: artifact.id,
              purpose: "supplier_quote",
              target: {
                id: supplierPriceId,
                schema: "store",
                table: "supplier_prices",
              },
            },
            value: undefined,
          }
        },
        recover: () => undefined,
        uploadId: quoteUploadId,
      })
    }
  )
  revalidatePath("/store/assets/[assetCode]", "page")
  revalidateStore()
}

export async function createStoreVendorAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await withStore(
      masterCapability("VENDOR", "save"),
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
              rejectDuplicates: true,
              actorUserId,
              code: requiredText(formData, "vendor_code"),
              contactDetails: optionalText(formData, "contact_details"),
              name: requiredText(formData, "vendor_name"),
              organizationId,
            })
      }
    )
    revalidateStore()
  })
}

export async function createStoreAssetCategoryAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await withStore(
      masterCapability("CATEGORY", "save"),
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
              rejectDuplicates: true,
              actorUserId,
              name: requiredText(formData, "asset_category_name"),
              organizationId,
            })
      }
    )
    revalidateStore()
  })
}

export async function createStoreAssetSubcategoryAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await withStore(
      masterCapability("SUBCATEGORY", "save"),
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
              rejectDuplicates: true,
              actorUserId,
              categoryId: requiredText(formData, "asset_category_id"),
              name: requiredText(formData, "asset_subcategory_name"),
              organizationId,
            })
      }
    )
    revalidateStore()
  })
}

export async function createStoreAssetNameAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await withStore(
      masterCapability("ASSET_NAME", "save"),
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
              rejectDuplicates: true,
              actorUserId,
              name: requiredText(formData, "asset_name"),
              organizationId,
              subcategoryId: requiredText(formData, "asset_subcategory_id"),
            })
      }
    )
    revalidateStore()
  })
}

export async function createStoreItemTypeAction(formData: FormData) {
  return withMasterSaveFeedback(async () => {
    await requireCapability(masterCapability("ITEM_TYPE", "save"), storePath)
    const drawingUploadId = pendingUploadId(formData, "asset_drawing")
    const masterId = optionalText(formData, "master_id")
    const drawingIntent = {
      ...(masterId ? { itemTypeId: masterId } : {}),
      kind: "store-item-drawing" as const,
    }
    await withStore(
      masterCapability("ITEM_TYPE", "save"),
      async (repository, actorUserId, organizationId) => {
        const pendingAuthorization = drawingUploadId
          ? await pendingUploadAuthorizationForUser(actorUserId)
          : null
        if (drawingUploadId && pendingAuthorization) {
          await preparePendingArtifactUploadForFinalAction({
            ...(masterId
              ? {
                  allowFinalizedBinding: {
                    purpose: "asset_drawing",
                    target: {
                      id: masterId,
                      schema: "store",
                      table: "item_types",
                    },
                  },
                }
              : {}),
            authorization: pendingAuthorization,
            expectedIntent: drawingIntent,
            uploadId: drawingUploadId,
          })
        }
        const input = {
          actorUserId,
          assetCategoryId: requiredText(formData, "asset_category_id"),
          assetNameId: requiredText(formData, "asset_name_id"),
          assetSubcategoryId: requiredText(formData, "asset_subcategory_id"),
          assetType: assetType(formData),
          applicableItemCode: optionalText(formData, "applicable_item_code"),
          identificationName:
            optionalText(formData, "identification_name") ?? "",
          manufacturerMake: optionalText(formData, "manufacturer_make"),
          minimumStock: Number(optionalText(formData, "minimum_stock") ?? 0),
          modelNumber: optionalText(formData, "model_number"),
          organizationId,
          ratedLoad: optionalText(formData, "rated_load"),
          unit: requiredText(formData, "unit"),
        }
        const item = masterId
          ? await repository.updateItemType({ ...input, id: masterId })
          : await repository.createItemType({
              ...input,
              rejectDuplicates: true,
            })
        if (drawingUploadId && pendingAuthorization) {
          await consumePendingArtifactUpload({
            authorization: pendingAuthorization,
            expectedIntent: drawingIntent,
            finalize: async (source) => {
              const artifact = await storeItemDrawingArtifact({
                ...source,
                actorUserId,
                itemTypeId: item.id,
                organizationId,
              })
              return {
                binding: {
                  artifactId: artifact.id,
                  purpose: "asset_drawing",
                  target: {
                    id: item.id,
                    schema: "store",
                    table: "item_types",
                  },
                },
                value: undefined,
              }
            },
            recover: () => undefined,
            uploadId: drawingUploadId,
          })
        }
      }
    )
    revalidateStore()
  })
}

async function storeItemDrawingArtifact(input: {
  actorUserId: string
  bytes: Buffer
  fileName: string
  itemTypeId: string
  mediaType: string
  organizationId: string
  pendingUploadId?: string
}) {
  const artifacts = createArtifactService({
    connectionString: readAuthEnvironment().connectionString,
    provider: createGoogleCloudArtifactProvider(),
  })
  try {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex")
    return await artifacts.store({
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
      pendingUploadId: input.pendingUploadId,
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
  await requireCapability(masterCapability("ITEM_TYPE", "save"), storePath)
  const drawingUploadId = pendingUploadId(formData, "asset_drawing")
  if (!drawingUploadId) {
    throw new Error("Select an Asset drawing to upload.")
  }
  await withStore(
    masterCapability("ITEM_TYPE", "save"),
    async (_repository, actorUserId, organizationId) => {
      const itemTypeId = requiredText(formData, "item_type_id")
      const authorization = await pendingUploadAuthorizationForUser(actorUserId)
      await consumePendingArtifactUpload({
        authorization,
        expectedIntent: { itemTypeId, kind: "store-item-drawing" },
        finalize: async (source) => {
          const artifact = await storeItemDrawingArtifact({
            ...source,
            actorUserId,
            itemTypeId,
            organizationId,
          })
          return {
            binding: {
              artifactId: artifact.id,
              purpose: "asset_drawing",
              target: {
                id: itemTypeId,
                schema: "store",
                table: "item_types",
              },
            },
            value: undefined,
          }
        },
        recover: () => undefined,
        uploadId: drawingUploadId,
      })
    }
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
  const session = await requireCapability(
    masterCapability(kind.slice("store_".length).toUpperCase(), "delete"),
    storePath
  )
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
        assetCategory: requiredText(formData, "asset_category"),
        assetName: requiredText(formData, "asset_name"),
        assetSubcategory: requiredText(formData, "asset_subcategory"),
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
  const resolution = requiredText(formData, "resolution")
  if (resolution !== "Existing Code Found" && resolution !== "Code Created") {
    throw new Error("Select a resolution for this request.")
  }
  await withStore(
    "store.new_item_requests.resolve",
    (repository, actorUserId, organizationId) =>
      repository.resolveCodeRequest({
        actorUserId,
        codeRequestId: requiredText(formData, "code_request_id"),
        itemTypeId: requiredText(formData, "item_type_id"),
        organizationId,
        resolution,
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
  const requestedUnitIds = formData
    .getAll("requested_unit_id")
    .map((value) => value.toString().trim())
  if (!itemTypeIds.length || itemTypeIds.length !== quantities.length) {
    throw new Error(
      "Select at least one coded Store item and enter its quantity."
    )
  }
  if (requestedUnitIds.length && requestedUnitIds.length !== itemTypeIds.length) {
    throw new Error("Each request line needs a Unit ID selection or blank value.")
  }
  const result = await withStore(
    "store.requests.submit",
    async (repository, actorUserId, organizationId) => {
      const context = await repository.requisitionRequestContext({
        organizationId,
        userId: actorUserId,
      })
      const policy = storeRequestFormPolicy(context)
      const fulfillmentKind = requiredText(formData, "fulfillment_kind")
      if (!["DEPARTMENT_USE", "PERSON_USE", "STORE_TRANSFER"].includes(fulfillmentKind)) {
        throw new Error("Choose a valid request purpose.")
      }
      const receivingStoreCode = fulfillmentKind === "STORE_TRANSFER"
        ? requiredText(formData, "receiving_store_code") : null
      let receivingStoreName: string | null = null
      if (receivingStoreCode) {
        const capability = accountableStorePermission(receivingStoreCode, "request")
        const granted = await listGrantedCapabilities(actorUserId, [capability])
        if (!granted.length || receivingStoreCode.toUpperCase() === "MAIN") {
          throw new Error("Only a designated receiving Store person can request responsibility.")
        }
        const receivingStore = (await repository.listRequestableStores(organizationId))
          .find((store) => store.code.toLowerCase() === receivingStoreCode.toLowerCase())
        if (!receivingStore) throw new Error("Receiving Store was not found.")
        receivingStoreName = receivingStore.name
      }
      const department = receivingStoreName ?? resolveStoreRequestDepartment(
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
        fulfillmentKind: fulfillmentKind as "DEPARTMENT_USE" | "PERSON_USE" | "STORE_TRANSFER",
        items: itemTypeIds.map((itemTypeId, index) => ({
          itemTypeId,
          quantity: quantities[index]!,
          requestedUnitId: requestedUnitIds[index] || null,
        })),
        locationId: location.id,
        organizationId,
        purpose: optionalText(formData, "purpose"),
        receivingStoreCode,
        recipientReference: fulfillmentKind === "PERSON_USE"
          ? context.requesterIdentity.code || context.requesterEmail : null,
        recipientName: fulfillmentKind === "PERSON_USE"
          ? context.requesterIdentity.name || context.requesterEmail : null,
        requestedBy: policy.requestedBy,
        requiredOn: optionalText(formData, "required_on"),
      })
    }
  )
  revalidateStore()
  redirect(`/store/requests/new?saved=${encodeURIComponent(result.requestNumber)}`)
}

export async function fulfillStoreTransferRequestAction(formData: FormData) {
  const session = await requireStoreAction("store.requests.issue", "/store/requests")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const organizationId = await repository.organizationIdForCode("MRMPL")
    .finally(() => repository.close())
  const transfers = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
  const common = {
    actorUserId: session.user.id,
    destinationStoreCode: requiredText(formData, "destination_store_code"),
    movedBy: session.user.name?.trim() || session.user.email,
    organizationId,
    requisitionId: requiredText(formData, "requisition_id"),
    remark: optionalText(formData, "remark"),
    sourceStoreCode: "MAIN",
  }
  const assetCode = optionalText(formData, "asset_code")
  if (assetCode) {
    await transfers.transferAssetAccountability({ ...common, assetCode })
  } else {
    await transfers.transferQuantity({
      ...common,
      itemTypeId: requiredText(formData, "item_type_id"),
      quantity: positiveNumber(formData, "issue_quantity"),
    })
  }
  revalidateStore()
  revalidatePath(accountableStoreHref(common.destinationStoreCode))
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

export async function cancelStoreRequisitionAction(formData: FormData) {
  await withStore(
    "store.requests.issue",
    (repository, actorUserId, organizationId) =>
      repository.cancelRequisition({
        actorUserId,
        organizationId,
        requisitionId: requiredText(formData, "requisition_id"),
      })
  )
  revalidateStore()
}

export async function issueRemainingStoreRequisitionBatchAction(
  formData: FormData
) {
  const requisitionIds = formData
    .getAll("requisition_id")
    .map((value) => value.toString().trim())
    .filter(Boolean)
  if (!requisitionIds.length) {
    throw new Error("Select at least one Store request line to allocate.")
  }
  const lines = requisitionIds.map((requisitionId) => ({
    assetCodes: formData
      .getAll(`asset_code_${requisitionId}`)
      .map((value) => value.toString().trim())
      .filter(Boolean),
    requisitionId,
  }))
  await withStore(
    "store.requests.issue",
    async (repository, actorUserId, organizationId, actorEmail) =>
      repository.issueRemainingRequisitionBatch({
        actorUserId,
        issuedBy: actorEmail,
        lines,
        organizationId,
      })
  )
  revalidateStore()
}

export async function receiveStoreStockAction(formData: FormData) {
  const guaranteeUploadId = pendingUploadId(formData, "guarantee_card")
  const purchaseOrderLineId = requiredText(formData, "purchase_order_line_id")
  const guaranteeIntent = {
    kind: "store-guarantee-card" as const,
    purchaseOrderLineId,
  }
  const unitDetails = {
    manufacturerSerialNumber: optionalText(formData, "manufacturer_serial_number"),
    installedOn: optionalText(formData, "installed_on"),
    stabilizerUnitId: optionalText(formData, "stabilizer_unit_id"),
    mcbNumber: optionalText(formData, "mcb_number"),
  }
  await withStore(
    "store.receipts.receive",
    async (repository, actorUserId, organizationId) => {
      const pendingAuthorization = guaranteeUploadId
        ? await pendingUploadAuthorizationForUser(actorUserId)
        : null
      if (guaranteeUploadId && pendingAuthorization) {
        await preparePendingArtifactUploadForFinalAction({
          authorization: pendingAuthorization,
          expectedIntent: guaranteeIntent,
          uploadId: guaranteeUploadId,
        })
      }
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
        purchaseOrderLineId,
        quantity: positiveNumber(formData, "quantity"),
        receivedBy: storeRequestFormPolicy(requestContext).requestedBy,
        unitDetails: Object.values(unitDetails).some(Boolean) ? unitDetails : undefined,
        warrantyPeriod: optionalText(formData, "warranty_period"),
        warrantyUntil: optionalText(formData, "warranty_until"),
      })
      if (guaranteeUploadId && pendingAuthorization) {
        await retainStoreReceiptGuaranteeCard({
          actorUserId,
          expectedIntent: guaranteeIntent,
          organizationId,
          pendingAuthorization,
          receiptId: received.receiptId,
          uploadId: guaranteeUploadId,
        })
      }
      return received
    }
  )
  revalidateStore()
}

export async function receiveRemainingStoreStockBatchAction(
  formData: FormData
) {
  const guaranteeUploadId = pendingUploadId(formData, "guarantee_card")
  const purchaseOrderId = requiredText(formData, "purchase_order_id")
  const purchaseOrderLineIds = formData
    .getAll("purchase_order_line_id")
    .map((value) => value.toString().trim())
    .filter(Boolean)
  if (!purchaseOrderLineIds.length) {
    throw new Error("Select at least one Purchase Order line to receive.")
  }
  const guaranteeIntent = {
    kind: "store-guarantee-card" as const,
    purchaseOrderId,
  }
  await withStore(
    "store.receipts.receive",
    async (repository, actorUserId, organizationId) => {
      const pendingAuthorization = guaranteeUploadId
        ? await pendingUploadAuthorizationForUser(actorUserId)
        : null
      if (guaranteeUploadId && pendingAuthorization) {
        await preparePendingArtifactUploadForFinalAction({
          authorization: pendingAuthorization,
          expectedIntent: guaranteeIntent,
          uploadId: guaranteeUploadId,
        })
      }
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
      const received = await repository.receiveRemainingStockBatch({
        actorUserId,
        billDate: optionalText(formData, "bill_date"),
        billNumber: optionalText(formData, "bill_number"),
        locationId: location.id,
        organizationId,
        purchaseOrderId,
        purchaseOrderLineIds,
        receivedBy: storeRequestFormPolicy(requestContext).requestedBy,
        warrantyPeriod: optionalText(formData, "warranty_period"),
        warrantyUntil: optionalText(formData, "warranty_until"),
      })
      if (guaranteeUploadId && pendingAuthorization) {
        await retainStoreReceiptGuaranteeCard({
          actorUserId,
          expectedIntent: guaranteeIntent,
          organizationId,
          pendingAuthorization,
          receiptId: received.receiptId,
          uploadId: guaranteeUploadId,
        })
      }
      return received
    }
  )
  revalidateStore()
}

export async function updateStoreAssetEquipmentDetailsAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  try {
    await withStore("store.receipts.receive", async (repository, actorUserId, organizationId) =>
      repository.updateAssetEquipmentDetails({
        actorUserId,
        assetCode,
        installedOn: optionalText(formData, "installed_on"),
        manufacturerSerialNumber: optionalText(formData, "manufacturer_serial_number"),
        mcbNumber: optionalText(formData, "mcb_number"),
        organizationId,
        stabilizerUnitId: optionalText(formData, "stabilizer_unit_id"),
        warrantyPeriod: optionalText(formData, "warranty_period"),
        warrantyUntil: optionalText(formData, "warranty_until"),
      })
    )
  } catch (error) {
    if (error instanceof Error && /Stabiliser Unit ID|own stabiliser/.test(error.message)) {
      return { error: error.message }
    }
    throw error
  }
  revalidateStore()
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
}

export async function createStorePurchaseOrdersAction(formData: FormData) {
  const itemTypeIds = formData
    .getAll("item_type_id")
    .map((value) => value.toString().trim())
  if (!itemTypeIds.length) {
    throw new Error("Select at least one Store item to order.")
  }
  const created = await withStore(
    "store.purchase_orders.create",
    async (repository, actorUserId, organizationId) => {
      const artifacts = createArtifactService({
        connectionString: readAuthEnvironment().connectionString,
        provider: createGoogleCloudArtifactProvider(),
      })
      try {
        return await repository.createPurchaseOrdersFromSelection({
          actorUserId,
          issuanceId: storePurchaseOrderIssuanceId(formData.get("issuance_id")),
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
    }
  )
  revalidateStore()
  redirect(`/store/stock?ordersSaved=${created.orders.length}`)
}

export async function moveStoreAssetAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore(
    "store.asset_movement.write",
    async (repository, actorUserId, organizationId, _actorEmail, actorUserName) => {
      const performer = await signedInPerformer({
        connectionString: readAuthEnvironment().connectionString,
        organizationId,
        userId: actorUserId,
        userName: actorUserName,
      })
      if (!performer) throw new Error("Your account needs a name to move this asset.")
      return repository.moveAsset({
        actorUserId,
        assetCode,
        holderReference: optionalText(formData, "holder_reference"),
        holderType: holderType(formData),
        movedBy: [performer.code, performer.name].filter(Boolean).join(" - "),
        organizationId,
        remark: optionalText(formData, "remark"),
        vendorId: optionalText(formData, "vendor_id"),
      })
    }
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
  redirect(`/store/movement?moved=${encodeURIComponent(assetCode)}`)
}

export async function scheduleStoreAssetMaintenanceMasterAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  const schedule = await withStore(
    "store.asset_maintenance.write",
    (repository, actorUserId, organizationId) =>
      repository.scheduleAssetMaintenanceMaster({
        actorUserId,
        assetCode,
        definitionId: requiredText(formData, "definition_id"),
        firstDueOn: requiredText(formData, "first_due_on"),
        organizationId,
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidatePath(`/store/assets/${encodeURIComponent(schedule.typeCode)}`)
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
    async (repository, actorUserId, organizationId, _actorEmail, actorUserName) => {
      const performer = await signedInPerformer({
        connectionString: readAuthEnvironment().connectionString,
        organizationId,
        userId: actorUserId,
        userName: actorUserName,
      })
      if (!performer) throw new Error("Your account needs a name to update asset status.")
      return repository.setAssetLifecycleStatus({
        actorUserId,
        assetCode,
        changedBy: [performer.code, performer.name].filter(Boolean).join(" - "),
        organizationId,
        remark: optionalText(formData, "status_remark"),
        status: status as "BROKEN" | "SCRAPPED" | "UNDER_MAINTENANCE",
      })
    }
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}
export async function recordStoreAssetAcquisitionAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore(
    "store.receipts.receive",
    (repository, actorUserId, organizationId) =>
      repository.recordAssetAcquisition({
        actorUserId,
        assetCode,
        organizationId,
        supplierId: requiredText(formData, "supplier_id"),
        unitPrice: requiredText(formData, "unit_price"),
      })
  )
  revalidatePath(`/store/assets/${encodeURIComponent(assetCode)}`)
  revalidateStore()
}

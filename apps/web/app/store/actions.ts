"use server"

import { randomUUID } from "node:crypto"

import {
  createMasterDataLifecycleRepository,
  createStoreRepository,
  type MasterDataKind,
  type StoreAssetType,
  type StoreHolderType,
} from "@workspace/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import {
  deleteUserAttachment,
  saveUserAttachment,
} from "@/lib/user-attachment-storage"
import { validateUserAttachment } from "@/lib/user-attachment-security"

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
  if (!holderTypes.includes(value as StoreHolderType)) {
    throw new Error("Holder type is invalid.")
  }
  return value as StoreHolderType
}

async function withStore<T>(
  capability: "store.manage" | "store.requests.write",
  operation: (
    repository: ReturnType<typeof createStoreRepository>,
    actorUserId: string,
    organizationId: string
  ) => Promise<T>
) {
  const session = await requireCapability(capability, storePath)
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    return await operation(repository, session.user.id, organizationId)
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

export async function createStoreLocationAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
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
  })
  revalidateStore()
}

export async function createStoreSupplierAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
    const masterId = optionalText(formData, "master_id")
    return masterId
      ? repository.updateSupplier({
          actorUserId,
          contactDetails: optionalText(formData, "contact_details"),
          email: optionalText(formData, "supplier_email"),
          id: masterId,
          name: requiredText(formData, "supplier_name"),
          organizationId,
        })
      : repository.createSupplier({
          actorUserId,
          code: requiredText(formData, "supplier_code"),
          contactDetails: optionalText(formData, "contact_details"),
          email: optionalText(formData, "supplier_email"),
          name: requiredText(formData, "supplier_name"),
          organizationId,
        })
  })
  revalidateStore()
}

export async function createStoreSupplierPriceAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.createSupplierPrice({
      actorUserId,
      itemTypeId: requiredText(formData, "item_type_id"),
      organizationId,
      quoteReference: optionalText(formData, "quote_reference"),
      supplierId: requiredText(formData, "supplier_id"),
      unitPrice: requiredText(formData, "unit_price"),
      validFrom: optionalText(formData, "valid_from"),
    })
  )
  revalidateStore()
}

export async function createStoreVendorAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
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
  })
  revalidateStore()
}

export async function createStoreAssetCategoryAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
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
  })
  revalidateStore()
}

export async function createStoreAssetSubcategoryAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
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
  })
  revalidateStore()
}

export async function createStoreAssetNameAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
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
  })
  revalidateStore()
}

export async function createStoreItemTypeAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) => {
    const masterId = optionalText(formData, "master_id")
    const input = {
      actorUserId,
      assetCategoryId: requiredText(formData, "asset_category_id"),
      assetNameId: requiredText(formData, "asset_name_id"),
      assetSubcategoryId: requiredText(formData, "asset_subcategory_id"),
      assetType: assetType(formData),
      applicableItemCode: optionalText(formData, "applicable_item_code"),
      drawingNumber: optionalText(formData, "drawing_number"),
      identificationName: requiredText(formData, "identification_name"),
      minimumStock: Number(optionalText(formData, "minimum_stock") ?? 0),
      organizationId,
      unit: requiredText(formData, "unit"),
    }
    return masterId
      ? repository.updateItemType({ ...input, id: masterId })
      : repository.createItemType(input)
  })
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
  const session = await requireCapability("store.manage", storePath)
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
    "store.requests.write",
    (repository, actorUserId, organizationId) =>
      repository.createCodeRequest({
        actorUserId,
        assetCategoryId: requiredText(formData, "asset_category_id"),
        assetNameId: requiredText(formData, "asset_name_id"),
        assetSubcategoryId: requiredText(formData, "asset_subcategory_id"),
        assetType: assetType(formData),
        department: requiredText(formData, "department"),
        identificationName: requiredText(formData, "identification_name"),
        organizationId,
        reason: optionalText(formData, "reason"),
        requestedBy: requiredText(formData, "requested_by"),
      })
  )
  revalidateStore()
}

export async function resolveMissingStoreCodeAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
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
    "store.requests.write",
    (repository, actorUserId, organizationId) =>
      repository.createRequisitionBatch({
        actorUserId,
        department: requiredText(formData, "department"),
        items: itemTypeIds.map((itemTypeId, index) => ({
          itemTypeId,
          quantity: quantities[index]!,
        })),
        locationId: requiredText(formData, "location_id"),
        organizationId,
        purpose: optionalText(formData, "purpose"),
        requestedBy: requiredText(formData, "requested_by"),
        requiredOn: optionalText(formData, "required_on"),
      })
  )
  revalidateStore()
  redirect("/store/requests")
}

export async function issueStoreRequisitionAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.issueRequisition({
      actorUserId,
      assetCode: optionalText(formData, "asset_code"),
      holderName: optionalText(formData, "holder_name"),
      holderReference: optionalText(formData, "holder_reference"),
      holderType: holderType(formData),
      issuedBy: optionalText(formData, "issued_by"),
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
  const storageKey = `store/${randomUUID()}-${validated.fileName}`
  await saveUserAttachment({
    bytes,
    mediaType: validated.mediaType,
    storageKey,
  })
  return { fileName: validated.fileName, storageKey }
}

export async function receiveStoreStockAction(formData: FormData) {
  const savedFile = await saveGuaranteeCard(formData.get("guarantee_card"))
  try {
    await withStore("store.manage", (repository, actorUserId, organizationId) =>
      repository.receiveStock({
        actorUserId,
        billDate: optionalText(formData, "bill_date"),
        billNumber: optionalText(formData, "bill_number"),
        guaranteeCardFileName: savedFile?.fileName,
        guaranteeCardStorageKey: savedFile?.storageKey,
        locationId: requiredText(formData, "location_id"),
        organizationId,
        purchaseOrderLineId: requiredText(formData, "purchase_order_line_id"),
        quantity: positiveNumber(formData, "quantity"),
        receivedBy: optionalText(formData, "received_by"),
        warrantyUntil: optionalText(formData, "warranty_until"),
      })
    )
  } catch (error) {
    if (savedFile) {
      await deleteUserAttachment(savedFile.storageKey).catch(() => undefined)
    }
    throw error
  }
  revalidateStore()
}

export async function createStorePurchaseOrdersAction(formData: FormData) {
  const itemTypeIds = formData
    .getAll("item_type_id")
    .map((value) => value.toString().trim())
  if (!itemTypeIds.length) {
    throw new Error("Select at least one Store item to order.")
  }
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.createPurchaseOrdersFromSelection({
      actorUserId,
      items: itemTypeIds.map((itemTypeId) => ({
        itemTypeId,
        quantity: positiveNumber(formData, `quantity_${itemTypeId}`),
      })),
      orderDate: optionalText(formData, "order_date"),
      organizationId,
      remark: optionalText(formData, "remark"),
    })
  )
  revalidateStore()
  redirect("/store/orders")
}

export async function moveStoreAssetAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
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
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
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
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
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
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
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

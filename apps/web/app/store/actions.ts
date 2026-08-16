"use server"

import { randomUUID } from "node:crypto"
import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  createStoreRepository,
  type StoreHolderType,
  type StoreTrackingMode,
} from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { validateUserAttachment } from "@/lib/user-attachment-security"

const storePath = "/store"
const holderTypes = [
  "DEPARTMENT",
  "MACHINE",
  "PERSON",
  "STORE",
  "UNIT",
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

function trackingMode(formData: FormData): StoreTrackingMode {
  return requiredText(formData, "tracking_mode") === "SERIALIZED"
    ? "SERIALIZED"
    : "CONSUMABLE"
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
  revalidatePath("/store")
  revalidatePath("/store/items")
  revalidatePath("/store/requests")
  revalidatePath("/store/assets")
}

export async function createStoreLocationAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.createLocation({
      actorUserId,
      code: requiredText(formData, "location_code"),
      locationType: requiredText(formData, "location_type") as
        | "DEPARTMENT"
        | "STORE"
        | "UNIT",
      name: requiredText(formData, "location_name"),
      organizationId,
    })
  )
  revalidateStore()
}

export async function createStoreSupplierAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.createSupplier({
      actorUserId,
      code: requiredText(formData, "supplier_code"),
      contactDetails: optionalText(formData, "contact_details"),
      name: requiredText(formData, "supplier_name"),
      organizationId,
    })
  )
  revalidateStore()
}

export async function createStoreItemTypeAction(formData: FormData) {
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.createItemType({
      actorUserId,
      assetCategory: requiredText(formData, "asset_category"),
      assetName: requiredText(formData, "asset_name"),
      assetSubcategory: requiredText(formData, "asset_subcategory"),
      assetType: requiredText(formData, "asset_type"),
      applicableItemCode: optionalText(formData, "applicable_item_code"),
      drawingNumber: optionalText(formData, "drawing_number"),
      identificationName: requiredText(formData, "identification_name"),
      minimumStock: Number(optionalText(formData, "minimum_stock") ?? 0),
      organizationId,
      trackingMode: trackingMode(formData),
      typeCode: requiredText(formData, "type_code"),
      unit: requiredText(formData, "unit"),
    })
  )
  revalidateStore()
}

export async function requestMissingStoreCodeAction(formData: FormData) {
  await withStore(
    "store.requests.write",
    (repository, actorUserId, organizationId) =>
      repository.createCodeRequest({
        actorUserId,
        assetCategory: requiredText(formData, "asset_category"),
        assetName: requiredText(formData, "asset_name"),
        assetSubcategory: requiredText(formData, "asset_subcategory"),
        assetType: requiredText(formData, "asset_type"),
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

export async function createStoreRequisitionAction(formData: FormData) {
  await withStore(
    "store.requests.write",
    (repository, actorUserId, organizationId) =>
      repository.createRequisition({
        actorUserId,
        department: requiredText(formData, "department"),
        itemTypeId: requiredText(formData, "item_type_id"),
        locationId: requiredText(formData, "location_id"),
        organizationId,
        purpose: optionalText(formData, "purpose"),
        quantity: positiveNumber(formData, "quantity"),
        requestedBy: requiredText(formData, "requested_by"),
        requiredOn: optionalText(formData, "required_on"),
      })
  )
  revalidateStore()
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
  const storageRoot = path.resolve(
    process.env.LOCAL_FILE_STORAGE_PATH ??
      path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
  )
  const storageKey = `store/${randomUUID()}-${validated.fileName}`
  const filePath = path.join(storageRoot, ...storageKey.split("/"))
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, bytes, { flag: "wx" })
  return { fileName: validated.fileName, filePath, storageKey }
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
        itemTypeId: requiredText(formData, "item_type_id"),
        locationId: requiredText(formData, "location_id"),
        organizationId,
        quantity: positiveNumber(formData, "quantity"),
        receivedBy: optionalText(formData, "received_by"),
        supplierId: optionalText(formData, "supplier_id"),
        unitPrice: requiredText(formData, "unit_price"),
        warrantyUntil: optionalText(formData, "warranty_until"),
      })
    )
  } catch (error) {
    if (savedFile) await unlink(savedFile.filePath).catch(() => undefined)
    throw error
  }
  revalidateStore()
}

export async function moveStoreAssetAction(formData: FormData) {
  const assetCode = requiredText(formData, "asset_code")
  await withStore("store.manage", (repository, actorUserId, organizationId) =>
    repository.moveAsset({
      actorUserId,
      assetCode,
      holderName: requiredText(formData, "holder_name"),
      holderReference: requiredText(formData, "holder_reference"),
      holderType: holderType(formData),
      movedBy: optionalText(formData, "moved_by"),
      organizationId,
      remark: optionalText(formData, "remark"),
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

"use server"

import { createArtifactService, createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { productionFloors } from "@workspace/db/production-floors"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStoreHref, accountableStorePermission, departmentStoreHref } from "@/lib/auth/department-store-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { getWebPostgresPool } from "@/lib/postgres-runtime"
import { isPastOrTodayIstDate } from "@/lib/date-time"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import { storeIssuedPurchaseOrderPdf } from "@/lib/store/issued-purchase-order-pdf"

export type DepartmentStoreActionState = { error: string | null }

function required(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim()
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`)
  return value
}

function optional(formData: FormData, key: string) {
  return formData.get(key)?.toString().trim() || null
}

function quantity(formData: FormData) {
  const value = Number(required(formData, "quantity"))
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Quantity must be greater than zero.")
  }
  return value
}

function permissionForStore(storeCode: string) {
  return {
    capability: accountableStorePermission(storeCode, "write"),
    path: accountableStoreHref(storeCode),
  }
}

async function withStoreWrite(
  formData: FormData,
  operation: (
    repository: ReturnType<typeof createDepartmentStoreRepository>,
    context: { actorUserId: string; movedBy: string; organizationId: string; storeCode: string }
  ) => Promise<unknown>,
  mainCapability: "store.asset_movement.write" | "store.asset_repair.write" = "store.asset_movement.write",
  mainReturnPath?: "/store/movement" | "/store/stock" | "/store/orders",
  requireMainStockRead = false
): Promise<DepartmentStoreActionState> {
  const storeCode = required(formData, "store_code")
  const { capability, path: storePath } = permissionForStore(storeCode)
  const path = storeCode === "MAIN" && mainReturnPath ? mainReturnPath
    : mainReturnPath === "/store/orders" ? `${storePath}/repairs` : storePath
  const session = storeCode === "MAIN"
    ? await requireStoreAction(mainCapability, path)
    : await requireCapability(capability, path)
  if (storeCode === "MAIN" && requireMainStockRead) {
    await requireCapability("store.stock.read", path)
  }
  const store = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
  let organizationId: string
  try {
    organizationId = await store.organizationIdForCode("MRMPL")
  } finally {
    await store.close()
  }
  const repository = createDepartmentStoreRepository({ pool: getWebPostgresPool() })
  try {
    await operation(repository, {
      actorUserId: session.user.id,
      movedBy: session.user.name?.trim() || session.user.email,
      organizationId,
      storeCode,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The Store operation could not be saved." }
  }
  for (const destination of [
    "/store/stock",
    "/store/movement",
    "/store/orders",
    "/quality-control/store",
    "/quality-control/store/movement",
    "/quality-control/store/repairs",
    ...productionFloors.map(({ code }) => departmentStoreHref(code)),
    ...productionFloors.map(({ code }) => `${departmentStoreHref(code)}/movement`),
    ...productionFloors.map(({ code }) => `${departmentStoreHref(code)}/repairs`),
  ]) revalidatePath(destination)
  redirect(`${path}?saved=1`)
}

export async function transferDepartmentQuantityAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) =>
    repository.transferQuantity({
      ...context,
      sourceStoreCode: context.storeCode,
      destinationStoreCode: required(formData, "destination_store_code"),
      itemTypeId: required(formData, "item_type_id"),
      quantity: quantity(formData),
      remark: optional(formData, "remark"),
    }), "store.asset_movement.write", "/store/movement", true
  )
}

export async function consumeDepartmentQuantityAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) => {
    if (context.storeCode === "MAIN") throw new Error("Consumption must be recorded by the receiving Store.")
    const consumedOn = required(formData, "consumed_on")
    if (!isPastOrTodayIstDate(consumedOn)) {
      throw new Error("Used on must be a valid date and cannot be in the future.")
    }
    const itemTypeIds = formData.getAll("item_type_id")
      .map((value) => value.toString().trim()).filter(Boolean)
    return repository.consumeQuantities({
      ...context,
      items: itemTypeIds.map((itemTypeId) => ({
        itemTypeId,
        quantity: Number(required(formData, `quantity_${itemTypeId}`)),
      })),
      consumedOn,
      remark: optional(formData, "remark"),
    })
  }, "store.asset_movement.write", "/store/movement")
}

export async function adjustDepartmentQuantityAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) => {
    const reason = required(formData, "reason")
    if (reason !== "LOSS" && reason !== "DAMAGE") throw new Error("Choose Loss or Damage.")
    return repository.adjustQuantity({
      ...context,
      itemTypeId: required(formData, "item_type_id"),
      quantity: quantity(formData),
      reason,
      remark: optional(formData, "remark"),
    })
  }, "store.asset_movement.write", "/store/stock", true)
}

export async function transferDepartmentAssetAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) =>
    repository.transferAssetAccountability({
      ...context,
      sourceStoreCode: context.storeCode,
      destinationStoreCode: required(formData, "destination_store_code"),
      assetCode: required(formData, "asset_code"),
      remark: optional(formData, "remark"),
    }), "store.asset_movement.write", "/store/movement", true
  )
}

function movementDestination(formData: FormData) {
  const holderType = required(formData, "holder_type")
  if (!["STORE", "DEPARTMENT", "MACHINE", "VENDOR"].includes(holderType)) {
    throw new Error("Choose a valid destination type.")
  }
  return {
    holderType: holderType as "STORE" | "DEPARTMENT" | "MACHINE" | "VENDOR",
    holderReference: required(formData, "holder_reference"),
    vendorId: optional(formData, "vendor_id"),
  }
}

export async function moveDepartmentAssetAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) =>
    repository.moveAsset({
      ...context,
      assetCode: required(formData, "asset_code"),
      ...movementDestination(formData),
      remark: optional(formData, "remark"),
    }), "store.asset_movement.write", "/store/movement"
  )
}

export async function createQualityGaugeSetAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) => {
    if (context.storeCode !== "QUALITY") throw new Error("Gauge sets are managed by Quality Store.")
    return repository.createGaugeSet({
      actorUserId: context.actorUserId,
      organizationId: context.organizationId,
      storeCode: context.storeCode,
      name: required(formData, "set_name"),
      assetCodes: [required(formData, "first_asset_code"), required(formData, "second_asset_code")],
    })
  }, "store.asset_movement.write", "/store/movement")
}

export async function moveQualityGaugeSetAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) => {
    if (context.storeCode !== "QUALITY") throw new Error("Gauge sets are managed by Quality Store.")
    return repository.moveGaugeSet({
      ...context,
      setId: required(formData, "set_id"),
      ...movementDestination(formData),
      remark: optional(formData, "remark"),
    })
  }, "store.asset_movement.write", "/store/movement")
}

export async function replaceQualityGaugeSetMemberAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) => {
    if (context.storeCode !== "QUALITY") throw new Error("Gauge sets are managed by Quality Store.")
    return repository.replaceGaugeSetMember({
      actorUserId: context.actorUserId,
      organizationId: context.organizationId,
      storeCode: context.storeCode,
      setId: required(formData, "set_id"),
      oldAssetCode: required(formData, "old_asset_code"),
      newAssetCode: required(formData, "new_asset_code"),
    })
  }, "store.asset_movement.write", "/store/movement")
}

export async function disbandQualityGaugeSetAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, (repository, context) => {
    if (context.storeCode !== "QUALITY") throw new Error("Gauge sets are managed by Quality Store.")
    return repository.disbandGaugeSet({
      actorUserId: context.actorUserId,
      organizationId: context.organizationId,
      setId: required(formData, "set_id"),
      storeCode: context.storeCode,
    })
  }, "store.asset_movement.write", "/store/movement")
}

export async function createDepartmentRepairOrderAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, async (departmentRepository, context) => {
    const assetCodes = formData.getAll("asset_code")
      .map((value) => value.toString().trim())
      .filter(Boolean)
    if (!assetCodes.length) throw new Error("Select at least one Unit ID for repair.")
    const accountableStore = await departmentRepository.getStoreByCode(
      context.organizationId, context.storeCode
    )
    const store = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
    const artifacts = createArtifactService({
      connectionString: readAuthEnvironment().connectionString,
      provider: createGoogleCloudArtifactProvider(),
    })
    try {
      return await store.createRepairPurchaseOrdersFromSelection({
        accountableStoreId: accountableStore.id,
        actorUserId: context.actorUserId,
        issuanceId: required(formData, "issuance_id"),
        items: assetCodes.map((assetCode) => ({
          assetCode,
          serviceDescription: required(formData, `service_description_${assetCode}`),
          servicePrice: required(formData, `service_price_${assetCode}`),
          supplierId: required(formData, `supplier_${assetCode}`),
          reassignmentDepartmentId: context.storeCode === "MAIN" &&
            formData.get(`reassignment_requested_${assetCode}`)
            ? required(formData, `reassignment_department_${assetCode}`)
            : null,
        })),
        orderDate: optional(formData, "order_date"),
        organizationId: context.organizationId,
        remark: optional(formData, "remark"),
        storeIssuedPdf: storeIssuedPurchaseOrderPdf(artifacts, context.actorUserId),
      })
    } finally {
      await artifacts.close()
      await store.close()
    }
  }, "store.asset_repair.write", "/store/orders")
}

export async function completeDepartmentRepairOrderAction(
  _state: DepartmentStoreActionState,
  formData: FormData
) {
  return withStoreWrite(formData, async (departmentRepository, context) => {
    const accountableStore = await departmentRepository.getStoreByCode(
      context.organizationId, context.storeCode
    )
    const store = createStoreRepository({ connectionString: readAuthEnvironment().connectionString })
    try {
      return await store.completeRepairPurchaseOrder({
        accountableStoreId: accountableStore.id,
        actorUserId: context.actorUserId,
        assetCode: required(formData, "asset_code"),
        organizationId: context.organizationId,
        purchaseOrderId: required(formData, "purchase_order_id"),
      })
    } finally {
      await store.close()
    }
  }, "store.asset_repair.write", "/store/orders")
}

"use server"

import {
  createArtifactService,
  createDepartmentStoreRepository,
  createStoreRepository,
} from "@workspace/db"
import { revalidatePath } from "next/cache"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { requireStoreAction } from "@/lib/auth/store-action-access"
import { createGoogleCloudArtifactProvider } from "@/lib/google-cloud-artifact-provider"
import { storeIssuedPurchaseOrderPdf } from "@/lib/store/issued-purchase-order-pdf"

function required(data: FormData, key: string) {
  const value = data.get(key)?.toString().trim()
  if (!value) throw new Error(`${key.replaceAll("_", " ")} is required.`)
  return value
}

function optional(data: FormData, key: string) {
  return data.get(key)?.toString().trim() || null
}

async function withAccountableStore<T>(
  data: FormData,
  operation: (input: {
    accountId: string
    actorUserId: string
    organizationId: string
    repository: ReturnType<typeof createStoreRepository>
    storeCode: string
    unitId: string
  }) => Promise<T>
) {
  const storeCode = required(data, "store_code")
  const unitId = required(data, "unit_id")
  const returnPath = `/department-store/calibration/${encodeURIComponent(unitId)}?store=${encodeURIComponent(storeCode)}`
  const session = storeCode === "MAIN"
    ? await requireStoreAction("store.asset_repair.write", returnPath)
    : await requireCapability(accountableStorePermission(storeCode, "write"), returnPath)
  const connectionString = readAuthEnvironment().connectionString
  const repository = createStoreRepository({ connectionString })
  const departments = createDepartmentStoreRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const accountability = await departments.getAssetAccountability(organizationId, unitId)
    if (!accountability || accountability.accountableStoreCode !== storeCode) {
      throw new Error("This Unit ID is not accountable to the selected store.")
    }
    const result = await operation({
      accountId: accountability.accountableStoreId,
      actorUserId: session.user.id,
      organizationId,
      repository,
      storeCode,
      unitId,
    })
    revalidatePath(returnPath)
    revalidatePath("/quality-control/calibration")
    revalidatePath("/iso-document/calibration-plan")
    revalidatePath("/store/orders")
    revalidatePath(`/store/assets/${encodeURIComponent(unitId)}`)
    return result
  } finally {
    await departments.close()
    await repository.close()
  }
}

export async function addCalibrationOfferAction(data: FormData) {
  await withAccountableStore(data, ({ accountId, actorUserId, organizationId, repository }) =>
    repository.addCalibrationOffer({
      accountableStoreId: accountId,
      actorUserId,
      notes: optional(data, "notes"),
      organizationId,
      quoteReference: optional(data, "quote_reference"),
      quotedOn: required(data, "quoted_on"),
      quotedPrice: required(data, "quoted_price"),
      supplierId: required(data, "supplier_id"),
      visitId: required(data, "visit_id"),
    })
  )
}

export async function issueCalibrationServiceOrderAction(data: FormData) {
  await withAccountableStore(data, async ({ accountId, actorUserId, organizationId, repository }) => {
    const visitId = required(data, "visit_id")
    const prepared = await repository.prepareCalibrationDispatch({
      accountableStoreId: accountId,
      actorUserId,
      offerId: required(data, "offer_id"),
      orderDate: required(data, "order_date"),
      organizationId,
      remark: optional(data, "remark"),
      visitId,
    })
    if (!prepared.alreadyIssued) {
      const artifacts = createArtifactService({
        connectionString: readAuthEnvironment().connectionString,
        provider: createGoogleCloudArtifactProvider(),
      })
      try {
        await storeIssuedPurchaseOrderPdf(artifacts, actorUserId)({
          document: prepared.document,
          organizationId,
          purchaseOrderId: prepared.purchaseOrderId,
        })
      } finally {
        await artifacts.close()
      }
    }
    await repository.issueCalibrationServiceOrder({
      accountableStoreId: accountId,
      actorUserId,
      organizationId,
      visitId,
    })
  })
}

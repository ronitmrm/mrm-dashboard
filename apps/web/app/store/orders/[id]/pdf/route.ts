import { createStoreRepository } from "@workspace/db"
import { redirect } from "next/navigation"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { accountableStorePermission } from "@/lib/auth/department-store-capabilities"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"
import { listGrantedStoreActions } from "@/lib/auth/store-action-access"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuthenticatedSession("/store/orders")
  const { id } = await params
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const artifact = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const origin = await repository.getPurchaseOrderOrigin({
      organizationId,
      purchaseOrderId: id,
    })
    if (!origin) return null
    const broad = await listGrantedCapabilities(session.user.id, ["store.purchase_register.read"])
    const scoped = origin.orderType === "REPAIR" && origin.originStoreCode
      ? origin.originStoreCode === "MAIN"
        ? (await listGrantedStoreActions(session.user.id)).has("store.asset_repair.write")
        : (await listGrantedCapabilities(session.user.id, [
            accountableStorePermission(origin.originStoreCode, "read"),
          ])).length > 0
      : false
    if (!broad.length && !scoped) redirect("/unauthorized")
    return repository.getPurchaseOrderPdfArtifact({
      organizationId,
      purchaseOrderId: id,
    })
  })().finally(() => repository.close())
  if (!artifact)
    return new Response("Purchase Order not found.", { status: 404 })
  if (!artifact.available) {
    return new Response("Purchase Order PDF is unavailable.", { status: 410 })
  }
  try {
    return await createArtifactDeliveryResponse(request, artifact, {
      download: new URL(request.url).searchParams.has("download"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Purchase Order PDF could not be loaded. Please try again.",
      unavailable: "Purchase Order PDF is unavailable.",
    })
    if (delivery) return delivery
    throw error
  }
}

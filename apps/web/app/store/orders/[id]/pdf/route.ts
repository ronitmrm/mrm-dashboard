import { createStoreRepository } from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability("store.purchase_register.read", "/store/orders")
  const { id } = await params
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const artifact = await (async () => {
    const organizationId = await repository.organizationIdForCode("MRMPL")
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

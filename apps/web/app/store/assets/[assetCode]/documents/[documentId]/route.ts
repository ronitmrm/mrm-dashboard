import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { requireCapability } from "@/lib/auth/require-capability"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetCode: string; documentId: string }> }
) {
  const { assetCode, documentId } = await params
  await requireCapability(
    "store.asset_history.read",
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const file = await repository.getAssetDocument({
      assetCode,
      documentId,
      organizationId,
    })
    return await createArtifactDeliveryResponse(request, file, {
      download: true,
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Store document could not be loaded. Please try again.",
      unavailable: "Store document is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}

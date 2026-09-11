import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { requireCapability } from "@/lib/auth/require-capability"
import { masterCapability } from "@/lib/auth/master-capabilities"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string; itemTypeId: string }> }
) {
  const { documentId, itemTypeId } = await params
  await requireCapability(masterCapability("ITEM_TYPE", "read"), "/store/items")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const file = await repository.getItemTypeDrawing({
      documentId,
      itemTypeId,
      organizationId,
    })
    return await createArtifactDeliveryResponse(request, file, {
      download: true,
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Asset drawing could not be loaded. Please try again.",
      unavailable: "Asset drawing is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}

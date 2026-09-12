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
  {
    params,
  }: {
    params: Promise<{ documentId: string; supplierPriceId: string }>
  }
) {
  const { documentId, supplierPriceId } = await params
  await requireCapability(
    masterCapability("SUPPLIER_PRICE", "read"),
    "/store/assets"
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const file = await repository.getSupplierPriceQuote({
      documentId,
      organizationId,
      supplierPriceId,
    })
    return await createArtifactDeliveryResponse(request, file, {
      download: true,
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Supplier quote could not be loaded. Please try again.",
      unavailable: "Supplier quote is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}

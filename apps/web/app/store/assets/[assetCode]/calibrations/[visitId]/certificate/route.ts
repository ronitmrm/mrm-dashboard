import { createStoreRepository } from "@workspace/db"

import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetCode: string; visitId: string }> }
) {
  const { assetCode, visitId } = await params
  await requireCapability(
    "store.asset_history.read",
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const certificate = await repository.getCalibrationCertificate({
      organizationId,
      assetCode,
      visitId,
    })
    if (!certificate) {
      return new Response("Calibration certificate not found.", { status: 404 })
    }
    return await createArtifactDeliveryResponse(request, certificate, {
      download: new URL(request.url).searchParams.has("download"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Calibration certificate could not be loaded. Please try again.",
      unavailable: "Calibration certificate is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}

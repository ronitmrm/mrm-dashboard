import { createDepartmentStoreRepository, createStoreRepository } from "@workspace/db"
import { notFound, redirect } from "next/navigation"

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetCode: string; visitId: string }> }
) {
  const { assetCode, visitId } = await params
  const session = await requireAuthenticatedSession(
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const connectionString = readAuthEnvironment().connectionString
  const repository = createStoreRepository({
    connectionString,
  })
  const departmental = createDepartmentStoreRepository({ connectionString })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const accountability = await departmental.getAssetAccountability(organizationId, assetCode)
    if (!accountability) notFound()
    const permissions = [
      "store.asset_history.read",
      "iso.calibration_plan.read",
      "store.stock.read",
      "quality.control.calibration.read",
      accountableStorePermission(accountability.accountableStoreCode, "read"),
    ]
    const granted = await listGrantedCapabilities(session.user.id, permissions)
    if (!granted.length) redirect("/unauthorized")
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
    await departmental.close()
    await repository.close()
  }
}

import { createProductPortfolioRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ revision: string; uid: string }> }
) {
  await requireCapability(
    "pricing.drawing_history.read",
    "/commercial/drawing-history"
  )
  const { revision, uid } = await params
  const repository = createProductPortfolioRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const file = await repository.getDrawingFileForOrganization(
      "MRMPL",
      uid,
      revision
    )
    if (!file)
      return new Response("Drawing revision file not found.", { status: 404 })
    if (
      file.objectLifecycleState !== null &&
      file.objectLifecycleState !== "available"
    ) {
      return new Response("Drawing revision file is unavailable.", {
        status: 410,
      })
    }
    return await createArtifactDeliveryResponse(request, file, {
      download: !new URL(request.url).searchParams.has("preview"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Drawing revision file could not be loaded. Please try again.",
      unavailable: "Drawing revision file is unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await repository.close()
  }
}

import { createArtifactLedgerRepository } from "@workspace/db"

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
  const session = await requireCapability(
    "artifacts.read",
    "/administration/artifacts"
  )
  const { id } = await params
  const repository = createArtifactLedgerRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  const artifact = await (async () => {
    const organizationId = await repository.organizationIdForUser(
      session.user.id
    )
    return repository.getForDelivery({ artifactId: id, organizationId })
  })().finally(() => repository.close())

  if (!artifact) return new Response("Artifact was not found.", { status: 404 })
  if (!artifact.available) {
    return new Response("Artifact is unavailable.", { status: 410 })
  }
  try {
    return await createArtifactDeliveryResponse(request, artifact, {
      download: new URL(request.url).searchParams.has("download"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Artifact could not be loaded. Please try again.",
      unavailable: "Artifact is unavailable.",
    })
    if (delivery) return delivery
    throw error
  }
}

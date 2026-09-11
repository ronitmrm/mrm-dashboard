import { createCommercialCostingRepository } from "@workspace/db"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"
import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await requireCapability(
    "pricing.quotes.read",
    "/commercial/quotes"
  )
  const { id, fileId } = await params
  const query = new URL(request.url).searchParams
  const revision = query.get("revision")
  if (revision !== null && !/^\d+$/.test(revision))
    return new Response("Invalid quote revision.", { status: 400 })
  const repository = createCommercialCostingRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const drawings = await repository.getQuotationDrawings(
      id,
      session.user.id,
      {
        revision: revision === null ? undefined : Number(revision),
        draft: query.get("draft") === "true",
      }
    )
    const drawing = drawings.find((drawing) => drawing.fileId === fileId)
    if (!drawing) return new Response("Drawing was not found.", { status: 404 })
    return await createArtifactDeliveryResponse(request, drawing, {
      download: query.has("download"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Drawing could not be loaded. Please try again.",
      unavailable: "Drawing is unavailable.",
    })
    if (delivery) return delivery
    if (
      error instanceof Error &&
      ["Enquiry was not found.", "Quote revision was not found."].includes(
        error.message
      )
    )
      return new Response("Drawing was not found.", { status: 404 })
    throw error
  } finally {
    await repository.close()
  }
}

import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import {
  artifactDeliveryErrorResponse,
  createArtifactDeliveryResponse,
} from "@/lib/artifact-delivery"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability("pricing.enquiries.read", "/commercial/enquiries")
  const { id } = await params
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const repository = createCommercialWorkflowRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const drawing = await repository.getCurrentDrawing({
      enquiryItemId: id,
      organizationId,
    })
    return await createArtifactDeliveryResponse(request, drawing, {
      download: !new URL(request.url).searchParams.has("preview"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Drawing could not be loaded. Please try again.",
      unavailable: "Drawing is deleted or unavailable.",
    })
    if (delivery) return delivery
    if (
      error instanceof Error &&
      error.message.includes("deleted or unavailable")
    ) {
      return new Response("Drawing is deleted or unavailable.", { status: 410 })
    }
    throw error
  } finally {
    await repository.close()
    await customers.close()
  }
}

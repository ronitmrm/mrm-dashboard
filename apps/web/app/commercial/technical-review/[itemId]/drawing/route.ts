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
  { params }: { params: Promise<{ itemId: string }> }
) {
  await requireCapability(
    "pricing.technical_review.read",
    "/commercial/technical-review"
  )
  const { itemId } = await params
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })

  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const drawing = await workflow.getCurrentDrawing({
      enquiryItemId: itemId,
      organizationId,
    })
    return await createArtifactDeliveryResponse(request, drawing, {
      download: true,
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
    await workflow.close()
    await customers.close()
  }
}

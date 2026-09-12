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
import { parseDesignBomAttachmentPurpose } from "@/lib/commercial-attachment"

const purposes = new Set(["cad", "customer_marked", "internal_drawing"])

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; purpose: string }> }
) {
  await requireCapability("pricing.design.read", "/commercial/design")
  const { id, purpose } = await params
  if (
    !purposes.has(purpose) &&
    !/^customer_drawing_[a-f0-9-]{36}$/.test(purpose) &&
    !parseDesignBomAttachmentPurpose(purpose)
  ) {
    return new Response("Design attachment was not found.", { status: 404 })
  }
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const attachments = await workflow.listAttachments({
      organizationId,
      purpose,
      targetId: id,
      targetTable: "design_tasks",
    })
    const attachment =
      attachments.find((candidate) => candidate.isCurrent) ?? attachments[0]
    if (!attachment) {
      return new Response("Design attachment was not found.", { status: 404 })
    }
    if (
      attachment.lifecycleState === "deleted" ||
      (attachment.objectLifecycleState !== null &&
        attachment.objectLifecycleState !== "available")
    ) {
      return new Response("Design attachment is deleted or unavailable.", {
        status: 410,
      })
    }
    return await createArtifactDeliveryResponse(request, attachment, {
      download: !new URL(request.url).searchParams.has("preview"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "Design attachment could not be loaded. Please try again.",
      unavailable: "Design attachment is deleted or unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await workflow.close()
    await customers.close()
  }
}

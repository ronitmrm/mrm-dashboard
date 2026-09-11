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
  { params }: { params: Promise<{ ecnId: string; purpose: string }> }
) {
  await requireCapability("pricing.revisions.read", "/commercial/ecns")
  const { ecnId, purpose } = await params
  if (purpose !== "drawing_revision") {
    return new Response("ECN attachment was not found.", { status: 404 })
  }
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const attachments = await workflow.listAttachments({
      organizationId,
      purpose,
      targetId: ecnId,
      targetTable: "engineering_change_notes",
    })
    const attachment =
      attachments.find((candidate) => candidate.isCurrent) ?? attachments[0]
    if (!attachment) {
      return new Response("ECN attachment was not found.", { status: 404 })
    }
    if (
      attachment.lifecycleState === "deleted" ||
      (attachment.objectLifecycleState !== null &&
        attachment.objectLifecycleState !== "available")
    ) {
      return new Response("ECN attachment is deleted or unavailable.", {
        status: 410,
      })
    }
    return await createArtifactDeliveryResponse(request, attachment, {
      download: !new URL(request.url).searchParams.has("preview"),
    })
  } catch (error) {
    const delivery = artifactDeliveryErrorResponse(error, {
      failed: "ECN attachment could not be loaded. Please try again.",
      unavailable: "ECN attachment is deleted or unavailable.",
    })
    if (delivery) return delivery
    throw error
  } finally {
    await workflow.close()
    await customers.close()
  }
}

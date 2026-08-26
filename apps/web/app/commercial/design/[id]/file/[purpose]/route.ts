import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

const purposes = new Set(["cad", "customer_marked", "internal_drawing"])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; purpose: string }> }
) {
  await requireCapability("pricing.design.read", "/commercial/design")
  const { id, purpose } = await params
  if (!purposes.has(purpose)) {
    return new Response("Design attachment was not found.", { status: 404 })
  }
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const attachments = await workflow.listAttachments({
      organizationId,
      purpose: purpose as "cad" | "customer_marked" | "internal_drawing",
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
    if (attachment.publicUrl) {
      return Response.redirect(attachment.publicUrl, 307)
    }
    const file = await readUserAttachment(attachment.storageKey)
    return new Response(file.body, {
      headers: userAttachmentDownloadHeaders(
        attachment.fileName,
        file.byteSize
      ),
    })
  } finally {
    await workflow.close()
    await customers.close()
  }
}

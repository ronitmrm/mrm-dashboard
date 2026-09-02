import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentResponseHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

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
    if (attachment.publicUrl) return Response.redirect(attachment.publicUrl, 307)
    const file = await readUserAttachment(attachment.storageKey)
    return new Response(file.body, {
      headers: userAttachmentResponseHeaders(
        attachment.fileName,
        file.byteSize,
        attachment.mediaType,
        new URL(request.url).searchParams.has("preview")
      ),
    })
  } finally {
    await workflow.close()
    await customers.close()
  }
}

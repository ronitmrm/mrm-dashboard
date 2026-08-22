import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  _request: Request,
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
    if (drawing.publicUrl) {
      return Response.redirect(drawing.publicUrl, 307)
    }
    const file = await readUserAttachment(drawing.storageKey)
    return new Response(file.body, {
      headers: userAttachmentDownloadHeaders(drawing.fileName, file.byteSize),
    })
  } catch (error) {
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

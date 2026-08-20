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
    const file = await readUserAttachment(drawing.storageKey)
    return new Response(file.body, {
      headers: userAttachmentDownloadHeaders(drawing.fileName, file.byteSize),
    })
  } finally {
    await workflow.close()
    await customers.close()
  }
}

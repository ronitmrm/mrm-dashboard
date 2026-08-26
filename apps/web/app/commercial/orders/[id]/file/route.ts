import { createCommercialOrdersRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireCapability(
    commercialCapabilities.purchaseOrders.read,
    "/commercial/orders"
  )
  const { id } = await params
  const repository = createCommercialOrdersRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const file = await repository.getPurchaseOrderFile(id)
    if (file.publicUrl) {
      return Response.redirect(file.publicUrl, 307)
    }
    if (!file.storageKey) {
      throw new Error("Purchase-order source file is unavailable.")
    }
    const attachment = await readUserAttachment(file.storageKey)
    return new Response(attachment.body, {
      headers: userAttachmentDownloadHeaders(
        file.fileName,
        attachment.byteSize
      ),
    })
  } finally {
    await repository.close()
  }
}

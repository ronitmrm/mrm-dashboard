import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ documentId: string; supplierPriceId: string }>
  }
) {
  const { documentId, supplierPriceId } = await params
  await requireCapability("store.masters.read", "/store/assets")
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const file = await repository.getSupplierPriceQuote({
      documentId,
      organizationId,
      supplierPriceId,
    })
    if (file.publicUrl) return Response.redirect(file.publicUrl, 307)
    if (!file.storageKey) throw new Error("Supplier quote is unavailable.")
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

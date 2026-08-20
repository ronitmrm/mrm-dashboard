import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"
import { readUserAttachment } from "@/lib/user-attachment-storage"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetCode: string; documentId: string }> }
) {
  const { assetCode, documentId } = await params
  await requireCapability(
    "store.asset_history.read",
    `/store/assets/${encodeURIComponent(assetCode)}`
  )
  const repository = createStoreRepository({
    connectionString: readAuthEnvironment().connectionString,
  })
  try {
    const organizationId = await repository.organizationIdForCode("MRMPL")
    const file = await repository.getAssetDocument({
      assetCode,
      documentId,
      organizationId,
    })
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

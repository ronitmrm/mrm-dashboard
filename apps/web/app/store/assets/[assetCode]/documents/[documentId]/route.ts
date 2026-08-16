import { readFile } from "node:fs/promises"
import path from "node:path"

import { createStoreRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetCode: string; documentId: string }> }
) {
  const { assetCode, documentId } = await params
  await requireCapability(
    "store.read",
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
    const storageRoot = path.resolve(
      process.env.LOCAL_FILE_STORAGE_PATH ??
        path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
    )
    const filePath = path.resolve(
      /*turbopackIgnore: true*/ storageRoot,
      ...file.storageKey.split("/")
    )
    if (!filePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error("Store document storage key is invalid.")
    }
    const bytes = await readFile(filePath)
    return new Response(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      {
        headers: userAttachmentDownloadHeaders(file.fileName, bytes.byteLength),
      }
    )
  } finally {
    await repository.close()
  }
}

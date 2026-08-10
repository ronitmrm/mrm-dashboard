import { readFile } from "node:fs/promises"
import path from "node:path"

import { createCommercialOrdersRepository } from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { commercialCapabilities } from "@/lib/auth/commercial-capabilities"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"

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
    const storageRoot = path.resolve(
      process.env.LOCAL_FILE_STORAGE_PATH ??
        path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
    )
    const filePath = path.resolve(storageRoot, ...file.storageKey.split("/"))
    if (!filePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error("PO storage key is invalid.")
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

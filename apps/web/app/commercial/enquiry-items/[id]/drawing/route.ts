import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"
import { userAttachmentDownloadHeaders } from "@/lib/user-attachment-security"

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
    const storageRoot = path.resolve(
      process.env.LOCAL_FILE_STORAGE_PATH ??
        path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
    )
    const filePath = path.resolve(storageRoot, ...drawing.storageKey.split("/"))
    if (!filePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error("Drawing storage key is invalid.")
    }
    const bytes = await readFile(filePath)
    return new Response(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      {
        headers: userAttachmentDownloadHeaders(
          drawing.fileName,
          bytes.byteLength
        ),
      }
    )
  } finally {
    await repository.close()
    await customers.close()
  }
}

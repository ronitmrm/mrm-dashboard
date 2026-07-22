import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

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
    const safeName = drawing.fileName.replace(/[\r\n"]/g, "_")
    return new Response(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Disposition": `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
          "Content-Length": String(bytes.byteLength),
          "Content-Type": drawing.mediaType ?? "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } finally {
    await repository.close()
    await customers.close()
  }
}

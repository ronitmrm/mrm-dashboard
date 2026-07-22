import { readFile } from "node:fs/promises"
import path from "node:path"

import {
  createCommercialWorkflowRepository,
  createCustomerRepository,
} from "@workspace/db"

import { readAuthEnvironment } from "@/lib/auth/auth"
import { requireCapability } from "@/lib/auth/require-capability"

const purposes = new Set(["cad", "customer_marked", "internal_drawing"])

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; purpose: string }> }
) {
  await requireCapability("pricing.design.read", "/commercial/design")
  const { id, purpose } = await params
  if (!purposes.has(purpose)) {
    return new Response("Design attachment was not found.", { status: 404 })
  }
  const connectionString = readAuthEnvironment().connectionString
  const customers = createCustomerRepository({ connectionString })
  const workflow = createCommercialWorkflowRepository({ connectionString })
  try {
    const organizationId = await customers.organizationIdForCode("MRMPL")
    const attachment = (
      await workflow.listAttachments({
        organizationId,
        purpose: purpose as "cad" | "customer_marked" | "internal_drawing",
        targetId: id,
        targetTable: "design_tasks",
      })
    )[0]
    if (!attachment) {
      return new Response("Design attachment was not found.", { status: 404 })
    }
    const storageRoot = path.resolve(
      process.env.LOCAL_FILE_STORAGE_PATH ??
        path.join(/*turbopackIgnore: true*/ process.cwd(), "local-data")
    )
    const filePath = path.resolve(
      storageRoot,
      ...attachment.storageKey.split("/")
    )
    if (!filePath.startsWith(storageRoot + path.sep)) {
      throw new Error("Design attachment storage key is invalid.")
    }
    const bytes = await readFile(filePath)
    const safeName = attachment.fileName.replace(/[\r\n"]/g, "_")
    return new Response(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer,
      {
        headers: {
          "Content-Disposition":
            'inline; filename="' +
            safeName +
            "\"; filename*=UTF-8''" +
            encodeURIComponent(safeName),
          "Content-Length": String(bytes.byteLength),
          "Content-Type": attachment.mediaType ?? "application/octet-stream",
          "X-Content-Type-Options": "nosniff",
        },
      }
    )
  } finally {
    await workflow.close()
    await customers.close()
  }
}

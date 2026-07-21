import { requireCapability } from "@/lib/auth/require-capability"

import { buildMastersWorkbook, masterTemplateFilename } from "../workbook"
import * as XLSX from "xlsx"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await requireCapability("pricing.masters.read", "/commercial/masters")
  const selectedKey =
    new URL(request.url).searchParams.get("master")?.trim() || undefined
  const workbook = buildMastersWorkbook(undefined, selectedKey)
  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer

  return new Response(
    output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength
    ) as ArrayBuffer,
    {
      headers: {
        "Content-Disposition": `attachment; filename="${masterTemplateFilename(
          selectedKey
        )}"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    }
  )
}

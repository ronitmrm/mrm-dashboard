import { requireCapability } from "@/lib/auth/require-capability"
import { commercialTemplateReadCapabilities } from "@/lib/auth/commercial-master-access"

import { buildMastersWorkbook, masterTemplateFilename } from "../workbook"
import * as XLSX from "xlsx"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const selectedKey = searchParams.get("master")?.trim() || undefined
  const selectedTermType = searchParams.get("termType")?.trim()
  for (const capability of commercialTemplateReadCapabilities(selectedKey, selectedTermType)) {
    await requireCapability(capability, "/commercial/masters")
  }
  const workbook = buildMastersWorkbook(undefined, selectedKey)
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (selectedKey === "commercials" && selectedTermType && sheet) {
    XLSX.utils.sheet_add_aoa(sheet, [[selectedTermType]], { origin: "B2" })
  }
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

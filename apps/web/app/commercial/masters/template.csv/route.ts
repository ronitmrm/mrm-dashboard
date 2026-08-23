import { commercialTermTypes, type CommercialTermType } from "@workspace/db"
import * as XLSX from "xlsx"

import { requireCapability } from "@/lib/auth/require-capability"

import { buildMastersWorkbook, masterTemplateFilename } from "../workbook"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  await requireCapability("pricing.masters.read", "/commercial/masters")
  const searchParams = new URL(request.url).searchParams
  const selectedKey = searchParams.get("master")?.trim() || undefined
  const selectedTermType = searchParams.get("termType")?.trim()
  const workbook = buildMastersWorkbook(undefined, selectedKey)
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (
    selectedKey === "commercials" &&
    sheet &&
    commercialTermTypes.includes(selectedTermType as CommercialTermType)
  ) {
    XLSX.utils.sheet_add_aoa(sheet, [[selectedTermType]], { origin: "B2" })
  }
  const csv = sheet ? XLSX.utils.sheet_to_csv(sheet) : ""
  const fileName = masterTemplateFilename(selectedKey).replace(
    /\.xlsx$/,
    ".csv"
  )

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}

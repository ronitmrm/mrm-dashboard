import * as XLSX from "xlsx"

export type MasterCsvRow = Record<string, string>

function columnKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase()
}

export async function readMasterCsv(
  file: FormDataEntryValue | null,
  fieldLabel = "Master CSV"
): Promise<MasterCsvRow[]> {
  if (!(file instanceof File) || file.size === 0) {
    throw new Error(`${fieldLabel} is required.`)
  }
  if (!/\.csv$/i.test(file.name)) {
    throw new Error("Only CSV files are accepted.")
  }
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
    raw: false,
    type: "buffer",
  })
  const sheetName = workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error("The CSV file has no readable rows.")
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  })
  if (!rawRows.length) throw new Error("The CSV file has no data rows.")
  return rawRows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        columnKey(key),
        String(value ?? "").trim(),
      ])
    )
  )
}

export function csvValue(row: MasterCsvRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[columnKey(key)]
    if (value) return value
  }
  return ""
}

export function masterCsvResponse(
  rows: Array<Record<string, unknown>>,
  fileName: string
) {
  const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  })
}

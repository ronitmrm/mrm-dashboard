type CsvValue = string | number | null | undefined

function csvCell(value: CsvValue) {
  const raw = String(value ?? "")
  const safe =
    typeof value === "string" && /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw
  return '"' + safe.replaceAll('"', '""') + '"'
}

export function cncDashboardCsv(
  rows: ReadonlyArray<ReadonlyArray<CsvValue>>,
  filename: string
) {
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    }
  )
}

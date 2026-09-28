import type { MasterCsvRow } from "./master-data-csv"

export const qualityRejectionCsvColumns = [
  "entry_id", "job_card", "date", "stage", "rejection_type", "defect",
  "reason", "rejected_pieces", "rejected_kg",
] as const

export function qualityRejectionCsvRows(rows: {
  id: string
  jobCard: string
  date: string
  stage: string
  type: string
  defect: string
  reason: string
  pieces: number
  kg: string
}[]) {
  return rows.map((row) => ({
    entry_id: row.id,
    job_card: row.jobCard,
    date: row.date,
    stage: row.stage,
    rejection_type: row.type,
    defect: row.defect,
    reason: row.reason,
    rejected_pieces: row.pieces,
    rejected_kg: row.kg,
  }))
}

export function parseQualityRejectionCsv(rows: MasterCsvRow[]) {
  const seen = new Set<string>()
  return rows.map((row, index) => {
    const line = index + 2
    for (const column of qualityRejectionCsvColumns) {
      if (!row[column]) throw new Error(`CSV row ${line}: ${column.replaceAll("_", " ")} is required.`)
    }
    const id = row.entry_id!
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new Error(`CSV row ${line}: Entry ID is invalid.`)
    if (seen.has(id.toLowerCase()))
      throw new Error(`CSV row ${line}: Entry ID is repeated.`)
    seen.add(id.toLowerCase())
    return {
      id,
      jobCard: row.job_card!,
      date: row.date!,
      stage: row.stage!,
      type: row.rejection_type!,
      defect: row.defect!,
      reason: row.reason!,
      pieces: Number(row.rejected_pieces),
      kg: Number(row.rejected_kg),
    }
  })
}

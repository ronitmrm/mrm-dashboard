import type { MasterDocumentRow } from "@workspace/db"
import {
  dataFrequencyLabels,
  documentRevisionLabel,
  documentTypeLabels,
} from "@workspace/db/document-control-domain"
import * as XLSX from "xlsx"

export function buildMasterDocumentWorkbook(rows: MasterDocumentRow[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      "Document Number": row.number ?? "",
      "Document Name": row.title,
      "Document Type": documentTypeLabels[row.documentType],
      Department: row.department,
      "Responsible Role": row.responsibleRole,
      "Record Location":
        row.recordLocations.map(({ label }) => label).join(", ") || "None",
      "Current Revision":
        row.revision === null ? "" : documentRevisionLabel(row.revision),
      "Last Revision Date": row.revisionDate?.slice(0, 10) ?? "",
      "Document Review Cycle": row.reviewCycleMonths
        ? `${row.reviewCycleMonths} months`
        : "Not applicable",
      "Data / Record Frequency": `${dataFrequencyLabels[row.dataFrequencyType]}${
        row.dataFrequencyIntervalDays
          ? ` · every ${row.dataFrequencyIntervalDays} days`
          : row.dataFrequencyDetail
            ? ` · ${row.dataFrequencyDetail}`
            : ""
      }`,
      "Data Retention": row.dataRetention,
      Status: row.useStatus === "in-use" ? "In Use" : "Not In Use",
    }))
  )
  sheet["!cols"] = [
    { wch: 18 },
    { wch: 42 },
    { wch: 28 },
    { wch: 20 },
    { wch: 24 },
    { wch: 36 },
    { wch: 16 },
    { wch: 18 },
    { wch: 24 },
    { wch: 32 },
    { wch: 20 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, "Master Document List")
  return workbook
}

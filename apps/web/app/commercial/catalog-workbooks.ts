import type { DrawingHistoryRow, WebsiteProductRow } from "@workspace/db"
import * as XLSX from "xlsx"

import {
  websiteProductFields,
  websiteProductValue,
} from "./website-products/fields"

export const drawingHistoryFilename = "drawing-history.xlsx"
export const websiteProductFilename = "website-product-data.xlsx"

function displayDate(value: string | null) {
  const text = String(value ?? "").trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text
}

export function buildDrawingHistoryWorkbook(rows: DrawingHistoryRow[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      "Drawing No.": row.drawingNumber,
      "Part Name": row.itemDescription,
      "Rev Date": displayDate(row.revisionDate),
      "Revision No.": row.revision,
      Remarks: row.remarks ?? "",
      "Sr. No.": row.rowNumber,
      UID: row.uid,
    })),
    {
      header: [
        "Sr. No.",
        "Part Name",
        "UID",
        "Drawing No.",
        "Revision No.",
        "Rev Date",
        "Remarks",
      ],
    }
  )
  sheet["!cols"] = [
    { wch: 8 },
    { wch: 42 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, "Drawing History")
  return workbook
}

export function buildWebsiteProductWorkbook(rows: WebsiteProductRow[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    websiteProductFields.map((field) => field.header),
    ...rows.map((row) =>
      websiteProductFields.map((field) => websiteProductValue(row, field.key))
    ),
  ])
  sheet["!cols"] = websiteProductFields.map((field) => ({
    wch: Math.max(16, field.label.length + 4),
  }))
  XLSX.utils.book_append_sheet(workbook, sheet, "Website Product Data")
  return workbook
}

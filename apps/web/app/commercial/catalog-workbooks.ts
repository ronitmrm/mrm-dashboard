import type { DrawingHistoryRow, WebsiteProductRow } from "@workspace/db"
import * as XLSX from "xlsx"

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

const websiteHeaders = [
  "UID",
  "partCode",
  "Product Description",
  "category",
  "subCategory",
  "size",
  "Grade",
  "material",
  "MATERIAL CONSTRUCTION",
  "finishPlating",
  "DRAWING CATEGORY",
  "dimensions",
  "THREAD SIZE 1",
  "THREAD SIZE 2",
  "THREAD SIZE 3",
  "THREAD SIZE 4",
  "threadStandard",
  "connections",
  "Pressure",
  "temperature",
  "sealant",
  "Final Assemblies Code",
  "description",
  "applications",
  "certifications",
  "additiolNotes",
  "Assembly 1 UID",
  "Assembly 1 Code",
  "Assembly 2 UID",
  "Assembly 2 Code",
  "Assembly 3 UID",
  "Assembly 3 Code",
  "Assembly 4 UID",
  "Assembly 4 Code",
  "Assembly 5 UID",
  "Assembly 5 Code",
  "Assembly 6 UID",
  "Assembly 6 Code",
  "Remark",
  "Website Active",
  "createdAt",
] as const

export function buildWebsiteProductWorkbook(rows: WebsiteProductRow[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    [...websiteHeaders],
    ...rows.map((row) => [
      row.uid,
      row.partCode,
      row.productDescription,
      row.category ?? "",
      row.subCategory ?? "",
      row.size ?? "",
      row.grade,
      row.material,
      row.materialConstruction ?? "",
      row.finishPlating ?? "",
      row.drawingCategory ?? "",
      row.dimensions ?? "",
      row.threadSize1 ?? "",
      row.threadSize2 ?? "",
      row.threadSize3 ?? "",
      row.threadSize4 ?? "",
      row.threadStandard ?? "",
      row.connections ?? "",
      row.pressure ?? "",
      row.temperature,
      row.sealant ?? "",
      row.finalAssembliesCode ?? "",
      row.description ?? "",
      row.applications,
      row.certifications ?? "",
      row.additionalNotes ?? "",
      row.assemblyUid1 ?? "",
      row.assemblyCode1 ?? "",
      row.assemblyUid2 ?? "",
      row.assemblyCode2 ?? "",
      row.assemblyUid3 ?? "",
      row.assemblyCode3 ?? "",
      row.assemblyUid4 ?? "",
      row.assemblyCode4 ?? "",
      row.assemblyUid5 ?? "",
      row.assemblyCode5 ?? "",
      row.assemblyUid6 ?? "",
      row.assemblyCode6 ?? "",
      row.remark ?? "",
      row.isActive ? "TRUE" : "FALSE",
      row.entryCreatedAt,
    ]),
  ])
  sheet["!cols"] = [
    10, 18, 42, 22, 28, 14, 16, 16, 22, 16, 28, 42, 18, 24, 24, 24, 32, 22, 20,
    26, 16, 24, 52, 36, 28, 52, 16, 18, 16, 18, 16, 18, 16, 18, 16, 18, 16, 18,
    14, 10, 12,
  ].map((wch) => ({ wch }))
  XLSX.utils.book_append_sheet(workbook, sheet, "Website Product Data")
  return workbook
}

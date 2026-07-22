import * as XLSX from "xlsx"

const headers = [
  "part",
  "description",
  "quantity",
  "target_price",
  "grade",
  "drawing_reference",
  "remarks",
] as const

const templateHeaders = [
  "part",
  "description",
  "grade",
  "quantity",
  "target_price",
  "customer_drawing_reference",
  "remarks",
] as const

type CanonicalHeader = (typeof headers)[number]

const aliases: Record<CanonicalHeader, string[]> = {
  description: ["description", "item description", "part description"],
  drawing_reference: [
    "drawing reference",
    "drawing_reference",
    "customer drawing reference",
    "customer_drawing_reference",
  ],
  grade: ["grade", "material grade", "material"],
  part: ["part", "customer part", "customer part code", "customer_part_code"],
  quantity: ["quantity", "qty"],
  remarks: ["remarks", "notes"],
  target_price: ["target price", "target_price", "price"],
}

function normalizedKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function canonicalHeader(value: string) {
  const normalized = normalizedKey(value)
  return headers.find((header) =>
    aliases[header].some((alias) => normalizedKey(alias) === normalized)
  )
}

function firstSheetRows(buffer: Buffer, fileName: string) {
  const normalizedName = fileName.toLowerCase()
  if (
    !normalizedName.endsWith(".csv") &&
    !normalizedName.endsWith(".xls") &&
    !normalizedName.endsWith(".xlsx")
  ) {
    throw new Error("Please upload a CSV, XLS, or XLSX file.")
  }
  const workbook = XLSX.read(buffer, {
    raw: false,
    type: "buffer",
  })
  const firstSheetName = workbook.SheetNames[0]
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined
  if (!sheet) return [] as unknown[][]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    blankrows: true,
    defval: "",
    header: 1,
    raw: false,
  })
}

export function parseEnquiryImportFile(buffer: Buffer, fileName: string) {
  const rows = firstSheetRows(buffer, fileName)
  if (rows.length < 2) return []
  const inputHeaders = rows[0]!.map((value) =>
    canonicalHeader(String(value ?? "").trim())
  )
  return rows
    .slice(1)
    .map((values, index) => {
      const rawValues = Object.fromEntries(
        headers.map((header) => {
          const sourceIndex = inputHeaders.indexOf(header)
          return [
            header,
            sourceIndex < 0 ? "" : String(values[sourceIndex] ?? "").trim(),
          ]
        })
      ) as Record<CanonicalHeader, string>
      return {
        rawValues,
        rowNumber: index + 2,
        status: "Unclassified",
      }
    })
    .filter((row) =>
      Object.values(row.rawValues).some((value) => value.length > 0)
    )
}

const registerAliases = {
  buyerName: ["Buyer Name", "Buyer", "Contact"],
  customerName: ["Customer", "Customer Name", "Company", "Company Name"],
  customerUid: ["Customer UID", "Customer Code", "Customer ID"],
  enquiryNumber: ["ENQ No.", "ENQ No", "ENQ", "Enquiry Number"],
  priority: ["Priority"],
  remarks: ["Remarks", "Notes"],
  source: ["Source"],
} as const

export function parseEnquiryRegisterFile(buffer: Buffer, fileName: string) {
  const rows = firstSheetRows(buffer, fileName)
  if (rows.length < 2) return []
  const inputHeaders = rows[0]!.map((value) =>
    normalizedKey(String(value ?? ""))
  )
  const valueFor = (values: unknown[], aliases: readonly string[]) => {
    const index = inputHeaders.findIndex((header) =>
      aliases.some((alias) => normalizedKey(alias) === header)
    )
    return index < 0 ? "" : String(values[index] ?? "").trim()
  }
  return rows
    .slice(1)
    .map((values, index) => ({
      buyerName: valueFor(values, registerAliases.buyerName),
      customerName: valueFor(values, registerAliases.customerName),
      customerUid: valueFor(values, registerAliases.customerUid),
      enquiryNumber: valueFor(values, registerAliases.enquiryNumber),
      priority: valueFor(values, registerAliases.priority),
      remarks: valueFor(values, registerAliases.remarks),
      rowNumber: index + 2,
      source: valueFor(values, registerAliases.source),
    }))
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== "rowNumber" && String(value).length > 0
      )
    )
}

export function buildEnquiryLinesTemplate() {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([
    [...templateHeaders],
    templateHeaders.map(() => ""),
  ])
  sheet["!cols"] = [
    { wch: 24 },
    { wch: 48 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 28 },
    { wch: 40 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, "Enquiry Lines")
  return workbook
}

export function enquiryLinesTemplateFilename() {
  return "enquiry-line-items-template.csv"
}

type EnquiryRegisterExportRow = {
  buyerName: string | null
  canDelete: boolean
  canEdit: boolean
  companyName: string
  customerUid: string
  dueFollowupCount: number
  enquiryNumber: string
  id: string
  itemCount: number
  latestQuoteSentAt: Date | null
  nextFollowupDue: string | null
  notFeasibleLineCount: number
  orderedLineCount: number
  pendingLineCount: number
  priority: string
  quoteSentCount: number
  quotedLineCount: number
  receivedOn: string
  remarks: string | null
  source: string
  technicalHandoverAt: Date | null
}

export function buildEnquiryRegisterExport(rows: EnquiryRegisterExportRow[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Type: "Customer Enquiry",
      Reference: row.enquiryNumber,
      Received: row.receivedOn,
      "Customer UID": row.customerUid,
      Customer: row.companyName,
      Source: row.source,
      Priority: row.priority,
      "Buyer Name": row.buyerName ?? "",
      Remarks: row.remarks ?? "",
      Lines: row.itemCount,
      "Quoted Lines": row.quotedLineCount,
      "Ordered Lines": row.orderedLineCount,
      "Pending Lines": row.pendingLineCount,
      "Not Feasible Lines": row.notFeasibleLineCount,
      "Handover At": row.technicalHandoverAt?.toISOString() ?? "",
      "Quote Items Sent": row.quoteSentCount,
      "PDF Sent At": row.latestQuoteSentAt?.toISOString() ?? "",
      "Quote PDF Link":
        row.quoteSentCount > 0
          ? `/commercial/quotes/enquiry/${row.id}/pdf`
          : "",
      "Next Follow-up": row.nextFollowupDue ?? "",
      "Due Follow-ups": row.dueFollowupCount,
      "Can Edit": row.canEdit ? "Yes" : "No",
      "Can Delete": row.canDelete ? "Yes" : "No",
    }))
  )
  XLSX.utils.book_append_sheet(workbook, sheet, "Sales Work Register")
  return workbook
}

export function enquiryRegisterExportFilename() {
  return "sales-work-register.xlsx"
}

export function buildEnquiryRegisterTemplate() {
  const workbook = XLSX.utils.book_new()
  const register = XLSX.utils.aoa_to_sheet([
    [
      "ENQ No.",
      "Customer UID",
      "Customer",
      "Source",
      "Priority",
      "Buyer Name",
      "Remarks",
    ],
    ["", "", "", "Email", "Normal", "", ""],
  ])
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Field", "Rule"],
    ["ENQ No.", "Leave blank to create; provide an existing number to update."],
    [
      "Customer",
      "Customer UID is preferred; otherwise use an exact unique name.",
    ],
  ])
  XLSX.utils.book_append_sheet(workbook, register, "Enquiry Register")
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions")
  return workbook
}

export function enquiryRegisterTemplateFilename() {
  return "enquiry-register-import-template.xlsx"
}

type EnquiryLinesExportHeader = {
  companyName: string
  customerUid: string
  enquiryNumber: string
}

type EnquiryLinesExportRow = {
  customerPartCode: string | null
  description: string
  drawingFileName: string | null
  drawingReference: string | null
  grade: string | null
  lineNumber: number
  quantity: number
  remarks: string | null
  targetPrice: number | null
}

export function buildEnquiryLinesExport(
  enquiry: EnquiryLinesExportHeader,
  rows: EnquiryLinesExportRow[]
) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      "ENQ No.": enquiry.enquiryNumber,
      "Customer UID": enquiry.customerUid,
      Customer: enquiry.companyName,
      "Line No": row.lineNumber,
      Part: row.customerPartCode ?? "",
      Description: row.description,
      Grade: row.grade ?? "",
      Quantity: row.quantity,
      Target: row.targetPrice ?? "",
      "Customer Drawing Reference": row.drawingReference ?? "",
      "Customer Drawing File": row.drawingFileName ?? "",
      Remarks: row.remarks ?? "",
    }))
  )
  XLSX.utils.book_append_sheet(workbook, sheet, "Logged Lines")
  return workbook
}

export function enquiryLinesExportFilename(enquiryNumber: string) {
  return `${enquiryNumber}-logged-lines.xlsx`
}

import * as XLSX from "xlsx"
import { parseProductionOpeningBatch } from "@workspace/db"

type Row = Record<string, string | number>
const headers = {
  "1 Work Orders": ["Work Order No.", "Job Card No.", "Part No.", "Order Qty (pcs)", "Due Date"],
  "2 Running Setups": ["Machine No.", "Job Card No.", "Part No.", "Route / Option", "Setup No."],
  "3 Running Production": ["Machine No.", "Job Card No.", "Part No.", "Route / Option", "Setup No.", "Good Qty (pcs)", "Rejected Qty (pcs)"],
  "4 Completed Setups": ["Job Card No.", "Part No.", "Route / Option", "Setup No.", "Good Qty (pcs)", "Rejected Qty (pcs)"],
  "5 Raw Material": ["Job Card No.", "Part No.", "RM PO No.", "RM Received Date", "Total Received (kg)", "Unused Available (kg)"],
  "6 Cutoff": ["Cutoff Date", "Cutoff Time (IST)"],
} as const

function required(row: Row, field: string) {
  const value = String(row[field] ?? "").trim()
  if (!value) throw new Error(`${field} is required on every populated row.`)
  return value
}
function quantity(row: Row, field: string) {
  const value = Number(required(row, field))
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a nonnegative number.`)
  return value
}
function calendarDate(value: string | number | undefined) {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value)
    if (!date) throw new Error("Invalid Excel date.")
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const date = new Date(`${value.trim()}T00:00:00Z`)
    if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value.trim()) return value.trim()
  }
  throw new Error("Dates must be Excel dates or YYYY-MM-DD text.")
}
function key(row: Row, fields: string[]) { return JSON.stringify(fields.map((field) => required(row, field).toLowerCase())) }

/** Reads the six-sheet startup template. Never writes to PostgreSQL. */
export function prepareCncOpeningWorkbook(bytes: Buffer) {
  const book = XLSX.read(bytes, { type: "buffer", cellDates: false })
  if (book.Workbook?.WBProps?.date1904) throw new Error("Use the template's standard Excel date system.")
  const sheets = Object.fromEntries(Object.entries(headers).map(([name, columns]) => {
    const sheet = book.Sheets[name]
    if (!sheet) throw new Error(`Missing sheet: ${name}`)
    const rows: Row[] = []
    for (const [column, field] of columns.entries()) {
      if (sheet[XLSX.utils.encode_cell({ r: 2, c: column })]?.v !== field) throw new Error(`Unexpected heading in ${name}: ${field}`)
    }
    const lastRow = name === "6 Cutoff" ? 4 : XLSX.utils.decode_range(sheet["!ref"] ?? "A1").e.r
    for (let r = 3; r <= lastRow; r++) {
      const row: Row = {}
      for (const [c, field] of columns.entries()) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })]
        if (cell?.f) throw new Error(`Replace formulas with verified values: ${name}, row ${r + 1}.`)
        const value: unknown = cell?.v
        if (typeof value === "number" || typeof value === "string") {
          row[field] = typeof value === "number" && ["Work Order No.", "Job Card No.", "Part No.", "Route / Option", "Machine No.", "RM PO No."].includes(field)
            ? cell?.w ?? String(value) : value
        }
      }
      if (Object.values(row).some((value) => String(value).trim())) rows.push(row)
    }
    return [name, rows]
  }))
  const cutoff = sheets["6 Cutoff"]!
  if (cutoff.length !== 1) throw new Error("Enter exactly one cutoff date and time.")
  const timeValue = cutoff[0]!["Cutoff Time (IST)"]
  const seconds = typeof timeValue === "number" ? Math.round(timeValue * 86400) : null
  const time = seconds === null ? String(timeValue ?? "").trim() : `${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) throw new Error("Cutoff time must be HH:mm or HH:mm:ss (IST).")
  const workOrders = sheets["1 Work Orders"]!
  const jobs = new Map<string, Row>()
  for (const row of workOrders) {
    required(row, "Work Order No.")
    required(row, "Part No.")
    const job = required(row, "Job Card No.").toLowerCase()
    if (jobs.has(job)) throw new Error(`Duplicate work order job card: ${job}`)
    if (!Number.isSafeInteger(quantity(row, "Order Qty (pcs)")) || quantity(row, "Order Qty (pcs)") === 0) throw new Error("Order quantity must be positive whole pieces.")
    row["Due Date"] = calendarDate(row["Due Date"])
    jobs.set(job, row)
  }
  const checkJob = (row: Row) => {
    const order = jobs.get(required(row, "Job Card No.").toLowerCase())
    if (!order || required(order, "Part No.").toLowerCase() !== required(row, "Part No.").toLowerCase()) throw new Error("Job Card / Part must match Work Orders.")
  }
  const fields = ["Job Card No.", "Part No.", "Route / Option", "Setup No.", "Machine No."]
  const production = new Map<string, Row>()
  for (const row of sheets["3 Running Production"]!) {
    const identity = key(row, fields)
    if (production.has(identity)) throw new Error("Duplicate Running Production row.")
    production.set(identity, row)
  }
  const opening = (row: Row, status: "running" | "completed") => {
    checkJob(row)
    return { jobCardNumber: required(row, "Job Card No."), partCode: required(row, "Part No."), optionNumber: required(row, "Route / Option"),
      setupNumber: quantity(row, "Setup No."), machineNumber: status === "running" ? required(row, "Machine No.") : null,
      goodPieces: quantity(row, "Good Qty (pcs)"), rejectedPieces: quantity(row, "Rejected Qty (pcs)"), status }
  }
  const rows = sheets["2 Running Setups"]!.map((row) => {
    const identity = key(row, fields)
    const output = production.get(identity)
    if (!output) throw new Error("Each Running Setup needs a matching Running Production row; explicitly enter zero if none.")
    production.delete(identity)
    return opening(output, "running")
  })
  if (production.size) throw new Error("Running Production has no matching Running Setup.")
  rows.push(...sheets["4 Completed Setups"]!.map((row) => opening(row, "completed")))
  const rawMaterial = sheets["5 Raw Material"]!
  for (const row of rawMaterial) {
    checkJob(row)
    required(row, "RM PO No.")
    row["RM Received Date"] = calendarDate(row["RM Received Date"])
    if (quantity(row, "Unused Available (kg)") > quantity(row, "Total Received (kg)")) throw new Error("Unused RM cannot exceed cumulative received kilograms.")
  }
  const batch = parseProductionOpeningBatch({ cutoffAt: `${calendarDate(cutoff[0]!["Cutoff Date"])}T${time.length === 5 ? `${time}:00` : time}+05:30`, rows })
  return { ...batch, workOrders, rawMaterial }
}

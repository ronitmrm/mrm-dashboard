import { read, utils, writeFileXLSX, SSF } from "xlsx"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import { csvDateValue } from "./csv-date"
import type {
  PlanningContext,
  ProposalInput,
  ProposalPlan,
  ProposedLine,
} from "./order-acceptance"

type WorkbookRow = Record<string, string | number>
const rmDateColumn = "RM ready date (DD/MM/YYYY)"
async function workbookRows(file: File, sheetName?: string) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Use an Excel file smaller than 5 MB.")
  const workbook = read(await file.arrayBuffer(), {
    type: "array",
    cellDates: false,
    raw: true,
  })
  const name = sheetName ?? workbook.SheetNames[0]
  const sheet = name ? workbook.Sheets[name] : undefined
  if (!sheet)
    throw new Error(`Missing worksheet: ${sheetName ?? "Proposed Order"}`)
  const formatted = utils.sheet_to_json<WorkbookRow>(sheet, {
    defval: "",
    raw: false,
  })
  const raw = utils.sheet_to_json<WorkbookRow>(sheet, { defval: "", raw: true })
  return formatted.map<WorkbookRow>((row, index) => {
    const rowNumber =
      typeof row.__rowNum__ === "number" ? row.__rowNum__ + 1 : index + 2
    if (!(rmDateColumn in row))
      throw new Error(
        `Row ${rowNumber}: the ${rmDateColumn} column is required. Download the current template.`
      )
    const value = raw[index]?.[rmDateColumn]
    let date = row[rmDateColumn]
    if (typeof value === "number" && !/\.csv$/i.test(file.name)) {
      const decoded = SSF.parse_date_code(value, {
        date1904: workbook.Workbook?.WBProps?.date1904,
      })
      if (!decoded)
        throw new Error(
          `Row ${rowNumber}: ${rmDateColumn} must be a valid date.`
        )
      date = `${String(decoded.d).padStart(2, "0")}/${String(decoded.m).padStart(2, "0")}/${String(decoded.y).padStart(4, "0")}`
    }
    return {
      ...row,
      [rmDateColumn]: csvDateValue(date, rowNumber, rmDateColumn),
    }
  })
}
function download(
  name: string,
  sheets: { name: string; rows: WorkbookRow[] }[]
) {
  const workbook = utils.book_new()
  for (const source of sheets) {
    const sheet = utils.json_to_sheet(source.rows)
    sheet["!cols"] = Object.keys(source.rows[0] ?? {}).map(() => ({ wch: 24 }))
    utils.book_append_sheet(workbook, sheet, source.name)
  }
  writeFileXLSX(workbook, name)
}
export function proposalTemplate() {
  download("proposed-order-template.xlsx", [
    {
      name: "Proposed Order",
      rows: [
        {
          "Line reference": "1",
          Product: "",
          "Route option": "",
          "Quantity pcs": "",
          [rmDateColumn]: "",
        },
      ],
    },
  ])
}
export async function importProposedOrder(file: File): Promise<ProposedLine[]> {
  const rows = await workbookRows(file)
  if (!rows.length || rows.length > 1000)
    throw new Error("The workbook must contain 1–1,000 lines.")
  return rows.map((row) => ({
    id: String(row["Line reference"] ?? "").trim(),
    part: String(row.Product ?? "").trim(),
    option: String(row["Route option"] ?? "").trim(),
    quantity: Number(String(row["Quantity pcs"] ?? "").replaceAll(",", "")),
    rmDate: String(row[rmDateColumn] ?? "").trim(),
  }))
}
export function exportRmDates(input: ProposalInput, context: PlanningContext) {
  download("proposed-order-rm-dates.xlsx", [
    {
      name: "RM Dates",
      rows: [
        ...context.existing
          .filter((line) => !line.rmDate)
          .map((line) => ({
            Proposal: input.reference,
            Source: "Existing",
            "Line reference": line.id,
            Product: line.part,
            "Quantity pcs": line.quantity,
            [rmDateColumn]: formatCalendarDate(
              input.existingRmDates[line.id] ?? ""
            ),
          })),
        ...input.lines.map((line) => ({
          Proposal: input.reference,
          Source: "Proposed",
          "Line reference": line.id,
          Product: line.part,
          "Quantity pcs": line.quantity,
          [rmDateColumn]: formatCalendarDate(line.rmDate),
        })),
      ],
    },
  ])
}
export async function importRmDates(
  file: File,
  input: ProposalInput,
  context: PlanningContext
): Promise<ProposalInput> {
  const rows = await workbookRows(file, "RM Dates")
  const result = structuredClone(input)
  const seen = new Set<string>()
  for (const row of rows) {
    if (String(row.Proposal) !== input.reference)
      throw new Error("RM workbook belongs to a different proposal reference.")
    const source = String(row.Source)
    const id = String(row["Line reference"])
    const key = `${source}:${id}`
    if (seen.has(key)) throw new Error(`Duplicate RM line: ${key}`)
    seen.add(key)
    const line =
      source === "Existing"
        ? context.existing.find((line) => line.id === id && !line.rmDate)
        : source === "Proposed"
          ? result.lines.find((line) => line.id === id)
          : undefined
    if (
      !line ||
      line.part !== String(row.Product) ||
      line.quantity !== Number(String(row["Quantity pcs"]).replaceAll(",", ""))
    )
      throw new Error(
        `RM workbook no longer matches ${key}. Export the current workbook again.`
      )
    const date = String(row[rmDateColumn] ?? "").trim()
    if (source === "Existing") result.existingRmDates[id] = date
    else line.rmDate = date
  }
  const expected =
    input.lines.length + context.existing.filter((line) => !line.rmDate).length
  if (seen.size !== expected)
    throw new Error(
      "RM workbook is missing lines. Export the current workbook again."
    )
  return result
}
export function exportProposalResult(input: ProposalInput, plan: ProposalPlan) {
  download("proposed-order-plan.xlsx", [
    {
      name: "Machine plan",
      rows: plan.lines.flatMap((line) =>
        (line.machinePlan ?? []).map((row) => ({
          Proposal: input.reference,
          Line: line.id,
          Product: line.part,
          Setup: row.setup,
          Machine: row.machine,
          "Quantity pcs": row.quantity,
          "Production start": formatCalendarDate(row.start),
          "Production finish": formatCalendarDate(row.end),
        }))
      ),
    },
    {
      name: "Line decisions",
      rows: plan.lines.map((line) => ({
        Proposal: input.reference,
        Line: line.id,
        Product: line.part,
        "Quantity pcs": line.quantity,
        Selected: line.selected ? "Yes" : "No",
        "Machining completion": formatCalendarDate(line.completion),
        "RM required by": formatCalendarDate(line.rmRequiredBy),
        Reason: line.reason,
      })),
    },
    {
      name: "Family utilisation",
      rows: plan.families.map((family) => ({
        Family: family.family,
        Machines: family.machines,
        "Available hours": family.available,
        "Committed hours": family.committed,
        "Proposed hours": family.proposed,
        "Utilisation %": family.utilisation * 100,
      })),
    },
    {
      name: "Assumptions",
      rows: [
        {
          "Machining start": formatCalendarDate(input.startDate),
          "Machining deadline": formatCalendarDate(input.deadline),
          "Tentative RM available from":
            input.mode === "deadline"
              ? formatCalendarDate(input.tentativeRmDate || input.startDate)
              : "Per-line RM dates",
          "Daily hours": input.hoursPerDay,
          "Time factor %": input.efficiency,
          "Setup hours per operation": input.setupHours,
          Scope: "Machining only; no finishing, inspection or packing days.",
          Method: plan.method,
          Qualification:
            "Conditional on RM; approval does not create a PO or reserve capacity.",
        },
      ],
    },
  ])
}

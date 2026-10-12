import { createHash } from "node:crypto"
import type { AnalysisImportRow } from "@workspace/db"
import {
  AnalysisError,
  analysisDate,
  parseAnalysisFields,
  type AnalysisKind,
} from "@workspace/db/iso-analysis-domain"
import * as XLSX from "xlsx"

const categories: Record<string, string> = {
  political: "Political",
  economical: "Economic",
  economic: "Economic",
  social: "Social",
  technology: "Technological",
  technological: "Technological",
  strength: "Strength",
  strengths: "Strength",
  weakness: "Weakness",
  weaknesses: "Weakness",
  opportunity: "Opportunity",
  opportunities: "Opportunity",
  threat: "Threat",
  threats: "Threat",
}
function date(value: unknown) {
  if (value === "" || value == null) return null
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) throw new AnalysisError("Workbook date is invalid.")
    return analysisDate(
      `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`
    )
  }
  return analysisDate(String(value).trim().slice(0, 10))
}
export function parseAnalysisWorkbook(
  bytes: Buffer,
  fileName: string,
  kind: AnalysisKind
): AnalysisImportRow[] {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false })
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const result: AnalysisImportRow[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
    })
    if (kind === "RISK") {
      const headerIndex = rows.findIndex((row) =>
        ["risk", "p", "s", "current action plan"].every((header) =>
          row.some((value) => String(value).trim().toLowerCase() === header)
        )
      )
      if (headerIndex < 0) continue
      const headers = rows[headerIndex]!.map((value) => String(value).trim())
      const read = (row: unknown[], label: string) =>
        row[
          headers.findIndex((h) => h.toLowerCase() === label.toLowerCase())
        ] ?? ""
      for (let index = headerIndex + 1; index < rows.length; index++) {
        const row = rows[index]!,
          description = String(read(row, "Risk")).trim()
        if (!description) continue
        const identifiedOn = date(read(row, "Date"))
        const originalPlan = String(read(row, "Current Action Plan")).trim()
        result.push({
          fields: parseAnalysisFields({
            kind,
            analysisYear: identifiedOn
              ? Number(identifiedOn.slice(0, 4))
              : Number(
                  new Date()
                    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
                    .slice(0, 4)
                ),
            category: "Other",
            description,
            actionPlan: ["", "_", "-"].includes(originalPlan)
              ? "Treatment plan awaiting assessment."
              : originalPlan,
            focus: "Risk",
            ownerUserId: null,
            identifiedOn,
          }),
          status: "Open",
          completionNotes: "",
          sourceKey: `${sha256}:${sheetName}:${index + 1}`,
          source: {
            fileName,
            sha256,
            sheet: sheetName,
            row: index + 1,
            documentNumber: "MRM-QA-027",
            columns: Object.fromEntries(
              headers.flatMap((header, cell) =>
                header
                  ? [
                      [
                        header,
                        header.toLowerCase() === "date"
                          ? (identifiedOn ?? "")
                          : String(row[cell] ?? ""),
                      ],
                    ]
                  : []
              )
            ),
          },
        })
      }
      continue
    }
    const expected =
      kind === "PEST"
        ? ["Issue Identified", "Factor", "Action Required"]
        : ["Description / Insight", "Analysis", "Action Plan"]
    const headerIndex = rows.findIndex((row) =>
      expected.every((header) =>
        row.some(
          (value) => String(value).trim().toLowerCase() === header.toLowerCase()
        )
      )
    )
    if (headerIndex < 0) continue
    const headers = rows[headerIndex]!.map((value) => String(value).trim())
    const column = (label: string) =>
      headers.findIndex((value) => value.toLowerCase() === label.toLowerCase())
    const read = (row: unknown[], label: string) => row[column(label)] ?? ""
    const analysisYear = Number(sheetName.trim())
    const documentNumber =
      rows
        .flat()
        .map((value) => String(value))
        .find((value) => /^MRM-QA-\d+-\d+$/.test(value.trim()))
        ?.trim() ?? ""
    for (let index = headerIndex + 1; index < rows.length; index++) {
      const row = rows[index]!
      const description = String(read(row, expected[0]!)).trim()
      if (!description) continue
      const sourceCategory = String(read(row, expected[1]!))
        .trim()
        .toLowerCase()
      const sourceStatus = String(read(row, "Status")).trim().toLowerCase()
      const status = ["done", "complet", "complete", "completed"].includes(
        sourceStatus
      )
        ? "Completed"
        : ["pending", "open", ""].includes(sourceStatus)
          ? "Open"
          : null
      if (!status)
        throw new AnalysisError(
          `${sheetName} row ${index + 1}: status '${sourceStatus}' is unsupported.`
        )
      const identifiedOn = kind === "PEST" ? date(read(row, "Date")) : null
      const reviewedOn = kind === "SWOT" ? date(read(row, "Review date")) : null
      const timeline = kind === "PEST" ? String(read(row, "Timeline")) : ""
      const days = /^\s*(\d+)\s*days?\s*$/i.exec(timeline)
      let dueOn: string | null = null
      if (identifiedOn && days) {
        const due = new Date(`${identifiedOn}T00:00:00Z`)
        due.setUTCDate(due.getUTCDate() + Number(days[1]))
        dueOn = due.toISOString().slice(0, 10)
      }
      const fields = parseAnalysisFields({
        kind,
        analysisYear,
        category: categories[sourceCategory],
        description,
        actionPlan: String(read(row, expected[2]!)),
        department:
          kind === "PEST" ? String(read(row, "Responsible Department")) : "",
        ownerUserId: null,
        identifiedOn,
        dueOn,
        reviewedOn,
        nextReviewOn: null,
      })
      const columns = Object.fromEntries(
        headers.flatMap((header, cell) =>
          header
            ? [
                [
                  header,
                  header === "Date"
                    ? (identifiedOn ?? "")
                    : header.toLowerCase() === "review date"
                      ? (reviewedOn ?? "")
                      : String(row[cell] ?? ""),
                ],
              ]
            : []
        )
      )
      result.push({
        fields,
        status,
        completionNotes: "",
        sourceKey: `${analysisYear}:${sheetName}:${index + 1}`,
        source: {
          fileName,
          sha256,
          sheet: sheetName,
          row: index + 1,
          documentNumber,
          columns,
        },
      })
    }
  }
  if (!result.length)
    throw new AnalysisError(
      `No ${kind} rows found. Use the supplied ${kind} workbook layout with a year-named sheet.`
    )
  return result
}

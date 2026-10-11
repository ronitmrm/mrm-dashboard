import { notFound } from "next/navigation"
import {
  analysisReference,
  isAnalysisKind,
} from "@workspace/db/iso-analysis-domain"
import { withIsoAnalysis } from "@/lib/iso-document/analysis-server"
import { xlsxResponse } from "@/lib/xlsx-response"
import * as XLSX from "xlsx"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> }
) {
  const kind = (await params).kind.toUpperCase()
  if (!isAnalysisKind(kind)) notFound()
  const item = new URL(request.url).searchParams.get("item")
  return withIsoAnalysis(async ({ repository, access }) => {
    const dossier =
      item && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item)
        ? await repository.dossier(access, item)
        : null
    if (item && (!dossier || dossier.entry.kind !== kind)) notFound()
    const rows = dossier ? [dossier.entry] : await repository.list(access, kind)
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.json_to_sheet(
      rows.map((row) => ({
        Reference: analysisReference(kind, row.number),
        Year: row.analysisYear,
        Category: row.category,
        "Risk / Opportunity": row.focus,
        Priority: row.priority,
        "Business Impact": row.impact,
        "Expected Outcome": row.expectedOutcome,
        "Effectiveness Findings": row.effectivenessNotes,
        "Issue / Insight": row.description,
        "Action Plan": row.actionPlan,
        Department: row.department,
        "Responsible Staff": row.ownerName ?? "Not assigned",
        "Issue Date": row.identifiedOn ?? "",
        "Target Date": row.dueOn ?? "",
        Status: row.status,
        "Work Done": row.completionNotes,
        "Evidence Location": row.evidenceLocation,
        "Completed By": row.completedBy ?? "",
        "Completed At": row.completedAt ?? "",
        "QA Verified By": row.closedBy ?? "",
        "Closed At": row.closedAt ?? "",
        "Closure Remarks": row.closureRemarks,
        "Review Date": row.reviewedOn ?? "",
        "Next Review": row.nextReviewOn ?? "",
        "Source File": row.source?.fileName ?? "",
        "Source Sheet": row.source?.sheet ?? "",
        "Source Row": row.source?.row ?? "",
        "Original Status": row.source?.columns.Status ?? "",
      }))
    )
    sheet["!cols"] = [
      { wch: 18 },
      { wch: 8 },
      { wch: 16 },
      { wch: 55 },
      { wch: 60 },
      { wch: 28 },
      { wch: 25 },
    ]
    XLSX.utils.book_append_sheet(workbook, sheet, `${kind} Analysis`)
    if (dossier)
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(
          dossier.history.map((event) => ({
            Timestamp: event.occurredAt,
            Actor: event.actorName,
            Action: event.eventType,
            Notes: event.remarks,
            Before: JSON.stringify(event.before),
            After: JSON.stringify(event.after),
          }))
        ),
        "Action History"
      )
    return xlsxResponse(
      workbook,
      `${kind.toLowerCase()}-analysis${item ? "-item" : ""}.xlsx`
    )
  })
}

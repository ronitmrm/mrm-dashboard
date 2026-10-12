import { notFound } from "next/navigation"
import * as XLSX from "xlsx"
import { xlsxResponse } from "@/lib/xlsx-response"
import { withCustomerSatisfaction } from "@/lib/iso-document/customer-satisfaction-server"
import { satisfactionTextFields } from "@workspace/db/customer-satisfaction-domain"
export async function GET(request: Request) {
  return withCustomerSatisfaction(async ({ repository, access }) => {
    const item = new URL(request.url).searchParams.get("item")
    if (item && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item))
      notFound()
    const dossier = item ? await repository.dossier(access, item) : null
    if (item && !dossier) notFound()
    const rows = dossier ? [dossier.entry] : await repository.list(access)
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.json_to_sheet(
        rows.map((row) => ({
          Reference: `CS-${String(row.number).padStart(5, "0")}`,
          Customer: row.customerName ?? row.fields.customerScope,
          Owner: row.ownerName,
          Status: row.status,
          ...Object.fromEntries(
            Object.entries(satisfactionTextFields).map(([key, label]) => [
              label,
              row.fields[key as keyof typeof satisfactionTextFields],
            ])
          ),
          "Period From": row.fields.periodFrom,
          "Period To": row.fields.periodTo,
          "Next Review": row.fields.nextReviewOn,
          "Follow-up required": row.fields.followUpRequired,
          "Follow-up reference": row.actionReference,
          "Follow-up status": row.actionStatus,
          "QA findings": row.decisionNotes,
          "Current report uploaded": row.fileCount > 0,
        }))
      ),
      "Reports"
    )
    if (dossier) {
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.json_to_sheet(dossier.files),
        "File Versions"
      )
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.json_to_sheet(
          dossier.history.flatMap((event) =>
            Object.entries({ ...event.before, ...event.after }).flatMap(
              ([key]) => {
                const before = event.before?.[key],
                  after = event.after?.[key]
                if (key === "fields")
                  return Object.keys({
                    ...(before as object),
                    ...(after as object),
                  }).map((field) => ({
                    When: event.occurredAt,
                    Actor: event.actorName,
                    Action: event.eventType,
                    Notes: event.remarks,
                    Field: field,
                    Before: String(
                      (before as Record<string, unknown> | undefined)?.[
                        field
                      ] ?? ""
                    ),
                    After: String(
                      (after as Record<string, unknown> | undefined)?.[field] ??
                        ""
                    ),
                  }))
                return [
                  {
                    When: event.occurredAt,
                    Actor: event.actorName,
                    Action: event.eventType,
                    Notes: event.remarks,
                    Field: key,
                    Before: JSON.stringify(before) ?? "",
                    After: JSON.stringify(after) ?? "",
                  },
                ]
              }
            )
          )
        ),
        "Change History"
      )
    }
    return xlsxResponse(book, "customer-satisfaction-reports.xlsx")
  })
}

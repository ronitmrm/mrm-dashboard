import * as XLSX from "xlsx"
import { withSipoc } from "@/lib/iso-document/sipoc-server"
import { sipocTextFields, sipocLists } from "@workspace/db/sipoc-domain"
function retainedFields(state: Record<string, unknown> | null) {
  return Object.entries(state ?? {}).flatMap(([key, value]) =>
    key === "fields" &&
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? Object.entries(value).map(([field, content]) => ({
          Field: field,
          Value: Array.isArray(content)
            ? content.join("\n")
            : String(content ?? ""),
        }))
      : [
          {
            Field: key,
            Value:
              typeof value === "object"
                ? JSON.stringify(value)
                : String(value ?? ""),
          },
        ]
  )
}
export async function GET() {
  return withSipoc(async ({ repository, access }) => {
    const records = await repository.list(access),
      book = XLSX.utils.book_new()
    function sheet(name: string, rows: Record<string, unknown>[]) {
      const data = XLSX.utils.json_to_sheet(rows)
      data["!cols"] = Object.keys(rows[0] ?? {}).map((_, index) => ({
        wch: index === 0 ? 14 : 32,
      }))
      XLSX.utils.book_append_sheet(book, data, name)
    }
    sheet(
      "Working Maps",
      records.map((row) => ({
        Map: `SIPOC-${row.number}`,
        Status: row.status,
        Revision: row.revision,
        "Approved revision": row.approvedRevision,
        ...Object.fromEntries(
          sipocTextFields.map(({ key, label }) => [label, row.fields[key]])
        ),
        ...Object.fromEntries(
          sipocLists.map(({ key, label }) => [
            label,
            row.fields[key].join("\n"),
          ])
        ),
        Owner: row.ownerName,
        "Next review": row.fields.nextReviewOn,
        "QA findings": row.decisionNotes,
      }))
    )
    const dossiers = await Promise.all(
      records.map((row) => repository.dossier(access, row.id))
    )
    sheet(
      "Approved Revisions",
      dossiers.flatMap(
        (d) =>
          d?.revisions.flatMap((rev) =>
            retainedFields({ fields: rev.fields }).map((field) => ({
              Map: `SIPOC-${d.entry.number}`,
              Revision: rev.revision,
              Owner: rev.ownerName,
              "Approved by": rev.approvedBy,
              "Approved at": rev.approvedAt,
              Findings: rev.notes,
              ...field,
            }))
          ) ?? []
      )
    )
    sheet(
      "Change History",
      dossiers.flatMap(
        (d) =>
          d?.history.flatMap((event) =>
            (["before", "after"] as const).flatMap((state) =>
              retainedFields(event[state]).map((field) => ({
                Map: `SIPOC-${d.entry.number}`,
                Action: event.eventType,
                By: event.actorName,
                At: event.occurredAt,
                Remarks: event.remarks,
                State: state,
                ...field,
              }))
            )
          ) ?? []
      )
    )
    sheet(
      "Original Source",
      records
        .filter((row) => row.source)
        .map((row) => ({
          Map: `SIPOC-${row.number}`,
          Source: JSON.stringify(row.source),
        }))
    )
    return new Response(
      XLSX.write(book, { type: "buffer", bookType: "xlsx" }),
      {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=sipoc-process-maps.xlsx",
        },
      }
    )
  })
}

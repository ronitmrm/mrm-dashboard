import { notFound } from "next/navigation"
import * as XLSX from "xlsx"
import {
  requirementReference,
  requirementAttention,
} from "@workspace/db/interested-parties-domain"
import { xlsxResponse } from "@/lib/xlsx-response"
import { requirementDetails } from "@/lib/iso-document/interested-parties-display"
import { withInterestedParties } from "@/lib/iso-document/interested-parties-server"
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("requirement")
  if (id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withInterestedParties(async ({ repository, access }) => {
    const dossier = id ? await repository.dossier(access, id) : null
    if (id && !dossier) notFound()
    const [records, reviews] = await Promise.all([
      dossier ? Promise.resolve([dossier.entry]) : repository.list(access),
      dossier
        ? Promise.resolve(dossier.reviews)
        : repository.monitoringRegister(access),
    ])
    const workbook = XLSX.utils.book_new()
    function sheet(
      name: string,
      rows: Array<Record<string, string | number | null>>
    ) {
      const page = XLSX.utils.json_to_sheet(rows)
      page["!cols"] = Array.from(
        { length: Math.max(1, Object.keys(rows[0] ?? {}).length) },
        () => ({ wch: 28 })
      )
      XLSX.utils.book_append_sheet(workbook, page, name)
    }
    sheet(
      "Requirements",
      records.map((entry) => ({
        Reference: requirementReference(entry.number),
        "Interested party": entry.partyGroup,
        Requirement: entry.requirement,
        ...Object.fromEntries(
          requirementDetails.map(([key, label]) => [label, entry[key]])
        ),
        State: entry.lifecycle,
        "Monitoring position": requirementAttention(entry),
        "Plan revision": entry.planRevision,
        "Last verified result": entry.verifiedOutcome,
        "Last verified check": entry.verifiedOn,
        "Verified plan revision": entry.verifiedPlanRevision,
        "Pending follow-up":
          entry.verifiedOutcome && entry.verifiedOutcome !== "Met"
            ? entry.followUp
            : "",
        "Follow-up target":
          entry.verifiedOutcome && entry.verifiedOutcome !== "Met"
            ? entry.followUpDueOn
            : "",
        Version: entry.version,
      }))
    )
    sheet(
      "Monitoring",
      reviews.map((review) => ({
        Requirement: requirementReference(review.planSnapshot.number),
        "Actual check": review.observedOn,
        "Proposed / verified result": review.outcome,
        "QA position": review.status,
        Observations: review.observations,
        Evidence: review.evidence,
        "Follow-up": review.followUp,
        "Follow-up target": review.followUpDueOn,
        "Related record": review.relatedReference,
        "Plan used": review.planRevision,
        "Recorded by": review.recordedBy,
        "Recorded at": review.recordedAt,
        "QA findings": review.decisionNotes,
        "QA decision by": review.decidedBy,
        "QA decision at": review.decidedAt,
        "Next review": review.nextReviewOn,
      }))
    )
    sheet(
      "Plans Used",
      reviews.flatMap((review) => [
        {
          Requirement: requirementReference(review.planSnapshot.number),
          "Actual check": review.observedOn,
          "Plan revision": review.planRevision,
          Field: "Requirement",
          Value: review.planSnapshot.requirement,
        },
        ...requirementDetails.map(([key, label]) => ({
          Requirement: requirementReference(review.planSnapshot.number),
          "Actual check": review.observedOn,
          "Plan revision": review.planRevision,
          Field: label,
          Value: review.planSnapshot[key],
        })),
      ])
    )
    sheet(
      "Original Source",
      records.flatMap((entry) =>
        entry.source
          ? Object.entries(entry.source.cells).map(([field, value]) => ({
              Requirement: requirementReference(entry.number),
              File: entry.source!.fileName,
              Sheet: entry.source!.sheet,
              Row: entry.source!.row,
              "Original form": entry.source!.formCode,
              Field: field,
              Value: value,
            }))
          : []
      )
    )
    if (dossier)
      sheet(
        "Change History",
        dossier.history.flatMap((event) =>
          [
            { phase: "Before", record: event.before },
            { phase: "After", record: event.after },
          ].flatMap(({ phase, record }) =>
            Object.entries(record ?? {}).flatMap(([field, value]) => {
              const content =
                typeof value === "string"
                  ? value
                  : (JSON.stringify(value) ?? "null")
              return Array.from(
                { length: Math.max(1, Math.ceil(content.length / 32000)) },
                (_, part) => ({
                  Event: event.id,
                  When: event.occurredAt,
                  By: event.actorName,
                  Action: event.eventType,
                  Remarks: event.remarks,
                  Record: phase,
                  Field: field,
                  Part: part + 1,
                  Value: content.slice(part * 32000, (part + 1) * 32000),
                })
              )
            })
          )
        )
      )
    return xlsxResponse(
      workbook,
      dossier
        ? `${requirementReference(dossier.entry.number)}-monitoring.xlsx`
        : "interested-party-requirements.xlsx",
      { compression: true }
    )
  })
}

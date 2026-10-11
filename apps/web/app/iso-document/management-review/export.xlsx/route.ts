import { notFound } from "next/navigation"
import * as XLSX from "xlsx"
import {
  meetingReference,
  reviewActionReference,
  reviewAgenda,
} from "@workspace/db/management-review-domain"
import { withManagementReview } from "@/lib/iso-document/management-review-server"
import { xlsxResponse } from "@/lib/xlsx-response"

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("meeting")
  if (id && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) notFound()
  return withManagementReview(async ({ repository, access }) => {
    const dossier = id ? await repository.meetingDossier(access, id) : null
    if (id && !dossier) notFound()
    const meetings = dossier
      ? [dossier.entry]
      : await repository.listMeetings(access)
    const points = await repository.listActions(access)
    const selectedPoints = dossier
      ? points.filter((point) =>
          dossier.actionReviews.some((review) => review.actionId === point.id)
        )
      : points
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
      "Meetings",
      meetings.map((meeting) => ({
        Reference: meetingReference(meeting.number),
        Title: meeting.title,
        Date: meeting.heldOn,
        "Start time": meeting.startTime,
        "End time": meeting.endTime,
        Location: meeting.location,
        "Review from": meeting.periodStart,
        "Review to": meeting.periodEnd,
        Chair: meeting.chairName,
        Status: meeting.status,
        "QA approved by": meeting.approvedBy,
        "QA approved at": meeting.approvedAt,
        "Approval remarks": meeting.approvalNotes,
        "Next review": meeting.nextReviewOn,
        "QMS suitability": meeting.suitability,
        "QMS adequacy": meeting.adequacy,
        "QMS effectiveness": meeting.effectiveness,
        "Improvement decisions": meeting.improvementDecisions,
        "QMS changes": meeting.qmsChanges,
        "Resource decisions": meeting.resourceDecisions,
        "Source file": meeting.source?.fileName ?? "",
      }))
    )
    sheet(
      "Attendance",
      meetings.flatMap((meeting) =>
        meeting.attendees.map((person) => ({
          Meeting: meetingReference(meeting.number),
          Name: person.name,
          Designation: person.designation,
          Department: person.department,
          Attendance: person.attendance,
        }))
      )
    )
    sheet(
      "Review Inputs",
      meetings.flatMap((meeting) =>
        meeting.agenda.map((topic) => ({
          Meeting: meetingReference(meeting.number),
          Topic:
            reviewAgenda.find((item) => item.key === topic.key)?.title ??
            topic.key,
          Outcome: topic.outcome,
          Discussion: topic.discussion,
          Evidence: topic.evidence,
          Decision: topic.decision,
        }))
      )
    )
    sheet(
      "Current Action Register",
      selectedPoints.map((point) => ({
        Point: reviewActionReference(point.number),
        "Original meeting": meetingReference(point.originMeetingNumber),
        Action: point.description,
        "Expected result": point.expectedOutcome,
        Department: point.department,
        Responsible: point.ownerName,
        Priority: point.priority,
        "Target date": point.dueOn,
        Status: point.status,
        "Related record": point.evidenceReference,
        "Work done": point.completionNotes,
        Evidence: point.evidenceLocation,
        "Completed by": point.completedBy,
        "Completed at": point.completedAt,
        "Effectiveness findings": point.effectivenessNotes,
        "QA closed by": point.closedBy,
        "Closed at": point.closedAt,
      }))
    )
    if (dossier) {
      sheet(
        "Meeting Action Reviews",
        dossier.actionReviews.map((review) => ({
          Point: reviewActionReference(review.snapshot.number),
          Action: review.snapshot.description,
          "Status at meeting": review.snapshot.status,
          "Responsible at meeting": review.snapshot.ownerName,
          "Target at meeting": review.snapshot.dueOn,
          "Expected result at meeting": review.snapshot.expectedOutcome,
          Discussion: review.notes,
          "Recorded by": review.reviewedBy,
          "Recorded at": review.reviewedAt,
        }))
      )
      sheet(
        "Minutes History",
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
              const parts = Math.max(1, Math.ceil(content.length / 32000))
              return Array.from({ length: parts }, (_, part) => ({
                Event: event.id,
                When: event.occurredAt,
                By: event.actorName,
                Action: event.eventType,
                Remarks: event.remarks,
                Record: phase,
                Field: field,
                Part: part + 1,
                Value: content.slice(part * 32000, (part + 1) * 32000),
              }))
            })
          )
        )
      )
      if (dossier.entry.source)
        sheet(
          "Original Source",
          dossier.entry.source.sections.flatMap((section) =>
            section.text
              ? [
                  {
                    File: dossier.entry.source!.fileName,
                    "Source notes": section.text,
                  },
                ]
              : (section.table ?? []).map((row) => ({
                  File: dossier.entry.source!.fileName,
                  "Source notes": row.join(" | "),
                }))
          )
        )
    }
    return xlsxResponse(
      workbook,
      dossier
        ? `${meetingReference(dossier.entry.number)}-review.xlsx`
        : "management-review-register.xlsx",
      { compression: true }
    )
  })
}

import PDFDocument from "pdfkit"
import type {
  ManagementReviewRecord,
  ManagementReviewActionReview,
} from "@workspace/db"
import {
  meetingReference,
  reviewActionReference,
  reviewAgenda,
} from "@workspace/db/management-review-domain"
import { registerPdfKitBrandFonts } from "@/lib/branding/pdfkit-fonts"
import { drawLogo } from "@/lib/branding/pdfkit-layout"

function text(value: string | null | undefined) {
  return (value || "Not recorded")
    .replace(/[\u2010-\u2015]/g, "-")
    .replaceAll("≤", "<=")
    .replaceAll("≥", ">=")
}
export async function managementReviewPdf(
  meeting: ManagementReviewRecord,
  reviews: ManagementReviewActionReview[]
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 80, bottom: 52, left: 42, right: 42 },
    bufferPages: true,
    autoFirstPage: false,
    info: {
      Title: `${meetingReference(meeting.number)} ${meeting.title}`,
      Author: "Mayank Raw Mint",
      Subject: `Management review minutes - ${meeting.status}`,
    },
  })
  const chunks: Buffer[] = []
  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.once("end", () => resolve(Buffer.concat(chunks)))
    doc.once("error", reject)
  })
  try {
    const fonts = await registerPdfKitBrandFonts(doc)
    const width = 511.28
    doc.on("pageAdded", () => {
      doc.x = 42
      doc.y = 80
    })
    doc.addPage()
    function heading(title: string) {
      if (doc.y > 725) doc.addPage()
      doc
        .font("Outfit-600")
        .fontSize(12)
        .fillColor("#111111")
        .text(text(title), 42, doc.y, { width, paragraphGap: 7 })
    }
    function paragraph(label: string, value: string | null | undefined) {
      if (doc.y + 38 > doc.page.height - doc.page.margins.bottom) doc.addPage()
      doc
        .font("Outfit-600")
        .fontSize(9.5)
        .fillColor("#333333")
        .text(label, { width, paragraphGap: 2 })
      doc
        .font("Outfit-400")
        .fontSize(10)
        .fillColor("#111111")
        .text(text(value), { width, lineGap: 2, paragraphGap: 8 })
    }
    doc
      .font("Outfit-600")
      .fontSize(18)
      .text(text(meeting.title), { width, paragraphGap: 12 })
    heading("Meeting record")
    paragraph(
      "Date, time and location",
      `${meeting.heldOn} | ${meeting.startTime || "Not recorded"} - ${meeting.endTime || "Not recorded"} | ${meeting.location}`
    )
    paragraph(
      "Review period",
      meeting.periodStart && meeting.periodEnd
        ? `${meeting.periodStart} to ${meeting.periodEnd}`
        : null
    )
    paragraph("Top management chair", meeting.chairName)
    paragraph("Planned next review", meeting.nextReviewOn)
    paragraph(
      "QA minutes approval",
      meeting.approvedBy
        ? `${meeting.approvedBy} | ${meeting.approvedAt ? new Date(meeting.approvedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : ""} (India)`
        : "Pending - these minutes are not approved"
    )
    if (meeting.approvalNotes)
      paragraph("Approval remarks", meeting.approvalNotes)
    if (meeting.source)
      paragraph(
        "Reference example",
        `${meeting.source.fileName}. Source labels are historical claims; confirmed attendance, decisions and action closure are recorded separately.`
      )
    heading("People and attendance")
    for (const [index, person] of meeting.attendees.entries())
      paragraph(
        `${index + 1}. ${person.name}`,
        `${person.designation || "Role not recorded"} | ${person.department || "Department not recorded"} | ${person.attendance}`
      )
    heading("Review inputs, discussion and decisions")
    for (const [index, topic] of reviewAgenda.entries()) {
      const input = meeting.agenda.find((item) => item.key === topic.key)
      heading(`${index + 1}. ${topic.title}`)
      paragraph("Review outcome", input?.outcome)
      paragraph("Discussion / results and trends", input?.discussion)
      paragraph("Evidence reference", input?.evidence)
      paragraph("Decision and rationale", input?.decision)
    }
    heading("Conclusions and management decisions")
    for (const [label, value] of [
      ["QMS suitability", meeting.suitability],
      ["QMS adequacy", meeting.adequacy],
      ["QMS effectiveness", meeting.effectiveness],
      ["Improvement decisions", meeting.improvementDecisions],
      ["QMS changes", meeting.qmsChanges],
      ["Resource decisions", meeting.resourceDecisions],
    ])
      paragraph(label!, value)
    heading("Actions reviewed in this meeting")
    paragraph(
      "Action follow-up",
      "Minutes approval does not close actions. The following retains each point's position when discussed here; use the shared pending list for its current status."
    )
    for (const review of reviews) {
      heading(
        `${reviewActionReference(review.snapshot.number)} - ${review.snapshot.description}`
      )
      paragraph(
        "Status, responsible person and deadline at review",
        `${review.snapshot.status} | ${review.snapshot.ownerName || "Not assigned"} | ${review.snapshot.department || "Not assigned"} | ${review.snapshot.dueOn || "Not set"}`
      )
      paragraph("Expected result", review.snapshot.expectedOutcome)
      paragraph("Discussion and decision", review.notes)
    }
    const range = doc.bufferedPageRange()
    for (let page = 0; page < range.count; page++) {
      doc.switchToPage(page)
      const bottomMargin = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      drawLogo({ doc, fonts }, 42, 28, 22)
      doc
        .font("Outfit-600")
        .fontSize(11)
        .fillColor("#006B48")
        .text("MAYANK RAW MINT", 74, 29, { width: 470, lineBreak: false })
      doc
        .font("Outfit-400")
        .fontSize(9)
        .fillColor("#333333")
        .text(
          `${meetingReference(meeting.number)} | ${meeting.status === "Approved" ? "QA APPROVED MINUTES" : "DRAFT - NOT APPROVED"} | Version ${meeting.version}`,
          74,
          46,
          { width: 470, lineBreak: false }
        )
      doc.moveTo(42, 66).lineTo(553, 66).strokeColor("#CCCCCC").stroke()
      doc
        .font("Outfit-400")
        .fontSize(8)
        .fillColor("#555555")
        .text(
          `${meetingReference(meeting.number)} | ${meeting.status} | Page ${page + 1} of ${range.count}`,
          42,
          809,
          { width, lineBreak: false }
        )
      doc.page.margins.bottom = bottomMargin
    }
    doc.end()
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error(String(error)))
    await completion.catch(() => undefined)
    throw error
  }
  return completion
}

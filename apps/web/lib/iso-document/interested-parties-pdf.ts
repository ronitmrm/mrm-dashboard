import PDFDocument from "pdfkit"
import type {
  InterestedPartyRequirement,
  InterestedPartyMonitoring,
} from "@workspace/db"
import {
  requirementReference,
  requirementAttention,
} from "@workspace/db/interested-parties-domain"
import { registerPdfKitBrandFonts } from "@/lib/branding/pdfkit-fonts"
import { drawLogo } from "@/lib/branding/pdfkit-layout"
import { requirementDetails } from "./interested-parties-display"
const text = (value: string | null | undefined) =>
  (value || "Not recorded")
    .replace(/[\u2010-\u2015]/g, "-")
    .replaceAll("≤", "<=")
    .replaceAll("≥", ">=")
export async function interestedPartiesPdf(
  entry: InterestedPartyRequirement,
  reviews: InterestedPartyMonitoring[]
) {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 80, bottom: 52, left: 42, right: 42 },
    bufferPages: true,
    autoFirstPage: false,
    info: {
      Title: `${requirementReference(entry.number)} Interested parties requirement and monitoring`,
      Author: "Mayank Raw Mint",
    },
  })
  const chunks: Buffer[] = []
  const completion = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.once("end", () => resolve(Buffer.concat(chunks)))
    doc.once("error", reject)
  })
  try {
    const fonts = await registerPdfKitBrandFonts(doc),
      width = 511.28
    doc.on("pageAdded", () => {
      doc.x = 42
      doc.y = 80
    })
    doc.addPage()
    function heading(value: string) {
      if (doc.y > 725) doc.addPage()
      doc
        .font("Outfit-600")
        .fontSize(12)
        .fillColor("#111111")
        .text(text(value), 42, doc.y, { width, paragraphGap: 7 })
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
      .text("Interested Parties Requirements and Monitoring", {
        width,
        paragraphGap: 12,
      })
    paragraph("Interested party / group", entry.partyGroup)
    paragraph("Requirement / expectation", entry.requirement)
    paragraph(
      "Record state and monitoring position",
      `${entry.lifecycle} | ${requirementAttention(entry)} | Plan revision ${entry.planRevision}`
    )
    heading("Requirement and monitoring plan")
    for (const [key, label] of requirementDetails) paragraph(label, entry[key])
    heading("Monitoring and QA decisions")
    if (!reviews.length)
      paragraph(
        "Monitoring",
        "No actual monitoring has been recorded. Original source status labels do not establish a verified result."
      )
    for (const [index, review] of reviews.entries()) {
      heading(
        `${index + 1}. Actual check ${review.observedOn} - ${review.status}`
      )
      paragraph(
        review.status === "Verified" ? "QA-verified result" : "Proposed result",
        review.outcome
      )
      paragraph("Observations / results", review.observations)
      paragraph("Evidence reference / location", review.evidence)
      paragraph(
        "Follow-up action and target",
        review.followUp
          ? `${review.followUp} | Target ${review.followUpDueOn || "Not set"}`
          : null
      )
      paragraph("Related action / record", review.relatedReference)
      paragraph(
        "Recorded by",
        `${review.recordedBy} | ${new Date(review.recordedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (India)`
      )
      paragraph("QA findings / decision reason", review.decisionNotes)
      paragraph(
        "QA decision by",
        review.decidedBy
          ? `${review.decidedBy} | ${review.decidedAt ? new Date(review.decidedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : ""} (India)`
          : null
      )
      paragraph("Next review recorded by QA", review.nextReviewOn)
      paragraph(
        "Plan used at check",
        `Revision ${review.planRevision} | ${review.planSnapshot.requirement} | ${review.planSnapshot.scope}`
      )
      paragraph(
        "Acceptance criteria at check",
        review.planSnapshot.acceptanceCriteria
      )
      paragraph(
        "Monitoring method / frequency at check",
        `${review.planSnapshot.monitoringMethod} | ${review.planSnapshot.frequency}`
      )
      paragraph(
        "Responsible staff at check",
        `${review.planSnapshot.ownerName || "Not assigned"} | ${review.planSnapshot.department}`
      )
    }
    if (entry.source) {
      heading("Original source row")
      paragraph(
        "Reference",
        `${entry.source.fileName} | ${entry.source.sheet}, row ${entry.source.row} | Original form ${entry.source.formCode}`
      )
      for (const [label, value] of Object.entries(entry.source.cells))
        paragraph(label, value)
    }
    const range = doc.bufferedPageRange()
    for (let page = 0; page < range.count; page++) {
      doc.switchToPage(page)
      const bottom = doc.page.margins.bottom
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
          `${requirementReference(entry.number)} | ${entry.lifecycle} | Plan revision ${entry.planRevision}`,
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
          `${requirementReference(entry.number)} | Page ${page + 1} of ${range.count}`,
          42,
          809,
          { width, lineBreak: false }
        )
      doc.page.margins.bottom = bottom
    }
    doc.end()
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error(String(error)))
    await completion.catch(() => undefined)
    throw error
  }
  return completion
}

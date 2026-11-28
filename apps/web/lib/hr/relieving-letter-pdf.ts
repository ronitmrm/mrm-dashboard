import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import type { PreparedEmploymentLetter } from "@workspace/db"
import {
  createEmploymentLetterPdf,
  LETTER_BODY_WIDTH,
  LETTER_GREEN,
  LETTER_LEFT,
  LETTER_WIDTH,
} from "./employment-letter-layout"

type Relieving = Extract<PreparedEmploymentLetter, { type: "relieving" }>
type Segment = string | { bold: string } | { company: true }

// Same single-page layout as the Appointment Letter's first page.
export async function buildRelievingLetterPdf(letter: Relieving) {
  const { doc, addPage, finish } = await createEmploymentLetterPdf(
    "relieving",
    letter.identity.employeeName
  )
  const { identity, details } = letter

  function text(
    value: string,
    y: number,
    options: { bold?: boolean; size?: number; green?: boolean; center?: boolean } = {}
  ) {
    doc
      .font(options.bold ? "medium" : "regular")
      .fontSize(options.size ?? 10)
      .fillColor(options.green ? LETTER_GREEN : "#000000")
      .text(value, LETTER_LEFT, y, {
        width: LETTER_BODY_WIDTH,
        align: options.center ? "center" : "left",
        lineGap: 1.5,
      })
    return doc.y
  }

  function paragraph(segments: Segment[], y: number) {
    doc.fontSize(10).text("", LETTER_LEFT, y, { width: LETTER_BODY_WIDTH, lineGap: 1.5, continued: true })
    segments.forEach((segment, index) => {
      const continued = index < segments.length - 1
      if (typeof segment === "string") {
        doc.font("regular").fillColor("#000000").text(segment, { continued })
      } else if ("bold" in segment) {
        doc.font("medium").fillColor("#000000").text(segment.bold, { continued })
      } else {
        doc.font("medium").fillColor(LETTER_GREEN).text("Mayank Raw Mint Pvt. Ltd.", { continued })
      }
    })
    return doc.y
  }

  addPage()
  doc
    .font("title")
    .fontSize(25)
    .fillColor(LETTER_GREEN)
    .text("RELIEVING LETTER", 0, 130, { width: LETTER_WIDTH, align: "center" })
  text(`Ref: ${letter.reference}`, 171, { bold: true, size: 14, green: true, center: true })
  text(formatCalendarDate(letter.issuedOn), 200, { bold: true })
  text("To,", 228)
  text(`${details.title} ${identity.employeeName}`, 246, { bold: true })
  text(`Employee Code: ${identity.employeeCode}`, 264)
  const recipientEnd = text(`${identity.designation}, ${identity.department}`, 282)
  const subjectEnd = text(
    "Subject: Relieving on non-confirmation of probation",
    Math.max(338, recipientEnd + 35),
    { bold: true }
  )
  let y = text(`Dear ${identity.employeeName},`, subjectEnd + 16)
  y = paragraph([
    "You joined ", { company: true }, " on ", { bold: formatCalendarDate(identity.joiningDate) },
    " as ", { bold: `${identity.designation} (${identity.department})` },
    ", on probation until ", { bold: formatCalendarDate(details.probationEndedOn) }, ".",
  ], y + 16)
  y = paragraph([
    "After reviewing your performance during the probation period, the management has decided not to confirm your employment. You are therefore relieved from the services of the company with effect from the close of working hours on ",
    { bold: formatCalendarDate(identity.lastWorkingDate!) }, ".",
  ], y + 16)
  y = text(
    "Your full and final settlement, if any, will be processed as per company policy. Please hand over all company property, documents and your ID card to the HR department on or before your last working day.",
    y + 16
  )
  y = text("We wish you the best in your future endeavours.", y + 16)
  if (y > 580)
    throw new Error("Relieving letter content exceeds the letter format. Shorten the designation or department.")
  text("Warm Regards,", Math.max(596, y + 18), { bold: true })
  text(details.signatoryName, 678, { bold: true })
  if (text(details.signatoryDesignation, 699, { bold: true }) > 729)
    throw new Error("Relieving letter signatory details exceed the letter format. Shorten the signatory designation.")
  return finish()
}

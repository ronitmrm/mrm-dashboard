import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import type { PreparedEmploymentLetter } from "@workspace/db"
import {
  createEmploymentLetterPdf,
  LETTER_BODY_WIDTH,
  LETTER_GREEN,
  LETTER_LEFT,
  LETTER_WIDTH,
} from "./employment-letter-layout"

type Appointment = Extract<PreparedEmploymentLetter, { type: "appointment" }>

export async function buildAppointmentLetterPdf(letter: Appointment) {
  const { doc, addPage, finish } = await createEmploymentLetterPdf(
    "appointment",
    letter.identity.employeeName
  )
  const position = letter.identity.combinedPosts
    ? letter.identity.designation
    : `${letter.identity.designation} (${letter.identity.department})`
  const probation = `${letter.details.probationLength} ${letter.details.probationLength === 1 ? letter.details.probationUnit.replace(/s$/, "") : letter.details.probationUnit}`
  const salary = letter.details.grossMonthlySalary.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  function text(
    value: string,
    y: number,
    options: {
      bold?: boolean
      size?: number
      x?: number
      width?: number
      green?: boolean
      center?: boolean
    } = {}
  ) {
    doc
      .font(options.bold ? "medium" : "regular")
      .fontSize(options.size ?? 10)
      .fillColor(options.green ? LETTER_GREEN : "#000000")
      .text(value, options.x ?? LETTER_LEFT, y, {
        width: options.width ?? LETTER_BODY_WIDTH,
        align: options.center ? "center" : "left",
        lineGap: 1.5,
      })
    return doc.y
  }
  addPage()
  doc
    .font("title")
    .fontSize(25)
    .fillColor(LETTER_GREEN)
    .text("APPOINTMENT LETTER", 0, 130, {
      width: LETTER_WIDTH,
      align: "center",
    })
  text(`Ref: ${letter.reference}`, 171, {
    bold: true,
    size: 14,
    green: true,
    center: true,
  })
  text(formatCalendarDate(letter.issuedOn), 200, { bold: true })
  text("To,", 228)
  text(letter.identity.employeeName, 246, { bold: true })
  const addressEnd = text(letter.details.postalAddress, 264)
  const subjectEnd = text(
    `Subject: Appointment for the Position of ${letter.identity.designation}`,
    Math.max(338, addressEnd + 35),
    { bold: true }
  )
  const greetingEnd = text(
    `Dear ${letter.identity.employeeName},`,
    subjectEnd + 16
  )
  doc
    .font("regular")
    .fontSize(10)
    .fillColor("#000000")
    .text(
      "We are pleased to confirm your appointment as ",
      LETTER_LEFT,
      greetingEnd + 16,
      { width: LETTER_BODY_WIDTH, lineGap: 1.5, continued: true }
    )
  doc.font("medium").text(position, { continued: true })
  doc.font("regular").text(" at ", { continued: true })
  doc
    .fillColor(LETTER_GREEN)
    .font("medium")
    .text("Mayank Raw Mint Pvt. Ltd.", { continued: true })
  doc
    .fillColor("#000000")
    .font("regular")
    .text(" following the successful completion of your probation period.")
  let y = text(
    "Please turn over to find the detailed terms and conditions of your employment.",
    doc.y + 16
  )
  y = text(
    "We look forward to your continued contribution and wish you a successful journey with us.",
    y + 16
  )
  if (y > 580)
    throw new Error(
      "Appointment letter content exceeds the sample format. Shorten the address or appointment details."
    )
  text("Warm Regards,", Math.max(596, y + 18), { bold: true })
  text(letter.details.signatoryName, 678, { bold: true })
  if (text(letter.details.signatoryDesignation, 699, { bold: true }) > 729) {
    throw new Error(
      "Appointment letter signatory details exceed the sample format. Shorten the signatory designation."
    )
  }

  addPage()
  text("Continuation of Appointment Letter", 134, { bold: true })
  text(`Ref: ${letter.reference}`, 155, { bold: true })
  const clauses = [
    [
      "Commencement of Employment",
      `Your appointment is effective from ${formatCalendarDate(letter.details.confirmationEffectiveDate)} after successful completion of the ${probation} probation period.`,
    ],
    [
      "Designation & Reporting",
      `Your designation will be ${position}, and you will report to ${letter.details.reportsTo}.`,
    ],
    [
      "Salary",
      `Your gross salary will be Rs. ${salary}/- per month. You will be eligible for an annual bonus in April, provided you have completed at least six months of confirmed service at the time of resignation.`,
    ],
    [
      "Place of Work",
      `You will be based at our ${letter.details.workLocation} facility, but may be assigned to any other location of the company as per business requirements.`,
    ],
    [
      "Working Days & Hours",
      `Your working days will be Saturday through Thursday. Duty hours are from ${letter.details.dutyStartTime} to ${letter.details.dutyEndTime} with a minimum of ${letter.details.minimumWeeklyHours} hours per week. Additional hours may be required based on responsibilities.`,
    ],
    [
      "Attendance Policy",
      "Policies regarding attendance, late coming, and early leaving will be applicable as per company rules, which will be shared at the time of joining.",
    ],
    [
      "Leave & Transfer Policy",
      "You will be entitled to 18 days of paid leave per annum post confirmation. You may be transferred to any department or location as per company needs.",
    ],
    [
      "Confidentiality",
      "You are expected to maintain the confidentiality of any company-related information shared during the course of your employment.",
    ],
    [
      "Company Property",
      "Any company property entrusted to you must be returned in good condition upon separation. Failure to do so may result in recovery from final dues.",
    ],
    [
      "Termination",
      "Your employment may be terminated due to misconduct, unauthorized absence, violation of company policies, or non-performance. Salary will be paid up to your last working day. In such cases, bonus or leave encashment may not be applicable.",
    ],
    [
      "Notice Period",
      "You are required to serve a notice period of one month upon resignation. Failure to do so may result in forfeiture of leave encashment, bonus, or any pending benefits.",
    ],
    [
      "Applicability of Company Policy",
      "Your employment will be governed by company policies and rules, which may be amended from time to time.",
    ],
  ] as const
  y = 187
  for (const [index, [heading, body]] of clauses.entries()) {
    text(`${index + 1}.`, y, { x: LETTER_LEFT + 1, width: 14 })
    doc
      .font("medium")
      .fontSize(10)
      .fillColor("#000000")
      .text(`${heading}: `, LETTER_LEFT + 17, y, {
        width: LETTER_BODY_WIDTH - 17,
        lineGap: 1.1,
        continued: true,
      })
    doc.font("regular").text(body)
    y = doc.y + 1
  }
  y = text(
    "Please confirm your acceptance by signing and returning a copy of this letter.",
    y + 11,
    { bold: true }
  )
  const ruleY = Math.max(601, y + 15)
  if (ruleY > 642)
    throw new Error(
      "Appointment letter content exceeds the sample format. Shorten the appointment details."
    )
  doc
    .moveTo(LETTER_LEFT, ruleY)
    .lineTo(LETTER_LEFT + LETTER_BODY_WIDTH, ruleY)
    .lineWidth(1)
    .strokeColor("#000000")
    .stroke()
  text("Acknowledged and Accepted by:", ruleY + 19, { bold: true })
  text(letter.identity.employeeName, Math.max(681, ruleY + 55), { bold: true })
  text("Date: ____________", Math.max(702, ruleY + 76), { bold: true })
  return finish()
}

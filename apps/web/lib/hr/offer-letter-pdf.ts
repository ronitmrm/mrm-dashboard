import type { PreparedEmploymentLetter } from "@workspace/db"
import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"

import {
  createEmploymentLetterPdf,
  LETTER_BODY_WIDTH,
  LETTER_GREEN,
  LETTER_LEFT,
} from "./employment-letter-layout"

type Offer = Extract<PreparedEmploymentLetter, { type: "offer" }>

export async function buildOfferLetterPdf(letter: Offer) {
  const { doc, addPage, finish } = await createEmploymentLetterPdf(
    "offer",
    letter.identity.employeeName
  )
  const lineHeight = 13.5
  let y = 0

  function text(
    value: string,
    options: {
      font?: "regular" | "medium" | "title"
      size?: number
      x?: number
      width?: number
      gap?: number
      align?: "left" | "center" | "right"
      color?: string
    } = {}
  ) {
    const size = options.size ?? 10
    doc.font(options.font ?? "regular").fontSize(size)
    const lineGap = lineHeight - doc.currentLineHeight()
    doc
      .fillColor(options.color ?? "#000000")
      .text(value, options.x ?? LETTER_LEFT, y, {
        width: options.width ?? LETTER_BODY_WIDTH,
        lineGap,
        align: options.align ?? "left",
      })
    y = doc.y + (options.gap ?? 0)
  }

  addPage()
  y = 130.85
  text("OFFER LETTER", {
    font: "title",
    size: 25,
    align: "center",
    color: LETTER_GREEN,
  })
  y = 173.4
  text(`Ref: ${letter.reference}`, {
    font: "medium",
    size: 14,
    align: "center",
    color: LETTER_GREEN,
  })
  y = 201.25
  text(formatCalendarDate(letter.issuedOn), { font: "medium" })
  y = 230.3
  text("To,")
  y = 247.75
  text(letter.identity.employeeName, { font: "medium", gap: 4 })
  text(letter.details.postalAddress)

  // Address and combined-post names can wrap; preserve the sample's spacing
  // while leaving the signing area clear for longer employee details.
  y = Math.max(338.95, y + 33)
  text(`Subject: Offer of Employment - ${letter.identity.designation}`, {
    font: "medium",
    gap: 14,
  })
  text(`Dear ${letter.identity.employeeName},`, { gap: 13.5 })
  const introduction = [
    {
      value:
        "With reference to your application and the subsequent interviews, we are pleased to offer you the position of ",
      font: "regular",
    },
    { value: letter.identity.designation, font: "medium" },
    { value: " at ", font: "regular" },
    {
      value: "Mayank Raw Mint Pvt. Ltd.",
      font: "medium",
      color: LETTER_GREEN,
    },
    { value: " Your joining date will be ", font: "regular" },
    {
      value: `${formatCalendarDate(letter.identity.joiningDate)}.`,
      font: "medium",
    },
  ] as const
  for (const [index, run] of introduction.entries()) {
    doc
      .font(run.font)
      .fontSize(10)
      .fillColor("color" in run ? run.color : "#000000")
    const options = {
      width: LETTER_BODY_WIDTH,
      lineGap: lineHeight - doc.currentLineHeight(),
      continued: index < introduction.length - 1,
    }
    if (index === 0) doc.text(run.value, LETTER_LEFT, y, options)
    else doc.text(run.value, options)
  }
  y = doc.y + 13.5
  text(
    "Please bring xerox copies of the following documents on the day of joining:",
    {
      gap: 13.5,
    }
  )
  for (const [index, item] of [
    "Adhar Card",
    "Pan Card",
    "Two Passport Size Photographs",
    "Cancelled Cheque or Bank Passbook",
    "Educational Qualification Certificates",
    "Previous Employment Experience Letter (if applicable)",
  ].entries()) {
    text(`${index + 1}. ${item}`, {
      x: 67,
      width: LETTER_BODY_WIDTH - (67 - LETTER_LEFT),
    })
  }
  y += 13.5
  text("Please turn over for detailed terms and conditions.")
  text(
    "We look forward to welcoming you and wish you a successful association with us.",
    {
      gap: 13.5,
    }
  )
  text("Warm Regards,", { font: "medium" })
  y = Math.max(678.95, y + 25)
  text(letter.details.signatoryName, { font: "medium", gap: 6.75 })
  text(letter.details.signatoryDesignation, { font: "medium" })
  if (y > 729) {
    throw new Error(
      "Offer letter content exceeds the two-page format. Shorten the address or appointment details."
    )
  }

  addPage()
  y = 120
  text("Continuation of Offer Letter", { font: "medium", gap: 7.5 })
  text(`Ref: ${letter.reference}`, { font: "medium", gap: 16 })
  const amount = (value: number) =>
    `Rs. ${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
  const clauses = [
    [
      "Compensation",
      `You will receive a consolidated salary of ${amount(letter.salary)} per ${letter.details.payPeriod} during probation, subject to applicable statutory deductions. After probation, your salary range will be ${amount(letter.details.salaryAfterProbationMinimum)} to ${amount(letter.details.salaryAfterProbationMaximum)} per ${letter.details.payPeriod}.`,
    ],
    [
      "Probation",
      `You will be on probation for a period of ${letter.details.probationLength} ${letter.details.probationUnit} from the date of joining. Upon satisfactory completion, your employment will be confirmed in writing.`,
    ],
    [
      "Termination During Probation",
      "During the probation period, either party may terminate the employment without notice. You will be entitled to salary up to your last working day. The company reserves the right to withhold dues in case of exit without proper intimation or clearance.",
    ],
    [
      "Statutory Deductions",
      "All applicable statutory deductions will be made in accordance with prevailing laws and regulations.",
    ],
    [
      "Working Days and Hours",
      `Your working days will be Saturday through Thursday. Duty hours will be from ${letter.details.dutyStartTime} to ${letter.details.dutyEndTime}, with a minimum working requirement as per applicable labour laws. You may be required to work additional hours based on business needs.`,
    ],
    [
      "Attendance Policy",
      "You will be governed by the company’s attendance and punctuality policies, which will be communicated at the time of joining.",
    ],
    [
      "Leave and Transfer Policy",
      "No paid leave will be applicable during the probation period unless otherwise stated. Leave entitlements will be applicable post confirmation. You may be assigned or transferred to different roles, departments, or locations based on organisational requirements.",
    ],
    [
      "Confidentiality",
      "You are required to maintain strict confidentiality of all company-related information during and after your employment.",
    ],
    [
      "Acceptance of Offer",
      "Please confirm your acceptance of this offer by signing and returning a copy of this letter.\nWe look forward to welcoming you and wish you a successful association with us.",
    ],
  ] as const
  for (const [index, [heading, body]] of clauses.entries()) {
    text(`${index + 1}.`, {
      font: "medium",
      x: 75.5,
      width: 9.1,
      align: "right",
    })
    y -= lineHeight
    text(heading, { font: "medium", x: 90, width: 446 })
    text(body, { x: 90, width: 446, gap: 7.75 })
  }
  text("Acknowledged and Accepted by:", { font: "medium" })
  if (y > 697) {
    throw new Error(
      "Offer letter content exceeds the two-page format. Shorten the probation details."
    )
  }
  y = Math.max(704.25, y + 20)
  const acceptanceY = y
  text(letter.identity.employeeName, { font: "medium", width: 320 })
  y = acceptanceY
  text("Date: ____________________", {
    font: "medium",
    x: 370,
    width: 166,
  })
  return finish()
}

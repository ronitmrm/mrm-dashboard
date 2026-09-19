import { readFile } from "node:fs/promises"
import path from "node:path"
import fontkit from "@pdf-lib/fontkit"
import type { PreparedEmploymentLetter } from "@workspace/db"
import { PDFDocument, rgb } from "pdf-lib"

type Offer = Extract<PreparedEmploymentLetter, { type: "offer" }>

const GREEN = rgb(0, 0.42, 0.29)
const BLACK = rgb(0, 0, 0)
const WIDTH = 595.28
const HEIGHT = 841.89

function date(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const suffix =
    day! >= 11 && day! <= 13
      ? "th"
      : ({ 1: "st", 2: "nd", 3: "rd" }[day! % 10] ?? "th")
  const name = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day)))
  return `${day}${suffix} ${name} ${year}`
}

export async function buildOfferLetterPdf(letter: Offer) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const asset = (name: string) =>
    readFile(path.join(process.cwd(), "lib", name))
  const [regularBytes, boldBytes, headerBytes, footerBytes] = await Promise.all(
    [
      asset("pricing/assets/Outfit-Regular.ttf"),
      asset("pricing/assets/Outfit-Medium.ttf"),
      asset("hr/assets/offer-header.png"),
      asset("hr/assets/offer-footer.png"),
    ]
  )
  const regular = await pdf.embedFont(regularBytes, { subset: true })
  const bold = await pdf.embedFont(boldBytes, { subset: true })
  const header = await pdf.embedPng(headerBytes)
  const footer = await pdf.embedPng(footerBytes)
  pdf.setTitle(`${letter.identity.employeeName} Offer Letter`)
  pdf.setSubject("offer employment letter")
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")

  let page = pdf.addPage([WIDTH, HEIGHT])
  let y = 625
  function footerOnPage() {
    page.drawImage(footer, {
      x: WIDTH * 0.065,
      y: HEIGHT * 0.019,
      width: WIDTH * 0.88,
      height: HEIGHT * 0.106,
    })
  }
  function text(
    value: string,
    options: {
      bold?: boolean
      size?: number
      x?: number
      gap?: number
      center?: boolean
      green?: boolean
    } = {}
  ) {
    const font = options.bold ? bold : regular
    const size = options.size ?? 10
    const x = options.x ?? 59.5
    const maxWidth = WIDTH - 59.5 - x
    const lines: string[] = []
    for (const paragraph of value.split(/\r?\n/)) {
      let current = ""
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = current ? `${current} ${word}` : word
        if (current && font.widthOfTextAtSize(next, size) > maxWidth) {
          lines.push(current)
          current = word
        } else current = next
      }
      lines.push(current)
    }
    for (const content of lines) {
      if (y < 112)
        throw new Error(
          "Offer letter content exceeds the two-page format. Shorten the address or appointment details."
        )
      page.drawText(content, {
        x: options.center
          ? (WIDTH - font.widthOfTextAtSize(content, size)) / 2
          : x,
        y,
        font,
        size,
        color: options.green ? GREEN : BLACK,
      })
      y -= 13.5
    }
    y -= options.gap ?? 0
  }
  footerOnPage()
  page.drawImage(header, {
    x: WIDTH * 0.065,
    y: HEIGHT * 0.89,
    width: WIDTH * 0.875,
    height: HEIGHT * 0.082,
  })
  y = 680
  text("OFFER LETTER", {
    bold: true,
    size: 25,
    center: true,
    green: true,
    gap: 20,
  })
  text(`Ref: ${letter.reference}`, {
    bold: true,
    size: 14,
    center: true,
    green: true,
    gap: 11,
  })
  text(date(letter.issuedOn), { bold: true, gap: 14 })
  text("To,", { gap: 4 })
  text(letter.identity.employeeName, { bold: true, gap: 4 })
  text(letter.details.postalAddress, { gap: 25 })
  text(`Subject: Offer of Employment - ${letter.identity.designation}`, {
    bold: true,
    gap: 14,
  })
  text(`Dear ${letter.identity.employeeName},`, { gap: 14 })
  text(
    `With reference to your application and the subsequent interviews, we are pleased to offer you the position of ${letter.identity.designation} at Mayank Raw Mint Pvt. Ltd. Your joining date will be ${date(letter.identity.joiningDate)}.`,
    { gap: 14 }
  )
  text(
    "Please bring xerox copies of the following documents on the day of joining:",
    { gap: 14 }
  )
  for (const [index, item] of [
    "Adhar Card",
    "Pan Card",
    "Two Passport Size Photographs",
    "Cancelled Cheque or Bank Passbook",
    "Educational Qualification Certificates",
    "Previous Employment Experience Letter (if applicable)",
  ].entries()) {
    text(`${index + 1}. ${item}`, { x: 67 })
  }
  y -= 14
  text("Please turn over for detailed terms and conditions.")
  text(
    "We look forward to welcoming you and wish you a successful association with us.",
    { gap: 14 }
  )
  text("Warm Regards,", { bold: true, gap: 48 })
  text(letter.details.signatoryName, { bold: true, gap: 6 })
  text(letter.details.signatoryDesignation)

  page = pdf.addPage([WIDTH, HEIGHT])
  footerOnPage()
  y = 817
  text("Continuation of Offer Letter", { bold: true, gap: 7 })
  text(`Ref: ${letter.reference}`, { bold: true, gap: 16 })
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
    text(`${index + 1}.  ${heading}`, { bold: true, x: 77 })
    text(body, { x: 90, gap: 10 })
  }
  text("Acknowledged and Accepted by:", { bold: true, gap: 28 })
  const acceptanceY = y
  text(letter.identity.employeeName, { bold: true })
  y = acceptanceY
  text("Date: ____________________", { bold: true, x: 370 })
  return pdf.save()
}

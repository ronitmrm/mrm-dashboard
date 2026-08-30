import type { PreparedEmploymentLetter } from "@workspace/db"
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib"

const A4: [number, number] = [595.28, 841.89]
const LEFT = 48
const WIDTH = A4[0] - LEFT * 2
const GREEN = rgb(0, 0.42, 0.29)
const INK = rgb(0.08, 0.1, 0.09)
const MUTED = rgb(0.32, 0.36, 0.34)

function safe(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^ -~]/g, "")
}

function wrapped(value: unknown, font: PDFFont, size: number, width: number) {
  const paragraphs = safe(value).split(/\r?\n/)
  const lines: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      lines.push("")
      continue
    }
    let line = ""
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (!line || font.widthOfTextAtSize(candidate, size) <= width)
        line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const suffix =
    day! % 10 === 1 && day !== 11
      ? "st"
      : day! % 10 === 2 && day !== 12
        ? "nd"
        : day! % 10 === 3 && day !== 13
          ? "rd"
          : "th"
  const monthName = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, month! - 1, day)))
  return `${day}${suffix} ${monthName} ${year}`
}

function money(value: number) {
  return `Rs. ${value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}/-`
}

type Drawing = {
  bold: PDFFont
  page: PDFPage
  regular: PDFFont
  y: number
}

function drawHeader(drawing: Drawing) {
  const { bold, page } = drawing
  page.drawRectangle({ color: GREEN, height: 18, width: 28, x: LEFT, y: 785 })
  page.drawRectangle({ color: GREEN, height: 5, width: 28, x: LEFT, y: 776 })
  page.drawText("MAYANK", { color: GREEN, font: bold, size: 12, x: 82, y: 791 })
  page.drawText("RAW MINT.", {
    color: GREEN,
    font: bold,
    size: 12,
    x: 82,
    y: 777,
  })
  page.drawLine({
    color: GREEN,
    end: { x: LEFT + WIDTH, y: 763 },
    start: { x: LEFT, y: 763 },
    thickness: 1,
  })
}

function drawFooter(drawing: Drawing) {
  const { bold, page, regular } = drawing
  page.drawLine({
    color: GREEN,
    end: { x: LEFT + WIDTH, y: 75 },
    start: { x: LEFT, y: 75 },
    thickness: 0.8,
  })
  page.drawText("MAYANK RAW MINT PVT. LTD.", {
    color: GREEN,
    font: bold,
    size: 7.5,
    x: LEFT,
    y: 58,
  })
  page.drawText("Plot no. 10 to 15, B/h Murlidhar Tractor,", {
    color: MUTED,
    font: regular,
    size: 6.7,
    x: LEFT,
    y: 46,
  })
  page.drawText("Hapa Industrial Area, Jamnagar, Gujarat 361120, India", {
    color: MUTED,
    font: regular,
    size: 6.7,
    x: LEFT,
    y: 36,
  })
  page.drawText("+91 96245 33303  |  +91 78787 87819", {
    color: MUTED,
    font: regular,
    size: 6.7,
    x: 350,
    y: 58,
  })
  page.drawText("info@mayankrawmint.com  |  www.mayankrawmint.com", {
    color: MUTED,
    font: regular,
    size: 6.7,
    x: 315,
    y: 46,
  })
  page.drawText("CIN: U27109GJ2002PTC041469", {
    color: MUTED,
    font: regular,
    size: 6.7,
    x: 378,
    y: 36,
  })
}

function drawTitle(drawing: Drawing, title: string) {
  const width = drawing.bold.widthOfTextAtSize(title, 15)
  drawing.page.drawText(title, {
    color: INK,
    font: drawing.bold,
    size: 15,
    x: (A4[0] - width) / 2,
    y: drawing.y,
  })
  drawing.y -= 30
}

function line(
  drawing: Drawing,
  value: unknown,
  options: { bold?: boolean; gap?: number; indent?: number; size?: number } = {}
) {
  const font = options.bold ? drawing.bold : drawing.regular
  const size = options.size ?? 10
  const indent = options.indent ?? 0
  const lines = wrapped(value, font, size, WIDTH - indent)
  for (const text of lines) {
    drawing.page.drawText(text || " ", {
      color: INK,
      font,
      size,
      x: LEFT + indent,
      y: drawing.y,
    })
    drawing.y -= size + 4
  }
  drawing.y -= options.gap ?? 4
}

function clause(
  drawing: Drawing,
  number: number,
  heading: string,
  body: string
) {
  line(drawing, `${number}. ${heading}`, { bold: true, gap: 1, size: 9.3 })
  line(drawing, body, { gap: 6, indent: 12, size: 8.8 })
}

function page(pdf: PDFDocument, regular: PDFFont, bold: PDFFont) {
  const drawing = { bold, page: pdf.addPage(A4), regular, y: 730 }
  drawHeader(drawing)
  drawFooter(drawing)
  return drawing
}

function sign(drawing: Drawing, name: string, designation: string) {
  line(drawing, "Warm Regards,", { gap: 18 })
  line(drawing, name, { bold: true, gap: 0 })
  line(drawing, designation, { gap: 0 })
}

function pronouns(value: "he-him" | "she-her" | "they-them") {
  if (value === "he-him")
    return {
      object: "him",
      possessive: "his",
      subject: "He",
      subjectLower: "he",
    }
  if (value === "she-her")
    return {
      object: "her",
      possessive: "her",
      subject: "She",
      subjectLower: "she",
    }
  return {
    object: "them",
    possessive: "their",
    subject: "They",
    subjectLower: "they",
  }
}

export async function buildEmploymentLetterPdf(
  letter: PreparedEmploymentLetter
) {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const title =
    letter.type === "offer"
      ? "Offer Letter"
      : letter.type === "appointment"
        ? "Appointment Letter"
        : "Certificate of Experience"
  pdf.setTitle(`${letter.identity.employeeName} ${title}`)
  pdf.setSubject(`${letter.type} employment letter`)
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")

  if (letter.type === "offer") {
    const first = page(pdf, regular, bold)
    drawTitle(first, "OFFER LETTER")
    line(first, `Ref: ${letter.reference}`, { bold: true, gap: 2 })
    line(first, dateLabel(letter.issuedOn), { gap: 14 })
    line(
      first,
      `To,\n${letter.identity.employeeName}\n${letter.details.postalAddress}`,
      { gap: 14 }
    )
    line(
      first,
      `Subject: Offer of Employment - ${letter.identity.designation}`,
      { bold: true, gap: 14 }
    )
    line(first, `Dear ${letter.identity.employeeName},`, { gap: 10 })
    line(
      first,
      `With reference to your application and the subsequent interviews, we are pleased to offer you the position of ${letter.identity.designation} in ${letter.identity.department} at Mayank Raw Mint Pvt. Ltd. Your joining date will be ${dateLabel(letter.identity.joiningDate)}.`,
      { gap: 10 }
    )
    line(
      first,
      "Please bring xerox copies of the following documents on the day of joining:",
      { gap: 4 }
    )
    ;[
      "Aadhaar Card",
      "PAN Card",
      "Two Passport Size Photographs",
      "Cancelled Cheque or Bank Passbook",
      "Educational Qualification Certificates",
      "Previous Employment Experience Letter (if applicable)",
    ].forEach((item, index) =>
      line(first, `${index + 1}. ${item}`, { gap: 0, indent: 10, size: 9.2 })
    )
    line(first, "Please turn over for detailed terms and conditions.", {
      gap: 8,
    })
    line(
      first,
      "We look forward to welcoming you and wish you a successful association with us.",
      { gap: 8 }
    )
    sign(
      first,
      letter.details.signatoryName,
      letter.details.signatoryDesignation
    )

    const second = page(pdf, regular, bold)
    drawTitle(second, "Continuation of Offer Letter")
    line(second, `Ref: ${letter.reference}`, { bold: true, gap: 12 })
    clause(
      second,
      1,
      "Compensation",
      `You will receive a consolidated salary of ${money(letter.salary)} per ${letter.details.payPeriod}, subject to applicable statutory deductions.`
    )
    clause(
      second,
      2,
      "Probation",
      `You will be on probation for a period of ${letter.details.probationLength} ${letter.details.probationUnit} from the date of joining. Upon satisfactory completion, your employment will be confirmed in writing.`
    )
    clause(
      second,
      3,
      "Termination During Probation",
      "During probation, either party may terminate employment without notice. Salary is payable up to the last working day, subject to proper intimation and clearance."
    )
    clause(
      second,
      4,
      "Statutory Deductions",
      "All applicable statutory deductions will be made in accordance with prevailing laws and regulations."
    )
    clause(
      second,
      5,
      "Working Days and Hours",
      "Working days are Saturday through Thursday. Duty hours are 08:30 to 20:00, subject to applicable labour laws and additional business requirements."
    )
    clause(
      second,
      6,
      "Attendance Policy",
      "Company attendance and punctuality policies communicated at joining will apply."
    )
    clause(
      second,
      7,
      "Leave and Transfer Policy",
      "No paid leave applies during probation unless stated otherwise. Post-confirmation leave and transfers follow company policy."
    )
    clause(
      second,
      8,
      "Confidentiality",
      "You must maintain strict confidentiality of company information during and after employment."
    )
    clause(
      second,
      9,
      "Acceptance of Offer",
      "Please confirm acceptance by signing and returning a copy of this letter."
    )
    line(
      second,
      `Acknowledged and Accepted by:\n${letter.identity.employeeName}\nDate: ____________________`,
      { gap: 0 }
    )
  } else if (letter.type === "appointment") {
    const first = page(pdf, regular, bold)
    drawTitle(first, "APPOINTMENT LETTER")
    line(first, `Ref: ${letter.reference}`, { bold: true, gap: 2 })
    line(first, dateLabel(letter.issuedOn), { gap: 14 })
    line(first, `To,\n${letter.identity.employeeName}`, { gap: 14 })
    line(
      first,
      `Subject: Appointment for the Position of ${letter.identity.designation}`,
      { bold: true, gap: 14 }
    )
    line(first, `Dear ${letter.identity.employeeName},`, { gap: 10 })
    line(
      first,
      `We are pleased to confirm your appointment as ${letter.identity.designation} in ${letter.identity.department} at Mayank Raw Mint Pvt. Ltd. following the successful completion of your probation period on ${dateLabel(letter.details.probationCompletedOn)}.`,
      { gap: 12 }
    )
    line(
      first,
      "Please turn over to find the detailed terms and conditions of your employment.",
      { gap: 12 }
    )
    line(
      first,
      "We look forward to your continued contribution and wish you a successful journey with us.",
      { gap: 12 }
    )
    sign(
      first,
      letter.details.signatoryName,
      letter.details.signatoryDesignation
    )

    const second = page(pdf, regular, bold)
    drawTitle(second, "Continuation of Appointment Letter")
    line(second, `Ref: ${letter.reference}`, { bold: true, gap: 12 })
    clause(
      second,
      1,
      "Commencement of Employment",
      `Your confirmed appointment is effective from ${dateLabel(letter.details.confirmationEffectiveDate)} after successful completion of probation.`
    )
    clause(
      second,
      2,
      "Designation & Reporting",
      `Your designation is ${letter.identity.designation} in ${letter.identity.department}, and you will report to ${letter.details.reportsTo}.`
    )
    clause(
      second,
      3,
      "Salary",
      `Your gross salary will be ${money(letter.details.grossMonthlySalary)} per month, subject to statutory deductions and company policy.`
    )
    clause(
      second,
      4,
      "Place of Work",
      `You will be based at ${letter.details.workLocation}, but may be assigned to another company location as business requires.`
    )
    clause(
      second,
      5,
      "Working Days & Hours",
      "Working days are Saturday through Thursday. Duty hours and additional responsibilities follow company policy and applicable law."
    )
    clause(
      second,
      6,
      "Attendance Policy",
      "Attendance, late-coming, and early-leaving rules will apply as communicated by the company."
    )
    clause(
      second,
      7,
      "Leave & Transfer Policy",
      "You are entitled to 18 days of paid leave per annum after confirmation and may be transferred as company needs require."
    )
    clause(
      second,
      8,
      "Confidentiality",
      "You must maintain confidentiality of company information during and after employment."
    )
    clause(
      second,
      9,
      "Company Property",
      "Company property entrusted to you must be returned in good condition upon separation."
    )
    clause(
      second,
      10,
      "Termination",
      "Employment may be terminated for misconduct, unauthorized absence, policy violation, or non-performance, subject to applicable law."
    )
    clause(
      second,
      11,
      "Notice Period",
      "You are required to serve one month's notice upon resignation unless the company agrees otherwise in writing."
    )
    clause(
      second,
      12,
      "Applicability of Company Policy",
      "Your employment is governed by company policies as amended from time to time."
    )
    line(
      second,
      `Acknowledged and Accepted by:\n${letter.identity.employeeName}\nDate: ____________________`,
      { gap: 0 }
    )
  } else {
    const drawing = page(pdf, regular, bold)
    drawTitle(drawing, "CERTIFICATE OF EXPERIENCE")
    line(drawing, "To Whomsoever It May Concern", { bold: true, gap: 12 })
    line(drawing, dateLabel(letter.issuedOn), { gap: 18 })
    const p = pronouns(letter.details.pronouns)
    line(
      drawing,
      `This is to certify that ${letter.details.title} ${letter.identity.employeeName} (Employee Code: ${letter.identity.employeeCode}) was employed with Mayank Raw Mint Pvt. Ltd. as ${letter.identity.designation} in ${letter.identity.department} at our ${letter.details.workLocation} from ${dateLabel(letter.identity.joiningDate)} to ${dateLabel(letter.identity.lastWorkingDate!)}.`,
      { gap: 12 }
    )
    line(
      drawing,
      `During ${p.possessive} tenure with the organisation, ${p.subjectLower} demonstrated sincerity, dedication, and professionalism in the discharge of ${p.possessive} duties. ${p.subject} was responsible for ${letter.details.keyResponsibilities}.`,
      { gap: 12 }
    )
    line(
      drawing,
      `${p.subject} maintained a positive attitude in the workplace and worked effectively with colleagues and management. We found ${p.object} to be reliable, disciplined, and well-versed in ${p.possessive} area of responsibility.`,
      { gap: 12 }
    )
    line(
      drawing,
      `We wish ${p.object} all the best in ${p.possessive} future endeavours.`,
      { gap: 18 }
    )
    sign(
      drawing,
      letter.details.signatoryName,
      letter.details.signatoryDesignation
    )
  }

  return pdf.save()
}

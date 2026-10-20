import { formatCalendarDate } from "@workspace/ui/lib/calendar-date"
import { buildOfferLetterPdf } from "./offer-letter-pdf"
import { buildAppointmentLetterPdf } from "./appointment-letter-pdf"
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
    .replace(/[^ -~\r\n]/g, "")
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
  return formatCalendarDate(value)
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
  for (const [text, y] of [
    ["+91 96245 33303  |  +91 78787 87819", 58],
    ["info@mayankrawmint.com  |  www.mayankrawmint.com", 46],
    ["CIN: U27109GJ2002PTC041469", 36],
  ] as const) {
    // drawText uses individual glyph advances without kerning.
    const width = [...text].reduce(
      (total, character) => total + regular.widthOfTextAtSize(character, 6.7),
      0
    )
    page.drawText(text, {
      color: MUTED,
      font: regular,
      size: 6.7,
      x: LEFT + WIDTH - width,
      y,
    })
  }
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
  if (letter.type === "offer") return buildOfferLetterPdf(letter)
  if (letter.type === "appointment") return buildAppointmentLetterPdf(letter)

  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  pdf.setTitle(`${letter.identity.employeeName} Certificate of Experience`)
  pdf.setSubject(`${letter.type} employment letter`)
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")

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

  return pdf.save()
}

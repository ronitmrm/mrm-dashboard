import PDFDocument from "pdfkit"
import type { RecruitmentJobPostDocument } from "@workspace/db"

import {
  drawBrandingText,
  layoutBrandingText,
  registerPdfKitBrandFonts,
  type BrandingTextSpan,
} from "../branding/pdfkit-fonts"
import { A4, drawLogo, GREEN, MARGIN } from "../branding/pdfkit-layout"

const WIDTH = A4[0] - MARGIN * 2
const BOTTOM = A4[1] - 70
const UNSPECIFIED = "Not specified"

function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : UNSPECIFIED
}

function salary(job: RecruitmentJobPostDocument) {
  const money = (value: string) =>
    `Rs. ${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
  if (job.minimumSalary !== null && job.maximumSalary !== null)
    return `${money(job.minimumSalary)} - ${money(job.maximumSalary)}`
  if (job.minimumSalary !== null) return `From ${money(job.minimumSalary)}`
  if (job.maximumSalary !== null) return `Up to ${money(job.maximumSalary)}`
  return UNSPECIFIED
}

export async function buildJobPostPdf(job: RecruitmentJobPostDocument) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    info: {
      Title: `${job.jobNumber} - ${job.title}`,
      Author: "Mayank Raw Mint Pvt. Ltd.",
      Creator: "MRM Dashboard",
      Subject: "Job Post",
    },
  })
  const chunks: Buffer[] = []
  const completion = new Promise<Buffer | Error>((resolve) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.once("end", () => resolve(Buffer.concat(chunks)))
    doc.once("error", (error: Error) => resolve(error))
  })
  try {
    const fonts = await registerPdfKitBrandFonts(doc)
    const ctx = { doc, fonts }
    let y = 0
    let page = 0
    const layout = (value: string | BrandingTextSpan[], size = 10.5) =>
      layoutBrandingText(
        doc,
        fonts,
        value,
        {
          language: "en",
          weight: 400,
          sizePt: size,
          lineHeight: 1.45,
        },
        WIDTH
      )

    function newPage() {
      doc.addPage({ size: [...A4], margin: 0 })
      page++
      drawLogo(ctx, MARGIN, 34, 32)
      drawBrandingText(
        doc,
        layout([{ text: "MAYANK RAW MINT PVT. LTD.", bold: true }], 14),
        MARGIN + 45,
        35,
        GREEN
      )
      drawBrandingText(doc, layout("Job Post", 10), MARGIN + 45, 57)
      doc
        .strokeColor(GREEN)
        .lineWidth(1)
        .moveTo(MARGIN, 85)
        .lineTo(A4[0] - MARGIN, 85)
        .stroke()
      doc
        .moveTo(MARGIN, BOTTOM + 17)
        .lineTo(A4[0] - MARGIN, BOTTOM + 17)
        .stroke()
      drawBrandingText(
        doc,
        layout("Mayank Raw Mint Pvt. Ltd.", 8),
        MARGIN,
        BOTTOM + 25,
        GREEN
      )
      drawBrandingText(
        doc,
        layout(`Page ${page}`, 8),
        MARGIN,
        BOTTOM + 25,
        GREEN,
        "right",
        WIDTH
      )
      y = 103
    }

    function text(
      value: string | BrandingTextSpan[],
      size = 10.5,
      color = "#050505"
    ) {
      const block = layout(value, size)
      for (const line of block.lines) {
        if (y + block.lineHeightPt > BOTTOM) newPage()
        drawBrandingText(doc, { ...block, lines: [line] }, MARGIN, y, color)
        y += block.lineHeightPt
      }
      y += 5
    }

    function section(title: string) {
      if (y + 55 > BOTTOM) newPage()
      y += 8
      text([{ text: title, bold: true }], 12, GREEN)
    }

    function detail(label: string, value: string | null) {
      text([
        { text: `${label}: `, bold: true },
        { text: value?.trim() || UNSPECIFIED },
      ])
    }

    newPage()
    text([{ text: job.title, bold: true }], 18)
    section("Opening Details")
    detail("Job Number", job.jobNumber)
    detail("Vacancy Code", job.vacancyCode)
    detail("Approved Post", job.postCode)
    detail("Job Description Template", job.templateCode)
    detail("Status", job.status)
    detail("Posted On", date(job.postDate))
    detail("Target Date", date(job.targetDate))
    detail("Number of Openings", String(job.employeeCount))
    section("Salary and Timings")
    detail("Salary Range (INR)", salary(job))
    detail("Shift Type", job.shiftType)
    detail("Shift Start Time (24-hour)", job.shiftStartTime)
    detail("Shift End Time (24-hour)", job.shiftEndTime)
    section("Candidate Requirements")
    detail("Gender", job.gender)
    detail("Education", job.education)
    detail("Experience", job.experience)
    section("Job Description")
    text(job.description?.trim() || UNSPECIFIED)
    doc.end()
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error(String(error)))
    await completion
    throw error
  }
  const result = await completion
  if (result instanceof Error) throw result
  return result
}

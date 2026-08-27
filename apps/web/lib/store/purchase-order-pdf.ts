import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib"

export type StorePurchaseOrderDocument = {
  lines: Array<{
    itemName: string
    orderedQuantity: string
    typeCode: string
    unit: string
    unitPrice: string
  }>
  orderDate: string
  orderNumber: string
  orderType?: "GOODS" | "REPAIR"
  remark?: string | null
  supplierAddress?: string | null
  supplierCode: string
  supplierGstNumber?: string | null
  supplierName: string
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 32
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const GREEN = rgb(0.02, 0.36, 0.22)
const DARK_GREEN = rgb(0.03, 0.2, 0.13)
const PALE_GREEN = rgb(0.92, 0.97, 0.94)
const INK = rgb(0.09, 0.13, 0.11)
const MUTED = rgb(0.36, 0.42, 0.39)
const BORDER = rgb(0.77, 0.82, 0.79)
const WHITE = rgb(1, 1, 1)

function ascii(value: unknown) {
  return String(value ?? "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
}

function number(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function amount(quantity: string, unitPrice: string) {
  return number(quantity) * number(unitPrice)
}

function money(value: number) {
  return `INR ${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`
}

function wrapText(
  value: unknown,
  font: PDFFont,
  size: number,
  maxWidth: number
) {
  const words = ascii(value).split(/\s+/).filter(Boolean)
  if (!words.length) return ["-"]
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawWrappedText(input: {
  color?: ReturnType<typeof rgb>
  font: PDFFont
  maxLines?: number
  page: PDFPage
  size: number
  value: unknown
  width: number
  x: number
  y: number
}) {
  const lines = wrapText(
    input.value,
    input.font,
    input.size,
    input.width
  ).slice(0, input.maxLines)
  lines.forEach((line, index) => {
    input.page.drawText(line, {
      color: input.color ?? INK,
      font: input.font,
      size: input.size,
      x: input.x,
      y: input.y - index * (input.size + 3),
    })
  })
  return lines.length
}

export async function buildStorePurchaseOrderPdf(
  document: StorePurchaseOrderDocument
) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${document.orderNumber} Purchase Order`)
  pdf.setSubject("Branded Store Purchase Order")
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = 0

  const drawBrandHeader = (continuation = false) => {
    page.drawRectangle({
      color: GREEN,
      height: 7,
      width: 32,
      x: MARGIN,
      y: 792,
    })
    page.drawRectangle({
      color: GREEN,
      height: 7,
      width: 26,
      x: MARGIN,
      y: 781,
    })
    page.drawRectangle({
      color: GREEN,
      height: 7,
      width: 20,
      x: MARGIN,
      y: 770,
    })
    page.drawText("MAYANK", {
      color: DARK_GREEN,
      font: bold,
      size: 13,
      x: 72,
      y: 786,
    })
    page.drawText("RAW MINT", {
      color: GREEN,
      font: bold,
      size: 13,
      x: 72,
      y: 771,
    })
    page.drawText(
      continuation ? "PURCHASE ORDER / CONTINUED" : "PURCHASE ORDER",
      {
        color: DARK_GREEN,
        font: bold,
        size: continuation ? 11 : 17,
        x: continuation ? 390 : 404,
        y: 783,
      }
    )
    page.drawText(ascii(document.orderNumber), {
      color: MUTED,
      font: regular,
      size: 8,
      x: 404,
      y: 768,
    })
    page.drawRectangle({
      color: GREEN,
      height: 30,
      width: CONTENT_WIDTH,
      x: MARGIN,
      y: 724,
    })
    page.drawText(
      document.orderType === "REPAIR"
        ? "REPAIR PURCHASE ORDER"
        : "STORE PURCHASE ORDER",
      { color: WHITE, font: bold, size: 14, x: MARGIN + 12, y: 734 }
    )
    y = 706
  }

  const drawOrderDetails = () => {
    const gap = 10
    const boxWidth = (CONTENT_WIDTH - gap) / 2
    const boxHeight = 88
    const boxY = y - boxHeight
    page.drawRectangle({
      borderColor: BORDER,
      borderWidth: 0.8,
      height: boxHeight,
      width: boxWidth,
      x: MARGIN,
      y: boxY,
    })
    page.drawRectangle({
      borderColor: BORDER,
      borderWidth: 0.8,
      height: boxHeight,
      width: boxWidth,
      x: MARGIN + boxWidth + gap,
      y: boxY,
    })
    page.drawRectangle({
      color: PALE_GREEN,
      height: 22,
      width: boxWidth,
      x: MARGIN,
      y: y - 22,
    })
    page.drawRectangle({
      color: PALE_GREEN,
      height: 22,
      width: boxWidth,
      x: MARGIN + boxWidth + gap,
      y: y - 22,
    })
    page.drawText("ORDER DETAILS", {
      color: DARK_GREEN,
      font: bold,
      size: 9,
      x: MARGIN + 10,
      y: y - 14,
    })
    page.drawText("SUPPLIER", {
      color: DARK_GREEN,
      font: bold,
      size: 9,
      x: MARGIN + boxWidth + gap + 10,
      y: y - 14,
    })
    const leftX = MARGIN + 10
    const rightX = MARGIN + boxWidth + gap + 10
    page.drawText(`PO Number: ${ascii(document.orderNumber)}`, {
      font: bold,
      size: 8.5,
      x: leftX,
      y: y - 39,
    })
    page.drawText(`Order Date: ${ascii(document.orderDate)}`, {
      font: regular,
      size: 8.5,
      x: leftX,
      y: y - 56,
    })
    page.drawText(
      `Order Type: ${document.orderType === "REPAIR" ? "Repair" : "Goods"}`,
      { font: regular, size: 8.5, x: leftX, y: y - 73 }
    )
    drawWrappedText({
      font: bold,
      maxLines: 2,
      page,
      size: 8.5,
      value: `${document.supplierCode} - ${document.supplierName}`,
      width: boxWidth - 20,
      x: rightX,
      y: y - 39,
    })
    const supplierLine = document.supplierGstNumber
      ? `GST: ${document.supplierGstNumber}`
      : document.supplierAddress || "Address not recorded"
    drawWrappedText({
      color: MUTED,
      font: regular,
      maxLines: 2,
      page,
      size: 8,
      value: supplierLine,
      width: boxWidth - 20,
      x: rightX,
      y: y - 69,
    })
    y = boxY - 18
  }

  const columns = [
    { key: "number", label: "#", width: 26 },
    { key: "code", label: "ASSET CODE", width: 67 },
    { key: "item", label: "DESCRIPTION", width: 170 },
    { key: "quantity", label: "QTY", width: 53 },
    { key: "unit", label: "UNIT", width: 45 },
    { key: "rate", label: "RATE", width: 78 },
    { key: "amount", label: "AMOUNT", width: 92 },
  ] as const

  const drawTableHeader = () => {
    page.drawRectangle({
      color: DARK_GREEN,
      height: 26,
      width: CONTENT_WIDTH,
      x: MARGIN,
      y: y - 26,
    })
    let x = MARGIN
    for (const column of columns) {
      page.drawText(column.label, {
        color: WHITE,
        font: bold,
        size: 7.3,
        x: x + 5,
        y: y - 17,
      })
      x += column.width
    }
    y -= 26
  }

  const newContinuationPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    drawBrandHeader(true)
    drawTableHeader()
  }

  drawBrandHeader()
  drawOrderDetails()
  drawTableHeader()

  document.lines.forEach((line, index) => {
    const descriptionLines = wrapText(
      line.itemName,
      regular,
      8,
      columns[2].width - 10
    )
    const rowHeight = Math.max(28, descriptionLines.length * 11 + 12)
    if (y - rowHeight < 145) newContinuationPage()
    page.drawRectangle({
      color: index % 2 === 0 ? WHITE : rgb(0.975, 0.985, 0.98),
      height: rowHeight,
      width: CONTENT_WIDTH,
      x: MARGIN,
      y: y - rowHeight,
    })
    page.drawLine({
      start: { x: MARGIN, y: y - rowHeight },
      end: { x: MARGIN + CONTENT_WIDTH, y: y - rowHeight },
      color: BORDER,
      thickness: 0.5,
    })
    const values = [
      String(index + 1),
      line.typeCode,
      line.itemName,
      line.orderedQuantity,
      line.unit,
      money(number(line.unitPrice)).replace("INR ", ""),
      money(amount(line.orderedQuantity, line.unitPrice)).replace("INR ", ""),
    ]
    let x = MARGIN
    values.forEach((value, columnIndex) => {
      drawWrappedText({
        font: columnIndex === 1 ? bold : regular,
        maxLines: columnIndex === 2 ? 4 : 2,
        page,
        size: 8,
        value,
        width: columns[columnIndex]!.width - 10,
        x: x + 5,
        y: y - 17,
      })
      x += columns[columnIndex]!.width
    })
    y -= rowHeight
  })

  const total = document.lines.reduce(
    (sum, line) => sum + amount(line.orderedQuantity, line.unitPrice),
    0
  )
  if (y < 250) {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    drawBrandHeader(true)
  }
  page.drawRectangle({
    color: PALE_GREEN,
    height: 38,
    width: 220,
    x: PAGE_WIDTH - MARGIN - 220,
    y: y - 38,
  })
  page.drawText("TOTAL", {
    color: DARK_GREEN,
    font: bold,
    size: 9,
    x: PAGE_WIDTH - MARGIN - 208,
    y: y - 24,
  })
  const totalText = money(total)
  page.drawText(totalText, {
    color: DARK_GREEN,
    font: bold,
    size: 11,
    x: PAGE_WIDTH - MARGIN - 12 - bold.widthOfTextAtSize(totalText, 11),
    y: y - 25,
  })
  y -= 58

  page.drawText("COMMERCIAL NOTES", {
    color: DARK_GREEN,
    font: bold,
    size: 9,
    x: MARGIN,
    y,
  })
  y -= 16
  const notes = [
    "Supply against the Asset Codes, quantities, and rates shown above.",
    "Supplier invoice and delivery documents must reference this PO number.",
    "Taxes, delivery, payment, and warranty terms remain as mutually approved.",
  ]
  if (document.remark) notes.push(`Remark: ${document.remark}`)
  notes.forEach((note, index) => {
    page.drawText(`${index + 1}.`, {
      color: GREEN,
      font: bold,
      size: 8,
      x: MARGIN,
      y,
    })
    const lines = drawWrappedText({
      font: regular,
      maxLines: 3,
      page,
      size: 8,
      value: note,
      width: 345,
      x: MARGIN + 14,
      y,
    })
    y -= lines * 11 + 4
  })

  page.drawLine({
    start: { x: 410, y: y + 8 },
    end: { x: PAGE_WIDTH - MARGIN, y: y + 8 },
    color: BORDER,
    thickness: 0.8,
  })
  page.drawText("For Mayank Raw Mint Private Limited", {
    color: DARK_GREEN,
    font: bold,
    size: 8,
    x: 389,
    y: y - 8,
  })
  page.drawText("Authorized Signatory", {
    color: MUTED,
    font: regular,
    size: 8,
    x: 430,
    y: y - 24,
  })

  const pages = pdf.getPages()
  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: MARGIN, y: 32 },
      end: { x: PAGE_WIDTH - MARGIN, y: 32 },
      color: GREEN,
      thickness: 1,
    })
    currentPage.drawText("Generated from the approved MRM Store workflow", {
      color: MUTED,
      font: regular,
      size: 7,
      x: MARGIN,
      y: 18,
    })
    const pageNumber = `Page ${index + 1} of ${pages.length}`
    currentPage.drawText(pageNumber, {
      color: MUTED,
      font: regular,
      size: 7,
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageNumber, 7),
      y: 18,
    })
  })

  return pdf.save()
}

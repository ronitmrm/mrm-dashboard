import { readFile } from "node:fs/promises"
import path from "node:path"
import PDFDocument from "pdfkit"

import { drawLogo, type PdfContext } from "../branding/pdfkit-layout"
import { registerPdfKitBrandFonts } from "../branding/pdfkit-fonts"

export type StorePurchaseOrderDocument = {
  lines: Array<{
    assetName: string
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
const MARGIN = 27
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const FOOTER_TOP = 781
const GREEN = "#006A49"
const BLACK = "#050505"
const CREAM = "#F7F7F2"
const BORDER = "#D7D9D5"
const WHITE = "#FFFFFF"

const COMPANY_NAME = "Mayank Raw Mint Pvt. Ltd."
const COMPANY_ADDRESS =
  "Plot no. 10 to 15, B/h Murlidhar Tractor, Hapa Industrial Area, Jamnagar, Gujarat, 361120, India"
const COMPANY_GSTIN = "24AAECM2045G1ZV"
const SIGNATURE_WIDTH = 160
const SIGNATURE_HEIGHT = 90
const SIGNATURE_TOP_GAP = 6

const columns = [
  { align: "center", label: "Sr. No.", width: 55 },
  { align: "center", label: "Delivery", width: 90 },
  { align: "left", label: "Item Description", width: 179 },
  { align: "center", label: "QTY", width: 72 },
  { align: "center", label: "Unit Price", width: 72 },
  { align: "center", label: "TOTAL", width: CONTENT_WIDTH - 468 },
] as const

const terms = [
  "GST as applicable.",
  "Acceptance of material is subject to approval of quality and quantity at our factory.",
  "Our order number must appear on the invoice, packing list, and correspondence.",
  "Material should be in accordance with the PO / quote.",
  "Freight and freight insurance are included in the above price.",
]

function cleanText(value: unknown) {
  return (
    String(value ?? "-")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .trim() || "-"
  )
}

function number(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function lineAmount(quantity: string, unitPrice: string) {
  return number(quantity) * number(unitPrice)
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  })
}

export function formatPurchaseOrderDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return cleanText(value)
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]
  const month = months[Number(match[2]) - 1]
  if (!month) return cleanText(value)
  return `${match[3]} ${month} ${match[1]}`
}

function underThousand(value: number) {
  const ones = [
    "",
    "ONE",
    "TWO",
    "THREE",
    "FOUR",
    "FIVE",
    "SIX",
    "SEVEN",
    "EIGHT",
    "NINE",
    "TEN",
    "ELEVEN",
    "TWELVE",
    "THIRTEEN",
    "FOURTEEN",
    "FIFTEEN",
    "SIXTEEN",
    "SEVENTEEN",
    "EIGHTEEN",
    "NINETEEN",
  ]
  const tens = [
    "",
    "",
    "TWENTY",
    "THIRTY",
    "FORTY",
    "FIFTY",
    "SIXTY",
    "SEVENTY",
    "EIGHTY",
    "NINETY",
  ]
  const parts: string[] = []
  let remaining = value
  if (remaining >= 100) {
    parts.push(`${ones[Math.floor(remaining / 100)]} HUNDRED`)
    remaining %= 100
  }
  if (remaining >= 20) {
    parts.push(tens[Math.floor(remaining / 10)]!)
    remaining %= 10
  }
  if (remaining) parts.push(ones[remaining]!)
  return parts.join(" ")
}

function integerInWords(value: number) {
  if (!value) return "ZERO"
  const parts: string[] = []
  let remaining = value
  for (const [size, label] of [
    [10_000_000, "CRORE"],
    [100_000, "LAKH"],
    [1_000, "THOUSAND"],
  ] as const) {
    if (remaining >= size) {
      parts.push(`${integerInWords(Math.floor(remaining / size))} ${label}`)
      remaining %= size
    }
  }
  if (remaining) parts.push(underThousand(remaining))
  return parts.join(" ")
}

export function purchaseOrderAmountInWords(value: number) {
  const paiseTotal = Math.max(0, Math.round(value * 100))
  const rupees = Math.floor(paiseTotal / 100)
  const paise = paiseTotal % 100
  return [
    integerInWords(rupees),
    paise ? `AND ${integerInWords(paise)} PAISE` : null,
  ]
    .filter(Boolean)
    .join(" ")
}

function collectPdfBytes(doc: PDFKit.PDFDocument) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.once("error", reject)
    doc.once("end", () => resolve(Buffer.concat(chunks)))
  })
}

let loadedSignatureStamp: Promise<Buffer> | undefined

function loadSignatureStamp() {
  return (loadedSignatureStamp ??= readFile(
    path.join(
      process.cwd(),
      "lib/branding/assets/authorized-signature-stamp.png"
    )
  ))
}

function brandTextWidth(doc: PDFKit.PDFDocument) {
  doc.font("Outfit-800").fontSize(31)
  const titleWidth = doc.widthOfString("MAYANK RAW MINT")
  doc.font("Outfit-400").fontSize(17)
  const taglineWidth = doc.widthOfString(
    "Precision Brass Fittings & Metal Components"
  )
  return Math.max(titleWidth, taglineWidth)
}

function drawFullBrandBlock(ctx: PdfContext, x: number) {
  const { doc } = ctx
  const logoWidth = 54
  const gap = 15
  const textX = x + logoWidth + gap
  drawLogo(ctx, x, 33, logoWidth)
  doc
    .font("Outfit-800")
    .fontSize(31)
    .fillColor(GREEN)
    .text("MAYANK RAW MINT", textX, 29, { lineBreak: false })
  doc
    .font("Outfit-400")
    .fontSize(17)
    .fillColor(GREEN)
    .text("Precision Brass Fittings & Metal Components", textX, 68, {
      lineBreak: false,
    })
}

function drawBrandHeader(ctx: PdfContext) {
  const { doc } = ctx
  const brandWidth = 54 + 15 + brandTextWidth(doc)
  drawFullBrandBlock(ctx, (PAGE_WIDTH - brandWidth) / 2)
  doc.rect(0, 121, PAGE_WIDTH, 64).fill(GREEN)
  doc
    .font("Outfit-800")
    .fontSize(31)
    .fillColor(WHITE)
    .text("PURCHASE ORDER", 0, 137, {
      align: "center",
      lineBreak: false,
      width: PAGE_WIDTH,
    })
}

function drawMetadata(
  doc: PDFKit.PDFDocument,
  document: StorePurchaseOrderDocument
) {
  const labels = [
    { label: "GST. No.", value: document.supplierGstNumber || "-", x: MARGIN },
    { label: "PO. No.", value: document.orderNumber, x: 226 },
    {
      label: "PO. DATE",
      value: formatPurchaseOrderDate(document.orderDate),
      x: 424,
    },
  ]
  for (const item of labels) {
    doc
      .font("Outfit-600")
      .fontSize(11.5)
      .fillColor(GREEN)
      .text(item.label, item.x, 202, { lineBreak: false })
    doc
      .font("Outfit-500")
      .fontSize(10.5)
      .fillColor(BLACK)
      .text(cleanText(item.value), item.x, 220, {
        lineBreak: false,
        width: item.x === MARGIN ? 170 : 145,
      })
  }

  doc
    .font("Outfit-600")
    .fontSize(11.5)
    .fillColor(GREEN)
    .text("Bill To", MARGIN, 249, { lineBreak: false })
  doc
    .font("Outfit-600")
    .fontSize(10.5)
    .fillColor(BLACK)
    .text(cleanText(document.supplierName), MARGIN, 267, {
      lineBreak: false,
      width: 270,
    })
  doc
    .font("Outfit-400")
    .fontSize(9.5)
    .fillColor(BLACK)
    .text(
      cleanText(document.supplierAddress || "Address not recorded"),
      MARGIN,
      285,
      {
        height: 42,
        lineGap: 2,
        width: 285,
      }
    )
}

function drawContinuationHeader(
  ctx: PdfContext,
  document: StorePurchaseOrderDocument
) {
  const { doc } = ctx
  drawFullBrandBlock(ctx, MARGIN)
  doc
    .font("Outfit-500")
    .fontSize(8.5)
    .fillColor(BLACK)
    .text(cleanText(document.orderNumber), 390, 7, {
      align: "right",
      lineBreak: false,
      width: PAGE_WIDTH - MARGIN - 390,
    })
  doc.rect(0, 96, PAGE_WIDTH, 36).fill(GREEN)
  doc
    .font("Outfit-700")
    .fontSize(17)
    .fillColor(WHITE)
    .text("PURCHASE ORDER / CONTINUED", 0, 105, {
      align: "center",
      lineBreak: false,
      width: PAGE_WIDTH,
    })
}

function drawItemsHeading(doc: PDFKit.PDFDocument, y: number) {
  doc
    .font("Outfit-600")
    .fontSize(11.5)
    .fillColor(GREEN)
    .text("Items", MARGIN, y, { lineBreak: false })
}

function drawTableHeader(doc: PDFKit.PDFDocument, y: number) {
  const height = 27
  let x = MARGIN
  doc.lineWidth(0.55)
  for (const column of columns) {
    doc.rect(x, y, column.width, height).fillAndStroke(CREAM, BORDER)
    doc
      .font("Outfit-600")
      .fontSize(9.2)
      .fillColor(BLACK)
      .text(column.label, x + 6, y + 8, {
        align: column.align,
        height: height - 12,
        lineBreak: false,
        width: column.width - 12,
      })
    x += column.width
  }
  return y + height
}

export function purchaseOrderItemDescription(
  line: StorePurchaseOrderDocument["lines"][number]
) {
  return `${cleanText(line.typeCode)} - ${cleanText(line.assetName)}`
}

function tableRowHeight(
  doc: PDFKit.PDFDocument,
  line: StorePurchaseOrderDocument["lines"][number]
) {
  doc.font("Outfit-400").fontSize(9.7)
  const descriptionHeight = doc.heightOfString(
    purchaseOrderItemDescription(line),
    {
      lineGap: 2,
      width: columns[2].width - 12,
    }
  )
  return Math.max(36, Math.min(96, descriptionHeight + 14))
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  line: StorePurchaseOrderDocument["lines"][number],
  index: number,
  y: number,
  height: number
) {
  const values = [
    String(index + 1),
    "MRMPL",
    purchaseOrderItemDescription(line),
    formatNumber(number(line.orderedQuantity), 3),
    formatNumber(number(line.unitPrice)),
    formatNumber(lineAmount(line.orderedQuantity, line.unitPrice)),
  ]
  let x = MARGIN
  doc.lineWidth(0.55)
  values.forEach((value, columnIndex) => {
    const column = columns[columnIndex]!
    doc.rect(x, y, column.width, height).fillAndStroke(WHITE, BORDER)
    doc.font("Outfit-400").fontSize(9.7)
    const textHeight = Math.min(
      height - 10,
      doc.heightOfString(value, {
        lineGap: 2,
        width: column.width - 12,
      })
    )
    doc
      .fillColor(BLACK)
      .text(value, x + 6, y + Math.max(5, (height - textHeight) / 2), {
        align: column.align,
        ellipsis: true,
        height: height - 10,
        lineGap: 2,
        width: column.width - 12,
      })
    x += column.width
  })
  return y + height
}

function totalAmount(document: StorePurchaseOrderDocument) {
  return document.lines.reduce(
    (sum, line) => sum + lineAmount(line.orderedQuantity, line.unitPrice),
    0
  )
}

function totalQuantity(document: StorePurchaseOrderDocument) {
  return document.lines.reduce(
    (sum, line) => sum + number(line.orderedQuantity),
    0
  )
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  document: StorePurchaseOrderDocument,
  y: number
) {
  const total = totalAmount(document)
  const firstWidth = columns[0].width + columns[1].width + columns[2].width
  const totalHeight = 27
  const amountHeight = 41
  const summaryCells = [
    { align: "center" as const, text: "TOTAL", width: firstWidth },
    {
      align: "center" as const,
      text: formatNumber(totalQuantity(document), 3),
      width: columns[3].width,
    },
    { align: "center" as const, text: "", width: columns[4].width },
    {
      align: "center" as const,
      text: formatNumber(total),
      width: columns[5].width,
    },
  ]
  let x = MARGIN
  for (const cell of summaryCells) {
    doc.rect(x, y, cell.width, totalHeight).fillAndStroke(CREAM, BORDER)
    doc
      .font("Outfit-600")
      .fontSize(9.7)
      .fillColor(BLACK)
      .text(cell.text, x + 6, y + 8, {
        align: cell.align,
        lineBreak: false,
        width: cell.width - 12,
      })
    x += cell.width
  }
  y += totalHeight

  const labelWidth = columns[0].width + columns[1].width
  doc.rect(MARGIN, y, labelWidth, amountHeight).fillAndStroke(CREAM, BORDER)
  doc
    .font("Outfit-600")
    .fontSize(9.3)
    .fillColor(BLACK)
    .text("Amount (in words)", MARGIN + 6, y + 14, {
      align: "center",
      lineBreak: false,
      width: labelWidth - 12,
    })
  doc
    .rect(MARGIN + labelWidth, y, CONTENT_WIDTH - labelWidth, amountHeight)
    .fillAndStroke(CREAM, BORDER)
  doc
    .font("Outfit-500")
    .fontSize(9.5)
    .fillColor(BLACK)
    .text(purchaseOrderAmountInWords(total), MARGIN + labelWidth + 7, y + 9, {
      align: "center",
      height: amountHeight - 14,
      lineGap: 2,
      width: CONTENT_WIDTH - labelWidth - 14,
    })
  return y + amountHeight
}

function commercialTerms(document: StorePurchaseOrderDocument) {
  return document.remark
    ? [...terms, `Remark: ${cleanText(document.remark)}`]
    : terms
}

function termsBoxHeight(
  doc: PDFKit.PDFDocument,
  document: StorePurchaseOrderDocument
) {
  doc.font("Outfit-400").fontSize(9.4)
  const bodyWidth = CONTENT_WIDTH - 54
  return (
    18 +
    commercialTerms(document).reduce(
      (sum, term) =>
        sum +
        Math.max(
          14,
          doc.heightOfString(term, { lineGap: 2, width: bodyWidth }) + 3
        ),
      0
    )
  )
}

function finalSectionHeight(
  doc: PDFKit.PDFDocument,
  document: StorePurchaseOrderDocument
) {
  return (
    27 +
    41 +
    31 +
    20 +
    termsBoxHeight(doc, document) +
    SIGNATURE_TOP_GAP +
    SIGNATURE_HEIGHT
  )
}

function drawTermsAndSignature(
  doc: PDFKit.PDFDocument,
  document: StorePurchaseOrderDocument,
  signatureStamp: Buffer,
  y: number
) {
  const headingY = y + 31
  doc
    .font("Outfit-600")
    .fontSize(13)
    .fillColor(GREEN)
    .text("Terms & Conditions", MARGIN + 2, headingY, { lineBreak: false })

  const boxY = headingY + 20
  const boxHeight = termsBoxHeight(doc, document)
  doc.rect(MARGIN, boxY, CONTENT_WIDTH, boxHeight).fill(CREAM)
  let termY = boxY + 11
  commercialTerms(document).forEach((term, index) => {
    doc
      .font("Outfit-500")
      .fontSize(9.4)
      .fillColor(BLACK)
      .text(`${index + 1}.`, MARGIN + 14, termY, {
        align: "right",
        lineBreak: false,
        width: 15,
      })
    doc.font("Outfit-400").fontSize(9.4)
    const bodyX = MARGIN + 34
    const bodyWidth = CONTENT_WIDTH - 54
    const height = doc.heightOfString(term, {
      lineGap: 2,
      width: bodyWidth,
    })
    doc.text(term, bodyX, termY, { lineGap: 2, width: bodyWidth })
    termY += Math.max(14, height + 3)
  })

  const signatureY = boxY + boxHeight + SIGNATURE_TOP_GAP
  const signatureX = PAGE_WIDTH - MARGIN - SIGNATURE_WIDTH
  doc.image(signatureStamp, signatureX, signatureY, {
    fit: [SIGNATURE_WIDTH, SIGNATURE_HEIGHT],
  })
}

function drawFooter(doc: PDFKit.PDFDocument) {
  doc.rect(0, FOOTER_TOP, PAGE_WIDTH, PAGE_HEIGHT - FOOTER_TOP).fill(GREEN)
  doc
    .font("Outfit-600")
    .fontSize(9.8)
    .fillColor(WHITE)
    .text(COMPANY_NAME, 0, FOOTER_TOP + 9, {
      align: "center",
      lineBreak: false,
      width: PAGE_WIDTH,
    })
  doc
    .font("Outfit-500")
    .fontSize(8.4)
    .fillColor(WHITE)
    .text(COMPANY_ADDRESS, MARGIN, FOOTER_TOP + 25, {
      align: "center",
      lineBreak: false,
      width: CONTENT_WIDTH,
    })
  doc
    .font("Outfit-600")
    .fontSize(9)
    .fillColor(WHITE)
    .text(`GSTIN No. ${COMPANY_GSTIN}`, 0, FOOTER_TOP + 42, {
      align: "center",
      lineBreak: false,
      width: PAGE_WIDTH,
    })
}

export async function buildStorePurchaseOrderPdf(
  document: StorePurchaseOrderDocument
) {
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    compress: true,
    fontLayoutCache: false,
    info: {
      Author: COMPANY_NAME,
      Creator: "MRM Dashboard",
      Producer: "MRM Dashboard",
      Subject: "Branded Store Purchase Order",
      Title: `${cleanText(document.orderNumber)} Purchase Order`,
    },
    margin: 0,
    size: [PAGE_WIDTH, PAGE_HEIGHT],
  })
  const output = collectPdfBytes(doc)
  const [fonts, signatureStamp] = await Promise.all([
    registerPdfKitBrandFonts(doc),
    loadSignatureStamp(),
  ])
  const ctx = { doc, fonts }

  doc.addPage({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] })
  drawBrandHeader(ctx)
  drawMetadata(doc, document)
  drawItemsHeading(doc, 337)
  let y = drawTableHeader(doc, 356)

  document.lines.forEach((line, index) => {
    const rowHeight = tableRowHeight(doc, line)
    const lastLine = index === document.lines.length - 1
    const availableBottom = lastLine
      ? FOOTER_TOP - finalSectionHeight(doc, document)
      : FOOTER_TOP - 10
    if (y + rowHeight > availableBottom) {
      doc.addPage({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] })
      drawContinuationHeader(ctx, document)
      drawItemsHeading(doc, 138)
      y = drawTableHeader(doc, 156)
    }
    y = drawTableRow(doc, line, index, y, rowHeight)
  })

  y = drawTotals(doc, document, y)
  drawTermsAndSignature(doc, document, signatureStamp, y)

  const range = doc.bufferedPageRange()
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index)
    drawFooter(doc)
  }
  doc.end()
  return output
}

import { readFile } from "node:fs/promises"
import path from "node:path"
import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb } from "pdf-lib"

export type QuoteDocument = {
  companyName: string
  quotationNumber?: string | null
  customerContact?: string | null
  customerAddress?: string | null
  customerReference?: string | null
  buyerName?: string | null
  deliveryTerms?: string | null
  documentDate?: Date | null
  preparedBy?: string | null
  preparedByTitle?: string | null
  totalEnquiryLines?: number
  conversionRate: number
  currency: string
  customerUid: string
  enquiryNumber: string
  incoterms: string | null
  lines: Array<{
    customerPartCode: string | null
    productCode?: string | null
    description: string
    lineNumber: number
    price: number | null
    quantity: number
    quoteNumber: string | null
    revision: number | null
    sentAt: Date | null
    status: string | null
  }>
  packagingTerms: string | null
  paymentTerms: string | null
  revision: number
  shipmentMode: string | null
  terms: Array<{ label: string; sortOrder: number; value: string }>
}

export type QuoteRateAdapters = {
  fetchText(url: string): Promise<string>
}

const liveAdapters: QuoteRateAdapters = {
  async fetchText(url) {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "Mozilla/5.0" },
    })
    if (!response.ok) throw new Error("Metal request failed.")
    return response.text()
  },
}

export async function loadQuoteMarketContext(
  input: { currency: string; conversionRate: number },
  adapters: QuoteRateAdapters = liveAdapters
): Promise<{
  copper: string
  zinc: string
  publishedOn?: string
  forex: { label: string; value: string }
}> {
  const currency = input.currency.trim().toUpperCase() || "USD"
  if (!Number.isFinite(input.conversionRate) || input.conversionRate <= 0) {
    throw new Error("Save a valid exchange rate on the enquiry before generating the PDF.")
  }
  const html = await adapters.fetchText("https://www.westmetall.com/en/markdaten.php")
    .catch(() => { throw new Error("Westmetall prices are unavailable. Please try generating the PDF again.") })
  const table = html.match(/<table\b[\s\S]*?<\/table>/gi)
    ?.find(value => /Official LME-Prices/i.test(value))
  const rows = [...(table ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(row => [...row[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cell => cell[1]!.replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim()))
  const publishedOn = rows[0]?.[1]
  const threeMonthColumn = rows.find(row => row.includes("3 months"))?.indexOf("3 months")
  const price = (metal: string) => {
    const value = threeMonthColumn === undefined ? undefined
      : rows.find(row => row[0] === metal)?.[threeMonthColumn]
    if (!value || !/^(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$/.test(value)) {
      throw new Error(`Westmetall three-month ${metal} price is unavailable. Please try generating the PDF again.`)
    }
    return value
  }
  if (!publishedOn || !/^\d{1,2}\.\s+[A-Za-z]+\s+\d{4}$/.test(publishedOn)) {
    throw new Error("Westmetall price date is unavailable. Please try generating the PDF again.")
  }
  return {
    copper: price("Copper"), zinc: price("Zinc"), publishedOn,
    forex: {
      label: `${currency}/INR Exchange Rate`,
      value: new Intl.NumberFormat("en-US", {
        useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 8,
      }).format(input.conversionRate),
    },
  }
}

function ascii(value: unknown) {
  return String(value ?? "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
}

export async function buildQuotePdf(
  document: QuoteDocument,
  context: Awaited<ReturnType<typeof loadQuoteMarketContext>>
) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(document.quotationNumber ?? `QTN-${document.enquiryNumber}`)
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")
  pdf.registerFontkit(fontkit)
  const asset = (name: string) => readFile(path.join(process.cwd(), "lib/pricing/assets", name))
  const embed = async (weight: string) =>
    pdf.embedFont(await asset(`Outfit-${weight}.ttf`), { subset: true })
  const [regular, medium, semibold, bold, letterhead, preparer] = await Promise.all([
    embed("Regular"), embed("Medium"), embed("SemiBold"), embed("Bold"),
    asset("quotation-letterhead.png").then((bytes) => pdf.embedPng(bytes)),
    asset("quotation-preparer.png").then((bytes) => pdf.embedPng(bytes)),
  ])
  const green = rgb(0, 0.416, 0.286)
  const ink = rgb(0, 0, 0)
  const pale = rgb(0.9686, 0.9686, 0.949)
  const border = rgb(0.85, 0.85, 0.85)
  const width = 595.5
  const height = 842.25
  const left = 59.55
  const right = width - left
  const bottom = 115
  const leading = 13.5
  let page = pdf.addPage([width, height])
  let y = 0
  const text = (
    value: unknown,
    x: number,
    baseline: number,
    size = 10,
    font = regular,
    color = ink
  ) =>
    page.drawText(ascii(value), {
      x,
      y: baseline,
      size,
      font,
      color,
    })
  const wrap = (
    value: unknown,
    available: number,
    size = 10,
    font = regular
  ) => {
    const result: string[] = []
    for (const paragraph of String(value ?? "-").split(/\r?\n/)) {
      let current = ""
      for (const word of ascii(paragraph).split(/\s+/)) {
        // Split long codes too: no cell may paint into a neighbouring column.
        let remainder = word
        while (remainder) {
          let chunk = remainder
          while (
            font.widthOfTextAtSize(chunk, size) > available &&
            chunk.length > 1
          ) {
            chunk = chunk.slice(0, -1)
          }
          const candidate = current ? `${current} ${chunk}` : chunk
          if (font.widthOfTextAtSize(candidate, size) > available && current) {
            result.push(current)
            current = ""
          }
          current = current ? `${current} ${chunk}` : chunk
          remainder = remainder.slice(chunk.length)
          if (remainder) {
            result.push(current)
            current = ""
          }
        }
      }
      result.push(current)
    }
    return result
  }
  const brand = () => {
    page.drawImage(letterhead, { x: 56.5, y: height - 96, width: 490, height: 68 })
    const bandTop = 721.34
    const bandHeight = 63.76
    page.drawRectangle({
      x: 0,
      y: bandTop - bandHeight,
      width,
      height: bandHeight,
      color: green,
    })
    const title = "QUOTATION"
    // Retain the reference's title kerning; pdf-lib otherwise uses unkerned advances.
    const titleOffsets = [0, 26.211, 48.678, 73.29, 90.956, 111.502, 131.953, 141.33, 167.125]
    titleOffsets.forEach((offset, index) =>
      text(title[index]!, 202.367 + offset, 678.575, 32.007, bold, rgb(1, 1, 1))
    )
    y = 618.22
  }
  const nextPage = () => {
    page = pdf.addPage([width, height])
    brand()
  }
  const room = (needed: number) => {
    if (y - needed < bottom) nextPage()
  }
  brand()
  text("Details", left, y, 12, semibold, green)
  const recipientX = 350.83
  text("To:", recipientX, y, 12, semibold, green)
  y -= 15.784
  const detailsTop = y
  const date = document.documentDate ?? new Date()
  const quoteNumber =
    document.quotationNumber ??
    `QTN-${document.enquiryNumber}`
  const details = [
    ["Quotation No:", quoteNumber],
    ["RFQ No:", document.customerReference || "-"],
    [
      "Date:",
      new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(date)),
    ],
    ["Copper LME: ($ / MT)", context.copper],
    ["Zinc LME: ($ / MT)", context.zinc],
    [`${document.currency} Exchange Rate:`, context.forex.value],
  ]
  pdf.setSubject(`LME 3 months; published ${context.publishedOn ?? "not supplied"}; enquiry ${document.enquiryNumber}`)
  for (const [label, value] of details) {
    const labelText = `${label} `
    const labelWidth = bold.widthOfTextAtSize(labelText, 10)
    text(labelText, left, y, 10, bold)
    wrap(value, 278 - labelWidth, 10).forEach((row, index) => {
      text(row, index === 0 ? left + labelWidth : left, y, 10)
      y -= 14.255
    })
  }
  let recipientY = detailsTop
  for (const [index, value] of [
    document.companyName,
    document.customerContact,
    document.customerAddress,
    document.buyerName ? `Buyer: ${document.buyerName}` : null,
  ].entries()) {
    if (!value) continue
    for (const row of wrap(value, right - recipientX, 10, index === 0 ? medium : regular)) {
      text(row, recipientX, recipientY, 10, index === 0 ? medium : regular)
      recipientY -= 14.255
    }
  }
  y = Math.min(y, recipientY) - 29.56
  text("Items", left, y, 12, semibold, green)
  y -= 11.62
  const tableLeft = 57.84
  const columns = [42.89, 99.19, 120.78, 156.56, 60.77]
  const headers = [
    "Sr. No.",
    "MRM Product Code",
    "Customer Product Code",
    "Item Description",
    `${document.currency} / Unit`,
  ]
  const tableHeader = () => {
    let x = tableLeft
    columns.forEach((cellWidth, index) => {
      page.drawRectangle({
        x,
        y: y - 27,
        width: cellWidth,
        height: 27,
        color: pale,
        borderColor: border,
        borderWidth: 0.6,
      })
      wrap(headers[index], cellWidth - 10, 10, medium).forEach((row, n) =>
        text(row, x + (cellWidth - medium.widthOfTextAtSize(row, 10)) / 2,
          y - 16.5 - n * leading, 10, medium)
      )
      x += cellWidth
    })
    y -= 27
  }
  room(65)
  tableHeader()
  for (const line of document.lines) {
    const cells = [
      String(line.lineNumber),
      line.productCode ?? "-",
      line.customerPartCode ?? "-",
      line.description,
      line.status === "Cannot Quote" ? "Cannot Quote" : line.price === null ? "-" : line.price.toFixed(4),
    ].map((value, index) => wrap(value, columns[index]! - 12, 10))
    const count = Math.max(...cells.map((cell) => cell.length))
    let offset = 0
    while (offset < count) {
      if (y - 27 < bottom) {
        nextPage()
        tableHeader()
      }
      const take = Math.min(
        count - offset,
        Math.floor((y - bottom - 12) / leading)
      )
      const rowHeight = Math.max(27, take * leading + 12)
      let x = tableLeft
      cells.forEach((cell, index) => {
        const cellWidth = columns[index]!
        page.drawRectangle({
          x,
          y: y - rowHeight,
          width: cellWidth,
          height: rowHeight,
          borderColor: border,
          borderWidth: 0.6,
        })
        cell.slice(offset, offset + take).forEach((row, n) => {
          const tx = x + (cellWidth - regular.widthOfTextAtSize(row, 10)) / 2
          text(row, tx, y - 16.5 - n * leading, 10)
        })
        x += cellWidth
      })
      y -= rowHeight
      offset += take
    }
  }
  y -= 40.84
  room(90)
  text("Prepared by", left, y, 12, semibold, green)
  page.drawImage(preparer, { x: 58, y: y - 32.635, width: 103, height: 19 })
  y -= 41.84
  text("Ankit Khattar", left, y, 10, medium)
  y -= 14.255
  text("Engineering Lead", left, y)
  y -= 38.44
  room(65)
  text("Terms & Conditions", left, y, 12, semibold, green)
  y -= 8.09
  const terms = [
    ["Payment", document.paymentTerms ?? "-"],
    ["Delivery", document.deliveryTerms || document.incoterms || "-"],
    ["Shipment Mode", document.shipmentMode ?? "-"],
    ["Packaging", document.packagingTerms ?? "-"],
    ...[...document.terms]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((term) => [term.label, term.value]),
  ]
  for (const [label, value] of terms) {
    const labelRows = wrap(label, 98, 10, medium)
    const valueRows = wrap(value, 371, 10)
    const count = Math.max(labelRows.length, valueRows.length)
    let offset = 0
    while (offset < count) {
      if (y - 18.26 < bottom) {
        nextPage()
        text("Terms & Conditions - Continued", left, y, 12, semibold, green)
        y -= 12
      }
      const take = Math.min(
        count - offset,
        Math.floor((y - bottom - 4.76) / leading)
      )
      const rowHeight = Math.max(18.26, take * leading + 4.76)
      page.drawRectangle({
        x: tableLeft,
        y: y - rowHeight,
        width: 102.91,
        height: rowHeight,
        color: pale,
      })
      labelRows
        .slice(offset, offset + take)
        .forEach((row, n) => text(row, 62.689, y - 11.617 - n * leading, 10, medium))
      valueRows
        .slice(offset, offset + take)
        .forEach((row, n) => text(row, 166.024, y - 11.617 - n * leading, 10))
      y -= rowHeight
      offset += take
    }
  }
  pdf.getPages().forEach((footerPage, index, pages) => {
    page = footerPage
    page.drawLine({
      start: { x: 39.78, y: 94.67 },
      end: { x: 555.73, y: 94.67 },
      thickness: 3,
      color: green,
    })
    text(
      "For any further queries or concerns, please reach out to:",
      left,
      64.282,
      12,
      semibold,
      green
    )
    text("Keyur Khattar", left, 47.437, 12, medium, green)
    text("+91 78787 87819", 156.014, 47.437, 12, medium, green)
    text("keyur@mayankrawmint.com", 259.367, 47.437, 12, medium, green)
    text(`${index + 1} / ${pages.length}`, right - 25, 20, 8, regular, green)
  })
  return pdf.save()
}

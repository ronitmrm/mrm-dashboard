import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

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
  pdf.setTitle(
    document.enquiryNumber + " Rev " + String(document.revision) + " Quote"
  )
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const green = rgb(0, 0.416, 0.286)
  const ink = rgb(0.06, 0.07, 0.065)
  const pale = rgb(0.966, 0.966, 0.951)
  const border = rgb(0.82, 0.83, 0.82)
  const width = 595.28
  const height = 841.89
  const left = 58
  const right = width - left
  const bottom = 117
  const leading = 13
  let page = pdf.addPage([width, height])
  let y = 0
  const text = (
    value: unknown,
    x: number,
    baseline: number,
    size = 9.5,
    strong = false,
    color = ink
  ) =>
    page.drawText(ascii(value), {
      x,
      y: baseline,
      size,
      font: strong ? bold : regular,
      color,
    })
  const wrap = (
    value: unknown,
    available: number,
    size = 9.5,
    strong = false
  ) => {
    const font = strong ? bold : regular
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
    const scale = 0.31
    const top = height - 34
    for (const path of [
      "M158.62,0H17.62C7.89,0,0,8.69,0,19.41v88.16h176.25V19.41c0-10.72-7.89-19.41-17.62-19.41Z",
      "M0,158.25c0,9.95,7.89,18.01,17.62,18.01h141c9.73,0,17.62-8.06,17.62-18.01v-17.24H0v17.24Z",
    ])
      page.drawSvgPath(path, { x: left, y: top, scale, color: green })
    const x = left + 67
    text(
      "MAYANK RAW MINT",
      x,
      top - 27,
      33,
      true,
      green
    )
    text(
      "Precision Brass Fittings & Metal Components",
      x,
      top - 53,
      15.3,
      false,
      green
    )
    const bandTop = 721
    const bandHeight = 63
    page.drawRectangle({
      x: 0,
      y: bandTop - bandHeight,
      width,
      height: bandHeight,
      color: green,
    })
    const title = "QUOTATION"
    const size = 31
    page.drawText(title, {
      x: (width - bold.widthOfTextAtSize(title, size)) / 2,
      y: bandTop - bandHeight / 2 - size * 0.35,
      font: bold,
      size,
      color: rgb(1, 1, 1),
    })
    y = bandTop - bandHeight - 29
  }
  const nextPage = () => {
    page = pdf.addPage([width, height])
    brand()
  }
  const room = (needed: number) => {
    if (y - needed < bottom) nextPage()
  }
  brand()
  text("Details", left, y, 12, true, green)
  const recipientX = 350
  text("To:", recipientX, y, 12, true, green)
  y -= 18
  const detailsTop = y
  const date = document.documentDate ?? new Date()
  const quoteNumber =
    document.quotationNumber ??
    `QTN-${document.enquiryNumber}`
  const details = [
    ["Quotation No:", `${quoteNumber} / Rev ${document.revision}`],
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
    ["Copper LME 3 months: ($ / MT)", context.copper],
    ["Zinc LME 3 months: ($ / MT)", context.zinc],
    ...(context.publishedOn ? [["LME price date:", context.publishedOn]] : []),
    [context.forex.label + ":", context.forex.value],
  ]
  for (const [label, value] of details) {
    const rows = wrap(`${label} ${value}`, 269, 9.3)
    for (const row of rows) {
      text(row, left, y, 9.3)
      y -= 14
    }
  }
  let recipientY = detailsTop
  for (const [index, value] of [
    document.companyName,
    document.customerContact,
    document.customerAddress,
    document.buyerName ? `Buyer: ${document.buyerName}` : null,
  ].entries()) {
    if (!value) continue
    for (const row of wrap(value, right - recipientX, 9.5, index === 0)) {
      text(row, recipientX, recipientY, 9.5, index === 0)
      recipientY -= 14
    }
  }
  y = Math.min(y, recipientY) - 26
  text("Items", left, y, 12, true, green)
  y -= 12
  const columns = [39, 99, 115, 159, right - left - 412]
  const headers = [
    "Sr. No.",
    "MRM Product Code",
    "Customer Product Code",
    "Item Description",
    `${document.currency} / Unit`,
  ]
  const tableHeader = () => {
    let x = left
    columns.forEach((cellWidth, index) => {
      page.drawRectangle({
        x,
        y: y - 30,
        width: cellWidth,
        height: 30,
        color: pale,
        borderColor: border,
        borderWidth: 0.6,
      })
      wrap(headers[index], cellWidth - 10, 8.5, true).forEach((row, n) =>
        text(row, x + (cellWidth - bold.widthOfTextAtSize(row, 8.5)) / 2,
          y - 12 - n * 10, 8.5, true)
      )
      x += cellWidth
    })
    y -= 30
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
    ].map((value, index) => wrap(value, columns[index]! - 12, 9))
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
      let x = left
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
          const tx = x + (cellWidth - regular.widthOfTextAtSize(row, 9)) / 2
          text(row, tx, y - 16 - n * leading, 9)
        })
        x += cellWidth
      })
      y -= rowHeight
      offset += take
    }
  }
  y -= 30
  room(70)
  text("Prepared by", left, y, 12, true, green)
  y -= 25
  text("Ankit Khattar", left, y, 10, true)
  y -= 15
  text("Engineering Lead", left, y)
  y -= 38
  room(65)
  text("Terms & Conditions", left, y, 12, true, green)
  y -= 11
  const terms = [
    ["Payment", document.paymentTerms ?? "-"],
    ["Delivery", document.deliveryTerms ?? "-"],
    ["Incoterms", document.incoterms ?? "-"],
    ["Shipment Mode", document.shipmentMode ?? "-"],
    ["Packaging", document.packagingTerms ?? "-"],
    ...[...document.terms]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((term) => [term.label, term.value]),
  ]
  for (const [label, value] of terms) {
    const labelRows = wrap(label, 93, 9, true)
    const valueRows = wrap(value, right - left - 119, 9.3)
    const count = Math.max(labelRows.length, valueRows.length)
    let offset = 0
    while (offset < count) {
      if (y - 27 < bottom) {
        nextPage()
        text("Terms & Conditions - Continued", left, y, 12, true, green)
        y -= 12
      }
      const take = Math.min(
        count - offset,
        Math.floor((y - bottom - 10) / leading)
      )
      const rowHeight = Math.max(23, take * leading + 10)
      page.drawRectangle({
        x: left,
        y: y - rowHeight,
        width: 103,
        height: rowHeight,
        color: pale,
      })
      labelRows
        .slice(offset, offset + take)
        .forEach((row, n) => text(row, left + 5, y - 15 - n * leading, 9, true))
      valueRows
        .slice(offset, offset + take)
        .forEach((row, n) => text(row, left + 112, y - 15 - n * leading, 9.3))
      y -= rowHeight
      offset += take
    }
  }
  pdf.getPages().forEach((footerPage, index, pages) => {
    page = footerPage
    page.drawLine({
      start: { x: 39, y: 95 },
      end: { x: width - 39, y: 95 },
      thickness: 2,
      color: green,
    })
    text(
      "For any further queries or concerns, please reach out to:",
      left,
      73,
      10.5,
      true,
      green
    )
    text(
      "Keyur Khattar    +91 78787 87819    keyur@mayankrawmint.com",
      left,
      56,
      10.2,
      false,
      green
    )
    text(`${index + 1} / ${pages.length}`, right - 25, 27, 8, false, green)
  })
  return pdf.save()
}

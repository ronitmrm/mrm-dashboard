import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

export type QuoteDocument = {
  companyName: string
  conversionRate: number
  currency: string
  customerUid: string
  enquiryNumber: string
  incoterms: string | null
  lines: Array<{
    customerPartCode: string | null
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
  fetchJson(url: string): Promise<unknown>
  fetchText(url: string): Promise<string>
}

const liveAdapters: QuoteRateAdapters = {
  async fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" })
    if (!response.ok) throw new Error("Rate request failed.")
    return response.json()
  },
  async fetchText(url) {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0" },
    })
    if (!response.ok) throw new Error("Metal request failed.")
    return response.text()
  },
}

function parseLmeValue(html: string, metal: "Copper" | "Zinc") {
  const section =
    html.match(/Official LME-Prices[\s\S]*?LME Stocks/i)?.[0] ?? html
  const row = section.match(new RegExp(metal + "[\\s\\S]{0,700}", "i"))
  const prices = row?.[0].match(/\d{1,3}(?:,\d{3})*\.\d{2}/g)
  return prices?.[1] ?? prices?.[0] ?? "-"
}

export async function loadQuoteMarketContext(
  input: { currency: string; fallbackRate: number },
  adapters: QuoteRateAdapters = liveAdapters
) {
  const currency = input.currency.trim().toUpperCase() || "USD"
  const [lme, forex] = await Promise.all([
    adapters
      .fetchText("https://www.westmetall.com/en/markdaten.php")
      .then((html) => ({
        copper: parseLmeValue(html, "Copper"),
        zinc: parseLmeValue(html, "Zinc"),
      }))
      .catch(() => ({ copper: "-", zinc: "-" })),
    currency === "INR"
      ? Promise.resolve({ label: "Inr Exchange Rate", value: "1.00" })
      : adapters
          .fetchJson(
            "https://api.frankfurter.app/latest?from=" +
              encodeURIComponent(currency) +
              "&to=INR"
          )
          .then((payload) => {
            const candidate = payload as { rates?: { INR?: number } }
            const rate = Number(candidate.rates?.INR)
            if (!Number.isFinite(rate) || rate <= 0) {
              throw new Error("Forex rate missing.")
            }
            return {
              label: currency + "/INR Forex Rate",
              value: rate.toFixed(2),
            }
          })
          .catch(() => ({
            label: currency + "/INR Forex Rate",
            value: Number(input.fallbackRate || 1).toFixed(2),
          })),
  ])
  return { ...lme, forex }
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
  let page = pdf.addPage([595.28, 841.89])
  let y = 795

  const draw = (
    value: unknown,
    options: { bold?: boolean; size?: number; x?: number } = {}
  ) => {
    const size = options.size ?? 9
    if (y < 55) {
      page = pdf.addPage([595.28, 841.89])
      y = 795
    }
    page.drawText(ascii(value), {
      color: rgb(0.1, 0.16, 0.14),
      font: options.bold ? bold : regular,
      size,
      x: options.x ?? 42,
      y,
    })
    y -= size + 6
  }

  draw("M.R.M. METPROTECH PRIVATE LIMITED", { bold: true, size: 16 })
  draw("Quotation " + document.enquiryNumber, { bold: true, size: 13 })
  draw(
    "Revision " +
      String(document.revision) +
      " | Customer " +
      document.customerUid +
      " - " +
      document.companyName
  )
  draw(
    "LME Copper " +
      context.copper +
      " | Zinc " +
      context.zinc +
      " | " +
      context.forex.label +
      " " +
      context.forex.value
  )
  y -= 8
  draw(
    "Ln | Customer Part | Description | Qty | " + document.currency + "/pc",
    {
      bold: true,
    }
  )
  for (const line of document.lines) {
    draw(
      [
        line.lineNumber,
        line.customerPartCode ?? "-",
        line.description,
        line.quantity.toFixed(4),
        line.price === null ? "-" : line.price.toFixed(4),
      ].join(" | ")
    )
  }
  y -= 10
  draw("Commercial terms", { bold: true, size: 11 })
  for (const [label, value] of [
    ["Payment", document.paymentTerms ?? "-"],
    ["Delivery", document.incoterms ?? "-"],
    ["Shipment Mode", document.shipmentMode ?? "-"],
    ["Packaging", document.packagingTerms ?? "-"],
    ...document.terms.map((term) => [term.label, term.value]),
  ]) {
    draw(label + ": " + value)
  }
  y -= 12
  draw("Prepared by MRMPL Commercial Team")

  return pdf.save()
}

import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import * as XLSX from "xlsx"

export type OrderArtifactDocument = {
  cancellationReason: string | null
  companyName: string
  currencyCode: string
  customerUid: string
  invoices: Array<{
    approvedAt: Date | null
    invoiceDate: string
    invoiceNumber: string
    revision: number
    sentAt: Date | null
    status: string
  }>
  lines: Array<{
    currencyCode: string
    customerPartCode: string
    decision: string
    decisionComment: string | null
    description: string | null
    lineNumber: number
    matchedUid: string | null
    piPrice: number | null
    poPrice: number
    priceDifference: number | null
    quantity: number
    quoteEnquiryNumber: string | null
    systemPrice: number | null
    systemProfitPercent: number | null
    systemPurchaseTimes: number | null
    systemScrapRate: number | null
  }>
  poDate: string
  poNumber: string
}

export type OrderMasterRow = {
  cancellationReason: string | null
  companyName: string
  currencyCode: string
  customerPartCode: string
  customerUid: string
  decision: string
  decisionComment: string | null
  description: string | null
  invoiceApprovedAt: Date | null
  invoiceNumber: string | null
  invoiceSentAt: Date | null
  lineNumber: number
  matchedUid: string | null
  piPrice: number | null
  poDate: string
  poNumber: string
  poPrice: number
  priceDifference: number | null
  quantity: number
  quoteEnquiryNumber: string | null
  quoteRequest: string | null
  systemPrice: number | null
  systemProfitPercent: number | null
  systemPurchaseTimes: number | null
  systemScrapRate: number | null
}

const percentValue = (value: number | null) =>
  value === null ? null : value * 100

export function buildPoTemplateWorkbook() {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet([
    {
      "Customer Part Code": "",
      Description: "",
      Quantity: "",
      "PO Price": "",
      Currency: "USD",
    },
  ])
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 34 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(workbook, sheet, "PO Lines")
  const instructions = XLSX.utils.aoa_to_sheet([
    ["Accepted columns"],
    [
      "Customer Part Code, Customer Part No, Customer Part #, Part Code, Item Code, Customer Code, Part",
    ],
    ["Description, Part Description, Item Description, Product Name"],
    ["Quantity, Qty, PO Qty, Order Quantity"],
    ["PO Price, Unit Price, Price, Rate, Approved Price"],
    ["Currency, Curr"],
  ])
  instructions["!cols"] = [{ wch: 24 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions")
  return workbook
}

function orderLineRows(order: OrderArtifactDocument) {
  return order.lines.map((line) => ({
    "Line No": line.lineNumber,
    "Customer Part Code": line.customerPartCode,
    Description: line.description,
    Quantity: line.quantity,
    Currency: line.currencyCode,
    "PO Price": line.poPrice,
    "System Price": line.systemPrice,
    Difference: line.priceDifference,
    "PI Price": line.piPrice,
    "Matched UID": line.matchedUid,
    "Quote ENQ": line.quoteEnquiryNumber,
    "Scrap Rate": line.systemScrapRate,
    "Purchase Times": line.systemPurchaseTimes,
    "Profit %": percentValue(line.systemProfitPercent),
    Decision: line.decision,
    "Decision Comment": line.decisionComment,
  }))
}

export function buildPurchaseOrderWorkbook(order: OrderArtifactDocument) {
  const workbook = XLSX.utils.book_new()
  const invoice = order.invoices[0]
  const summary = XLSX.utils.aoa_to_sheet([
    ["PO Number", order.poNumber],
    ["PO Date", order.poDate],
    ["Customer UID", order.customerUid],
    ["Customer", order.companyName],
    ["PI Number", invoice?.invoiceNumber ?? ""],
    ["PI Sent At", invoice?.sentAt ?? ""],
    ["PI Approved At", invoice?.approvedAt ?? ""],
    ["Cancellation Reason", order.cancellationReason ?? ""],
  ])
  summary["!cols"] = [{ wch: 24 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(workbook, summary, "Summary")
  const lines = XLSX.utils.json_to_sheet(orderLineRows(order))
  lines["!cols"] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 32 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 10 },
    { wch: 18 },
    { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(workbook, lines, "PO Lines")
  return workbook
}

export function buildProformaInvoiceWorkbook(order: OrderArtifactDocument) {
  const invoice = order.invoices[0]
  if (!invoice) throw new Error("Generate PI before exporting PI Excel.")
  const workbook = XLSX.utils.book_new()
  const summary = XLSX.utils.aoa_to_sheet([
    ["PI Number", invoice.invoiceNumber],
    ["PI Sent At", invoice.sentAt ?? ""],
    ["PI Approved At", invoice.approvedAt ?? ""],
    ["PO Number", order.poNumber],
    ["PO Date", order.poDate],
    ["Customer UID", order.customerUid],
    ["Customer", order.companyName],
  ])
  summary["!cols"] = [{ wch: 24 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(workbook, summary, "PI Summary")
  const rows = order.lines.map((line) => ({
    "Line No": line.lineNumber,
    "Customer Part Code": line.customerPartCode,
    Description: line.description,
    "Matched UID": line.matchedUid,
    "Quote ENQ": line.quoteEnquiryNumber,
    Quantity: line.quantity,
    Currency: line.currencyCode,
    "PO Price": line.poPrice,
    "PI Price": line.piPrice,
    "Line Total": (line.piPrice ?? 0) * line.quantity,
    Decision: line.decision,
    "Decision Comment": line.decisionComment,
  }))
  const lines = XLSX.utils.json_to_sheet(rows)
  lines["!cols"] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 32 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 30 },
  ]
  XLSX.utils.book_append_sheet(workbook, lines, "PI Lines")
  return workbook
}

export function buildOrderMasterWorkbook(
  rows: OrderMasterRow[],
  approvedOnly = false
) {
  const workbook = XLSX.utils.book_new()
  const data = approvedOnly
    ? rows.map((row) => ({
        "PI Number": row.invoiceNumber,
        "PI Approved At": row.invoiceApprovedAt,
        "PO Number": row.poNumber,
        "PO Date": row.poDate,
        "Customer UID": row.customerUid,
        Customer: row.companyName,
        "Line No": row.lineNumber,
        "Customer Part Code": row.customerPartCode,
        Description: row.description,
        "Matched UID": row.matchedUid,
        "Quote ENQ": row.quoteEnquiryNumber,
        Quantity: row.quantity,
        Currency: row.currencyCode,
        "PO Price": row.poPrice,
        "PI Price": row.piPrice,
        "Line Total": (row.piPrice ?? 0) * row.quantity,
        "Scrap Rate": row.systemScrapRate,
        "Purchase Times": row.systemPurchaseTimes,
        "Profit %": percentValue(row.systemProfitPercent),
        Decision: row.decision,
        "Decision Comment": row.decisionComment,
      }))
    : rows.map((row) => ({
        "PO Number": row.poNumber,
        "PO Date": row.poDate,
        "Customer UID": row.customerUid,
        Customer: row.companyName,
        "Line No": row.lineNumber,
        "Customer Part Code": row.customerPartCode,
        Description: row.description,
        Quantity: row.quantity,
        Currency: row.currencyCode,
        "PO Price": row.poPrice,
        "System Price": row.systemPrice,
        Difference: row.priceDifference,
        "PI Price": row.piPrice,
        "Matched UID": row.matchedUid,
        "Quote ENQ": row.quoteEnquiryNumber,
        "Created Quote Request": row.quoteRequest,
        "Scrap Rate": row.systemScrapRate,
        "Purchase Times": row.systemPurchaseTimes,
        "Profit %": percentValue(row.systemProfitPercent),
        Decision: row.decision,
        "Decision Comment": row.decisionComment,
        "PI Number": row.invoiceNumber,
        "PI Sent At": row.invoiceSentAt,
        "PI Approved At": row.invoiceApprovedAt,
        "Cancellation Reason": row.cancellationReason,
      }))
  const sheet = XLSX.utils.json_to_sheet(data)
  sheet["!cols"] = approvedOnly
    ? [
        { wch: 16 },
        { wch: 20 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 26 },
        { wch: 8 },
        { wch: 20 },
        { wch: 32 },
        { wch: 14 },
        { wch: 16 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 10 },
        { wch: 18 },
        { wch: 30 },
      ]
    : [
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 26 },
        { wch: 8 },
        { wch: 20 },
        { wch: 32 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 24 },
        { wch: 12 },
        { wch: 14 },
        { wch: 10 },
        { wch: 18 },
        { wch: 30 },
        { wch: 16 },
        { wch: 20 },
        { wch: 20 },
        { wch: 30 },
      ]
  XLSX.utils.book_append_sheet(
    workbook,
    sheet,
    approvedOnly ? "Approved PI Master" : "PO Master"
  )
  return workbook
}

function text(value: unknown) {
  return String(value ?? "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
}

export async function buildProformaInvoicePdf(order: OrderArtifactDocument) {
  const invoice = order.invoices[0]
  if (!invoice) throw new Error("Generate PI before opening the PI PDF.")
  const pdf = await PDFDocument.create()
  pdf.setTitle(invoice.invoiceNumber + " Proforma Invoice")
  pdf.setCreator("MRM Dashboard")
  pdf.setProducer("MRM Dashboard")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page = pdf.addPage([595.28, 841.89])
  let y = 790
  const draw = (
    value: unknown,
    options: { bold?: boolean; size?: number; x?: number } = {}
  ) => {
    const size = options.size ?? 8
    if (y < 55) {
      page = pdf.addPage([595.28, 841.89])
      y = 790
    }
    page.drawText(text(value), {
      color: rgb(0.08, 0.2, 0.15),
      font: options.bold ? bold : regular,
      size,
      x: options.x ?? 42,
      y,
    })
    y -= size + 6
  }
  page.drawRectangle({
    borderColor: rgb(0.08, 0.35, 0.2),
    borderWidth: 1,
    color: rgb(0.94, 0.98, 0.95),
    height: 34,
    width: 511,
    x: 42,
    y: 770,
  })
  draw("PROFORMA INVOICE", { bold: true, size: 16, x: 54 })
  draw("PI Status: " + invoice.status, { x: 395 })
  y -= 20
  draw("PI No.: " + invoice.invoiceNumber + " | PI Date: " + invoice.invoiceDate)
  draw("PO No.: " + order.poNumber + " | PO Date: " + order.poDate)
  draw("Customer: " + order.companyName + " | " + order.customerUid)
  y -= 10
  draw(
    "Sr | MRM Part | Customer Part | Description | Qty | Unit Price | Total",
    { bold: true }
  )
  let grandTotal = 0
  for (const line of order.lines) {
    const total = (line.piPrice ?? 0) * line.quantity
    grandTotal += total
    draw(
      [
        line.lineNumber,
        line.matchedUid ?? "-",
        line.customerPartCode,
        line.description ?? "-",
        line.quantity.toFixed(2),
        line.currencyCode + " " + (line.piPrice ?? 0).toFixed(2),
        line.currencyCode + " " + total.toFixed(2),
      ].join(" | ")
    )
  }
  y -= 8
  draw(
    "Grand Total: " + order.currencyCode + " " + grandTotal.toFixed(2),
    { bold: true }
  )
  y -= 28
  draw("For Mayank Raw Mint", { bold: true })
  draw("Authorized Signatory", { bold: true, x: 420 })
  return pdf.save()
}

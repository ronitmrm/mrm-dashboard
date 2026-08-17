import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

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
  remark?: string | null
  supplierCode: string
  supplierName: string
}

function ascii(value: unknown) {
  return String(value ?? "-")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
}

function amount(quantity: string, unitPrice: string) {
  return (Number(quantity) * Number(unitPrice)).toFixed(2)
}

export async function buildStorePurchaseOrderPdf(
  document: StorePurchaseOrderDocument
) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${document.orderNumber} Purchase Order`)
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
      color: rgb(0.08, 0.15, 0.12),
      font: options.bold ? bold : regular,
      size,
      x: options.x ?? 42,
      y,
    })
    y -= size + 7
  }

  draw("M.R.M. METPROTECH PRIVATE LIMITED", { bold: true, size: 16 })
  draw(`PURCHASE ORDER ${document.orderNumber}`, { bold: true, size: 13 })
  draw(`Order Date: ${document.orderDate}`)
  draw(`Supplier: ${document.supplierCode} - ${document.supplierName}`)
  y -= 10
  draw("Code | Item | Quantity | Unit | INR/Unit | Amount INR", {
    bold: true,
  })
  for (const line of document.lines) {
    draw(
      [
        line.typeCode,
        line.itemName,
        line.orderedQuantity,
        line.unit,
        Number(line.unitPrice).toFixed(2),
        amount(line.orderedQuantity, line.unitPrice),
      ].join(" | ")
    )
  }
  y -= 8
  const total = document.lines.reduce(
    (sum, line) => sum + Number(line.orderedQuantity) * Number(line.unitPrice),
    0
  )
  draw(`TOTAL: INR ${total.toFixed(2)}`, { bold: true, size: 11 })
  if (document.remark) draw(`Remark: ${document.remark}`)
  y -= 18
  draw("For M.R.M. Metprotech Private Limited", { bold: true })
  draw("Authorized Signatory")

  return pdf.save()
}

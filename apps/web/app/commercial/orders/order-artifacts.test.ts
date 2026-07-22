import { PDFDocument } from "pdf-lib"
import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"

import {
  buildOrderMasterWorkbook,
  buildPoTemplateWorkbook,
  buildProformaInvoicePdf,
  buildProformaInvoiceWorkbook,
  buildPurchaseOrderWorkbook,
  type OrderArtifactDocument,
  type OrderMasterRow,
} from "./order-artifacts"

const order: OrderArtifactDocument = {
  cancellationReason: null,
  companyName: "Source Customer",
  currencyCode: "USD",
  customerUid: "CUS-001",
  invoices: [
    {
      approvedAt: new Date("2026-07-22T10:00:00Z"),
      invoiceDate: "2026-07-22",
      invoiceNumber: "PI-001",
      revision: 1,
      sentAt: new Date("2026-07-22T09:00:00Z"),
      status: "Approved",
    },
  ],
  lines: [
    {
      currencyCode: "USD",
      customerPartCode: "PART-001",
      decision: "Keep Our Price",
      decisionComment: "Retain sent price",
      description: "Ordered component",
      lineNumber: 1,
      matchedUid: "M100",
      piPrice: 12.5,
      poPrice: 13,
      priceDifference: 0.5,
      quantity: 4,
      quoteEnquiryNumber: "ENQ-001",
      systemPrice: 12.5,
      systemProfitPercent: 0.15,
      systemPurchaseTimes: 1,
      systemScrapRate: 2,
    },
  ],
  poDate: "2026-07-21",
  poNumber: "PO-001",
}

const masterRow: OrderMasterRow = {
  cancellationReason: null,
  companyName: order.companyName,
  currencyCode: order.currencyCode,
  customerPartCode: order.lines[0]!.customerPartCode,
  customerUid: order.customerUid,
  decision: order.lines[0]!.decision,
  decisionComment: order.lines[0]!.decisionComment,
  description: order.lines[0]!.description,
  invoiceApprovedAt: order.invoices[0]!.approvedAt,
  invoiceNumber: order.invoices[0]!.invoiceNumber,
  invoiceSentAt: order.invoices[0]!.sentAt,
  lineNumber: 1,
  matchedUid: "M100",
  piPrice: 12.5,
  poDate: order.poDate,
  poNumber: order.poNumber,
  poPrice: 13,
  priceDifference: 0.5,
  quantity: 4,
  quoteEnquiryNumber: "ENQ-001",
  quoteRequest: null,
  systemPrice: 12.5,
  systemProfitPercent: 0.15,
  systemPurchaseTimes: 1,
  systemScrapRate: 2,
}

describe("PO and PI artifacts", () => {
  test("keeps source template, detail, PI, and master sheet contracts", () => {
    const template = buildPoTemplateWorkbook()
    expect(template.SheetNames).toEqual(["PO Lines", "Instructions"])
    expect(
      XLSX.utils.sheet_to_json(template.Sheets["PO Lines"]!, {
        header: 1,
      })[0]
    ).toEqual([
      "Customer Part Code",
      "Description",
      "Quantity",
      "PO Price",
      "Currency",
    ])

    const detail = buildPurchaseOrderWorkbook(order)
    expect(detail.SheetNames).toEqual(["Summary", "PO Lines"])
    expect(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(
        detail.Sheets["PO Lines"]!
      )[0]
    ).toMatchObject({
      "Matched UID": "M100",
      "Profit %": 15,
      "Quote ENQ": "ENQ-001",
    })

    const pi = buildProformaInvoiceWorkbook(order)
    expect(pi.SheetNames).toEqual(["PI Summary", "PI Lines"])
    expect(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(pi.Sheets["PI Lines"]!)[0]
    ).toMatchObject({ "Line Total": 50, "PI Price": 12.5 })

    const poMaster = buildOrderMasterWorkbook([masterRow])
    const approved = buildOrderMasterWorkbook([masterRow], true)
    expect(poMaster.SheetNames).toEqual(["PO Master"])
    expect(approved.SheetNames).toEqual(["Approved PI Master"])
    expect(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(
        approved.Sheets["Approved PI Master"]!
      )[0]
    ).toMatchObject({ "PI Number": "PI-001", "Line Total": 50 })
  })

  test("builds an inline-ready PI PDF from retained invoice values", async () => {
    const bytes = await buildProformaInvoicePdf(order)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getTitle()).toBe("PI-001 Proforma Invoice")
    expect(pdf.getCreator()).toBe("MRM Dashboard")
    expect(pdf.getPageCount()).toBe(1)
  })
})

import type { createCommercialCostingRepository } from "@workspace/db"
import * as XLSX from "xlsx"

export type PricingRegisterRow = Awaited<
  ReturnType<
    ReturnType<typeof createCommercialCostingRepository>["listPricingRegister"]
  >
>[number]

type PricingViewRow = Record<string, string | number>

function value(record: Record<string, unknown>, key: string) {
  const result = record[key]
  return result === null || result === undefined
    ? ""
    : (result as string | number)
}

export function toPricingViewRow(row: PricingRegisterRow): PricingViewRow {
  const product = row.product
  const context = row.productContext
  const inputs = row.quoteInputs
  const calculation = row.calculation
  return {
    "Row Type": row.componentDepth > 0 ? row.itemType : row.itemType,
    "Customer Line Status": row.componentDepth > 0 ? "" : row.lifecycleStatus,
    "Customer UID": row.customerUid,
    "Change Date": row.changeDate.toISOString(),
    "Customer Part Code": row.customerPartCode ?? "",
    "Price Rev": row.revision,
    Under: row.parentUid ?? "",
    "BOM Level": row.componentDepth || "",
    "BOM Qty": row.componentQuantity,
    UID: row.uid,
    "Q/P": row.componentDepth > 0 ? "" : row.lifecycleStatus,
    Description: value(product, "description"),
    Size: "",
    "MRMPL Product Description": "",
    Shipping: row.shippingTerms ?? "",
    Packaging: row.packaging ?? "",
    Pricing: value(product, "pricingMethod"),
    ENQ: row.enquiryNumber ?? "",
    Line: row.lineNumber ?? "",
    Customer: row.companyName,
    "Enquiry Description": row.enquiryDescription,
    "Production Type": value(product, "productionType"),
    "Machine Type": value(context, "machineType"),
    Grade: value(context, "grade"),
    "Rod Type": value(context, "rodType"),
    "Rod Size": value(context, "rodSize"),
    "Die Code": value(context, "dieCode"),
    "1 Piece Weight ( gm )": value(product, "weight100Pcs"),
    "No of Piece / KG": value(calculation, "piecesPerKg"),
    Casting: value(product, "casting"),
    "Scrap Rate (INR/kg)": value(inputs, "scrapRate"),
    "Alloy Premium (INR/kg)": value(product, "alloyPremium"),
    "Ext. Cost (INR/kg)": value(product, "extrusionCost"),
    "Forg Cost+ Nitric Blasting (INR/kg)": value(product, "forgingCost"),
    "Direct (INR/kg)": value(product, "directPurchasePricePerKg"),
    "Direct (INR/pc)": value(product, "directPurchasePricePerPiece"),
    "M/c Cost (INR/kg)": value(product, "machiningCost"),
    "M/c Cost (INR/pc)": value(product, "machiningPricePerPiece"),
    "Washing (INR/kg)": value(product, "washing"),
    "Checking (INR/kg)": value(product, "checking"),
    "Marking (INR/kg)": value(product, "marking"),
    "Plating (INR/kg)": value(product, "plating"),
    "Anneling (INR/kg)": value(product, "annealing"),
    "Debbring (INR/kg)": value(product, "deburring"),
    "Buffing (INR/kg)": value(product, "buffing"),
    "Sealant (INR/kg)": value(product, "sealant"),
    "Packing (INR/kg)": value(inputs, "packingCost"),
    "Shipping (INR/kg)": value(inputs, "shippingCost"),
    "Overhead (INR/kg)": value(product, "overheadCost"),
    "Assembly Cost (INR/kg)": value(product, "assemblyOperationCost"),
    Remarks: value(context, "remarks"),
    "Rejection %": Number(value(product, "rejectionPercent") || 0) * 100,
    "BL %": Number(value(product, "burningLossPercent") || 0) * 100,
    "Conversion Cost": value(inputs, "conversionRate"),
    Profit: Number(value(inputs, "profitPercent") || 0) * 100,
    "OR Purchase Times": value(inputs, "purchaseTimes"),
    "Assembled Part": value(inputs, "assembledPartInr"),
    "Net Rate / KG Without Alloy Premium": value(
      calculation,
      "netRateWithoutAlloy"
    ),
    "Net Rate / KG With Alloy Premium": value(calculation, "netRateWithAlloy"),
    "Scrap Rate / gm": value(calculation, "scrapRatePerGm"),
    "RM Cost": value(calculation, "rawMaterialCost"),
    "Scrap Return": value(calculation, "scrapReturn"),
    "Scrap Return Price ( Inc. Burning Loss )": value(
      calculation,
      "scrapReturnPriceIncludingBurningLoss"
    ),
    "Scrap Return Price": value(calculation, "scrapReturnPrice"),
    "Total Rods Cost": value(calculation, "totalRodsCost"),
    Rejection: value(calculation, "rejectionCost"),
    "Total - A": value(calculation, "totalA"),
    "Profit - B": value(calculation, "profitB"),
    "Total - A + B": value(calculation, "totalAPlusB"),
    "Rate / PCS In INR": value(calculation, "rateInr"),
    "Total Rate / PCS In INR": value(calculation, "totalRateInr"),
    Currency: row.currency,
    "Rate / PCS In Currency": value(calculation, "rateUsd"),
    "Quote Status": row.componentDepth > 0 ? "" : row.status,
  }
}

export const pricingHeaders = Object.keys(
  toPricingViewRow({
    calculation: {},
    changeDate: new Date(0),
    companyName: "",
    componentDepth: 0,
    componentQuantity: 1,
    currency: "",
    customerId: "",
    customerPartCode: null,
    customerUid: "",
    enquiryDescription: "",
    enquiryNumber: null,
    id: "",
    isActive: false,
    itemType: "",
    lifecycleStatus: "",
    lineNumber: null,
    packaging: null,
    parentUid: null,
    product: {},
    productContext: {},
    quoteInputs: {},
    quoteNumber: "",
    rowKey: "",
    revision: 1,
    sentAt: null,
    shippingTerms: null,
    status: "",
    uid: "",
    unitPrice: 0,
  })
)

export function buildPricingWorkbook(rows: PricingRegisterRow[]) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows.map(toPricingViewRow), {
    header: pricingHeaders,
  })
  sheet["!cols"] = pricingHeaders.map((header) => ({
    wch: Math.max(14, Math.min(header.length + 6, 32)),
  }))
  XLSX.utils.book_append_sheet(workbook, sheet, "Pricing View")
  return workbook
}

export const pricingWorkbookFilename = "pricing-view.xlsx"

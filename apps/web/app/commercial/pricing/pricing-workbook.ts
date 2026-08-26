import type { createCommercialCostingRepository } from "@workspace/db"
import * as XLSX from "xlsx"

export type PricingRegisterRow = Awaited<
  ReturnType<
    ReturnType<typeof createCommercialCostingRepository>["listPricingRegister"]
  >
>[number]

export type PricingViewRow = Record<string, string | number>

const dashOnly = /^[\s\u2010-\u2015\u2212-]+$/u

function normalizedText(result: unknown) {
  if (result === null || result === undefined) return ""
  const text = String(result)
  return dashOnly.test(text) ? "-" : text
}

function dashIfEmpty(result: unknown) {
  return normalizedText(result) || "-"
}

function value(
  record: Record<string, unknown>,
  key: string,
  decimalPlaces = 2
) {
  const result = record[key]
  if (result === null || result === undefined) return ""
  return typeof result === "number"
    ? result.toFixed(decimalPlaces)
    : normalizedText(result)
}

function percentValue(record: Record<string, unknown>, key: string) {
  const result = record[key]
  if (result === null || result === undefined) return ""
  const number = Number(result)
  return Number.isFinite(number) ? (number * 100).toFixed(2) : ""
}

function directValue(record: Record<string, unknown>, key: string) {
  const pricingMethod = record.pricingMethod
  if (pricingMethod === null || pricingMethod === undefined) return ""
  return String(pricingMethod).trim().toLowerCase() === "direct purchase"
    ? value(record, key)
    : "-"
}

export function toPricingViewRow(row: PricingRegisterRow): PricingViewRow {
  const product = row.product
  const context = row.productContext
  const inputs = row.quoteInputs
  const calculation = row.calculation
  const isCustomerPrice = Boolean(row.quoteNumber)
  const quoteStatus = row.lifecycleStatus === "P" ? "P" : "Q"
  const customerValue = (
    record: Record<string, unknown>,
    key: string,
    decimalPlaces = 2
  ) => (isCustomerPrice ? value(record, key, decimalPlaces) : "-")
  return {
    "Row Type": row.componentDepth > 0 ? row.itemType : row.itemType,
    "Pricing Scope": isCustomerPrice ? "Customer Price" : "Product Base",
    "Customer Line Status": isCustomerPrice ? quoteStatus : "-",
    "Customer UID": isCustomerPrice ? dashIfEmpty(row.customerUid) : "-",
    "Change Date": row.changeDate.toISOString(),
    "Customer Part Code": isCustomerPrice
      ? dashIfEmpty(row.customerPartCode)
      : "-",
    "Price Rev": isCustomerPrice ? row.revision : "-",
    Under: dashIfEmpty(row.parentUid),
    "BOM Level": row.componentDepth || "",
    "BOM Qty": row.componentQuantity.toFixed(2),
    UID: row.uid,
    "Q/P": quoteStatus,
    Description: value(product, "description"),
    Size: row.websiteSize ?? "",
    "MRMPL Product Description": row.websiteProductDescription ?? "",
    Shipping: dashIfEmpty(row.shippingTerms),
    Packaging: dashIfEmpty(row.packaging),
    Pricing: value(product, "pricingMethod"),
    ENQ: isCustomerPrice ? dashIfEmpty(row.enquiryNumber) : "-",
    Line: isCustomerPrice ? (row.lineNumber ?? "-") : "-",
    Customer: isCustomerPrice ? dashIfEmpty(row.companyName) : "-",
    "Enquiry Description": isCustomerPrice
      ? dashIfEmpty(row.enquiryDescription)
      : "-",
    "Production Type": value(product, "productionType"),
    "Machine Type": value(context, "machineType"),
    Grade: value(context, "grade"),
    "Rod Type": value(context, "rodType"),
    "Rod Size": value(context, "rodSize"),
    "Die Code": value(context, "dieCode"),
    "1 Piece Weight ( gm )": value(product, "weight100Pcs"),
    "No of Piece / KG": value(calculation, "piecesPerKg"),
    "Product Base Cost (INR/pc)": value(product, "productCostInr"),
    Casting: value(product, "casting"),
    "Scrap Rate (INR/kg)": customerValue(inputs, "scrapRate"),
    "Alloy Premium (INR/kg)": value(product, "alloyPremium"),
    "Ext. Cost (INR/kg)": value(product, "extrusionCost"),
    "Forg Cost+ Nitric Blasting (INR/kg)": value(product, "forgingCost"),
    "Direct (INR/kg)": directValue(product, "directPurchasePricePerKg"),
    "Direct (INR/pc)": directValue(product, "directPurchasePricePerPiece"),
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
    "Packing (INR/kg)": customerValue(inputs, "packingCost"),
    "Shipping (INR/kg)": customerValue(inputs, "shippingCost"),
    "Overhead (INR/kg)": value(product, "overheadCost"),
    "Assembly Cost (INR/kg)": value(product, "assemblyOperationCost"),
    Remarks: value(context, "remarks"),
    "Rejection %": percentValue(product, "rejectionPercent"),
    "BL %": percentValue(product, "burningLossPercent"),
    "Conversion Cost": customerValue(inputs, "conversionRate"),
    Profit: isCustomerPrice ? percentValue(inputs, "profitPercent") : "-",
    "OR Purchase Times": customerValue(inputs, "purchaseTimes"),
    "Assembled Part": customerValue(inputs, "assembledPartInr"),
    "Net Rate / KG Without Alloy Premium": customerValue(
      calculation,
      "netRateWithoutAlloy"
    ),
    "Net Rate / KG With Alloy Premium": customerValue(
      calculation,
      "netRateWithAlloy"
    ),
    "Scrap Rate / gm": customerValue(calculation, "scrapRatePerGm"),
    "RM Cost": customerValue(calculation, "rawMaterialCost"),
    "Scrap Return": customerValue(calculation, "scrapReturn"),
    "Scrap Return Price ( Inc. Burning Loss )": customerValue(
      calculation,
      "scrapReturnPriceIncludingBurningLoss"
    ),
    "Scrap Return Price": customerValue(calculation, "scrapReturnPrice"),
    "Total Rods Cost": customerValue(calculation, "totalRodsCost"),
    Rejection: customerValue(calculation, "rejectionCost"),
    "Total - A": customerValue(calculation, "totalA"),
    "Profit - B": customerValue(calculation, "profitB"),
    "Total - A + B": customerValue(calculation, "totalAPlusB"),
    "Rate / PCS In INR": customerValue(calculation, "rateInr"),
    "Total Rate / PCS In INR": customerValue(calculation, "totalRateInr"),
    Currency: row.currency,
    "Rate / PCS In Currency": customerValue(calculation, "rateUsd", 4),
    "Quote Status": isCustomerPrice
      ? row.componentDepth > 0
        ? ""
        : row.status
      : "-",
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
    websiteProductDescription: null,
    websiteSize: null,
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

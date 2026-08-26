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

function isDirectPricing(record: Record<string, unknown>) {
  const pricingMethod = String(record.pricingMethod ?? "")
    .trim()
    .toLowerCase()
  return pricingMethod === "direct" || pricingMethod === "direct purchase"
}

function directValue(
  record: Record<string, unknown>,
  directKey: string,
  importedWorkingKey: string
) {
  if (!isDirectPricing(record)) return "-"
  const direct = record[directKey]
  const importedWorking = record[importedWorkingKey]
  const result =
    Number(direct) === 0 && Number(importedWorking) !== 0
      ? importedWorking
      : (direct ?? importedWorking)
  return value({ result }, "result")
}

function machiningValue(record: Record<string, unknown>, key: string) {
  return isDirectPricing(record) ? "-" : value(record, key)
}

function isCustomerPackageSummary(row: PricingRegisterRow) {
  return (
    Boolean(row.quoteNumber) &&
    row.componentDepth === 0 &&
    ["package", "assembly"].includes(row.itemType.toLowerCase())
  )
}

const packageNotApplicableColumns = [
  "Product Base Cost (INR/pc)",
  "Casting",
  "Scrap Rate (INR/kg)",
  "Alloy Premium (INR/kg)",
  "Ext. Cost (INR/kg)",
  "Forg Cost+ Nitric Blasting (INR/kg)",
  "BL %",
  "OR Purchase Times",
  "Assembled Part",
  "Net Rate / KG Without Alloy Premium",
  "Net Rate / KG With Alloy Premium",
  "Scrap Rate / gm",
  "RM Cost",
  "Scrap Return",
  "Scrap Return Price ( Inc. Burning Loss )",
  "Scrap Return Price",
  "Total Rods Cost",
] as const

const packageDashWhenEmptyColumns = [
  "BOM Level",
  "Description",
  "Size",
  "MRMPL Product Description",
  "Pricing",
  "Production Type",
  "Machine Type",
  "Grade",
  "Rod Type",
  "Rod Size",
  "Die Code",
  "1 Piece Weight ( gm )",
  "No of Piece / KG",
  "Remarks",
] as const

const packageDashWhenZeroColumns = [
  "Direct (INR/kg)",
  "Direct (INR/pc)",
  "M/c Cost (INR/kg)",
  "M/c Cost (INR/pc)",
  "Washing (INR/kg)",
  "Checking (INR/kg)",
  "Marking (INR/kg)",
  "Plating (INR/kg)",
  "Anneling (INR/kg)",
  "Debbring (INR/kg)",
  "Buffing (INR/kg)",
  "Sealant (INR/kg)",
  "Overhead (INR/kg)",
  "Assembly Cost (INR/kg)",
] as const

export function orderPricingRows(rows: PricingRegisterRow[]) {
  const ordered: PricingRegisterRow[] = []
  let group: PricingRegisterRow[] = []

  const flush = () => {
    const [root, ...components] = group
    if (!root) return
    if (components.length && isCustomerPackageSummary(root)) {
      ordered.push(...components, root)
    } else {
      ordered.push(...group)
    }
    group = []
  }

  for (const row of rows) {
    if (row.componentDepth === 0) flush()
    group.push(row)
  }
  flush()
  return ordered
}

export function toPricingViewRow(row: PricingRegisterRow): PricingViewRow {
  const product = row.product
  const context = row.productContext
  const inputs = row.quoteInputs
  const calculation = row.calculation
  const isCustomerPrice = Boolean(row.quoteNumber)
  const isPackageSummary = isCustomerPackageSummary(row)
  const quoteStatus = row.lifecycleStatus === "P" ? "P" : "Q"
  const missingPricingValues = new Set<string>()
  if (isCustomerPrice && !row.customerPartCode?.trim()) {
    missingPricingValues.add("Customer Part Code")
  }
  for (const field of row.pricingMissingFields) {
    missingPricingValues.add(field)
  }
  const customerValue = (
    record: Record<string, unknown>,
    key: string,
    decimalPlaces = 2
  ) => (isCustomerPrice ? value(record, key, decimalPlaces) : "-")
  const view: PricingViewRow = {
    "Row Type": isPackageSummary ? "Package Total" : row.itemType,
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
    "Product Base Cost (INR/pc)": isPackageSummary
      ? "-"
      : value(product, "productCostInr"),
    Casting: isPackageSummary ? "-" : value(product, "casting"),
    "Scrap Rate (INR/kg)": isPackageSummary
      ? "-"
      : customerValue(inputs, "scrapRate"),
    "Alloy Premium (INR/kg)": isPackageSummary
      ? "-"
      : value(product, "alloyPremium"),
    "Ext. Cost (INR/kg)": isPackageSummary
      ? "-"
      : value(product, "extrusionCost"),
    "Forg Cost+ Nitric Blasting (INR/kg)": isPackageSummary
      ? "-"
      : value(product, "forgingCost"),
    "Direct (INR/kg)": directValue(
      product,
      "directPurchasePricePerKg",
      "machiningCost"
    ),
    "Direct (INR/pc)": directValue(
      product,
      "directPurchasePricePerPiece",
      "machiningPricePerPiece"
    ),
    "M/c Cost (INR/kg)": machiningValue(product, "machiningCost"),
    "M/c Cost (INR/pc)": machiningValue(product, "machiningPricePerPiece"),
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
    "Rejection %": percentValue(product, "rejectionPercent"),
    "BL %": percentValue(product, "burningLossPercent"),
    "Conversion Cost": "95.00",
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
    "BOM Component Cost (INR/pc)": isPackageSummary
      ? customerValue(calculation, "childQuoteTotal")
      : "-",
    Currency: "USD",
    "Rate / PCS In Currency": customerValue(calculation, "rateUsd", 4),
    "Pricing Completeness":
      row.lifecycleStatus === "D"
        ? "Dead"
        : missingPricingValues.size
          ? "Missing Values"
          : "Complete",
    "Missing Pricing Values": missingPricingValues.size
      ? [...missingPricingValues].join("; ")
      : "-",
    "Quote Status": isCustomerPrice
      ? row.componentDepth > 0
        ? "-"
        : dashIfEmpty(row.status)
      : "-",
    Remarks: value(context, "remarks"),
  }

  if (isPackageSummary) {
    for (const column of packageNotApplicableColumns) view[column] = "-"
    for (const column of packageDashWhenEmptyColumns) {
      if (!normalizedText(view[column])) view[column] = "-"
    }
    for (const column of packageDashWhenZeroColumns) {
      const result = normalizedText(view[column])
      if (!result || Number(result) === 0) view[column] = "-"
    }
  }

  return view
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
    pricingMissingFields: [],
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
  const sheet = XLSX.utils.json_to_sheet(toPricingViewRows(rows), {
    header: pricingHeaders,
  })
  sheet["!cols"] = pricingHeaders.map((header) => ({
    wch: Math.max(14, Math.min(header.length + 6, 32)),
  }))
  XLSX.utils.book_append_sheet(workbook, sheet, "Pricing View")
  return workbook
}

export function toPricingViewRows(rows: PricingRegisterRow[]) {
  return orderPricingRows(rows).map(toPricingViewRow)
}
export const pricingWorkbookFilename = "pricing-view.xlsx"

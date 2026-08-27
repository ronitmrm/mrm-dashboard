import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"

import {
  buildPricingWorkbook,
  pricingHeaders,
  pricingWorkbookFilename,
  toPricingViewRow,
  toPricingViewRows,
  type PricingRegisterRow,
} from "./pricing-workbook"

const row: PricingRegisterRow = {
  calculation: {
    netRateWithAlloy: 130,
    netRateWithoutAlloy: 110,
    rateUsd: 1.2500000000000002,
    scrapRatePerGm: 0.5685000000000001,
    totalRateInr: 100,
  },
  changeDate: new Date("2026-07-22T00:00:00.000Z"),
  companyName: "Example Customer",
  componentDepth: 0,
  componentQuantity: 1,
  currency: "USD",
  customerId: "customer-id",
  customerPartCode: "PART-1",
  customerUid: "C001",
  enquiryDescription: "Valve",
  enquiryNumber: "ENQ-1",
  id: "quote-id",
  isActive: true,
  itemType: "List",
  lifecycleStatus: "Q",
  lineNumber: 1,
  packaging: "Export",
  parentUid: null,
  pricingMissingFields: [],
  product: {
    burningLossPercent: 0.03,
    description: "Valve",
    directPurchasePricePerKg: 120,
    directPurchasePricePerPiece: 1.2,
    pricingMethod: "Derived",
    rejectionPercent: 0.05,
    uid: "Q001",
  },
  productContext: { grade: "CZ121" },
  quoteInputs: { conversionRate: 80, profitPercent: 0.2 },
  quoteNumber: "ENQ-1-Q001",
  revision: 1,
  rowKey: "quote-id:quote-id",
  sentAt: new Date("2026-07-22T01:00:00.000Z"),
  shippingTerms: "FOB",
  status: "Sent",
  uid: "Q001",
  unitPrice: 1.25,
  websiteProductDescription: "Purchased valve",
  websiteSize: "1/2 inch",
}

describe("Pricing spreadsheet workbook", () => {
  test("preserves the source sheet, filename, headers and percent display", () => {
    const view = toPricingViewRow(row)
    expect(view["Rejection %"]).toBe("5.00")
    expect(view["BL %"]).toBe("3.00")
    expect(view.Profit).toBe("20.00")
    expect(view["Scrap Rate / gm"]).toBe("0.57")
    expect(view["Rate / PCS In Currency"]).toBe("1.2500")
    expect(view["Direct (INR/kg)"]).toBe("-")
    expect(view["Direct (INR/pc)"]).toBe("-")
    expect(view.Size).toBe("1/2 inch")
    expect(view["MRMPL Product Description"]).toBe("Purchased valve")
    expect(pricingWorkbookFilename).toBe("pricing-view.xlsx")
    expect(pricingHeaders.at(-1)).toBe("Remarks")

    const workbook = buildPricingWorkbook([row])
    expect(workbook.SheetNames).toEqual(["Pricing View"])
    const sheet = workbook.Sheets["Pricing View"]!
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    expect(values[0]).toEqual(pricingHeaders)
    expect(values[1]?.[pricingHeaders.indexOf("Rate / PCS In Currency")]).toBe(
      "1.2500"
    )
  })

  test("shows WORKING direct prices in Direct columns and hides machining", () => {
    const directRow: PricingRegisterRow = {
      ...row,
      product: {
        ...row.product,
        directPurchasePricePerKg: 0,
        directPurchasePricePerPiece: 0,
        machiningCost: 514,
        machiningPricePerPiece: 0.771,
        pricingMethod: "Direct Purchase",
      },
    }

    expect(toPricingViewRow(directRow)).toMatchObject({
      "Direct (INR/kg)": "514.00",
      "Direct (INR/pc)": "0.77",
      "M/c Cost (INR/kg)": "-",
      "M/c Cost (INR/pc)": "-",
    })
  })

  test("identifies incomplete prices and defaults their USD terms", () => {
    const incompleteRow: PricingRegisterRow = {
      ...row,
      currency: "",
      customerPartCode: null,
      pricingMissingFields: ["Production Type", "Rod Size"],
      quoteInputs: {},
    }

    expect(toPricingViewRow(incompleteRow)).toMatchObject({
      Currency: "USD",
      "Conversion Cost": "95.00",
      "Missing Pricing Values": "Customer Part Code; Production Type; Rod Size",
      "Pricing Completeness": "Missing Values",
    })
  })

  test("labels product-base pricing and exposes its stored INR cost", () => {
    const productBaseRow: PricingRegisterRow = {
      ...row,
      companyName: "",
      currency: "INR",
      customerId: "",
      customerPartCode: null,
      customerUid: "",
      lifecycleStatus: "D",
      packaging: null,
      parentUid: null,
      product: { ...row.product, productCostInr: 16.2957 },
      quoteNumber: "",
      revision: 0,
      shippingTerms: null,
      status: "",
    }

    expect(toPricingViewRow(productBaseRow)).toMatchObject({
      "Customer Line Status": "-",
      "Customer Part Code": "-",
      "Customer UID": "-",
      ENQ: "-",
      "Enquiry Description": "-",
      Line: "-",
      "Net Rate / KG Without Alloy Premium": "-",
      Packaging: "-",
      "Price Rev": "-",
      "Pricing Scope": "Product Base",
      "Product Base Cost (INR/pc)": "16.30",
      Profit: "-",
      "Q/P": "Q",
      "Quote Status": "-",
      "Rate / PCS In Currency": "-",
      "Scrap Rate (INR/kg)": "-",
      Shipping: "-",
      Under: "-",
    })
    expect(toPricingViewRow(row)["Pricing Scope"]).toBe("Customer Price")
  })

  test("uses one dash and repeats enquiry context on BOM children", () => {
    const childRow: PricingRegisterRow = {
      ...row,
      componentDepth: 1,
      enquiryDescription: "Package enquiry",
      lifecycleStatus: "D",
      lineNumber: 7,
      packaging: "—",
      parentUid: "M2",
      shippingTerms: "–",
      uid: "M2B",
    }

    expect(toPricingViewRow(childRow)).toMatchObject({
      "Customer Line Status": "Q",
      "Enquiry Description": "Package enquiry",
      Line: 7,
      Packaging: "-",
      "Q/P": "Q",
      "Quote Status": "-",
      Shipping: "-",
      Under: "M2",
    })
  })

  test("keeps product-derived answers on a package base row", () => {
    const packageRow: PricingRegisterRow = {
      ...row,
      calculation: { piecesPerKg: 66.2251655629139 },
      companyName: "",
      currency: "INR",
      customerId: "",
      customerPartCode: null,
      customerUid: "",
      itemType: "Package",
      product: {
        assemblyOperationCost: 5,
        description: "3/16 X 1/8 Male Compression X Male Nptf Adapter",
        productCostInr: 2.36,
        rejectionPercent: 0.02,
        uid: "M2",
      },
      quoteNumber: "",
      revision: 0,
      status: "",
      uid: "M2",
    }

    expect(toPricingViewRow(packageRow)).toMatchObject({
      "Assembly Cost (INR/kg)": "5.00",
      "No of Piece / KG": "66.23",
      "Product Base Cost (INR/pc)": "2.36",
      "Rejection %": "2.00",
      "Total Rate / PCS In INR": "-",
    })
  })

  test("shows the M2 package first and separates process, BOM, combined INR, and currency totals", () => {
    const packageRow: PricingRegisterRow = {
      ...row,
      calculation: {
        childQuoteTotal: 21.79,
        netRateWithAlloy: 0,
        netRateWithoutAlloy: 0,
        rateInr: 0.69,
        rateUsd: 0.2379,
        rawMaterialCost: 0,
        scrapRatePerGm: 0,
        scrapReturn: 0,
        totalRateInr: 22.48,
        totalRodsCost: 21.79,
      },
      itemType: "Package",
      product: {
        alloyPremium: 7,
        annealing: 0,
        assemblyOperationCost: 5,
        buffing: 0,
        casting: 1,
        deburring: 0,
        description: "M2 package",
        extrusionCost: 26,
        forgingCost: 12,
        machiningCost: 0,
        marking: 0,
        overheadCost: 0,
        plating: 0,
        productCostInr: 2.94,
        rejectionPercent: 0.02,
        sealant: 0,
        washing: 0,
      },
      productContext: {
        dieCode: "",
        grade: "",
        machineType: "",
        remarks: "",
        rodSize: "",
        rodType: "",
      },
      quoteInputs: {
        ...row.quoteInputs,
        assembledPartInr: 21.79,
        conversionRate: 95,
        packingCost: 0.15,
        profitPercent: 0.15,
        purchaseTimes: 1,
        scrapRate: 835,
        shippingCost: 0.09,
      },
      rowKey: "m2-root:m2-root",
      uid: "M2",
    }
    const component = (uid: string): PricingRegisterRow => ({
      ...row,
      componentDepth: 1,
      itemType: "Solid",
      parentUid: "M2",
      product: { description: uid },
      rowKey: `m2-root:${uid}`,
      uid,
    })

    const views = toPricingViewRows([
      packageRow,
      component("M2B"),
      component("R26"),
      component("R51"),
    ])

    expect(views.map((view) => view.UID)).toEqual(["M2", "M2B", "R26", "R51"])
    expect(pricingHeaders).not.toContain("Assembled Part")
    expect(pricingHeaders.indexOf("BOM Component Cost (INR/pc)")).toBe(
      pricingHeaders.indexOf("Total Rate / PCS In INR") + 1
    )
    expect(
      pricingHeaders.indexOf(
        "Total Package Price Including BOM Component Cost (INR/pc)"
      )
    ).toBe(pricingHeaders.indexOf("BOM Component Cost (INR/pc)") + 1)
    expect(views[0]).toMatchObject({
      "Alloy Premium (INR/kg)": "-",
      "Anneling (INR/kg)": "0.00",
      "Assembly Cost (INR/kg)": "5.00",
      "BL %": "-",
      "BOM Component Cost (INR/pc)": "21.79",
      "Buffing (INR/kg)": "0.00",
      Casting: "-",
      "Debbring (INR/kg)": "0.00",
      "Die Code": "-",
      "Ext. Cost (INR/kg)": "-",
      "Forg Cost+ Nitric Blasting (INR/kg)": "-",
      Grade: "-",
      "M/c Cost (INR/kg)": "-",
      "Machine Type": "-",
      "Marking (INR/kg)": "0.00",
      "Net Rate / KG With Alloy Premium": "-",
      "Net Rate / KG Without Alloy Premium": "-",
      "OR Purchase Times": "-",
      "Overhead (INR/kg)": "-",
      "Packing (INR/kg)": "0.15",
      "Plating (INR/kg)": "0.00",
      "Product Base Cost (INR/pc)": "-",
      "Production Type": "-",
      "Rate / PCS In INR": "0.69",
      "Rate / PCS In Currency": "0.2366",
      "Rejection %": "2.00",
      "RM Cost": "-",
      "Rod Size": "-",
      "Rod Type": "-",
      "Scrap Rate (INR/kg)": "-",
      "Scrap Rate / gm": "-",
      "Scrap Return": "-",
      "Sealant (INR/kg)": "0.00",
      "Shipping (INR/kg)": "0.09",
      "Total Package Price Including BOM Component Cost (INR/pc)": "22.48",
      "Total Rate / PCS In INR": "0.69",
      "Total Rods Cost": "-",
      "Washing (INR/kg)": "-",
    })
  })
})

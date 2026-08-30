import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"

import {
  buildPricingWorkbook,
  isPricingFormulaCell,
  pricingFormulaHeaders,
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
  test("omits BOM Level and identifies every displayed pricing formula", () => {
    expect(pricingHeaders).not.toContain("BOM Level")
    expect(pricingFormulaHeaders).toEqual([
      "No of Piece / KG",
      "Direct (INR/pc)",
      "M/c Cost (INR/pc)",
      "Net Rate / KG Without Alloy Premium",
      "Net Rate / KG With Alloy Premium",
      "Scrap Rate / gm",
      "RM Cost",
      "Scrap Return",
      "Scrap Return Price ( Inc. Burning Loss )",
      "Scrap Return Price",
      "Total Rods Cost",
      "Rejection",
      "Total - A",
      "Profit - B",
      "Total - A + B",
      "Rate / PCS In INR",
      "Total Rate / PCS In INR",
      "BOM Component Cost (INR/pc)",
      "Total Package Price Including BOM Component Cost (INR/pc)",
      "Rate / PCS In Currency",
    ])
    expect(
      pricingFormulaHeaders.every((header) => pricingHeaders.includes(header))
    ).toBe(true)
    const view = toPricingViewRow(row)
    expect(
      isPricingFormulaCell("Net Rate / KG Without Alloy Premium", view)
    ).toBe(true)
    expect(isPricingFormulaCell("BOM Component Cost (INR/pc)", view)).toBe(
      false
    )
    expect(
      isPricingFormulaCell("1 Piece Weight ( gm )", {
        ...view,
        "1 Piece Weight ( gm )": "15.10",
        "Row Type": "Package Total",
      })
    ).toBe(true)
    expect(isPricingFormulaCell("1 Piece Weight ( gm )", view)).toBe(false)
  })

  test("preserves the source sheet, filename, headers and percent display", () => {
    const view = toPricingViewRow(row)
    expect(view["Rejection %"]).toBe("5.00%")
    expect(view["BL %"]).toBe("3.00%")
    expect(view.Profit).toBe("20.00%")
    expect(view["Scrap Rate / gm"]).toBe("0.57")
    expect(view["Rate / PCS In Currency"]).toBe("1.2500")
    expect(view["Direct (INR/kg)"]).toBe("-")
    expect(view["Direct (INR/pc)"]).toBe("-")
    expect(view["Conversion Cost"]).toBe("80.00")
    expect(view.Size).toBe("1/2 inch")
    expect(view["MRMPL Product Description"]).toBe("Purchased valve")
    expect(pricingWorkbookFilename).toBe("pricing-view.xlsx")
    expect(pricingHeaders.at(-1)).toBe("Remarks")
    expect(pricingHeaders).toContain("Q/P")
    expect(pricingHeaders).not.toContain("Customer Line Status")
    expect(pricingHeaders).not.toContain("Pricing Completeness")
    expect(pricingHeaders).not.toContain("Missing Pricing Values")

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

  test("shows forging as not applicable for a Barstock product", () => {
    const barstockRow: PricingRegisterRow = {
      ...row,
      product: {
        ...row.product,
        forgingCost: 0,
        productionType: "Barstock",
      },
    }

    expect(
      toPricingViewRow(barstockRow)["Forg Cost+ Nitric Blasting (INR/kg)"]
    ).toBe("-")
  })

  test("shows forging only for Casting and Forging products", () => {
    const forgingFor = (productionType: string) => {
      const productionRow: PricingRegisterRow = {
        ...row,
        product: {
          ...row.product,
          forgingCost: 12,
          productionType,
        },
      }

      return toPricingViewRow(productionRow)[
        "Forg Cost+ Nitric Blasting (INR/kg)"
      ]
    }

    expect(forgingFor("Casting")).toBe("12.00")
    expect(forgingFor("Forging")).toBe("12.00")
    for (const productionType of ["Barstock", "Moulded", "Package"]) {
      expect(forgingFor(productionType)).toBe("-")
    }
  })
  test("defaults incomplete prices to their available USD terms", () => {
    const incompleteRow: PricingRegisterRow = {
      ...row,
      currency: "",
      customerPartCode: null,
      pricingMissingFields: ["Product Type", "Rod Size"],
      quoteInputs: {},
    }

    expect(toPricingViewRow(incompleteRow)).toMatchObject({
      Currency: "USD",
      "Conversion Cost": "-",
    })
  })

  test("labels product-base pricing without inventing customer values", () => {
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
      "Customer Part Code": "-",
      "Customer UID": "-",
      ENQ: "-",
      "Enquiry Description": "-",
      Line: "-",
      "Net Rate / KG Without Alloy Premium": "-",
      Packaging: "-",
      "Price Rev": "-",
      "Pricing Scope": "Product Base",
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
      customerPartCode: null,
      enquiryDescription: "Package enquiry",
      lifecycleStatus: "Q",
      lineNumber: 7,
      packaging: "—",
      parentUid: "M2",
      pricingMissingFields: ["Customer Part Code"],
      shippingTerms: "–",
      uid: "M2B",
    }

    expect(toPricingViewRow(childRow)).toMatchObject({
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
        burningLossPercent: 0.05,
        machiningCost: 180,
        machiningPricePerPiece: 5.5,
        productCostInr: 2.36,
        rejectionPercent: 0.02,
        uid: "M2",
      },
      productContext: {
        grade: "C3604",
        rodSize: "16 mm",
        rodType: "SOLID",
      },
      quoteNumber: "",
      revision: 0,
      status: "",
      uid: "M2",
    }

    expect(toPricingViewRow(packageRow)).toMatchObject({
      "Assembly Cost (INR/kg)": "5.00",
      "BL %": "-",
      Grade: "-",
      "M/c Cost (INR/kg)": "-",
      "M/c Cost (INR/pc)": "-",
      "No of Piece / KG": "66.23",
      "Rejection %": "2.00%",
      "Rod Size": "-",
      "Rod Type": "-",
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
    expect(pricingHeaders).not.toContain("Product Base Cost (INR/pc)")
    expect(pricingHeaders.indexOf("BOM Component Cost (INR/pc)")).toBe(
      pricingHeaders.indexOf("Total Rate / PCS In INR") + 1
    )
    expect(
      pricingHeaders.indexOf(
        "Total Package Price Including BOM Component Cost (INR/pc)"
      )
    ).toBe(pricingHeaders.indexOf("BOM Component Cost (INR/pc)") + 1)
    expect(pricingHeaders).toContain("Product Type")
    expect(pricingHeaders).toContain("Production Type")
    expect(pricingHeaders).toContain("Blank Piece Weight ( gm )")
    expect(pricingHeaders).not.toContain("Casting")
    expect(pricingHeaders).not.toContain("Machine Type")
    expect(views[0]).toMatchObject({
      "Alloy Premium (INR/kg)": "-",
      "Anneling (INR/kg)": "0.00",
      "Assembly Cost (INR/kg)": "5.00",
      "BL %": "-",
      "BOM Component Cost (INR/pc)": "21.79",
      "Buffing (INR/kg)": "0.00",
      "Blank Piece Weight ( gm )": "-",
      "Debbring (INR/kg)": "0.00",
      "Die Code": "-",
      "Ext. Cost (INR/kg)": "-",
      "Forg Cost+ Nitric Blasting (INR/kg)": "-",
      Grade: "-",
      "M/c Cost (INR/kg)": "-",
      "Production Type": "-",
      "Marking (INR/kg)": "0.00",
      "Net Rate / KG With Alloy Premium": "-",
      "Net Rate / KG Without Alloy Premium": "-",
      "OR Purchase Times": "-",
      "Overhead (INR/kg)": "-",
      "Packing (INR/kg)": "0.15",
      "Plating (INR/kg)": "0.00",
      "Product Type": "-",
      "Rate / PCS In INR": "0.69",
      "Rate / PCS In Currency": "0.2366",
      "Rejection %": "2.00%",
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

  test("treats a nested Assembly as a package summary", () => {
    const assemblyRow: PricingRegisterRow = {
      ...row,
      calculation: {
        childQuoteTotal: 54.41,
        rateInr: 14.01,
        rateUsd: 0.1483,
        totalRateInr: 68.42,
      },
      componentDepth: 1,
      itemType: "Assembly",
      parentUid: "M1110",
      pricingMissingFields: ["One-Piece Weight (g)*", "Pieces per Kg"],
      product: {
        alloyPremium: 7,
        assemblyOperationCost: 353,
        burningLossPercent: 0.05,
        casting: 4.06,
        extrusionCost: 26,
        forgingCost: 12,
        machiningCost: 180,
        machiningPricePerPiece: 5.5,
        productionType: "Assembly",
      },
      productContext: {
        grade: "C3604",
        rodSize: "16 mm",
        rodType: "SOLID",
      },
      quoteInputs: {
        ...row.quoteInputs,
        conversionRate: 94.5,
        scrapRate: 915,
      },
      uid: "M1110A",
    }

    expect(toPricingViewRow(assemblyRow)).toMatchObject({
      "Alloy Premium (INR/kg)": "-",
      "Assembly Cost (INR/kg)": "353.00",
      "BL %": "-",
      "BOM Component Cost (INR/pc)": "54.41",
      "Ext. Cost (INR/kg)": "-",
      Grade: "-",
      "M/c Cost (INR/kg)": "-",
      "M/c Cost (INR/pc)": "-",
      "Rate / PCS In Currency": "0.7240",
      "Rod Size": "-",
      "Rod Type": "-",
      "Scrap Rate (INR/kg)": "-",
      "Total Package Price Including BOM Component Cost (INR/pc)": "68.42",
      "Total Rate / PCS In INR": "14.01",
    })
  })
})

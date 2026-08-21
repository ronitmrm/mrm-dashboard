import * as XLSX from "xlsx"
import { describe, expect, test } from "vitest"

import type { CommercialMasterSnapshot } from "@workspace/db"

import {
  buildMastersWorkbook,
  masterTemplateFilename,
  parseMastersWorkbook,
} from "./workbook"

const snapshot: CommercialMasterSnapshot = {
  applications: [{ name: "Heating", sortOrder: 2 }],
  categories: [{ code: "01", name: "Fittings" }],
  certifications: [{ name: "ROHS", sortOrder: 3 }],
  commercialTerms: [{ active: true, name: "FOB", termType: "incoterms" }],
  customers: [
    {
      companyName: "Fixture Customer",
      country: "India",
      customerUid: "CUST-900",
      defaultBuyerName: "Purchasing",
      defaultCurrency: "USD",
      defaultIncoterms: "FOB",
      defaultPackagingTerms: "Export box",
      defaultPaymentTerms: "Net 30",
      defaultShipmentMode: "Sea",
      email: "sales@example.test",
      phone: null,
      status: "Active",
    },
  ],
  machineTypes: [{ name: "Conventional" }],
  materialGrades: [{ name: "C3604" }],
  materialRates: [
    {
      active: true,
      alloyPremium: 12.5,
      extrusionCost: 8.25,
      grade: "C3604",
      rodType: "SOLID",
    },
  ],
  packagingOptions: [
    {
      active: true,
      costBasis: "Per 100 pcs",
      name: "Export box",
      packingCost: 4.5,
    },
  ],
  processes: [{ name: "Forging" }],
  quoteTerms: [
    {
      active: true,
      label: "Validity",
      sortOrder: 10,
      termKey: "validity",
      value: "Thirty days",
    },
  ],
  rodTypes: [{ name: "SOLID" }],
  shippingTerms: [{ active: true, name: "Air", shippingCost: 7.5 }],
  subcategories: [
    {
      category: "Fittings",
      combinationCode: "101",
      name: "Elbows",
    },
  ],
  websiteFields: [{ fieldType: "material", name: "Brass", sortOrder: 4 }],
}

describe("Pricing masters workbook", () => {
  test("matches the source template sheet names and filenames", () => {
    const workbook = buildMastersWorkbook()

    expect(workbook.SheetNames).toEqual([
      "Customers",
      "Machine Types",
      "Grades",
      "Rod Types",
      "Categories",
      "Sub Categories",
      "Processes",
      "Applications",
      "Certifications",
      "Website Fields",
      "Website Connections",
      "Website Pressure",
      "Website Temperature",
      "Website Sealant",
      "Material Rates",
      "Shipping",
      "Packaging",
      "Commercial Terms",
      "Quote PDF Terms",
    ])
    expect(masterTemplateFilename()).toBe("masters-template.xlsx")
    expect(masterTemplateFilename("rod-types")).toBe(
      "rod-types-master-template.xlsx"
    )
  })

  test("falls back to the complete source template for an unknown master", () => {
    expect(buildMastersWorkbook(undefined, "unknown").SheetNames).toEqual(
      buildMastersWorkbook().SheetNames
    )
    expect(masterTemplateFilename("unknown")).toBe("masters-template.xlsx")
  })

  test("accepts source header aliases and transformations", () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          Company: "Alias Customer",
          Country: "",
          UID: "ALIAS-1",
        },
      ]),
      "Customers"
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ Machine_Type: "Swiss" }]),
      "Machine Types"
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([{ category_name: "Fittings", code: "02" }]),
      "Categories"
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          category_name: "Fittings",
          code: "202",
          subcategory: "Tees",
        },
      ]),
      "Sub Categories"
    )
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([
        {
          key: "validity",
          label: "Validity",
          sort_order: "not-a-number",
          text: "Thirty days",
        },
      ]),
      "Quote Terms"
    )

    expect(parseMastersWorkbook(workbook)).toMatchObject({
      categories: [{ code: "02", name: "Fittings" }],
      customers: [
        {
          companyName: "Alias Customer",
          country: null,
          customerUid: "ALIAS-1",
          email: null,
          phone: null,
          status: "Active",
        },
      ],
      machineTypes: [{ name: "Swiss" }],
      quoteTerms: [
        {
          active: true,
          label: "Validity",
          sortOrder: 100,
          termKey: "validity",
          value: "Thirty days",
        },
      ],
      subcategories: [
        {
          category: "Fittings",
          combinationCode: "202",
          name: "Tees",
        },
      ],
    })
  })

  test("round-trips canonical source master data", () => {
    const workbook = buildMastersWorkbook(snapshot)
    const output = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "buffer",
    }) as Buffer
    const reparsed = XLSX.read(output, { type: "buffer" })

    expect(parseMastersWorkbook(reparsed)).toEqual(snapshot)
  })
})

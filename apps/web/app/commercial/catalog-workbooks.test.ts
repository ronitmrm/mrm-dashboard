import { describe, expect, test } from "vitest"
import * as XLSX from "xlsx"

import type { DrawingHistoryRow, WebsiteProductRow } from "@workspace/db"

import {
  buildDrawingHistoryWorkbook,
  buildWebsiteProductWorkbook,
  drawingHistoryFilename,
  websiteProductFilename,
} from "./catalog-workbooks"

describe("LM08 commercial catalog workbooks", () => {
  test("preserves the Drawing History sheet, filename, columns, and display date", () => {
    const row: DrawingHistoryRow = {
      buffoliLaminatedQuantity: 1,
      cncLaminatedQuantity: 3,
      conventionalLaminatedQuantity: 2,
      drawingId: "drawing-1",
      drawingNumber: "DWG-1",
      itemDescription: "Fixture part",
      itemId: "item-1",
      remarks: "Released",
      revision: "2",
      revisionDate: "2026-07-22",
      rowNumber: 1,
      sourceQuoteItemId: null,
      uid: "M1",
    }
    const workbook = buildDrawingHistoryWorkbook([row])
    expect(drawingHistoryFilename).toBe("drawing-history.xlsx")
    expect(workbook.SheetNames).toEqual(["Drawing History"])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["Drawing History"]!, {
        defval: "",
      })
    ).toEqual([
      {
        "Drawing No.": "DWG-1",
        "Part Name": "Fixture part",
        "Rev Date": "22/07/2026",
        "Revision No.": "2",
        Remarks: "Released",
        "Sr. No.": 1,
        UID: "M1",
      },
    ])
  })

  test("exports the requested website catalogue fields in order", () => {
    const row = {
      additionalNotes: "Approved",
      applications: "Heating",
      assemblyCode1: "01-101-002",
      assemblyCode2: null,
      assemblyCode3: null,
      assemblyCode4: null,
      assemblyCode5: null,
      assemblyCode6: null,
      assemblyUid1: "M2",
      assemblyUid2: null,
      assemblyUid3: null,
      assemblyUid4: null,
      assemblyUid5: null,
      assemblyUid6: null,
      catalogGrade: "C3604",
      category: "Fittings",
      certifications: "ROHS",
      connections: "NPT",
      description: "Catalog copy",
      dimensions: "10 x 20 mm",
      drawingCategory: "Production",
      entryCreatedAt: "2026-07-22",
      finalAssembliesCode: "01-101-002",
      finishPlating: "Nickel",
      grade: "C3604",
      isActive: true,
      itemId: "item-1",
      material: "Brass",
      materialConstruction: "Forging",
      partCode: "01-101-001",
      pressure: "10 bar",
      productDescription: "1/2 in X Elbows",
      profileId: "profile-1",
      remark: "Ready",
      sealant: "PTFE",
      size: "1/2 in",
      sourceQuoteItemId: null,
      subCategory: "Elbows",
      temperature: "120 C",
      threadSize1: "1/2 NPT",
      threadSize2: null,
      threadSize3: null,
      threadSize4: null,
      threadStandard: "ANSI/ASME B1.20.1",
      uid: "M1",
      websiteCategory: null,
      websiteStatus: "Completed",
      websiteSubCategory: null,
    } satisfies WebsiteProductRow
    const workbook = buildWebsiteProductWorkbook([row])
    const sheet = workbook.Sheets["Website Product Data"]!
    const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
    expect(websiteProductFilename).toBe("website-product-data.xlsx")
    expect(workbook.SheetNames).toEqual(["Website Product Data"])
    expect(values[0]).toEqual([
      "uid",
      "description",
      "grade",
      "material",
      "size",
      "category",
      "sub_category",
      "applications",
      "certifications",
      "connections",
      "MATERIAL CONSTRUCTION",
      "FINAL ASSEMBLIES CODE",
      "dimensions",
      "drawing_category",
      "finish_plating",
      "pressure",
      "sealant",
      "temperature",
      "THREAD STANDARD",
      "thread_size_1",
      "thread_size_2",
      "thread_size_3",
      "thread_size_4",
      "website_active",
      "created_at",
      "remark",
      "additional_notes",
    ])
    expect(values[1]).toEqual([
      "M1",
      "Catalog copy",
      "C3604",
      "Brass",
      "1/2 in",
      "Fittings",
      "Elbows",
      "Heating",
      "ROHS",
      "NPT",
      "Forging",
      "01-101-002",
      "10 x 20 mm",
      "Production",
      "Nickel",
      "10 bar",
      "PTFE",
      "120 C",
      "ANSI/ASME B1.20.1",
      "1/2 NPT",
      "",
      "",
      "",
      "TRUE",
      "2026-07-22",
      "Ready",
      "Approved",
    ])
  })
})

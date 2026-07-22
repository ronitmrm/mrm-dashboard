import * as XLSX from "xlsx"
import { describe, expect, test } from "vitest"

import {
  buildEnquiryLinesExport,
  buildEnquiryLinesTemplate,
  buildEnquiryRegisterExport,
  buildEnquiryRegisterTemplate,
  enquiryLinesExportFilename,
  enquiryLinesTemplateFilename,
  enquiryRegisterExportFilename,
  enquiryRegisterTemplateFilename,
  parseEnquiryImportFile,
  parseEnquiryRegisterFile,
} from "./enquiry-workbook"

describe("enquiry import workbook", () => {
  test("preserves the source CSV template contract and spreadsheet row numbers", () => {
    const csv = [
      "part,description,quantity,target_price,grade,drawing_reference,remarks",
      'P-100,"Quoted, precision component",12,4.5,CZ121,DRG-100,Urgent',
      ",,,,,,",
      "P-200,Second component,3,8.25,CW614N,DRG-200,",
    ].join("\n")

    expect(
      parseEnquiryImportFile(Buffer.from(csv), "customer-enquiry.csv")
    ).toEqual([
      {
        rawValues: {
          description: "Quoted, precision component",
          drawing_reference: "DRG-100",
          grade: "CZ121",
          part: "P-100",
          quantity: "12",
          remarks: "Urgent",
          target_price: "4.5",
        },
        rowNumber: 2,
        status: "Unclassified",
      },
      {
        rawValues: {
          description: "Second component",
          drawing_reference: "DRG-200",
          grade: "CW614N",
          part: "P-200",
          quantity: "3",
          remarks: "",
          target_price: "8.25",
        },
        rowNumber: 4,
        status: "Unclassified",
      },
    ])
  })

  test.each(["xls", "xlsx"])(
    "accepts source header aliases from %s workbooks",
    (extension) => {
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet([
          {
            "Customer Drawing Reference": "DWG-ALIAS",
            Description: "Workbook line",
            Grade: "C3604",
            Part: "WB-1",
            Quantity: 9,
            Remarks: "Imported",
            "Target Price": 17.5,
          },
        ]),
        "Enquiry Lines"
      )
      const buffer = XLSX.write(workbook, {
        bookType: extension as "xls" | "xlsx",
        type: "buffer",
      }) as Buffer

      expect(
        parseEnquiryImportFile(buffer, `enquiry-lines.${extension}`)
      ).toEqual([
        {
          rawValues: {
            description: "Workbook line",
            drawing_reference: "DWG-ALIAS",
            grade: "C3604",
            part: "WB-1",
            quantity: "9",
            remarks: "Imported",
            target_price: "17.5",
          },
          rowNumber: 2,
          status: "Unclassified",
        },
      ])
    }
  )

  test("builds the exact source line template", () => {
    const workbook = buildEnquiryLinesTemplate()
    expect(workbook.SheetNames).toEqual(["Enquiry Lines"])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["Enquiry Lines"]!, {
        header: 1,
      })[0]
    ).toEqual([
      "part",
      "description",
      "grade",
      "quantity",
      "target_price",
      "customer_drawing_reference",
      "remarks",
    ])
    expect(enquiryLinesTemplateFilename()).toBe(
      "enquiry-line-items-template.csv"
    )
  })

  test("rejects unsupported file types", () => {
    expect(() =>
      parseEnquiryImportFile(Buffer.from("{}"), "enquiry.json")
    ).toThrow("CSV, XLS, or XLSX")
  })

  test("builds the exact Sales Work Register export contract", () => {
    const workbook = buildEnquiryRegisterExport([
      {
        buyerName: "Mayank",
        canDelete: false,
        canEdit: true,
        companyName: "Acme",
        customerUid: "C-001",
        dueFollowupCount: 1,
        enquiryNumber: "ENQ-2607-001",
        id: "enquiry-1",
        itemCount: 3,
        latestQuoteSentAt: new Date("2026-07-20T10:00:00.000Z"),
        nextFollowupDue: "2026-08-04",
        notFeasibleLineCount: 1,
        orderedLineCount: 1,
        pendingLineCount: 0,
        priority: "High",
        quoteSentCount: 1,
        quotedLineCount: 2,
        receivedOn: "2026-07-18",
        remarks: "Export fixture",
        source: "Email",
        technicalHandoverAt: new Date("2026-07-19T10:00:00.000Z"),
      },
    ])
    expect(workbook.SheetNames).toEqual(["Sales Work Register"])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["Sales Work Register"]!, {
        header: 1,
      })[0]
    ).toEqual([
      "Type",
      "Reference",
      "Received",
      "Customer UID",
      "Customer",
      "Source",
      "Priority",
      "Buyer Name",
      "Remarks",
      "Lines",
      "Quoted Lines",
      "Ordered Lines",
      "Pending Lines",
      "Not Feasible Lines",
      "Handover At",
      "Quote Items Sent",
      "PDF Sent At",
      "Quote PDF Link",
      "Next Follow-up",
      "Due Follow-ups",
      "Can Edit",
      "Can Delete",
    ])
    expect(enquiryRegisterExportFilename()).toBe("sales-work-register.xlsx")
  })

  test("builds the exact enquiry register import template", () => {
    const workbook = buildEnquiryRegisterTemplate()
    expect(workbook.SheetNames).toEqual(["Enquiry Register", "Instructions"])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["Enquiry Register"]!, {
        header: 1,
      })[0]
    ).toEqual([
      "ENQ No.",
      "Customer UID",
      "Customer",
      "Source",
      "Priority",
      "Buyer Name",
      "Remarks",
    ])
    expect(enquiryRegisterTemplateFilename()).toBe(
      "enquiry-register-import-template.xlsx"
    )
  })

  test("parses register aliases while preserving physical row numbers", () => {
    const csv = [
      "ENQ,Customer Code,Company,Source,Priority,Buyer,Notes",
      "ENQ-2607-001,C-001,,Portal,High,Mayank,Update",
      ",,,,,,",
      ",,Acme,Email,Normal,,Create",
    ].join("\n")
    expect(parseEnquiryRegisterFile(Buffer.from(csv), "register.csv")).toEqual([
      {
        buyerName: "Mayank",
        customerName: "",
        customerUid: "C-001",
        enquiryNumber: "ENQ-2607-001",
        priority: "High",
        remarks: "Update",
        rowNumber: 2,
        source: "Portal",
      },
      {
        buyerName: "",
        customerName: "Acme",
        customerUid: "",
        enquiryNumber: "",
        priority: "Normal",
        remarks: "Create",
        rowNumber: 4,
        source: "Email",
      },
    ])
  })

  test("builds the exact logged-lines export contract", () => {
    const workbook = buildEnquiryLinesExport(
      {
        companyName: "Acme",
        customerUid: "C-001",
        enquiryNumber: "ENQ-2607-001",
      },
      [
        {
          customerPartCode: "P-1",
          description: "Part",
          drawingFileName: "drawing.pdf",
          drawingReference: "D-1",
          grade: "CZ121",
          lineNumber: 1,
          quantity: 10,
          remarks: "Ready",
          targetPrice: 1.25,
        },
      ]
    )
    expect(workbook.SheetNames).toEqual(["Logged Lines"])
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets["Logged Lines"]!, {
        header: 1,
      })[0]
    ).toEqual([
      "ENQ No.",
      "Customer UID",
      "Customer",
      "Line No",
      "Part",
      "Description",
      "Grade",
      "Quantity",
      "Target",
      "Customer Drawing Reference",
      "Customer Drawing File",
      "Remarks",
    ])
    expect(enquiryLinesExportFilename("ENQ-2607-001")).toBe(
      "ENQ-2607-001-logged-lines.xlsx"
    )
  })
})

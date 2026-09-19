import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib"
import { describe, expect, it } from "vitest"
import type { PreparedEmploymentLetter } from "@workspace/db"

import { buildEmploymentLetterPdf } from "./employment-letter-pdf"

const identity = {
  department: "Human Resources",
  designation: "H.O.D.",
  employeeCode: "315",
  employeeName: "Divyaba M. Jadeja",
  joiningDate: "2025-11-26",
  lastWorkingDate: "2026-02-16",
}

describe("employment letter PDF", () => {
  const letters: Array<[string, number, PreparedEmploymentLetter]> = [
    [
      "offer",
      2,
      {
        applicationStatus: "Approved",
        details: {
          dutyStartTime: "09:15",
          dutyEndTime: "18:45",
          salaryAfterProbationMinimum: 18000,
          salaryAfterProbationMaximum: 22000,
          payPeriod: "month",
          postalAddress: "368-1, Elgan Society\nHapa, Jamnagar",
          probationLength: 2,
          probationUnit: "months",
          signatoryDesignation: "Director",
          signatoryName: "Ankit Khattar",
        },
        identity: { ...identity, employeeCode: null },
        issuedOn: "2026-04-13",
        ordinal: 11,
        reference: "MRMPL-HR-202627-OL-11",
        salary: 15000,
        type: "offer" as const,
        willingToJoin: true,
      },
    ],
    [
      "appointment",
      2,
      {
        details: {
          confirmationEffectiveDate: "2026-02-23",
          grossMonthlySalary: 24500,
          probationCompletedOn: "2026-02-22",
          reportsTo: "Ronit Khattar",
          signatoryDesignation: "Director",
          signatoryName: "Ankit Khattar",
          workLocation: "Star Venus",
        },
        identity,
        issuedOn: "2026-03-02",
        ordinal: 7,
        postStatus: "Occupied",
        reference: "MRMPL-HR-202526-AL-7",
        type: "appointment" as const,
      },
    ],
    [
      "experience",
      1,
      {
        details: {
          keyResponsibilities: "Team coordination and employee management",
          pronouns: "she-her",
          signatoryDesignation: "Director",
          signatoryName: "Ankit Khattar",
          title: "Ms.",
          workLocation: "Head Office",
        },
        identity,
        issuedOn: "2026-04-13",
        ordinal: 8,
        postStatus: "Resigned",
        reference: "MRMPL-HR-202627-EL-8",
        type: "experience" as const,
      },
    ],
  ]

  it.each(letters)(
    "builds the %s template",
    async (type, pageCount, letter) => {
      const bytes = await buildEmploymentLetterPdf(letter)
      expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe("%PDF")
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(pageCount)
      expect(pdf.getTitle()).toContain(letter.identity.employeeName)
      expect(pdf.getSubject()).toContain(`${type}`)
      if (type === "offer") {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
        const document = await getDocument({
          data: bytes,
          useSystemFonts: true,
        }).promise
        try {
          const pages = await Promise.all(
            [1, 2].map(async (number) => {
              const page = await document.getPage(number)
              const content = await page.getTextContent()
              return content.items
                .flatMap((item) => ("str" in item ? [item.str] : []))
                .join(" ")
            })
          )
          expect(pages[0]).toContain("OFFER LETTER")
          for (const text of [
            "Continuation of Offer Letter",
            "Rs. 15,000.00",
            "Rs. 18,000.00",
            "Rs. 22,000.00",
            "09:15 to 18:45",
            "withhold dues",
            "Acknowledged and Accepted by:",
            letter.identity.employeeName,
            "Date: ____________________",
          ]) {
            expect(pages[1]?.replace(/\s+/g, " ")).toContain(text)
          }
        } finally {
          await document.destroy()
        }
      }
      if (type === "appointment") {
        const content = pdf.context
          .enumerateIndirectObjects()
          .filter(
            (entry): entry is [(typeof entry)[0], PDFRawStream] =>
              entry[1] instanceof PDFRawStream
          )
          .map(([, stream]) =>
            Buffer.from(decodePDFRawStream(stream).decode()).toString()
          )
          .join("\n")
        for (const text of [
          "Acknowledged and Accepted by:",
          letter.identity.employeeName,
          "Date: ____________________",
        ]) {
          expect(content).toContain(
            `<${Buffer.from(text).toString("hex").toUpperCase()}> Tj`
          )
        }
      }
    }
  )
})

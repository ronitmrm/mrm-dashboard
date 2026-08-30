import { PDFDocument } from "pdf-lib"
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
    }
  )
})

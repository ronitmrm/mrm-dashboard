import { describe, expect, it } from "vitest"

import { prepareEmploymentLetter } from "./recruitment-employment-letters"

const identity = {
  department: "Human Resources",
  designation: "H.O.D.",
  employeeCode: "315",
  employeeName: "Divyaba M. Jadeja",
  joiningDate: "2025-11-26",
}

describe("employment letter lifecycle", () => {
  it("prepares an accepted candidate offer with the financial-year reference", () => {
    const letter = prepareEmploymentLetter({
      applicationStatus: "Approved",
      details: {
        payPeriod: "month",
        postalAddress: "368-1, Elgan Society\nHapa, Jamnagar\nGujarat - 361120",
        probationLength: 2,
        probationUnit: "months",
        signatoryDesignation: "Director",
        signatoryName: "Ankit Khattar",
      },
      identity: {
        ...identity,
        employeeCode: null,
      },
      issuedOn: "2026-04-13",
      ordinal: 11,
      salary: 15000,
      type: "offer",
      willingToJoin: true,
    })

    expect(letter.reference).toBe("MRMPL-HR-202627-OL-11")
    expect(letter.details.postalAddress).toContain("Hapa, Jamnagar")
  })

  it("rejects an appointment letter before an employee completes probation", () => {
    expect(() =>
      prepareEmploymentLetter({
        details: {
          confirmationEffectiveDate: "2026-02-01",
          grossMonthlySalary: 24500,
          probationCompletedOn: "2026-03-01",
          reportsTo: "Ronit Khattar",
          signatoryDesignation: "Director",
          signatoryName: "Ankit Khattar",
          workLocation: "Star Venus",
        },
        identity,
        issuedOn: "2026-02-20",
        ordinal: 7,
        postStatus: "Occupied",
        type: "appointment",
      })
    ).toThrow(
      "Probation must be completed before issuing an Appointment Letter."
    )
  })

  it("rejects an experience letter before the recorded last working date", () => {
    expect(() =>
      prepareEmploymentLetter({
        details: {
          keyResponsibilities: "Team coordination and employee management",
          pronouns: "she-her",
          signatoryDesignation: "Director",
          signatoryName: "Ankit Khattar",
          title: "Ms.",
          workLocation: "Head Office",
        },
        identity: {
          ...identity,
          lastWorkingDate: "2026-04-30",
        },
        issuedOn: "2026-04-13",
        ordinal: 8,
        postStatus: "Resigned",
        type: "experience",
      })
    ).toThrow(
      "Last Working Date must be reached before issuing an Experience Letter."
    )
  })
})

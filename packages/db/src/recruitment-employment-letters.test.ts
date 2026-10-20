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
        dutyStartTime: "09:15",
        dutyEndTime: "18:45",
        salaryAfterProbationMinimum: 18000,
        salaryAfterProbationMaximum: 22000,
        payPeriod: "month",
        postalAddress: "368-1, Elgan Society\nHapa, Jamnagar\nGujarat - 361120",
        probationLength: 2,
        probationUnit: "months",
        signatoryDesignation: "Director",
        signatoryName: "Ankit Khattar",
      },
      identity: {
        ...identity,
        employeeCode: "69",
      },
      issuedOn: "2026-04-13",
      ordinal: 11,
      salary: 15000,
      type: "offer",
      willingToJoin: true,
    })

    expect(letter.reference).toBe("MRMPL-HR-202627-OL-11")
    expect(letter.identity.employeeCode).toBeNull()
    expect(letter.details.postalAddress).toContain("Hapa, Jamnagar")
  })

  it("rejects an appointment letter before an employee completes probation", () => {
    expect(() =>
      prepareEmploymentLetter({
        details: {
          confirmationEffectiveDate: "2026-02-01",
          dutyStartTime: "09:15",
          dutyEndTime: "18:45",
          grossMonthlySalary: 24500,
          minimumWeeklyHours: 60,
          postalAddress: "12 Test Road\nJamnagar, Gujarat - 361001",
          probationCompletedOn: "2026-03-01",
          probationLength: 3,
          probationUnit: "months",
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

  it("retains appointment terms and validates duty hours", () => {
    const request = {
      details: {
        confirmationEffectiveDate: "2026-02-23",
        dutyStartTime: "09:15",
        dutyEndTime: "18:45",
        grossMonthlySalary: 24500,
        minimumWeeklyHours: 54,
        postalAddress: " 12 Test Road\nJamnagar, Gujarat - 361001 ",
        probationCompletedOn: "2026-02-22",
        probationLength: 90,
        probationUnit: "days" as const,
        reportsTo: "Test Manager",
        signatoryDesignation: "Director",
        signatoryName: "Test Signatory",
        workLocation: "Head Office",
      },
      identity,
      issuedOn: "2026-02-23",
      ordinal: 7,
      postStatus: "Occupied",
      type: "appointment" as const,
    }
    const letter = prepareEmploymentLetter(request)

    expect(letter.details).toEqual({
      ...request.details,
      postalAddress: request.details.postalAddress.trim(),
    })
    expect(() =>
      prepareEmploymentLetter({
        ...request,
        details: { ...request.details, dutyStartTime: "25:15" },
      })
    ).toThrow("Duty start time must be a valid time.")
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

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { CandidateOfferLetterRegister } from "./candidate-offer-letter-register"

describe("CandidateOfferLetterRegister", () => {
  it("shows a candidate's generated offer letter with its PDF action", () => {
    const html = renderToStaticMarkup(
      <CandidateOfferLetterRegister
        letters={[
          {
            applicationId: "application-1",
            department: "Human Resources",
            designation: "HOD / Human Resources",
            details: {},
            employeeCode: null,
            employeeName: "Harsh Maniar",
            fileAvailable: true,
            id: "letter-1",
            issuedOn: "2026-09-04",
            joiningDate: "2026-09-15",
            lastWorkingDate: null,
            letterType: "offer",
            postCode: "HR-HO-2",
            postId: "post-1",
            referenceNumber: "MRMPL-HR-202627-OL-1",
          },
        ]}
      />
    )

    expect(html).toContain("Offer Letter History")
    expect(html).toContain("MRMPL-HR-202627-OL-1")
    expect(html).toContain("HOD / Human Resources")
    expect(html).toContain('href="/hr/employment-letters/letter-1/download"')
  })
})

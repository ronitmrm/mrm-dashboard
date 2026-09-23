import { describe, expect, it } from "vitest"

import {
  documentNumber,
  documentRevisionLabel,
  parseDocumentControlMetadata,
} from "./document-control-domain"

describe("ISO document control identity", () => {
  it("formats the agreed permanent number and revision without an R prefix", () => {
    expect(documentNumber(7)).toBe("MRM-QA-007")
    expect(documentRevisionLabel(0)).toBe("00")
    expect(documentRevisionLabel(12)).toBe("12")
  })

  it("rejects an invalid review cycle", () => {
    expect(() =>
      parseDocumentControlMetadata({
        contentAccess: "restricted",
        dataFrequencyDetail: "Daily",
        dataFrequencyIntervalDays: 1,
        dataFrequencyType: "scheduled-interval",
        dataRetention: "5 years",
        documentType: "form-format",
        recordLocations: [
          { kind: "mrm", label: "FPIR", href: "/quality/fpir" },
          { kind: "physical", label: "QA archive" },
        ],
        responsibleRole: "Quality Engineer",
        reviewCycleMonths: 0,
        useStatus: "in-use",
      })
    ).toThrow("Review cycle must be a positive number of months.")
  })
})

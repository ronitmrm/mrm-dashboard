import { describe, expect, test } from "vitest"

import {
  designDrawingStatuses,
  initialDesignWorkflowStep,
} from "./commercial-design-domain"

describe("initial Design drawing step", () => {
  test("tracks the root and every new part as Uploaded, Missing, or Not Required", () => {
    const statuses = designDrawingStatuses({
      attachmentPurposes: ["internal_drawing", "bom_line_2_internal_drawing"],
      bomLines: [
        { componentSource: "New", drawingRequirement: "Required", lineNumber: 1 },
        { componentSource: "New", drawingRequirement: "Required", lineNumber: 2 },
        { componentSource: "New", drawingRequirement: "Not Required", lineNumber: 3 },
        { componentSource: "Existing", drawingRequirement: "Required", lineNumber: 4 },
      ],
      rootRequirement: "Required",
    })

    expect(statuses).toEqual([
      { key: "root", label: "Root Product", status: "Uploaded" },
      { key: "bom-line-1", label: "BOM Line 1", status: "Missing" },
      { key: "bom-line-2", label: "BOM Line 2", status: "Uploaded" },
      { key: "bom-line-3", label: "BOM Line 3", status: "Not Required" },
      { key: "bom-line-4", label: "BOM Line 4", status: "Not Required" },
    ])
  })

  test("does not enter completion until structured data and drawings are complete", () => {
    expect(
      initialDesignWorkflowStep({
        drawings: [{ key: "root", label: "Root Product", status: "Missing" }],
        structuredComplete: false,
      })
    ).toBe("structured")
    expect(
      initialDesignWorkflowStep({
        drawings: [{ key: "root", label: "Root Product", status: "Missing" }],
        structuredComplete: true,
      })
    ).toBe("drawings")
    expect(
      initialDesignWorkflowStep({
        drawings: [{ key: "root", label: "Root Product", status: "Uploaded" }],
        structuredComplete: true,
      })
    ).toBe("complete")
  })
})

import { describe, expect, test } from "vitest"

import { selectedEnquiryLine } from "./enquiry-detail"

describe("enquiry line detail selection", () => {
  const lines = [
    { id: "line-1", description: "First" },
    { id: "line-2", description: "Second" },
  ]

  test("keeps every line collapsed until a specific row is selected", () => {
    expect(selectedEnquiryLine(lines, undefined)).toBeUndefined()
    expect(selectedEnquiryLine(lines, "missing")).toBeUndefined()
  })

  test("opens only the selected line", () => {
    expect(selectedEnquiryLine(lines, "line-2")).toEqual({
      id: "line-2",
      description: "Second",
    })
  })
})

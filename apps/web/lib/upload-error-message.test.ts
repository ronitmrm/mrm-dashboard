import { describe, expect, test } from "vitest"

import {
  getUploadErrorMessage,
  getUploadResultError,
} from "./upload-error-message"

describe("upload error feedback", () => {
  test("keeps actionable validation details from failed CSV uploads", () => {
    expect(
      getUploadErrorMessage(
        new Error("Row 4: Heat number is required."),
        "CSV upload failed."
      )
    ).toBe("Row 4: Heat number is required.")

    expect(
      getUploadResultError({ error: "Row 7: Quantity must be greater than 0." })
    ).toBe("Row 7: Quantity must be greater than 0.")
  })

  test("uses safe fallback text for empty or unknown failures", () => {
    expect(getUploadErrorMessage(new Error("  "), "CSV upload failed.")).toBe(
      "CSV upload failed."
    )
    expect(getUploadErrorMessage(null, "CSV upload failed.")).toBe(
      "CSV upload failed."
    )
    expect(getUploadResultError(undefined)).toBeUndefined()
  })
})

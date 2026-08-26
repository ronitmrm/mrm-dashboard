import { describe, expect, it } from "vitest"

import {
  commercialArtifactPurposes,
  validateCommercialAttachment,
} from "./commercial-attachment"

describe("Commercial attachment validation", () => {
  it("preserves each business purpose while reusing drawing validation", () => {
    expect(
      commercialArtifactPurposes.map((purpose) =>
        validateCommercialAttachment({
          bytes: Buffer.from("%PDF-1.7\n"),
          declaredMediaType: "application/pdf",
          fileName: `${purpose}.pdf`,
          purpose,
        })
      )
    ).toEqual(
      commercialArtifactPurposes.map((purpose) => ({
        fileName: `${purpose}.pdf`,
        mediaType: "application/pdf",
        purpose,
      }))
    )
  })

  it("rejects an attachment above the established 25 MB limit", () => {
    expect(() =>
      validateCommercialAttachment({
        bytes: Buffer.alloc(25 * 1024 * 1024 + 1),
        declaredMediaType: "application/pdf",
        fileName: "oversized.pdf",
        purpose: "sales_clarification",
      })
    ).toThrow("Drawing files must not exceed 25 MB.")
  })

  it("rejects a declared media type that conflicts with the file extension", () => {
    expect(() =>
      validateCommercialAttachment({
        bytes: Buffer.from("%PDF-1.7\n"),
        declaredMediaType: "text/plain",
        fileName: "drawing.pdf",
        purpose: "drawing",
      })
    ).toThrow("Drawing file media type does not match its extension.")
  })

  it("retains a canonical CAD media type", () => {
    expect(
      validateCommercialAttachment({
        bytes: Buffer.from("AC1027"),
        declaredMediaType: "image/vnd.dwg",
        fileName: "design.dwg",
        purpose: "cad",
      })
    ).toEqual({
      fileName: "design.dwg",
      mediaType: "application/dwg",
      purpose: "cad",
    })
  })
})

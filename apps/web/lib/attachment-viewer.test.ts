import { describe, expect, test } from "vitest"

import { attachmentViewerHref, safeAttachmentSource } from "./attachment-viewer"

describe("attachment viewer links", () => {
  test("accepts only same-origin absolute paths and preserves metadata", () => {
    expect(safeAttachmentSource("/commercial/design/1/file/cad")).toBe(
      "/commercial/design/1/file/cad"
    )
    expect(safeAttachmentSource("https://evil.example/file")).toBeNull()
    expect(safeAttachmentSource("//evil.example/file")).toBeNull()
    expect(
      attachmentViewerHref({
        fileName: "drawing.pdf",
        mediaType: "application/pdf",
        source: "/commercial/design/1/file/cad",
      })
    ).toContain("/attachments/view?")
  })
})

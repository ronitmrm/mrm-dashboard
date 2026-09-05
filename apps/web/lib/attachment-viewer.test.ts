import { describe, expect, test } from "vitest"

import {
  attachmentContentDisposition,
  attachmentViewerHref,
  safeAttachmentSource,
} from "./attachment-viewer"

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

  test("previews PDFs inline and downloads them only on request", () => {
    expect(
      attachmentContentDisposition(
        "https://app.test/document?preview=1",
        "offer.pdf"
      )
    ).toBe(`inline; filename="offer.pdf"; filename*=UTF-8''offer.pdf`)
    expect(
      attachmentContentDisposition(
        "https://app.test/document?download=1",
        "offer.pdf"
      )
    ).toBe(`attachment; filename="offer.pdf"; filename*=UTF-8''offer.pdf`)
  })
})

import { describe, expect, it } from "vitest"

import {
  userAttachmentDownloadHeaders,
  validateUserAttachment,
} from "./user-attachment-security"

const bytes = (...values: number[]) => Buffer.from(values)

const zipWithEntry = (entry: string) =>
  Buffer.concat([
    bytes(0x50, 0x4b, 0x03, 0x04),
    Buffer.from(`[Content_Types].xml\0${entry}`),
  ])

describe("user attachment security", () => {
  it.each([
    ["drawing", "drawing.pdf", Buffer.from("%PDF-1.7\n")],
    ["drawing", "drawing.dwg", Buffer.from("AC1032drawing")],
    ["drawing", "drawing.dxf", Buffer.from("0\nSECTION\n2\nHEADER\n")],
    [
      "drawing",
      "drawing.png",
      bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    ],
    ["drawing", "drawing.jpeg", bytes(0xff, 0xd8, 0xff, 0xe0)],
    ["purchase-order", "source.pdf", Buffer.from("%PDF-1.7\n")],
    ["purchase-order", "source.xlsx", zipWithEntry("xl/workbook.xml")],
    ["purchase-order", "source.docx", zipWithEntry("word/document.xml")],
  ] as const)("accepts a valid %s attachment named %s", (purpose, name, data) => {
    expect(validateUserAttachment({ bytes: data, fileName: name, purpose })).toEqual({
      fileName: name,
      mediaType: "application/octet-stream",
    })
  })

  it("rejects disallowed extensions and mismatched signatures", () => {
    expect(() =>
      validateUserAttachment({
        bytes: Buffer.from("MZ executable"),
        fileName: "drawing.pdf",
        purpose: "drawing",
      })
    ).toThrow("does not match its extension")

    expect(() =>
      validateUserAttachment({
        bytes: Buffer.from("plain text"),
        fileName: "drawing.svg",
        purpose: "drawing",
      })
    ).toThrow("must be a PDF, DWG, DXF, PNG, or JPEG")

    expect(() =>
      validateUserAttachment({
        bytes: zipWithEntry("word/document.xml"),
        fileName: "source.xlsx",
        purpose: "purchase-order",
      })
    ).toThrow("does not match its extension")
  })

  it("forces user uploads to download with a server-controlled content type", () => {
    expect(userAttachmentDownloadHeaders('unsafe\r\n"name.pdf', 42)).toEqual({
      "Content-Disposition":
        "attachment; filename=\"unsafe___name.pdf\"; filename*=UTF-8''unsafe___name.pdf",
      "Content-Length": "42",
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    })
  })
})

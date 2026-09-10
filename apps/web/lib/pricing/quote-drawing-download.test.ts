import { expect, test } from "vitest"
import { unzipSync, strFromU8 } from "fflate"
import { buildQuoteDrawingsZip } from "./quote-drawing-download"

test("downloads all available part drawings without overwriting repeated filenames", () => {
  const bytes = buildQuoteDrawingsZip([
    {
      lineNumber: 1,
      fileName: "drawing.pdf",
      bytes: new TextEncoder().encode("first"),
    },
    {
      lineNumber: 2,
      fileName: "drawing.pdf",
      bytes: new TextEncoder().encode("second"),
    },
    {
      lineNumber: 2,
      fileName: "../drawing.pdf",
      bytes: new TextEncoder().encode("third"),
    },
  ])
  const entries = unzipSync(bytes)
  expect(Object.keys(entries)).toEqual([
    "Line-1/1-drawing.pdf",
    "Line-2/2-drawing.pdf",
    "Line-2/3-drawing.pdf",
  ])
  expect(Object.values(entries).map((bytes) => strFromU8(bytes))).toEqual([
    "first",
    "second",
    "third",
  ])
})

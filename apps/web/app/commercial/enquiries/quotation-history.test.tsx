import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import type { QuotationVersion } from "@workspace/db"
import { QuotationHistory } from "./quotation-history"

test("places downloads on their quoted part and offers a revision-specific ZIP", () => {
  const selected: QuotationVersion = {
    id: "v1",
    revision: 1,
    status: "Sent",
    sentAt: null,
    fileId: null,
    terms: null,
    lines: [1, 2].map((number) => ({
      enquiryItemId: `part-${number}`,
      quoteItemId: `q-${number}`,
      lineNumber: number,
      productCode: `M${number}`,
      customerPartCode: null,
      description: `Part ${number}`,
      quantity: 1,
      price: 2,
      itemRevision: 1,
    })),
  }
  const html = renderToStaticMarkup(
    <QuotationHistory
      enquiryId="enquiry"
      enquiryNumber="ENQ-1"
      versions={[selected]}
      selected={selected}
      drawings={[
        {
          enquiryItemId: "part-2",
          fileId: "file",
          fileName: "part-two.pdf",
          mediaType: "application/pdf",
        },
      ]}
    />
  )
  expect(html).toContain("Download All Drawings")
  expect(html).toContain("drawings/download?revision=1")
  expect(html).toContain("drawings/file?revision=1&amp;download=1")
  expect(html.indexOf("part-two.pdf")).toBeGreaterThan(html.indexOf("Part 2"))
  expect(html).not.toContain(">Customer Drawings</a>")
})

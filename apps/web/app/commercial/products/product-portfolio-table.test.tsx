import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { ProductPortfolioTable } from "./product-portfolio-table"

const product = {
  category: "Compression Fitting",
  itemType: "List",
  mrmplDescription: "Male Adapter",
  productSize: "1/4 X 3/8",
  productType: "Barstock",
  rodSize: "16 Round",
  subCategory: "Male Compression Adapter",
  uid: "M25",
  designRevision: "03",
}

describe("ProductPortfolioTable", () => {
  test("returns the selected Product to the requested Design BOM line", () => {
    const markup = renderToStaticMarkup(
      <ProductPortfolioTable
        rows={[product]}
        selection={{
          lineIndex: 2,
          returnTo: "/commercial/design/line-1/new",
        }}
      />
    )

    expect(markup).toContain("Select Product")
    expect(markup).toContain(
      'href="/commercial/design/line-1/new?product=M25&amp;selectedLine=2&amp;section=bom"'
    )
  })

  test("links the released Product UID and revision to its read-only dossier", () => {
    const markup = renderToStaticMarkup(
      <ProductPortfolioTable rows={[product]} />
    )

    expect(markup).toContain("Design Rev.")
    expect(markup).toContain(">03<")
    expect(markup).toContain('href="/commercial/products/M25"')
    expect(markup).toContain("View Dossier")
  })
})

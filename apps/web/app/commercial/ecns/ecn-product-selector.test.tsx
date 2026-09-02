import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { EcnProductSelector } from "./ecn-product-selector"

describe("ECN Product selector", () => {
  it("provides separate searchable UID, category, subcategory, and name controls", () => {
    const markup = renderToStaticMarkup(
      <EcnProductSelector
        items={[
          {
            category: "Flare Fitting",
            description: "1/4 X 1/4 Male Flare X Male Nptf Adapter",
            id: "item-1",
            subcategory: "Male Flare X Male Nptf Adapter",
            uid: "M1",
          },
        ]}
      />
    )

    expect(markup).toContain("Product UID")
    expect(markup).toContain("Category")
    expect(markup).toContain("Subcategory")
    expect(markup).toContain("Product Name")
    expect(markup).toContain('name="item_id"')
    expect(markup.match(/data-slot="searchable-select"/g)).toHaveLength(4)
  })
})

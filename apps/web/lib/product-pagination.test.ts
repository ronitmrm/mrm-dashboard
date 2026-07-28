import { describe, expect, it } from "vitest"

import { productPageBounds } from "./product-pagination"

describe("product pagination", () => {
  it("bounds the initial product register query", () => {
    expect(productPageBounds(undefined)).toEqual({
      limit: 25,
      offset: 0,
      page: 1,
    })
  })

  it("maps later pages to a bounded offset", () => {
    expect(productPageBounds("3")).toEqual({
      limit: 25,
      offset: 50,
      page: 3,
    })
  })

  it("normalizes invalid page values", () => {
    expect(productPageBounds("-2").page).toBe(1)
    expect(productPageBounds("word").page).toBe(1)
  })
})

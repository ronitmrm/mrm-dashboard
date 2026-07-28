import { describe, expect, it } from "vitest"

import { customerPageBounds } from "./customer-pagination"

describe("customer pagination", () => {
  it("keeps the editable customer register small", () => {
    expect(customerPageBounds(undefined)).toEqual({
      limit: 15,
      offset: 0,
      page: 1,
    })
  })

  it("maps later pages to the correct offset", () => {
    expect(customerPageBounds("2")).toEqual({
      limit: 15,
      offset: 15,
      page: 2,
    })
  })

  it("normalizes invalid page values", () => {
    expect(customerPageBounds("-2").page).toBe(1)
    expect(customerPageBounds("word").page).toBe(1)
  })
})

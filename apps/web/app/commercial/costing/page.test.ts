import { describe, expect, test, vi } from "vitest"

const { permanentRedirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
}))

vi.mock("next/navigation", () => ({ permanentRedirect }))

import ProductsPage from "../products/page"
import CostingPage from "./page"

describe("retired costing route", () => {
  test("permanently redirects to Product Parameter Costing", () => {
    CostingPage()

    expect(permanentRedirect).toHaveBeenCalledWith(
      "/commercial/product-costing"
    )
  })
  test("permanently redirects the retired Products route to Pricing", () => {
    ProductsPage()

    expect(permanentRedirect).toHaveBeenCalledWith("/commercial/pricing")
  })
})

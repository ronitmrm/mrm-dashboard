import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createProductPortfolioRepository } from "./product-portfolio"

const orderedProduct = {
  category: "Hydraulics",
  item_type: "List",
  mrmpl_description: "Ordered hose fitting",
  product_type: "Barstock",
  size: "1/4 inch",
  sub_category: "Hose Barb",
  uid: "M100",
}

const quotedProduct = {
  category: "Hydraulics",
  item_type: "List",
  mrmpl_description: "Customer quoted fitting",
  product_type: "Forging",
  size: "3/8 inch",
  sub_category: "Hose Barb",
  uid: "Q200",
}

describe("Product Portfolio repository", () => {
  it("adds the selected customer's quoted products to the global ordered portfolio", async () => {
    const query = vi.fn(
      async (_statement: string, values: readonly unknown[]) => ({
        rows:
          values[1] === "CUST-001"
            ? [orderedProduct, quotedProduct]
            : [orderedProduct],
      })
    )
    const repository = createProductPortfolioRepository({
      pool: { query } as unknown as Pool,
    })

    await expect(
      repository.listForOrganization("MRMPL", {
        customerUid: " CUST-001 ",
      })
    ).resolves.toEqual([
      {
        category: "Hydraulics",
        itemType: "List",
        mrmplDescription: "Ordered hose fitting",
        productType: "Barstock",
        size: "1/4 inch",
        subCategory: "Hose Barb",
        uid: "M100",
      },
      {
        category: "Hydraulics",
        itemType: "List",
        mrmplDescription: "Customer quoted fitting",
        productType: "Forging",
        size: "3/8 inch",
        subCategory: "Hose Barb",
        uid: "Q200",
      },
    ])
    await expect(repository.listForOrganization("MRMPL")).resolves.toEqual([
      expect.objectContaining({ uid: "M100" }),
    ])
  })
})

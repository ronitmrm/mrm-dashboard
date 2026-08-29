import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"

import { createProductPortfolioRepository } from "./product-portfolio"

const orderedProduct = {
  category: "Hydraulics",
  item_type: "List",
  mrmpl_description: "Ordered hose fitting",
  product_type: "Barstock",
  product_size: "1/4 inch",
  rod_size: "12.7 Hex",
  sub_category: "Hose Barb",
  uid: "M100",
}

const quotedProduct = {
  category: "Hydraulics",
  item_type: "List",
  mrmpl_description: "Customer quoted fitting",
  product_type: "Forging",
  product_size: "3/8 inch",
  rod_size: "16 Round",
  sub_category: "Hose Barb",
  uid: "Q200",
}

describe("Product Portfolio repository", () => {
  it("returns each Product UID once with separate Product and Rod sizes", async () => {
    const query = vi.fn(
      async (_statement: string, values: readonly unknown[]) => ({
        rows:
          values[1] === "CUST-001"
            ? [orderedProduct, { ...orderedProduct }, quotedProduct]
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
        productSize: "1/4 inch",
        rodSize: "12.7 Hex",
        subCategory: "Hose Barb",
        uid: "M100",
      },
      {
        category: "Hydraulics",
        itemType: "List",
        mrmplDescription: "Customer quoted fitting",
        productType: "Forging",
        productSize: "3/8 inch",
        rodSize: "16 Round",
        subCategory: "Hose Barb",
        uid: "Q200",
      },
    ])
    await expect(repository.listForOrganization("MRMPL")).resolves.toEqual([
      expect.objectContaining({ uid: "M100" }),
    ])
  })
})

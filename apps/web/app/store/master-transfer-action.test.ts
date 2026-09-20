import { beforeEach, expect, test, vi } from "vitest"

const { save } = vi.hoisted(() => ({
  save: vi.fn<(data: FormData) => Promise<void | { error: string }>>(),
}))
vi.mock("@/lib/master-data-csv", () => import("../../lib/master-data-csv"))
vi.mock("@/lib/store-master-selection", () => import("../../lib/store-master-selection"))
vi.mock("@/lib/auth/master-capabilities", () => ({ masterCapability: () => "store.import" }))
vi.mock("@/lib/auth/auth", () => ({ readAuthEnvironment: () => ({ connectionString: "test" }) }))
vi.mock("@workspace/db", () => ({
  createStoreRepository: () => ({
    organizationIdForCode: async () => "organization",
    close: async () => {},
    listAssetClassificationMasters: async () => ({
      categories: [{ id: "category-id", name: "Production Tooling" }],
      subcategories: [{ id: "subcategory-id", categoryId: "category-id", name: "Tools" }],
      assetNames: [
        { id: "other-name-id", subcategoryId: "other-subcategory", name: "Fixture" },
        { id: "name-id", subcategoryId: "subcategory-id", name: "Fixture" },
      ],
    }),
  }),
}))
vi.mock("./actions", () => ({
  createStoreAssetCategoryAction: save,
  createStoreAssetNameAction: save,
  createStoreAssetSubcategoryAction: save,
  createStoreItemTypeAction: save,
  createStoreLocationAction: save,
  createStoreSupplierAction: save,
  createStoreSupplierPriceAction: save,
  createStoreVendorAction: save,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }))
vi.mock("@/lib/auth/require-capability", () => ({ requireCapability: vi.fn() }))

import { importStoreMasterCsvAction } from "./master-transfer-action"

function upload(rows: string) {
  const data = new FormData()
  data.set("store_master", "ITEM_TYPE")
  data.set(
    "master_csv_file",
    new File([`asset_category_id,asset_subcategory_id,asset_name_id,asset_type,identification_name\n${rows.split("\n").map((row) => `Production Tooling,Tools,Fixture,${row}`).join("\n")}`], "items.csv", {
      type: "text/csv",
    })
  )
  return data
}

beforeEach(() => save.mockReset())

test("imports readable classification and Asset Type labels using canonical form values", async () => {
  await importStoreMasterCsvAction(
    upload("Non Consumable,Chair\nConsumable,Oil")
  )
  expect(
    save.mock.calls.map(([data]) => data.get("asset_type"))
  ).toEqual(["NON_CONSUMABLE", "CONSUMABLE"])
  expect(save.mock.calls[0]?.[0].get("asset_category_id")).toBe("category-id")
  expect(save.mock.calls[0]?.[0].get("asset_subcategory_id")).toBe("subcategory-id")
  expect(save.mock.calls[0]?.[0].get("asset_name_id")).toBe("name-id")
})

test("rejects an unknown classification before saving the row", async () => {
  const data = upload("Non Consumable,")
  data.set("master_csv_file", new File([
    "asset_category,asset_subcategory,asset_name,asset_type\nProduction Tooling,Missing,Fixture,Non Consumable",
  ], "items.csv"))
  const result = await importStoreMasterCsvAction(data)
  expect(result?.error).toContain('Row 2: Asset Subcategory "Missing" was not found')
  expect(save).not.toHaveBeenCalled()
})

test("reports a rejected row and stops instead of losing duplicate feedback", async () => {
  save
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ error: "This entry already exists." })
  const result = await importStoreMasterCsvAction(
    upload("Non Consumable,Chair\nNon Consumable,Chair\nConsumable,Oil")
  )
  expect(result?.error).toBe(
    "Row 3: This entry already exists. 1 row(s) imported before stopping."
  )
  expect(save).toHaveBeenCalledTimes(2)
})

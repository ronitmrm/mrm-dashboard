import { beforeEach, expect, test, vi } from "vitest"

const { save } = vi.hoisted(() => ({
  save: vi.fn<(data: FormData) => Promise<void | { error: string }>>(),
}))
vi.mock("@/lib/master-data-csv", () => import("../../lib/master-data-csv"))
vi.mock("@/lib/store-master-selection", () => import("../../lib/store-master-selection"))
vi.mock("@/lib/store-units", () => import("../../lib/store-units"))
vi.mock("@/lib/auth/master-capabilities", () => ({ masterCapability: () => "store.import" }))
vi.mock("@/lib/auth/auth", () => ({ readAuthEnvironment: () => ({ connectionString: "test" }) }))
vi.mock("@workspace/db", () => ({
  createStoreRepository: () => ({
    organizationIdForCode: async () => "organization",
    close: async () => {},
    listSuppliers: async () => [{ id: "supplier-id", name: "Tool Supplier", code: "SUP-001" }],
    listItemTypes: async () => [{ id: "item-id", typeCode: "NC001" }],
    listAssetClassificationMasters: async () => ({
      categories: [{ id: "category-id", name: "Production Tooling" }],
      subcategories: [
        { id: "subcategory-id", categoryId: "category-id", name: "Tools" },
        { id: "other-subcategory", categoryId: "other-category", name: "Tools" },
      ],
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

async function importCsv(master: string, csv: string) {
  const data = new FormData()
  data.set("store_master", master)
  data.set("master_csv_file", new File([csv], "master.csv"))
  return importStoreMasterCsvAction(data)
}

test("resolves readable references across Store master CSVs and form labels", async () => {
  expect(await importCsv("SUBCATEGORY", "asset_category,asset_subcategory_name\nproduction tooling,Fixtures")).toBeUndefined()
  expect(save.mock.lastCall?.[0].get("asset_category_id")).toBe("category-id")
  expect(await importCsv("ASSET_NAME", "asset_name,asset_category,asset_subcategory\nNew Fixture,Production Tooling,Tools")).toBeUndefined()
  expect(save.mock.lastCall?.[0].get("asset_subcategory_id")).toBe("subcategory-id")
  expect(await importCsv("SUPPLIER_PRICE", "supplier,asset_code,unit_price,valid_from\nTool Supplier,NC001,100,2026-09-20\nSUP-001,NC001,110,2026-09-21")).toBeUndefined()
  expect(save.mock.lastCall?.[0].get("supplier_id")).toBe("supplier-id")
  expect(save.mock.lastCall?.[0].get("item_type_id")).toBe("item-id")
  expect(await importCsv("LOCATION", "location_code,location_name,location_type\nSTR,Main Store,Store")).toBeUndefined()
  expect(save.mock.lastCall?.[0].get("location_type")).toBe("STORE")
  expect(await importCsv("ITEM_TYPE", "asset_category,asset_subcategory,asset_name,asset_type,unit\nProduction Tooling,Tools,Fixture,Non Consumable,Number (No.)")).toBeUndefined()
  expect(save.mock.lastCall?.[0].get("unit")).toBe("No.")
})

test("normalizes day-first Supplier Price dates before saving", async () => {
  save.mockImplementationOnce(async (data) => {
    if (data.get("valid_from") !== "2026-09-19") {
      return { error: 'date/time field value out of range: "19-09-2026"' }
    }
  })

  const result = await importCsv(
    "SUPPLIER_PRICE",
    "supplier,asset_code,unit_price,valid_from\nTool Supplier,NC001,100,19-09-2026"
  )

  expect(result).toBeUndefined()
  expect(save.mock.lastCall?.[0].get("valid_from")).toBe("2026-09-19")
})

test("rejects an ambiguous Subcategory without choosing a parent arbitrarily", async () => {
  const result = await importCsv("ASSET_NAME", "asset_name,asset_subcategory_id\nNew Fixture,Tools")
  expect(result?.error).toContain('Row 2: Asset Subcategory "Tools" is ambiguous.')
  expect(save).not.toHaveBeenCalled()
})

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

import { beforeEach, expect, test, vi } from "vitest"

const { save } = vi.hoisted(() => ({
  save: vi.fn<(data: FormData) => Promise<void | { error: string }>>(),
}))
vi.mock("@/lib/master-data-csv", () => import("../../lib/master-data-csv"))
vi.mock("@/lib/store-master-selection", () => import("../../lib/store-master-selection"))
vi.mock("@/lib/auth/master-capabilities", () => ({ masterCapability: () => "store.import" }))
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
    new File([`asset_type,identification_name\n${rows}`], "items.csv", {
      type: "text/csv",
    })
  )
  return data
}

beforeEach(() => save.mockReset())

test("imports readable Asset Type labels using the canonical form values", async () => {
  await importStoreMasterCsvAction(
    upload("Non Consumable,Chair\nConsumable,Oil")
  )
  expect(
    save.mock.calls.map(([data]) => data.get("asset_type"))
  ).toEqual(["NON_CONSUMABLE", "CONSUMABLE"])
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

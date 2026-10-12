import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/components/ui/golden-patterns", () => import("../ui/golden-patterns"))

vi.mock("@/app/department-store/actions", () => ({
  assignDepartmentAssetStorageAction: vi.fn(),
  consumeDepartmentQuantityAction: vi.fn(),
  createQualityGaugeSetAction: vi.fn(),
  disbandQualityGaugeSetAction: vi.fn(),
  moveQualityGaugeSetAction: vi.fn(),
  recordDepartmentAssetLossAction: vi.fn(),
  replaceQualityGaugeSetMemberAction: vi.fn(),
  transferDepartmentAssetAction: vi.fn(),
  transferDepartmentQuantityAction: vi.fn(),
}))

import { DepartmentStoreForms } from "./department-store-forms"

test("offers only local storage controls for an assigned Unit ID", () => {
  const html = renderToStaticMarkup(
    <DepartmentStoreForms
      action="physical"
      assets={[]}
      consumables={[]}
      departments={[]}
      gaugeSets={[]}
      machines={[]}
      recorderId="storekeeper"
      storageAssets={[{ assetCode: "NC459-0001", assetName: "Crate Trolley" }]}
      storageLocations={{
        defaults: [],
        locations: [
          { id: "cnc-default", code: "CNC", name: "CNC Store", storeCode: "CNC", isDefault: true },
          { id: "cnc-rack-a", code: "CNC-A", name: "Rack A", storeCode: "cnc", isDefault: false },
          { id: "main-rack", code: "MAIN-A", name: "Main Rack", storeCode: "MAIN", isDefault: true },
        ],
      }}
      store={{
        id: "cnc", code: "CNC", name: "CNC Store", kind: "PRODUCTION",
        defaultLocationId: "cnc-default", productionFloorCode: "cnc",
      }}
      stores={[]}
      today="2026-10-12"
      vendors={[]}
    />
  )
  expect(html).toContain("Storage location")
  expect(html).toContain('value="" selected=""')
  expect(html).not.toContain('value="cnc-default"')
  expect(html).toContain('value="cnc-rack-a"')
  expect(html).not.toContain("Rack A")
  expect(html).not.toContain('value="main-rack"')
  expect(html).toContain('name="storage_location_id"')
  expect(html).toContain('value="NC459-0001"')
  expect(html).not.toContain('name="stock_type"')
  expect(html).not.toContain('name="holder_type"')
  expect(html).not.toContain('name="holder_reference"')
})

import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/components/ui/golden-patterns", () => import("../ui/golden-patterns"))

vi.mock("@/app/department-store/actions", () => ({
  consumeDepartmentQuantityAction: vi.fn(),
  createQualityGaugeSetAction: vi.fn(),
  disbandQualityGaugeSetAction: vi.fn(),
  moveDepartmentAssetAction: vi.fn(),
  moveQualityGaugeSetAction: vi.fn(),
  recordDepartmentAssetLossAction: vi.fn(),
  replaceQualityGaugeSetMemberAction: vi.fn(),
  transferDepartmentAssetAction: vi.fn(),
  transferDepartmentQuantityAction: vi.fn(),
}))

import { DepartmentStoreForms } from "./department-store-forms"

test("offers the Store's racks for assigning an asset location", () => {
  const html = renderToStaticMarkup(
    <DepartmentStoreForms
      action="physical"
      assets={[]}
      consumables={[]}
      departments={[]}
      gaugeSets={[]}
      machines={[]}
      recorderId="storekeeper"
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
  expect(html).toContain("Store location")
  expect(html).toContain('value="cnc-default" selected=""')
  expect(html).toContain('value="cnc-rack-a"')
  expect(html).not.toContain('value="main-rack"')
  expect(html).toContain('name="holder_reference"')
})

import type { ComponentProps } from "react"
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

const emptyStoreProps = {
  assets: [], consumables: [], departments: [], gaugeSets: [], machines: [],
  operatorId: "signed-in-user-id",
  storageAssets: [], storageLocations: { defaults: [], locations: [] }, stores: [],
  store: { id: "cnc", code: "CNC", name: "CNC Store", kind: "PRODUCTION",
    defaultLocationId: "cnc-default", productionFloorCode: "cnc" },
  today: "2026-10-12", vendors: [],
} satisfies Omit<ComponentProps<typeof DepartmentStoreForms>, "action">

test("returns omit receiving storage and use forms show the signed-in operator and stock facts", () => {
  const quantity = renderToStaticMarkup(<DepartmentStoreForms {...emptyStoreProps} action="quantity" />)
  const accountability = renderToStaticMarkup(<DepartmentStoreForms {...emptyStoreProps} action="accountability" />)
  expect(quantity + accountability).not.toContain('name="destination_location_id"')
  expect(quantity + accountability).not.toContain("Storage Location")
  const use = renderToStaticMarkup(<DepartmentStoreForms {...emptyStoreProps} action="consume-single" />)
  expect(use).toContain("Asset Code")
  expect(use).toContain('name="item_type_id"')
  expect(use).toContain('name="consumed_on"')
  const operator = use.match(/<input[^>]*name="operator_id"[^>]*>/)?.[0]
  expect(operator).toContain('required=""')
  expect(operator).toContain('value="signed-in-user-id"')
  expect(operator).toMatch(/readonly/i)
  expect(use).toContain("Storage Location")
  expect(use).toContain("Available Units")
  const multiple = renderToStaticMarkup(<DepartmentStoreForms {...emptyStoreProps} action="consume"
    selectedItemIds={["item-1"]} consumables={[{
      itemTypeId: "item-1", typeCode: "C002", assetName: "Insert", unit: "No.",
      assetCategory: "Cutting Insert", assetSubcategory: "Turning Insert", makeModel: "Non Specific",
      availableQuantity: "18", companyQuantity: "18", storageLocations: "CNC-A, CNC-B",
    }]} />)
  expect(multiple).toContain('name="item_type_id" value="item-1"')
  expect(multiple.match(/<input[^>]*name="quantity_item-1"[^>]*>/)?.[0]).toContain('max="18"')
  expect(multiple.match(/<input[^>]*name="use_storage_location_item-1"[^>]*>/)?.[0])
    .toMatch(/readOnly="".*value="CNC-A, CNC-B"/i)
  expect(multiple.match(/<input[^>]*name="use_available_units_item-1"[^>]*>/)?.[0])
    .toMatch(/readOnly="".*value="18 No\."/i)
  expect(multiple.match(/<input[^>]*name="operator_id"[^>]*>/)?.[0])
    .toMatch(/readOnly="".*value="signed-in-user-id"/i)
})

test("offers only local storage controls for an assigned Unit ID", () => {
  const html = renderToStaticMarkup(
    <DepartmentStoreForms
      action="physical"
      assets={[]}
      consumables={[]}
      departments={[]}
      gaugeSets={[]}
      machines={[]}
      operatorId="signed-in-user-id"
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

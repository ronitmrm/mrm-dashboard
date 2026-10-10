import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import { StoreStorageLocationField } from "./store-storage-location-field"

test("selects the existing item location within the receiving Store and allows a different location", () => {
  const html = renderToStaticMarkup(
    <StoreStorageLocationField
      id="receipt-location"
      itemTypeId="item"
      storeCode="QUALITY"
      storage={{
        defaults: [
          { itemTypeId: "item", locationId: "rack-a", storeCode: "QUALITY" },
        ],
        locations: [
          {
            code: "QA",
            id: "rack-a",
            isDefault: false,
            name: "Rack A",
            storeCode: "QUALITY",
          },
          {
            code: "QB",
            id: "rack-b",
            isDefault: true,
            name: "Rack B",
            storeCode: "QUALITY",
          },
          {
            code: "MAIN",
            id: "main",
            isDefault: true,
            name: "Main Store",
            storeCode: "MAIN",
          },
        ],
      }}
    />
  )
  expect(html).toContain('value="rack-a" selected=""')
  expect(html).toContain('value="rack-b"')
  expect(html).not.toContain('value="main"')
  expect(html).toContain('name="destination_location_id"')
})

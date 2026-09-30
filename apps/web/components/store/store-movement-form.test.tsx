import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/app/store/actions", () => ({ moveStoreAssetAction: vi.fn() }))

import { StoreMovementForm } from "./store-movement-form"

test("shows the selected assigned unit's quantity and current holder", () => {
  const markup = renderToStaticMarkup(
    <StoreMovementForm
      departments={[{ code: "CNC", name: "CNC" }]}
      initialUnitId="NC003-0001"
      locations={[]}
      machines={[]}
      performer="Store User"
      units={[
        {
          assetCode: "NC003-0001",
          assetName: "VB-081-1",
          holderName: "CNC",
          holderReference: "CNC",
          holderType: "DEPARTMENT",
          locationName: "Old Store Location",
          status: "ASSIGNED",
        },
      ]}
      vendors={[]}
    />
  )

  expect(markup).toContain(
    'Available Quantity</dt><dd class="font-medium">0</dd>'
  )
  expect(markup).toContain(
    'Allocated Quantity</dt><dd class="font-medium">1</dd>'
  )
  expect(markup).toContain(
    'Current Location</dt><dd class="font-medium">Department — CNC</dd>'
  )
})

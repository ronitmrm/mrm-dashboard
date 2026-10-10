import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"
import { Dialog } from "@workspace/ui/components/dialog"

vi.mock("@/lib/date-time", () => import("../../lib/date-time"))

import { StoreTransferConfirmation } from "./store-transfer-confirmation"

const props = {
  action: async () => ({ error: null }),
  choices: [
    {
      acquiredOn: "2026-01-02",
      assetCode: "NC287-0001",
      itemTypeId: "drill",
      reservedRequestId: "line",
    },
    {
      acquiredOn: null,
      assetCode: "NC287-0002",
      itemTypeId: "drill",
      reservedRequestId: "other-request",
    },
  ],
  destinationStoreCode: "QUALITY",
  destinationStoreName: "Quality Store",
  lines: [
    {
      assetName: "Cordless Drill",
      id: "line",
      itemTypeId: "drill",
      requestedUnitCode: "NC287-0001",
      typeCode: "NC287",
    },
  ],
  storageLocations: {
    defaults: [],
    locations: [
      {
        code: "QA",
        id: "rack-a",
        isDefault: true,
        name: "Rack A",
        storeCode: "QUALITY",
      },
    ],
  },
}

test("reviews assigned units by item with acquisition date, location and one transfer confirmation", () => {
  const html = renderToStaticMarkup(
    <Dialog>
      <StoreTransferConfirmation {...props} />
    </Dialog>
  )
  expect(html).toContain("Cordless Drill")
  expect(html).toContain("1 of 1 units selected")
  expect(html).toContain("02 Jan 2026")
  expect(html).toContain("Receiving Location")
  expect(html).toContain('value="NC287-0001" selected=""')
  expect(html).not.toContain('value="NC287-0002"')
  expect(html).toContain("Confirm Transfer (1)")
})

test("blocks confirmation when an assigned unit is unavailable", () => {
  const html = renderToStaticMarkup(
    <Dialog>
      <StoreTransferConfirmation {...props} choices={[]} />
    </Dialog>
  )
  expect(html).toContain("0 of 1 units selected")
  expect(html).toContain("the assigned unit is unavailable")
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/)
})

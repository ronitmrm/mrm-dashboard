import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { StoreReceiptUnitFields } from "./store-receipt-unit-fields"

test("shows optional physical-unit fields only for a single serialized receipt", () => {
  const single = renderToStaticMarkup(
    <StoreReceiptUnitFields equipmentUnits={[]} orderId="one" remainingQuantity="1" serialized />
  )
  const multiple = renderToStaticMarkup(
    <StoreReceiptUnitFields equipmentUnits={[]} orderId="many" remainingQuantity="2" serialized />
  )

  expect(single).toContain("Manufacturer Serial Number")
  expect(single).toContain("Connected Stabiliser Unit ID")
  expect(single).toContain("Connected MCB Unit ID")
  expect(multiple).not.toContain("Manufacturer Serial Number")
})

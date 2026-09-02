import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test, vi } from "vitest"

vi.mock("../costing/actions", () => ({
  updateProductCostingAction: vi.fn(),
}))

import { ProductCostingForm } from "./product-costing-form"

const product = {
  alloyPremium: 0,
  annealing: 0,
  assemblyOperationCost: 0,
  buffing: 0,
  burningLossPercent: 0,
  casting: 1,
  checking: 0,
  deburring: 0,
  description: "Part",
  directPurchasePricePerKg: 0,
  extrusionCost: 0,
  forgingCost: 0,
  id: "item-1",
  itemType: "List",
  machineTypeId: null,
  machiningCost: 8,
  marking: 0,
  materialGrade: null,
  overheadCost: 0,
  piecesPerKg: 10,
  plating: 5,
  pricingMethod: "Derived",
  processesRequired: ["Washing"],
  productType: "Barstock",
  productionType: "CNC",
  rejectionPercent: 0,
  remarks: null,
  rodSize: null,
  rodType: null,
  sealant: 0,
  uid: "M1",
  washing: 2,
  weight100Pcs: 100,
}

describe("ProductCostingForm", () => {
  test("only submits process prices selected in the released Design BOM", () => {
    const markup = renderToStaticMarkup(
      <ProductCostingForm
        bomParts={[]}
        machineTypes={[]}
        product={product}
        rootItemId="item-1"
        taskId="task-1"
      />
    )

    expect(markup).toContain('name="washing"')
    expect(markup).not.toContain('name="plating"')
    expect(markup).not.toContain('name="machining_cost"')
    expect(markup).toContain('disabled="" step="any" value="5"')
  })
})

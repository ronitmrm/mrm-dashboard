import { describe, expect, it } from "vitest"

import {
  customerCostingTaskHref,
  productCostingTaskHref,
} from "./costing-task-routes"

describe("costing task routes", () => {
  it("opens standard Product Costing work on a dedicated task page", () => {
    expect(
      productCostingTaskHref({
        enquiryItemId: "task id",
        itemId: "item/id",
        taskId: "queue-id",
        taskType: "Product Parameter Costing",
      })
    ).toBe("/commercial/product-costing/task%20id?item=item%2Fid")
  })

  it("opens Product bulk revisions on a dedicated Product Costing page", () => {
    expect(
      productCostingTaskHref({
        enquiryItemId: null,
        itemId: null,
        taskId: "bulk id",
        taskType: "Product Parameter Bulk Revision",
      })
    ).toBe("/commercial/product-costing/revisions/bulk%20id")
  })

  it("keeps ECN work on its existing workbench", () => {
    expect(
      productCostingTaskHref({
        enquiryItemId: null,
        itemId: null,
        taskId: "ecn id",
        taskType: "ECN Product Parameter Costing",
      })
    ).toBe("/commercial/ecns?ecn=ecn%20id#ecn-workbench")
  })

  it("opens standard Customer Costing work on a dedicated task page", () => {
    expect(
      customerCostingTaskHref({
        enquiryItemId: "task id",
        quoteRevisionRequestId: "revision/id",
        taskId: "queue-id",
        taskType: "PO Price Match",
      })
    ).toBe("/commercial/customer-costing/task%20id?poRevision=revision%2Fid")
  })
})

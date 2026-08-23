import { describe, expect, it } from "vitest"

import { activeEnquiryCustomers } from "./enquiry-customers"

describe("active Enquiry customers", () => {
  it("accepts status casing and whitespace used by legacy and imported masters", () => {
    const rows = [
      { id: "1", status: "Active" },
      { id: "2", status: " active " },
      { id: "3", status: "ACTIVE" },
      { id: "4", status: "Inactive" },
    ]

    expect(activeEnquiryCustomers(rows).map(({ id }) => id)).toEqual([
      "1",
      "2",
      "3",
    ])
  })
})

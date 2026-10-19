import { expect, it } from "vitest"
import { portfolioCsvInput } from "./portfolio-csv"

it("maps customer-independent product CSV fields and BOM references", () => {
  expect(
    portfolioCsvInput(
      {
        uid: "M901",
        item_type: "Assembly",
        product_size: "25",
        category: "Fittings",
        subcategory: "Union",
        production_type: "Assembly",
        processes_required: "Washing;Checking",
        components: "M855:2;M856:1",
      },
      "operator"
    )
  ).toMatchObject({
    actorUserId: "operator",
    organizationCode: "MRMPL",
    uid: "M901",
    itemType: "Assembly",
    processesRequired: ["Washing", "Checking"],
    components: [
      { uid: "M855", quantity: 2 },
      { uid: "M856", quantity: 1 },
    ],
  })
})

it("rejects customer fields rather than linking imported products", () => {
  expect(() =>
    portfolioCsvInput({ item_type: "List", customer: "ABC" }, "operator")
  ).toThrow("Unknown column: customer")
})

import { expect, test } from "vitest"
import { selectQuoteDrawingIds } from "./quote-drawings"

test("quote handoff uses explicit customer drawings, otherwise the latest approved portfolio drawing", () => {
  const history = [
    { fileId: "old", revision: 0, approved: true },
    { fileId: "approved", revision: 2, approved: true },
    { fileId: "draft", revision: 3, approved: false },
  ]
  expect(
    selectQuoteDrawingIds({
      selected: ["customer", "customer", "missing"],
      available: ["customer", "approved"],
      portfolio: true,
      history,
    })
  ).toEqual(["customer"])
  expect(
    selectQuoteDrawingIds({
      selected: [],
      available: ["old", "approved", "draft"],
      portfolio: true,
      history,
    })
  ).toEqual(["approved"])
  expect(
    selectQuoteDrawingIds({
      selected: [],
      available: ["old"],
      portfolio: true,
      history,
    })
  ).toEqual([])
  expect(
    selectQuoteDrawingIds({
      selected: [],
      available: ["approved"],
      portfolio: false,
      history,
    })
  ).toEqual([])
})

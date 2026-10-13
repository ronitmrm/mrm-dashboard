import { expect, it } from "vitest"
import { clearRetiredPageStorage } from "./retired-page-storage"

it("clears retired ISO filters while preserving retained registers and preferences", () => {
  const values = new Map([
    ["iso:pending-actions:mine", "old"],
    ["iso-document:master-document-list", "old"],
    ["iso-analysis-risk-pending", "old"],
    ["mrmpl:/iso-document/sipoc/example:operational-table:r1", "old"],
    ["iso-calibration-plan", "keep"],
    ["iso-measuring-instrument-register", "keep"],
    ["order-acceptance-products", "keep"],
    ["theme", "dark"],
  ])
  clearRetiredPageStorage({
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
    clear: () => values.clear(),
  })
  expect([...values.keys()]).toEqual([
    "iso-calibration-plan",
    "iso-measuring-instrument-register",
    "order-acceptance-products",
    "theme",
  ])
})

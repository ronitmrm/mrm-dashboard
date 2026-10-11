import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { RouteChangeTargetPicker } from "./route-change-target-picker"

test("shows Item Code before Job Card and limits Job Cards to the selected item", () => {
  const workOrders = [
    { jcNo: "JC-1", partCode: "M6", fgPoNo: "PO-1" },
    { jcNo: "JC-2", partCode: "M6", fgPoNo: "PO-2" },
    { jcNo: "JC-3", partCode: "M7", fgPoNo: "PO-3" },
  ]
  const render = (partCode: string) =>
    renderToStaticMarkup(
      <RouteChangeTargetPicker
        target=""
        partCode={partCode}
        workOrders={workOrders}
        onPartCodeChange={() => {}}
        onTargetChange={() => {}}
      />
    )

  const selected = render("M6")
  expect(selected.indexOf("Item Code")).toBeLessThan(
    selected.indexOf("Job Card")
  )
  expect(selected).not.toContain('role="tablist"')
  expect(selected).toContain('value="JC-1"')
  expect(selected).toContain('value="JC-2"')
  expect(selected).not.toContain('value="JC-3"')

  const empty = render("")
  const jobCardSelect = empty.match(
    /<select[^>]*id="route-change-job-card"[^>]*>/
  )?.[0]
  expect(jobCardSelect).toContain("disabled")
  expect(empty).toContain("Select Item First")
  expect(empty).not.toContain('value="JC-1"')
})

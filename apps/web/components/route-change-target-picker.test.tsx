import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { RouteChangeTargetPicker } from "./route-change-target-picker"

test("separates Job Card and Part Code lookup, with part lookup limited to its Job Cards", () => {
  const workOrders = [
    { jcNo: "JC-1", partCode: "M6", fgPoNo: "PO-1" },
    { jcNo: "JC-2", partCode: "M6", fgPoNo: "PO-2" },
    { jcNo: "JC-3", partCode: "M7", fgPoNo: "PO-3" },
  ]
  const render = (mode: "jobCard" | "partCode") => renderToStaticMarkup(
    <RouteChangeTargetPicker
      mode={mode}
      target=""
      partCode="M6"
      workOrders={workOrders}
      onModeChange={() => {}}
      onPartCodeChange={() => {}}
      onTargetChange={() => {}}
    />
  )

  const jobCardTab = render("jobCard")
  expect(jobCardTab).toContain("Job Card")
  expect(jobCardTab).toContain("Part Code")
  expect(jobCardTab).toContain('list="route-change-job-cards"')

  const partTab = render("partCode")
  expect(partTab).toContain('list="route-change-part-codes"')
  expect(partTab).toContain("Job Card for this part")
  expect(partTab).toContain('value="JC-1"')
  expect(partTab).toContain('value="JC-2"')
  expect(partTab).not.toContain('value="JC-3"')
})

import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/lib/unified-navigation", () => import("../lib/unified-navigation"))
vi.mock("@/components/ui/golden-patterns", () => import("./ui/golden-patterns"))

import { JobCardRegister } from "./job-card-register"

test("shows the saved finish and changing current forecast for the matching Job Card and part", () => {
  const render = (currentProbableDispatchDate: string) => renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      rows={[{ jcNo: "P2132", partCode: "R131" }]}
      finishDateRows={[
        { jcNo: "P2132", partCode: "R131", plannedDispatchDateAtRmReceipt: "25-Sept-26", currentProbableDispatchDate },
        { jcNo: "P2132", partCode: "OTHER", plannedDispatchDateAtRmReceipt: "1-Nov-26", currentProbableDispatchDate: "2-Nov-26" },
      ]} />
  )
  const initial = render("28-Sept-26")
  expect(initial).toContain("Planned Finish Date")
  expect(initial).toContain("Current Estimated Finish")
  expect(initial).toContain("25-Sept-26")
  expect(initial).toContain("28-Sept-26")
  const refreshed = render("30-Sept-26")
  expect(refreshed).toContain("25-Sept-26")
  expect(refreshed).toContain("30-Sept-26")
  expect(refreshed).not.toContain("28-Sept-26")
  expect(refreshed).not.toContain("Nov-26")
})

test("does not invent an RM-receipt finish for a legacy Job Card", () => {
  const markup = renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      rows={[{ jcNo: "P0556", partCode: "R272" }]}
      finishDateRows={[
        { jcNo: "P0556", partCode: "R272", plannedDispatchDateAtRmReceipt: "", currentProbableDispatchDate: "29-Sept-26" },
      ]} />
  )

  expect(markup).toContain("Not recorded")
  expect(markup).toContain("29-Sept-26")
})

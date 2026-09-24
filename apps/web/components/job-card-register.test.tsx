import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/lib/unified-navigation", () => import("../lib/unified-navigation"))
vi.mock("@/components/ui/golden-patterns", () => import("./ui/golden-patterns"))

import { JobCardRegister } from "./job-card-register"

test("shows the saved finish and changing current forecast for the matching Job Card and part", () => {
  const render = (currentProbableDispatchDate: string) => renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      routeRows={[]} productionRows={[]}
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
      routeRows={[]} productionRows={[]}
      rows={[{ jcNo: "P0556", partCode: "R272" }]}
      finishDateRows={[
        { jcNo: "P0556", partCode: "R272", plannedDispatchDateAtRmReceipt: "", currentProbableDispatchDate: "29-Sept-26" },
      ]} />
  )

  expect(markup).toContain("Not recorded")
  expect(markup).toContain("29-Sept-26")
  expect(markup).toContain("Progress unavailable")
})

test("shows setup-weighted progress from existing snapshots without new cached progress fields", () => {
  const render = (secondSetupGood: number) => renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      rows={[{ jcNo: "JC-1", partCode: "PART-1", optionNumber: "1", orderPcs: 500 }]}
      routeRows={[
        { partNo: "PART-1", optionNumber: "1", setupNo: "1.1", displaySetupNo: "1" },
        { partNo: "PART-1", optionNumber: "1", setupNo: "1.2", displaySetupNo: "2" },
        { partNo: "PART-1", optionNumber: "2", setupNo: "3" },
      ]}
      productionRows={[
        { jobCard: "JC-1", partCode: "PART-1", setupNo: "1", actualQty: 300 },
        { jobCard: "JC-1", partCode: "PART-1", setupNo: "1", actualQty: 300 },
        { jobCard: "JC-1", partCode: "PART-1", setupNo: "2", actualQty: secondSetupGood },
        { jobCard: "OTHER", partCode: "PART-1", setupNo: "2", actualQty: 500 },
      ]}
      finishDateRows={[]} />
  )
  const markup = render(0)
  expect(markup).toContain("50.0%")
  expect(markup).toContain("1/2 setups complete")
  expect(markup).toContain('role="progressbar"')
  expect(markup).toContain('aria-valuenow="50"')
  expect(markup).toContain('width:50%')
  expect(render(250)).toContain('aria-valuenow="75"')
})

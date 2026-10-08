import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/lib/unified-navigation", () => import("../lib/unified-navigation"))
vi.mock("@/components/ui/golden-patterns", () => import("./ui/golden-patterns"))

import { JobCardRegister } from "./job-card-register"

test("counts every Job Card in one summary bucket, including readiness and partial dispatch", () => {
  const markup = renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      finishDateRows={[]} routeRows={[{ partNo: "PART-1", optionNumber: "1", setupNo: "1" }]}
      productionRows={[{ jobCard: "COMPLETE", partCode: "PART-1", setupNo: "1", actualQty: 100 }]}
      rows={[
        { jcNo: "AWAITING" },
        { jcNo: "READY", rmStatus: "Received" },
        { jcNo: "READINESS", rmStatus: "Received", routeStatus: "Missing route" },
        { jcNo: "ACTIVE", rawRows: 1 },
        { jcNo: "PARTIAL", dispatchStatus: "Partially dispatched" },
        { jcNo: "COMPLETE", partCode: "PART-1", optionNumber: "1", orderPcs: 100 },
        { jcNo: "DISPATCHED", dispatchStatus: "Dispatched" },
        { jcNo: "HISTORICAL", dispatchStatus: "Dispatch approved" },
      ]} />
  )
  const summary = markup.match(/data-slot="metric-summary"[\s\S]*?<\/section>/)?.[0].replace(/<[^>]*>/g, "")
  expect(summary).toContain("Job Cards8")
  expect(summary).toContain("Awaiting RM1")
  expect(summary).toContain("In Production4")
  expect(summary).toContain("Production Complete1")
  expect(summary).toContain("Dispatched2")
})

test("shows the saved finish and changing current forecast for the matching Job Card and part", () => {
  const render = (currentProbableDispatchDate: string) => renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      routeRows={[]} productionRows={[]}
      rows={[{ jcNo: "P2132", partCode: "R131", poDate: "2026-09-12" }]}
      finishDateRows={[
        { jcNo: "P2132", partCode: "R131", plannedDispatchDateAtRmReceipt: "25-Sept-26", currentProbableDispatchDate, actualFinishDate: "24-Sept-26" },
        { jcNo: "P2132", partCode: "OTHER", plannedDispatchDateAtRmReceipt: "1-Nov-26", currentProbableDispatchDate: "2-Nov-26", actualFinishDate: "4-Nov-26" },
      ]} />
  )
  const initial = render("28-Sept-26")
  expect(initial).toContain("Planned Finish Date")
  expect(initial).toContain("Current Estimated Finish")
  expect(initial).toContain("Actual Finish Date")
  expect(initial).toContain("FG PO Date")
  expect(initial).toContain("2026-09-12")
  expect(initial).toContain("25-Sept-26")
  expect(initial).toContain("28-Sept-26")
  expect(initial).toContain("24-Sept-26")
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
  expect(markup).toContain("<span class=\"text-muted-foreground\">-</span>")
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

test("shows dispatched finished good and order shortfall instead of active progress", () => {
  const markup = renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      rows={[{ jcNo: "JC-DISPATCHED", partCode: "PART-1", optionNumber: "1", orderPcs: 1100,
        finalSetupGoodPieces: 1046, dispatchStatus: "Shifted to dispatch" }]}
      routeRows={[
        { partNo: "PART-1", optionNumber: "1", setupNo: "1" },
        { partNo: "PART-1", optionNumber: "1", setupNo: "2" },
      ]}
      productionRows={[
        { jobCard: "JC-DISPATCHED", partCode: "PART-1", setupNo: "1", actualQty: 1046 },
        { jobCard: "JC-DISPATCHED", partCode: "PART-1", setupNo: "2", actualQty: 1046 },
      ]}
      finishDateRows={[]} />
  )

  expect(markup).toContain("Dispatched")
  expect(markup).toContain("1,046 / 1,100 pcs")
  expect(markup).toContain("54 pcs short of order")
  expect(markup).toContain("Not recorded")
  expect(markup).not.toContain("95.1%")
  expect(markup).not.toContain('role="progressbar"')
})

test("keeps production progress visible after a partial dispatch", () => {
  const markup = renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      rows={[{ jcNo: "JC-PARTIAL", partCode: "PART-1", optionNumber: "1", orderPcs: 100,
        finalSetupNumber: "1", finalSetupGoodPieces: 40,
        dispatchStatus: "Partially dispatched", dispatchedPieces: 25, dispatchAvailablePieces: 15 }]}
      routeRows={[{ partNo: "PART-1", optionNumber: "1", setupNo: "1" }]}
      productionRows={[{ jobCard: "JC-PARTIAL", partCode: "PART-1", setupNo: "3", actualQty: 40 }]}
      finishDateRows={[]} />
  )

  expect(markup).toContain("Partially dispatched")
  expect(markup).toContain("25 pcs dispatched")
  expect(markup).toContain("15 ready to dispatch")
  expect(markup).toContain('role="progressbar"')
  expect(markup).toContain('aria-valuenow="40"')
})

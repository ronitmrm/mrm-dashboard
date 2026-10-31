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
        { jcNo: "READY · Rev 1 · Rework", rootJobCardNumber: "READY", revisionNumber: 1, orderPcs: 12, rmStatus: "Received" },
        { jcNo: "READY · Rev 1 · Replacement", rootJobCardNumber: "READY", revisionNumber: 1, orderPcs: 8, rmStatus: "Waiting" },
        { jcNo: "READINESS", rmStatus: "Received", routeStatus: "Missing route" },
        { jcNo: "ACTIVE", rawRows: 1 },
        { jcNo: "PARTIAL", dispatchStatus: "Partially dispatched", dispatchedPieces: 25 },
        { jcNo: "COMPLETE", partCode: "PART-1", optionNumber: "1", orderPcs: 100 },
        { jcNo: "DISPATCHED", dispatchStatus: "Dispatched", dispatchedPieces: 1200 },
        { jcNo: "DISPATCHED · Rev 1 · Rework", rootJobCardNumber: "DISPATCHED", revisionNumber: 1, dispatchStatus: "Dispatched", dispatchedPieces: 30 },
        { jcNo: "DISPATCHED · Rev 1 · Replacement", rootJobCardNumber: "DISPATCHED", revisionNumber: 1, dispatchStatus: "Dispatched", dispatchedPieces: 5 },
        { jcNo: "HISTORICAL", dispatchStatus: "Dispatch approved", dispatchedPieces: null, finalSetupGoodPieces: 999 },
      ]} />
  )
  const summary = markup.match(/data-slot="metric-summary"[\s\S]*?<\/section>/)?.[0].replace(/<[^>]*>/g, "")
  expect(summary).toContain("Job Cards8")
  expect(summary).toContain("Awaiting RM2")
  expect(summary).toContain("In Production3")
  expect(summary).toContain("Production Complete1")
  expect(summary).toContain("Dispatched2")
  expect(summary).toContain("Total Parts Dispatched1,260")
  expect(markup).toContain("Rev 1 · 2 revisions")
})

test("shows the saved finish and changing current forecast for the matching Job Card and part", () => {
  const render = (currentProbableDispatchDate: string) => renderToStaticMarkup(
    <JobCardRegister actionNeededCount={0} floor="cnc" onOpenMasterReadiness={() => {}}
      routeRows={[]} productionRows={[]}
      rows={[{ jcNo: "P2132", partCode: "R131", poDate: "10/17/26", committedDispatchDate: "2026-10-05" }]}
      finishDateRows={[
        { jcNo: "P2132", partCode: "R131", rmReceivedDate: "20-Sept-26", plannedDispatchDateAtRmReceipt: "25-Sept-26", currentProbableDispatchDate, actualFinishDate: "24-Sept-26" },
        { jcNo: "P2132", partCode: "OTHER", plannedDispatchDateAtRmReceipt: "1-Nov-26", currentProbableDispatchDate: "2-Nov-26", actualFinishDate: "4-Nov-26" },
      ]} />
  )
  const initial = render("28-Sept-26")
  expect(initial).toContain("Planned Finish Date")
  expect(initial).toContain("RM Received Date")
  expect(initial).toContain("20/09/2026")
  expect(initial).toContain("Current Estimated Finish")
  expect(initial).toContain("Committed Dispatch Date")
  expect(initial).toContain("05/10/2026")
  expect(initial).toContain("Actual Finish Date")
  expect(initial).toContain("FG PO Date")
  expect(initial).toContain("17/10/2026")
  expect(initial).toContain("25/09/2026")
  expect(initial).toContain("28/09/2026")
  expect(initial).toContain("24/09/2026")
  const refreshed = render("30-Sept-26")
  expect(refreshed).toContain("05/10/2026")
  expect(refreshed).toContain("25/09/2026")
  expect(refreshed).toContain("30/09/2026")
  expect(refreshed).not.toContain("28/09/2026")
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
  expect(markup).toContain("Not set")
  expect(markup).toContain("29/09/2026")
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

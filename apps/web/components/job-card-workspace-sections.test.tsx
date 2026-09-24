import { renderToStaticMarkup } from "react-dom/server"
import { expect, test, vi } from "vitest"

vi.mock("@/lib/date-time", () => import("../lib/date-time"))

import { JobCardQualityRecords, SetupProduction } from "./job-card-workspace-sections"

test("shows setup good output and opens the matching saved QC reports in the selected floor", () => {
  const setup = renderToStaticMarkup(<SetupProduction orderedQuantity={500}
    setups={[{ setupNumber: "1", operationName: "Turning" }]}
    rows={[{ setupNumber: "1", actualGoodPieces: 705, completionPercent: 100 },
      { setupNumber: "2", actualGoodPieces: 411, completionPercent: 82.2 }]} />)
  expect(setup).toContain("705")
  expect(setup).toContain("411")
  expect(setup).toContain("41.1%")
  const quality = renderToStaticMarkup(<JobCardQualityRecords floor="cnc" rows={[
    { id: "1", kind: "first_piece", reportKey: "jc|fpi", status: "Approved" },
    { id: "2", kind: "hourly", reportKey: "jc|hourly", status: "OK" },
  ]} />)
  expect(quality).toContain("/dashboard/first-piece-inspection/report?floor=cnc&amp;reportId=jc%7Cfpi")
  expect(quality).toContain("/dashboard/hourly-quality-check/report?floor=cnc&amp;checkId=jc%7Chourly")
})

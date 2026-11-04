import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import type { ParallelMachineReview } from "@workspace/db"
import { ParallelMachineReadinessReview } from "./parallel-machine-readiness-review"

test("parallel review shows calculated blocker and requires an explicit queue or early-start choice", () => {
  const review: ParallelMachineReview = {
    fingerprint: "review",
    ready: false,
    blocker:
      "Available WIP: 25,480 pcs; required for 2 machines: 34,715 pcs; short by 9,235 pcs.",
    plannedStart: "12/11/2026",
    plannedFinish: "15/11/2026",
    availableWip: 25480,
    requiredWip: 34714.286,
    bufferDays: 3,
    machineCount: 2,
    earlyStartAllowed: true,
    earlyStartBlocker: "",
  }
  const render = (value: ParallelMachineReview) =>
    renderToStaticMarkup(
      <ParallelMachineReadinessReview
        review={value}
        busy={false}
        error=""
        decision=""
        onCalculate={() => {}}
        onDecision={() => {}}
      />
    )
  const html = render(review)
  expect(html).toContain("short by 9,235 pcs")
  expect(html).toContain("12/11/2026")
  expect(html).toContain("Queue for calculated start")
  expect(html).toContain("Approve early start using available WIP")
  expect(render({ ...review, earlyStartAllowed: false })).not.toContain(
    "Approve early start using available WIP"
  )
  expect(render({ ...review, ready: true, blocker: "" })).not.toContain(
    "How should this machine be added?"
  )
})

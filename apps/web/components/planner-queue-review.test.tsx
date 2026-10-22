import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"
import { PlannerQueueTable, PlannerSetupDecision } from "./planner-queue-review"

test("shows an explicit running-setup stop choice and the ordered queue result", () => {
  const markup = renderToStaticMarkup(
    <>
      <PlannerSetupDecision
        identity="M838 / P2072 / Setup 1"
        machine="CNC-25"
        running
        selected
        onChange={() => {}}
      />
      <PlannerQueueTable
        machine="CNC-25"
        rows={[
          { key: "new", identity: "M744 / P2292 / Setup 1", kind: "moved" },
          { key: "queued", identity: "M838 / P2072 / Setup 1", kind: "queued" },
        ]}
      />
    </>
  )
  expect(markup).toContain("Stop running setup")
  expect(markup).toContain("Cancel stop")
  expect(markup).toContain("Stop on save")
  expect(markup).toContain('aria-pressed="true"')
  expect(markup.indexOf("M744 / P2292")).toBeLessThan(
    markup.lastIndexOf("M838 / P2072")
  )
  expect(markup).not.toContain("draggable")
  const keepingRunning = renderToStaticMarkup(
    <PlannerSetupDecision identity="M838 / P2072 / Setup 1" machine="CNC-25"
      running selected={false} onChange={() => {}} />
  )
  expect(keepingRunning).toContain("Keep running")
  expect(keepingRunning.match(/<button\b/g)).toHaveLength(1)
  expect(keepingRunning).toContain("Stop running setup")
})

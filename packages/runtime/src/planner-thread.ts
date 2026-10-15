import { parentPort } from "node:worker_threads"
import { buildLegacyDashboardSnapshotWithPlanning } from "@workspace/db/dashboard-analysis"
import type { PlannerRequest, PlannerResult } from "./planner-worker-pool"

if (!parentPort) throw new Error("Planner must run in a worker thread")
const port = parentPort
port.on("message", ({ id, input, options }: PlannerRequest) => {
  try {
    port.postMessage({ id, snapshot: buildLegacyDashboardSnapshotWithPlanning(input, options) } satisfies PlannerResult)
  } catch (error) {
    port.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies PlannerResult)
  }
})

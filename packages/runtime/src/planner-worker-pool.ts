import { availableParallelism } from "node:os"
import { Worker } from "node:worker_threads"
import type { buildLegacyDashboardSnapshotWithPlanning } from "@workspace/db/dashboard-analysis"

export type PlannerRequest = {
  id: number
  input: Parameters<typeof buildLegacyDashboardSnapshotWithPlanning>[0]
  options: Parameters<typeof buildLegacyDashboardSnapshotWithPlanning>[1]
}
export type PlannerResult =
  | { id: number; snapshot: ReturnType<typeof buildLegacyDashboardSnapshotWithPlanning> }
  | { id: number; error: string }

type PendingCalculation = {
  resolve: (snapshot: ReturnType<typeof buildLegacyDashboardSnapshotWithPlanning>) => void
  reject: (error: Error) => void
}

export function createPlannerWorkerPool(size = Math.min(2, availableParallelism())) {
  const slots: Array<{ worker?: Worker; pending: Map<number, PendingCalculation> }> =
    Array.from({ length: Math.max(1, size) }, () => ({
      pending: new Map<number, PendingCalculation>(),
    }))
  let sequence = 0
  let closed = false

  function workerFor(slot: (typeof slots)[number]) {
    if (slot.worker) return slot.worker
    const extension = import.meta.url.endsWith(".ts") ? "ts" : "js"
    const worker = new Worker(new URL(`./planner-thread.${extension}`, import.meta.url), {
      execArgv:
        extension === "ts"
          ? [...process.execArgv, "--import", import.meta.resolve("tsx")]
          : process.execArgv,
    })
    slot.worker = worker
    const fail = (error: Error) => {
      if (slot.worker !== worker) return
      slot.worker = undefined
      for (const pending of slot.pending.values()) pending.reject(error)
      slot.pending.clear()
    }
    worker.on("error", fail)
    worker.on("exit", (code) => fail(new Error(`Planner thread exited (${code})`)))
    worker.on("message", (message: PlannerResult) => {
      const pending = slot.pending.get(message.id)
      if (!pending) return
      slot.pending.delete(message.id)
      if ("error" in message) pending.reject(new Error(message.error))
      else pending.resolve(message.snapshot)
      if (!slot.pending.size) worker.unref()
    })
    worker.unref()
    return worker
  }

  return {
    calculate(input: PlannerRequest["input"], options: PlannerRequest["options"]) {
      if (closed) return Promise.reject(new Error("Planner thread pool is closed"))
      const slot = slots.reduce((best, candidate) =>
        candidate.pending.size < best.pending.size ? candidate : best
      )
      return new Promise<ReturnType<typeof buildLegacyDashboardSnapshotWithPlanning>>((resolve, reject) => {
        const id = ++sequence
        const worker = workerFor(slot)
        slot.pending.set(id, { resolve, reject })
        worker.ref()
        try {
          worker.postMessage({ id, input, options } satisfies PlannerRequest)
        } catch (error) {
          slot.pending.delete(id)
          if (!slot.pending.size) worker.unref()
          reject(error)
        }
      })
    },
    async close() {
      closed = true
      await Promise.all(
        slots.map(async (slot) => {
          for (const pending of slot.pending.values()) {
            pending.reject(new Error("Planner thread pool closed"))
          }
          slot.pending.clear()
          await slot.worker?.terminate()
          slot.worker = undefined
        })
      )
    },
  }
}

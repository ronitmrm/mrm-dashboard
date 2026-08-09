import { performance } from "node:perf_hooks"

import {
  emitStructuredTelemetry,
  retainedJsonTelemetrySink,
  telemetryRuntimeFromEnvironment,
  workerListenerEvent,
  workerSweepEvent,
  type TelemetryRuntime,
  type TelemetrySink,
  type WorkerListenerState,
} from "@workspace/observability"

import type { RefreshListenerTransition } from "./postgres-refresh-listener"
import type { WorkerSafetySnapshot } from "./worker-loop"

type WorkerSweepObservation = {
  cycleOutcome: "error" | "success"
  snapshot: WorkerSafetySnapshot | null
}

const emptySnapshot: WorkerSafetySnapshot = {
  failedJobs: 0,
  lastVersion: null,
  oldestOutboxSeconds: null,
  oldestPendingSeconds: null,
  pendingJobs: 0,
  pendingOutbox: 0,
  poolWaiters: 0,
  retryingOutbox: 0,
  runningJobs: 0,
}

export function createWorkerRuntimeMonitor({
  nowMs = () => performance.now(),
  runtime = telemetryRuntimeFromEnvironment(),
  sink = retainedJsonTelemetrySink,
  workerId,
}: {
  nowMs?: () => number
  runtime?: TelemetryRuntime
  sink?: TelemetrySink
  workerId: string
}) {
  let live = true
  let listenerState: WorkerListenerState = "connecting"
  let lastListenerReconciliationAt: string | null = null
  let lastReconnectAt: string | null = null
  let lastSafetySweepAt: string | null = null
  let safetySweepOutcome: WorkerSweepObservation["cycleOutcome"] | null = null
  let latestSnapshot = emptySnapshot
  let minuteOutcome: WorkerSweepObservation["cycleOutcome"] = "success"
  let minutePoolWaiters = 0
  let sweepCount = 0

  function monotonicNow() {
    try {
      const value = nowMs()
      return Number.isFinite(value) ? value : 0
    } catch {
      return 0
    }
  }

  let nextSweepEmissionAtMs = monotonicNow() + 60_000

  function timestamp() {
    try {
      return runtime.now() || new Date().toISOString()
    } catch {
      return new Date().toISOString()
    }
  }

  return {
    liveness() {
      return { live }
    },

    readiness() {
      return {
        lastListenerReconciliationAt,
        lastSafetySweepAt,
        listenerState,
        ready:
          live &&
          listenerState === "ready" &&
          lastListenerReconciliationAt !== null &&
          safetySweepOutcome === "success",
        safetySweepOutcome,
      }
    },

    recordListenerTransition(transition: RefreshListenerTransition) {
      const event = workerListenerEvent(
        {
          commandId: workerId,
          disconnectCategory: transition.disconnectCategory,
          reconciliationResult: transition.reconciliationResult,
          retryCount: transition.retryCount,
          state: transition.state,
        },
        runtime
      )
      listenerState = transition.state
      if (transition.reconciliationResult !== "not-run") {
        lastListenerReconciliationAt = event.timestamp
      }
      if (transition.state === "ready" && transition.retryCount > 0) {
        lastReconnectAt = event.timestamp
      }
      if (transition.state === "stopped") live = false
      emitStructuredTelemetry(event, sink)
    },

    recordSweep(observation: WorkerSweepObservation) {
      lastSafetySweepAt = timestamp()
      safetySweepOutcome = observation.cycleOutcome
      minuteOutcome =
        minuteOutcome === "error" || observation.cycleOutcome === "error"
          ? "error"
          : "success"
      sweepCount += 1
      if (observation.snapshot) {
        latestSnapshot = observation.snapshot
        minutePoolWaiters = Math.max(
          minutePoolWaiters,
          observation.snapshot.poolWaiters
        )
      }

      const currentMs = monotonicNow()
      if (currentMs < nextSweepEmissionAtMs) return

      emitStructuredTelemetry(
        workerSweepEvent(
          {
            commandId: workerId,
            cycleOutcome: minuteOutcome,
            failedJobs: latestSnapshot.failedJobs,
            lastReconciliationAt: lastListenerReconciliationAt,
            lastReconnectAt,
            lastVersion: latestSnapshot.lastVersion,
            listenerState,
            oldestOutboxSeconds: latestSnapshot.oldestOutboxSeconds,
            oldestPendingSeconds: latestSnapshot.oldestPendingSeconds,
            pendingJobs: latestSnapshot.pendingJobs,
            pendingOutbox: latestSnapshot.pendingOutbox,
            poolWaiters: minutePoolWaiters,
            retryingOutbox: latestSnapshot.retryingOutbox,
            runningJobs: latestSnapshot.runningJobs,
            sweepCount,
          },
          runtime
        ),
        sink
      )
      minuteOutcome = "success"
      minutePoolWaiters = 0
      sweepCount = 0
      nextSweepEmissionAtMs +=
        Math.floor((currentMs - nextSweepEmissionAtMs) / 60_000 + 1) * 60_000
    },

    stop() {
      live = false
    },
  }
}

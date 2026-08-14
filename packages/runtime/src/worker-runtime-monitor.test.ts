import {
  createTelemetryRuntime,
  type StructuredTelemetryEvent,
} from "@workspace/observability"
import { describe, expect, it, vi } from "vitest"

import { createWorkerRuntimeMonitor } from "./worker-runtime-monitor"

const runtime = createTelemetryRuntime({
  artifactCommit: "commit-worker-monitor",
  environment: "test",
  now: () => "2026-08-08T12:00:00.000Z",
})

const idleSnapshot = {
  failedJobs: 0,
  lastVersion: 42,
  oldestOutboxSeconds: null,
  oldestPendingSeconds: null,
  pendingJobs: 0,
  pendingOutbox: 0,
  poolWaiters: 0,
  retryingOutbox: 0,
  runningJobs: 0,
}

describe("worker runtime monitor", () => {
  it("emits listener transitions and keeps query-free process health", () => {
    const events: StructuredTelemetryEvent[] = []
    let nowMs = 0
    const monitor = createWorkerRuntimeMonitor({
      nowMs: () => nowMs,
      runtime,
      sink: (event) => events.push(event),
      workerId: "worker-monitor",
    })

    expect(monitor.liveness()).toEqual({ live: true })
    expect(monitor.readiness()).toMatchObject({ ready: false })

    monitor.recordListenerTransition({
      disconnectCategory: null,
      reconciliationResult: "not-run",
      retryCount: 0,
      state: "connecting",
    })
    monitor.recordListenerTransition({
      disconnectCategory: null,
      reconciliationResult: "success",
      retryCount: 0,
      state: "ready",
    })
    nowMs = 30_000
    monitor.recordSweep({
      cycleOutcome: "success",
      snapshot: idleSnapshot,
    })

    expect(monitor.readiness()).toEqual({
      lastListenerReconciliationAt: "2026-08-08T12:00:00.000Z",
      lastSafetySweepAt: "2026-08-08T12:00:00.000Z",
      listenerState: "ready",
      ready: true,
      safetySweepOutcome: "success",
    })
    expect(events).toEqual([
      expect.objectContaining({
        event: "worker.listener",
        state: "connecting",
      }),
      expect.objectContaining({
        event: "worker.listener",
        reconciliationResult: "success",
        state: "ready",
      }),
    ])

    monitor.stop()
    expect(monitor.liveness()).toEqual({ live: false })
    expect(monitor.readiness()).toMatchObject({ ready: false })
  })

  it("aggregates two normal sweeps into one retained minute event", () => {
    const events: StructuredTelemetryEvent[] = []
    let nowMs = 0
    const monitor = createWorkerRuntimeMonitor({
      nowMs: () => nowMs,
      runtime,
      sink: (event) => events.push(event),
      workerId: "worker-monitor",
    })
    monitor.recordListenerTransition({
      disconnectCategory: null,
      reconciliationResult: "success",
      retryCount: 1,
      state: "ready",
    })

    nowMs = 30_000
    monitor.recordSweep({
      cycleOutcome: "success",
      snapshot: idleSnapshot,
    })
    nowMs = 60_000
    monitor.recordSweep({
      cycleOutcome: "success",
      snapshot: { ...idleSnapshot, lastVersion: 43, poolWaiters: 2 },
    })

    expect(events.filter(({ event }) => event === "worker.sweep")).toEqual([
      expect.objectContaining({
        commandId: "worker-monitor",
        cycleOutcome: "success",
        event: "worker.sweep",
        lastReconciliationAt: "2026-08-08T12:00:00.000Z",
        lastReconnectAt: "2026-08-08T12:00:00.000Z",
        lastVersion: 43,
        listenerState: "ready",
        poolWaiters: 2,
        sweepCount: 2,
      }),
    ])
  })

  it("retains reconnect and sweep retry evidence without throwing on logging failure", () => {
    let nowMs = 0
    const sink = vi.fn(() => {
      throw new Error("retained drain unavailable")
    })
    const monitor = createWorkerRuntimeMonitor({
      nowMs: () => nowMs,
      runtime,
      sink,
      workerId: "worker-monitor",
    })

    expect(() =>
      monitor.recordListenerTransition({
        disconnectCategory: "timeout",
        reconciliationResult: "error",
        retryCount: 2,
        state: "retrying",
      })
    ).not.toThrow()
    nowMs = 60_000
    expect(() =>
      monitor.recordSweep({ cycleOutcome: "error", snapshot: null })
    ).not.toThrow()
    expect(monitor.readiness()).toMatchObject({
      listenerState: "retrying",
      ready: false,
      safetySweepOutcome: "error",
    })
    expect(sink).toHaveBeenCalledTimes(2)
  })
})

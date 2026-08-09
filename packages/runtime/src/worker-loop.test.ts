import { describe, expect, it, vi } from "vitest"

import { advanceSweepDeadline, runSafetySweepCycle } from "./worker-loop"

const idleBatch = {
  failed: 0,
  outbox: { published: 0, retrying: 0 },
  processed: 0,
  retrying: 0,
}

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

describe("worker safety sweep", () => {
  it("uses probes without opening a full drain while idle", async () => {
    const runBatch = vi.fn().mockResolvedValue(idleBatch)

    const result = await runSafetySweepCycle({
      consecutiveFailures: 3,
      maxRetryDelayMs: 30_000,
      probeWork: vi.fn().mockResolvedValue({
        eligibleRefresh: false,
        publishableOutbox: false,
        snapshot: idleSnapshot,
      }),
      runBatch,
      workerId: "test-worker",
    })

    expect(result).toEqual({
      consecutiveFailures: 0,
      probe: {
        eligibleRefresh: false,
        publishableOutbox: false,
        snapshot: idleSnapshot,
      },
    })
    expect(runBatch).not.toHaveBeenCalled()
  })

  it("enters one serialized drain after either probe is positive", async () => {
    const batch = { ...idleBatch, processed: 1 }
    const runBatch = vi.fn().mockResolvedValue(batch)

    const result = await runSafetySweepCycle({
      consecutiveFailures: 0,
      maxRetryDelayMs: 30_000,
      probeWork: vi.fn().mockResolvedValue({
        eligibleRefresh: true,
        publishableOutbox: false,
        snapshot: { ...idleSnapshot, pendingJobs: 1 },
      }),
      runBatch,
      workerId: "test-worker",
    })

    expect(result).toEqual({
      batch,
      consecutiveFailures: 0,
      event: { batch, event: "batch", workerId: "test-worker" },
      probe: {
        eligibleRefresh: true,
        publishableOutbox: false,
        snapshot: { ...idleSnapshot, pendingJobs: 1 },
      },
    })
    expect(runBatch).toHaveBeenCalledTimes(1)
  })

  it("turns a transient probe timeout into a bounded redacted retry", async () => {
    const timeout = new AggregateError(
      [Object.assign(new Error("connect failed"), { code: "ETIMEDOUT" })],
      ""
    )

    const result = await runSafetySweepCycle({
      consecutiveFailures: 0,
      maxRetryDelayMs: 30_000,
      probeWork: vi.fn().mockRejectedValue(timeout),
      runBatch: vi.fn().mockResolvedValue(idleBatch),
      workerId: "test-worker",
    })

    expect(result).toEqual({
      consecutiveFailures: 1,
      event: {
        category: "timeout",
        event: "sweep-error",
        retryDelayMs: 250,
        workerId: "test-worker",
      },
      retryDelayMs: 250,
    })
    expect(JSON.stringify(result)).not.toContain("connect failed")
  })

  it("keeps the 30-second cadence anchored when a sweep finishes late", () => {
    expect(
      advanceSweepDeadline({
        intervalMs: 30_000,
        nowMs: 30_100,
        previousDeadlineMs: 30_000,
      })
    ).toBe(60_000)
    expect(
      advanceSweepDeadline({
        intervalMs: 30_000,
        nowMs: 95_000,
        previousDeadlineMs: 60_000,
      })
    ).toBe(120_000)
  })
})

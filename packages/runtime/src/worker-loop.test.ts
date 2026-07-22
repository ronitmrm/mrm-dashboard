import { describe, expect, it, vi } from "vitest"

import { runContinuousWorkerCycle } from "./worker-loop"

describe("continuous worker resilience", () => {
  it("turns a transient PostgreSQL timeout into a redacted retry event", async () => {
    const timeout = new AggregateError(
      [Object.assign(new Error("connect failed"), { code: "ETIMEDOUT" })],
      ""
    )
    const runBatch = vi.fn().mockRejectedValue(timeout)

    const result = await runContinuousWorkerCycle({
      consecutiveFailures: 0,
      maxRetryDelayMs: 30_000,
      pollIntervalMs: 1_000,
      runBatch,
      workerId: "test-worker",
    })

    expect(result).toEqual({
      consecutiveFailures: 1,
      event: {
        category: "timeout",
        event: "poll-error",
        retryDelayMs: 1_000,
        workerId: "test-worker",
      },
      waitMs: 1_000,
    })
    expect(JSON.stringify(result)).not.toContain("connect failed")
  })

  it("resets backoff after the next successful batch", async () => {
    const batch = {
      failed: 0,
      outbox: { published: 0, retrying: 0 },
      processed: 0,
      retrying: 0,
    }

    const result = await runContinuousWorkerCycle({
      consecutiveFailures: 4,
      maxRetryDelayMs: 30_000,
      pollIntervalMs: 1_000,
      runBatch: vi.fn().mockResolvedValue(batch),
      workerId: "test-worker",
    })

    expect(result).toEqual({
      batch,
      consecutiveFailures: 0,
      waitMs: 1_000,
    })
  })
})

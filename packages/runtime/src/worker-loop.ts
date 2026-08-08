import { runtimeErrorCategory } from "./managed-telemetry"

type WorkerBatch = {
  failed: number
  outbox: { published: number; retrying: number }
  processed: number
  retrying: number
}

export type WorkerSafetySnapshot = {
  failedJobs: number
  lastVersion: number | null
  oldestOutboxSeconds: number | null
  oldestPendingSeconds: number | null
  pendingJobs: number
  pendingOutbox: number
  poolWaiters: number
  retryingOutbox: number
  runningJobs: number
}

export type WorkerSafetyProbe = {
  eligibleRefresh: boolean
  publishableOutbox: boolean
  snapshot: WorkerSafetySnapshot
}

type RunSafetySweepCycleOptions<T extends WorkerBatch> = {
  consecutiveFailures: number
  maxRetryDelayMs: number
  probeWork: () => Promise<WorkerSafetyProbe>
  runBatch: () => Promise<T>
  workerId: string
}

function hasBatchActivity(batch: WorkerBatch) {
  return (
    batch.processed > 0 ||
    batch.retrying > 0 ||
    batch.failed > 0 ||
    batch.outbox.published > 0 ||
    batch.outbox.retrying > 0
  )
}

export function advanceSweepDeadline({
  intervalMs,
  nowMs,
  previousDeadlineMs,
}: {
  intervalMs: number
  nowMs: number
  previousDeadlineMs: number
}) {
  const elapsedIntervals = Math.max(
    1,
    Math.floor((nowMs - previousDeadlineMs) / intervalMs) + 1
  )
  return previousDeadlineMs + elapsedIntervals * intervalMs
}

export async function runSafetySweepCycle<T extends WorkerBatch>({
  consecutiveFailures,
  maxRetryDelayMs,
  probeWork,
  runBatch,
  workerId,
}: RunSafetySweepCycleOptions<T>) {
  try {
    const probe = await probeWork()
    if (!probe.eligibleRefresh && !probe.publishableOutbox) {
      return { consecutiveFailures: 0, probe }
    }

    const batch = await runBatch()
    return {
      batch,
      consecutiveFailures: 0,
      ...(hasBatchActivity(batch)
        ? { event: { batch, event: "batch" as const, workerId } }
        : {}),
      probe,
    }
  } catch (error) {
    const nextFailureCount = consecutiveFailures + 1
    const retryDelayMs = Math.min(
      maxRetryDelayMs,
      250 * 2 ** Math.min(nextFailureCount - 1, 7)
    )
    return {
      consecutiveFailures: nextFailureCount,
      event: {
        category: runtimeErrorCategory(error) ?? "unknown",
        event: "sweep-error" as const,
        retryDelayMs,
        workerId,
      },
      retryDelayMs,
    }
  }
}

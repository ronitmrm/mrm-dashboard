import { runtimeErrorCategory } from "./managed-telemetry"

type WorkerBatch = {
  failed: number
  outbox: { published: number; retrying: number }
  processed: number
  retrying: number
}

type RunContinuousWorkerCycleOptions<T extends WorkerBatch> = {
  consecutiveFailures: number
  maxRetryDelayMs: number
  pollIntervalMs: number
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

export async function runContinuousWorkerCycle<T extends WorkerBatch>({
  consecutiveFailures,
  maxRetryDelayMs,
  pollIntervalMs,
  runBatch,
  workerId,
}: RunContinuousWorkerCycleOptions<T>) {
  try {
    const batch = await runBatch()
    return {
      batch,
      consecutiveFailures: 0,
      ...(hasBatchActivity(batch)
        ? { event: { batch, event: "batch" as const, workerId } }
        : {}),
      waitMs: pollIntervalMs,
    }
  } catch (error) {
    const nextFailureCount = consecutiveFailures + 1
    const retryDelayMs = Math.min(
      maxRetryDelayMs,
      pollIntervalMs * 2 ** Math.min(nextFailureCount - 1, 5)
    )
    return {
      consecutiveFailures: nextFailureCount,
      event: {
        category: runtimeErrorCategory(error) ?? "unknown",
        event: "poll-error" as const,
        retryDelayMs,
        workerId,
      },
      waitMs: retryDelayMs,
    }
  }
}

import { hostname } from "node:os"

import { createDurableRefreshWorker } from "../durable-refresh-worker"
import { readWorkerPostgresEnvironment } from "../managed-runtime"
import { readRedisAccelerationEnvironment } from "../redis-acceleration"
import { runContinuousWorkerCycle } from "../worker-loop"

const postgres = readWorkerPostgresEnvironment()
const redis = readRedisAccelerationEnvironment(process.env, postgres.hosted)
const workerId = process.env.REFRESH_WORKER_ID ?? `${hostname()}:${process.pid}`
const pollIntervalMs = Math.max(
  100,
  Number(process.env.REFRESH_WORKER_POLL_MS ?? 1_000)
)
const batchSize = Math.max(
  1,
  Number(process.env.REFRESH_WORKER_BATCH_SIZE ?? 10)
)
const maxRetryDelayMs = Math.max(
  pollIntervalMs,
  Number(process.env.REFRESH_WORKER_MAX_RETRY_DELAY_MS ?? 30_000)
)
const once = process.argv.includes("--once")
const statusOnly = process.argv.includes("--status")

const worker = createDurableRefreshWorker({
  postgresPoolMax: postgres.max,
  postgresUrl: postgres.connectionString,
  ...redis,
  workerId,
})

let stopping = false
const stop = () => {
  stopping = true
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, durationMs))

async function runBatch() {
  let processed = 0
  let retrying = 0
  let failed = 0

  for (let index = 0; index < batchSize && !stopping; index += 1) {
    const result = await worker.runRefreshOnce()
    if (result.status === "idle") break
    if (result.status === "processed") processed += 1
    if (result.status === "retrying") retrying += 1
    if (result.status === "failed") failed += 1
  }

  const outbox = await worker.flushOutbox(batchSize * 10)
  return { failed, outbox, processed, retrying }
}

try {
  if (statusOnly) {
    process.stdout.write(`${JSON.stringify(await worker.status())}\n`)
  } else if (once) {
    const batch = await runBatch()
    const status = await worker.status()
    process.stdout.write(`${JSON.stringify({ batch, status, workerId })}\n`)
  } else {
    process.stdout.write(`${JSON.stringify({ event: "started", workerId })}\n`)
    let consecutiveFailures = 0
    while (!stopping) {
      const cycle = await runContinuousWorkerCycle({
        consecutiveFailures,
        maxRetryDelayMs,
        pollIntervalMs,
        runBatch,
        workerId,
      })
      consecutiveFailures = cycle.consecutiveFailures
      if (cycle.event) {
        const output = `${JSON.stringify(cycle.event)}\n`
        if (cycle.event.event === "poll-error") process.stderr.write(output)
        else process.stdout.write(output)
      }
      if (!stopping) await wait(cycle.waitMs)
    }
    process.stdout.write(`${JSON.stringify({ event: "stopped", workerId })}\n`)
  }
} finally {
  await worker.close()
}

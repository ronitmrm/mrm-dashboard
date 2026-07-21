import { hostname } from "node:os"

import { createDurableRefreshWorker } from "../durable-refresh-worker"

const postgresUrl =
  process.env.DATABASE_URL ?? "postgres://mrmpl:mrmpl@localhost:5434/mrmpl"
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380"
const workerId = process.env.REFRESH_WORKER_ID ?? `${hostname()}:${process.pid}`
const pollIntervalMs = Math.max(
  100,
  Number(process.env.REFRESH_WORKER_POLL_MS ?? 1_000)
)
const batchSize = Math.max(
  1,
  Number(process.env.REFRESH_WORKER_BATCH_SIZE ?? 10)
)
const once = process.argv.includes("--once")
const statusOnly = process.argv.includes("--status")

const worker = createDurableRefreshWorker({
  postgresUrl,
  redisUrl,
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
    while (!stopping) {
      const batch = await runBatch()
      if (
        batch.processed > 0 ||
        batch.retrying > 0 ||
        batch.failed > 0 ||
        batch.outbox.published > 0 ||
        batch.outbox.retrying > 0
      ) {
        process.stdout.write(
          `${JSON.stringify({ batch, event: "batch", workerId })}\n`
        )
      }
      if (!stopping) await wait(pollIntervalMs)
    }
    process.stdout.write(`${JSON.stringify({ event: "stopped", workerId })}\n`)
  }
} finally {
  await worker.close()
}

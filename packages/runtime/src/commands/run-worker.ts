import { hostname } from "node:os"
import { performance } from "node:perf_hooks"

import { createDurableRefreshWorker } from "../durable-refresh-worker"
import {
  readWorkerListenerPostgresEnvironment,
  readWorkerPostgresEnvironment,
} from "../managed-runtime"
import { createPostgresRefreshListener } from "../postgres-refresh-listener"
import { readRedisAccelerationEnvironment } from "../redis-acceleration"
import { createWorkerRuntimeMonitor } from "../worker-runtime-monitor"
import { advanceSweepDeadline, runSafetySweepCycle } from "../worker-loop"

function boundedMilliseconds(
  value: string | undefined,
  fallback: number,
  minimum: number
) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback
}

const postgres = readWorkerPostgresEnvironment()
const redis = readRedisAccelerationEnvironment(process.env, postgres.hosted)
const workerId = process.env.REFRESH_WORKER_ID ?? `${hostname()}:${process.pid}`
const sweepIntervalMs = boundedMilliseconds(
  process.env.REFRESH_WORKER_SWEEP_MS,
  30_000,
  1_000
)
const batchSize = Math.max(
  1,
  Number(process.env.REFRESH_WORKER_BATCH_SIZE ?? 10)
)
const maxRetryDelayMs = boundedMilliseconds(
  process.env.REFRESH_WORKER_MAX_RETRY_DELAY_MS,
  30_000,
  250
)
const once = process.argv.includes("--once")
const statusOnly = process.argv.includes("--status")

const worker = createDurableRefreshWorker({
  postgresPoolMax: postgres.max,
  postgresUrl: postgres.connectionString,
  ...redis,
  workerId,
})
const monitor = createWorkerRuntimeMonitor({ workerId })

let stopping = false
let listener: ReturnType<typeof createPostgresRefreshListener> | undefined
let cancelWait: (() => void) | undefined
const stop = () => {
  stopping = true
  cancelWait?.()
  const listenerState = listener?.snapshot().state
  if (listenerState === "connecting" || listenerState === "disconnected") {
    void listener?.stop().catch(() => undefined)
  }
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)

const wait = (durationMs: number) =>
  new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cancelWait = undefined
      resolve()
    }, durationMs)
    cancelWait = () => {
      clearTimeout(timeout)
      cancelWait = undefined
      resolve()
    }
  })

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

let activeBatch: ReturnType<typeof runBatch> | undefined
function reconcileBatch() {
  if (!activeBatch) {
    activeBatch = runBatch().finally(() => {
      activeBatch = undefined
    })
  }
  return activeBatch
}

try {
  if (statusOnly) {
    process.stdout.write(`${JSON.stringify(await worker.status())}\n`)
  } else if (once) {
    const batch = await runBatch()
    const status = await worker.status()
    process.stdout.write(`${JSON.stringify({ batch, status, workerId })}\n`)
  } else {
    const listenerPostgres = readWorkerListenerPostgresEnvironment()
    listener = createPostgresRefreshListener({
      connectionString: listenerPostgres.connectionString,
      onTransition: monitor.recordListenerTransition,
      reconcile: async () => {
        await reconcileBatch()
      },
    })
    const listenerReady = listener.start()
    void listenerReady.catch(() => undefined)
    process.stdout.write(`${JSON.stringify({ event: "started", workerId })}\n`)
    let consecutiveFailures = 0
    let nextSweepAtMs = performance.now() + sweepIntervalMs
    while (!stopping) {
      await wait(Math.max(0, nextSweepAtMs - performance.now()))
      if (stopping) break
      const cycle = await runSafetySweepCycle({
        consecutiveFailures,
        maxRetryDelayMs,
        probeWork: worker.probeWork,
        runBatch: reconcileBatch,
        workerId,
      })
      monitor.recordSweep({
        cycleOutcome: cycle.retryDelayMs ? "error" : "success",
        snapshot: cycle.probe?.snapshot ?? null,
      })
      consecutiveFailures = cycle.consecutiveFailures
      if (cycle.event) {
        const output = `${JSON.stringify(cycle.event)}\n`
        if (cycle.event.event === "sweep-error") process.stderr.write(output)
        else process.stdout.write(output)
      }
      const nowMs = performance.now()
      nextSweepAtMs = cycle.retryDelayMs
        ? nowMs + cycle.retryDelayMs
        : advanceSweepDeadline({
            intervalMs: sweepIntervalMs,
            nowMs,
            previousDeadlineMs: nextSweepAtMs,
          })
    }
    process.stdout.write(`${JSON.stringify({ event: "stopped", workerId })}\n`)
  }
} finally {
  await listener?.stop()
  monitor.stop()
  await worker.close()
}

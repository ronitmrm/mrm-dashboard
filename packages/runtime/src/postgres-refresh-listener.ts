import { Client, type Notification } from "pg"

import { runtimeErrorCategory } from "./managed-telemetry"

export const dashboardRefreshChannel = "mrm_dashboard_refresh"

export type RefreshListenerState =
  | "disconnected"
  | "connecting"
  | "listening"
  | "reconciling"
  | "ready"
  | "retrying"
  | "stopped"

export type RefreshListenerTransition = {
  disconnectCategory: ReturnType<typeof runtimeErrorCategory>
  reconciliationResult: "error" | "not-run" | "success"
  retryCount: number
  state: Exclude<RefreshListenerState, "disconnected">
}

export type RefreshReconciliationRequest = {
  general: boolean
  organizationIds: string[]
  reasons: Array<"notification" | "reconnect" | "startup">
}

export type RefreshListenerClient = {
  connect(): Promise<void>
  end(): Promise<void>
  off(event: string, listener: (...arguments_: unknown[]) => void): unknown
  on(event: string, listener: (...arguments_: unknown[]) => void): unknown
  query(text: string): Promise<unknown>
}

export type PostgresRefreshListenerOptions = {
  applicationName?: string
  connectionString: string
  createClient?: () => RefreshListenerClient
  initialReconnectDelayMs?: number
  maxReconnectDelayMs?: number
  onTransition?: (transition: RefreshListenerTransition) => void
  random?: () => number
  reconcile(request: RefreshReconciliationRequest): Promise<void>
}

const organizationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function notificationOrganizationId(notification: Notification) {
  const payload = notification.payload
  if (!payload || Buffer.byteLength(payload, "utf8") >= 1_024) return undefined
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>
    if (
      parsed.v !== 1 ||
      parsed.queueKey !== "dashboard" ||
      typeof parsed.organizationId !== "string" ||
      !organizationIdPattern.test(parsed.organizationId)
    ) {
      return undefined
    }
    return parsed.organizationId
  } catch {
    return undefined
  }
}

export function createPostgresRefreshListener({
  applicationName = "mrm-refresh-listener",
  connectionString,
  createClient = () =>
    new Client({
      application_name: applicationName,
      connectionString,
    }) as unknown as RefreshListenerClient,
  initialReconnectDelayMs = 250,
  maxReconnectDelayMs = 30_000,
  onTransition,
  random = Math.random,
  reconcile,
}: PostgresRefreshListenerOptions) {
  let activeReconciliation: Promise<void> | undefined
  let cancelReconnectDelay: (() => void) | undefined
  let currentClient: RefreshListenerClient | undefined
  let currentClientEnd: (() => Promise<void>) | undefined
  let currentSessionClose: (() => void) | undefined
  let pending = false
  let pendingGeneral = false
  let pendingOrganizationIds = new Set<string>()
  let pendingReasons = new Set<
    RefreshReconciliationRequest["reasons"][number]
  >()
  let runner: Promise<void> | undefined
  let session = 0
  let state: RefreshListenerState = "disconnected"
  let stopping = false
  const firstReady = deferred<void>()
  let firstReadySettled = false

  function transition(next: RefreshListenerTransition) {
    state = next.state
    try {
      onTransition?.(next)
    } catch {
      // Telemetry must not alter durable queue processing.
    }
  }

  function reconnectDelay(failures: number) {
    const exponential = Math.min(
      maxReconnectDelayMs,
      initialReconnectDelayMs * 2 ** Math.min(Math.max(0, failures - 1), 20)
    )
    return Math.round(exponential * (0.8 + random() * 0.4))
  }

  function waitForReconnect(durationMs: number) {
    if (durationMs <= 0) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        cancelReconnectDelay = undefined
        resolve()
      }, durationMs)
      cancelReconnectDelay = () => {
        clearTimeout(timeout)
        cancelReconnectDelay = undefined
        resolve()
      }
    })
  }

  function queueReconciliation(
    reason: RefreshReconciliationRequest["reasons"][number],
    organizationId?: string
  ) {
    if (stopping) return Promise.resolve()
    pending = true
    pendingReasons.add(reason)
    if (organizationId) pendingOrganizationIds.add(organizationId)
    else pendingGeneral = true

    if (!activeReconciliation) {
      activeReconciliation = (async () => {
        while (pending && !stopping) {
          const request: RefreshReconciliationRequest = {
            general: pendingGeneral,
            organizationIds: [...pendingOrganizationIds].sort(),
            reasons: [...pendingReasons].sort(),
          }
          pending = false
          pendingGeneral = false
          pendingOrganizationIds = new Set()
          pendingReasons = new Set()
          await reconcile(request)
        }
      })().finally(() => {
        activeReconciliation = undefined
      })
    }
    return activeReconciliation
  }

  async function run() {
    let failures = 0
    while (!stopping) {
      transition({
        disconnectCategory: null,
        reconciliationResult: "not-run",
        retryCount: failures,
        state: "connecting",
      })
      const client = createClient()
      currentClient = client
      const sessionClosed = deferred<void>()
      let ended = false
      let invalidated = false
      let registered = false
      let disconnectCategory: ReturnType<typeof runtimeErrorCategory> = null
      let reconciliationResult: RefreshListenerTransition["reconciliationResult"] =
        "not-run"
      const endClient = async () => {
        if (ended) return
        ended = true
        await client.end().catch(() => undefined)
      }
      const invalidate = () => {
        if (invalidated) return
        invalidated = true
        sessionClosed.resolve()
      }
      const onError = (error: unknown) => {
        disconnectCategory = runtimeErrorCategory(error) ?? "unknown"
        invalidate()
      }
      const onEnd = () => {
        disconnectCategory ??= "connectivity"
        invalidate()
      }
      const onNotification = (notification: Notification) => {
        if (notification.channel !== dashboardRefreshChannel || stopping) return
        const organizationId = notificationOrganizationId(notification)
        transition({
          disconnectCategory: null,
          reconciliationResult: "not-run",
          retryCount: 0,
          state: "reconciling",
        })
        void queueReconciliation("notification", organizationId)
          .then(() => {
            if (!invalidated && !stopping && currentClient === client) {
              transition({
                disconnectCategory: null,
                reconciliationResult: "success",
                retryCount: 0,
                state: "ready",
              })
              reconciliationResult = "not-run"
            }
          })
          .catch((error: unknown) => {
            disconnectCategory = runtimeErrorCategory(error) ?? "unknown"
            reconciliationResult = "error"
            invalidate()
          })
      }
      currentClientEnd = endClient
      currentSessionClose = invalidate
      client.on("error", onError as (...arguments_: unknown[]) => void)
      client.on("end", onEnd as (...arguments_: unknown[]) => void)
      client.on(
        "notification",
        onNotification as (...arguments_: unknown[]) => void
      )

      try {
        await client.connect()
        if (stopping) continue
        await client.query(`LISTEN ${dashboardRefreshChannel}`)
        registered = true
        session += 1
        transition({
          disconnectCategory: null,
          reconciliationResult: "not-run",
          retryCount: failures,
          state: "listening",
        })
        transition({
          disconnectCategory: null,
          reconciliationResult: "not-run",
          retryCount: failures,
          state: "reconciling",
        })
        await queueReconciliation(session === 1 ? "startup" : "reconnect")
        reconciliationResult = "success"
        if (stopping) continue
        transition({
          disconnectCategory: null,
          reconciliationResult,
          retryCount: failures,
          state: "ready",
        })
        failures = 0
        reconciliationResult = "not-run"
        if (!firstReadySettled) {
          firstReadySettled = true
          firstReady.resolve()
        }
        await sessionClosed.promise
      } catch (error) {
        disconnectCategory =
          runtimeErrorCategory(error) ?? disconnectCategory ?? "unknown"
        if (registered) reconciliationResult = "error"
        invalidate()
      } finally {
        client.off("error", onError as (...arguments_: unknown[]) => void)
        client.off("end", onEnd as (...arguments_: unknown[]) => void)
        client.off(
          "notification",
          onNotification as (...arguments_: unknown[]) => void
        )
        if (stopping && registered) {
          await client
            .query(`UNLISTEN ${dashboardRefreshChannel}`)
            .catch(() => undefined)
        }
        await endClient()
        if (currentClient === client) {
          currentClient = undefined
          currentClientEnd = undefined
          currentSessionClose = undefined
        }
      }

      if (!stopping) {
        failures += 1
        transition({
          disconnectCategory,
          reconciliationResult,
          retryCount: failures,
          state: "retrying",
        })
        await waitForReconnect(reconnectDelay(failures))
      }
    }
    transition({
      disconnectCategory: null,
      reconciliationResult: "not-run",
      retryCount: 0,
      state: "stopped",
    })
  }

  return {
    snapshot() {
      return { session, state }
    },

    start() {
      if (!runner) runner = run()
      return firstReady.promise
    },

    async stop() {
      if (stopping) {
        await runner
        return
      }
      stopping = true
      cancelReconnectDelay?.()
      await activeReconciliation?.catch(() => undefined)
      currentSessionClose?.()
      if (state === "connecting") {
        await currentClientEnd?.()
      }
      await runner
      if (!firstReadySettled) {
        firstReadySettled = true
        firstReady.reject(
          new Error("PostgreSQL refresh listener stopped before becoming ready")
        )
      }
      state = "stopped"
    },
  }
}

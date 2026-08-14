import { EventEmitter } from "node:events"

import type { Notification, QueryResult } from "pg"
import { describe, expect, it, vi } from "vitest"

import {
  createPostgresRefreshListener,
  type RefreshListenerClient,
  type RefreshReconciliationRequest,
} from "./postgres-refresh-listener"

class FakeClient extends EventEmitter implements RefreshListenerClient {
  connect = vi.fn(async (): Promise<void> => undefined)
  end = vi.fn(async (): Promise<void> => undefined)
  query = vi.fn(async (text: string) => {
    void text
    return { rows: [] } as unknown as QueryResult
  })
}

class BlockingClient extends FakeClient {
  private rejectConnect: ((reason?: unknown) => void) | undefined

  connect = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        void resolve
        this.rejectConnect = reject
      })
  )

  end = vi.fn(async () => {
    this.rejectConnect?.(new Error("connection cancelled"))
  })
}

async function eventually(assertion: () => void) {
  const deadline = Date.now() + 1_000
  let failure: unknown
  while (Date.now() < deadline) {
    try {
      assertion()
      return
    } catch (error) {
      failure = error
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
  }
  throw failure
}

describe("PostgreSQL refresh listener", () => {
  it("coalesces hints, reconnects once for error/end, and shuts down cleanly", async () => {
    const firstClient = new FakeClient()
    const secondClient = new FakeClient()
    const clients = [firstClient, secondClient]
    const gates: Array<() => void> = []
    const reconcile = vi.fn((request: RefreshReconciliationRequest) => {
      void request
      return new Promise<void>((resolve) => {
        gates.push(resolve)
      })
    })
    const onTransition = vi.fn()
    const listener = createPostgresRefreshListener({
      connectionString: "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test",
      createClient: () => clients.shift()!,
      initialReconnectDelayMs: 0,
      maxReconnectDelayMs: 0,
      onTransition,
      random: () => 0.5,
      reconcile,
    })

    const starting = listener.start()
    await eventually(() => expect(reconcile).toHaveBeenCalledTimes(1))
    firstClient.emit("notification", {
      channel: "mrm_dashboard_refresh",
      payload: JSON.stringify({
        organizationId: "00000000-0000-4000-8000-000000000001",
        queueKey: "dashboard",
        v: 1,
      }),
      processId: 1,
    } satisfies Notification)
    firstClient.emit("notification", {
      channel: "mrm_dashboard_refresh",
      payload: "malformed",
      processId: 1,
    } satisfies Notification)
    gates.shift()?.()
    await eventually(() => expect(reconcile).toHaveBeenCalledTimes(2))
    gates.shift()?.()
    await starting

    const first = listener.snapshot()
    expect(first).toMatchObject({ session: 1, state: "ready" })
    expect(reconcile.mock.calls[1]?.[0]).toEqual({
      general: true,
      organizationIds: ["00000000-0000-4000-8000-000000000001"],
      reasons: ["notification"],
    })

    firstClient.emit(
      "error",
      Object.assign(new Error("connection lost"), { code: "ETIMEDOUT" })
    )
    firstClient.emit("end")
    await eventually(() => expect(reconcile).toHaveBeenCalledTimes(3))
    gates.shift()?.()
    await eventually(() =>
      expect(listener.snapshot()).toMatchObject({ session: 2, state: "ready" })
    )
    expect(secondClient.query).toHaveBeenCalledTimes(1)
    expect(listener.snapshot()).toEqual({ session: 2, state: "ready" })
    expect(secondClient.query).toHaveBeenCalledTimes(1)

    await listener.stop()
    expect(firstClient.end).toHaveBeenCalledTimes(1)
    expect(secondClient.query.mock.calls.map(([query]) => query)).toEqual([
      "LISTEN mrm_dashboard_refresh",
      "UNLISTEN mrm_dashboard_refresh",
    ])
    expect(secondClient.end).toHaveBeenCalledTimes(1)
    expect(listener.snapshot()).toEqual({ session: 2, state: "stopped" })
    expect(onTransition).toHaveBeenCalledWith({
      disconnectCategory: "timeout",
      reconciliationResult: "not-run",
      retryCount: 1,
      state: "retrying",
    })
    expect(onTransition).toHaveBeenCalledWith({
      disconnectCategory: null,
      reconciliationResult: "success",
      retryCount: 1,
      state: "ready",
    })
  })

  it("cancels an in-flight connection without double-closing the client", async () => {
    const client = new BlockingClient()
    const listener = createPostgresRefreshListener({
      connectionString: "postgres://mrmpl:mrmpl@localhost:5434/mrmpl_test",
      createClient: () => client,
      reconcile: vi.fn(async () => undefined),
    })

    const starting = listener.start().catch((error: unknown) => error)
    await eventually(() =>
      expect(listener.snapshot()).toMatchObject({ state: "connecting" })
    )
    await listener.stop()

    await expect(starting).resolves.toEqual(
      new Error("PostgreSQL refresh listener stopped before becoming ready")
    )
    expect(client.end).toHaveBeenCalledTimes(1)
    expect(listener.snapshot()).toEqual({ session: 0, state: "stopped" })
  })
})

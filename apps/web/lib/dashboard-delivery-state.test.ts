import { describe, expect, it } from "vitest"

import {
  createDashboardDeliveryState,
  dashboardDeliveryPollDelay,
  dashboardDeliveryReducer,
  dashboardRequestDescriptor,
} from "./dashboard-delivery-state"

describe("dashboard delivery state", () => {
  it("moves an initial floor request to independent current delivery dimensions", () => {
    const initial = createDashboardDeliveryState<{ rows: string[] }>("cnc")
    const loading = dashboardDeliveryReducer(initial, {
      type: "request.started",
      requestId: 1,
      floor: "cnc",
    })
    const current = dashboardDeliveryReducer(loading, {
      type: "state.changed",
      requestId: 1,
      floor: "cnc",
      data: { rows: ["CNC-1"] },
      version: 7,
      coverage: "partial",
      refresh: "running",
      atMs: 1_000,
    })

    expect(current).toMatchObject({
      connection: "connecting",
      coverage: "partial",
      data: { rows: ["CNC-1"] },
      floor: "cnc",
      lastError: null,
      payload: "current",
      refresh: "running",
      request: "settled",
      version: 7,
      visibility: "visible",
    })
    expect(dashboardDeliveryPollDelay(current, 1_000)).toBe(1_000)
    expect(
      dashboardDeliveryReducer(current, { type: "refresh.poll-due" })
    ).toMatchObject({ refetchPending: true, request: "canonical-state" })
  })

  it("retains the exact payload for hints and unchanged responses without overlapping requests", () => {
    const data = { rows: ["CNC-1"] }
    const initial = createDashboardDeliveryState<typeof data>("cnc")
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(initial, {
        type: "request.started",
        requestId: 1,
        floor: "cnc",
      }),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "complete",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const hinted = dashboardDeliveryReducer(loaded, {
      type: "hint.received",
    })
    const refetching = dashboardDeliveryReducer(hinted, {
      type: "request.started",
      requestId: 2,
      floor: "cnc",
    })
    const overlapping = dashboardDeliveryReducer(refetching, {
      type: "request.started",
      requestId: 3,
      floor: "cnc",
    })
    const unchanged = dashboardDeliveryReducer(overlapping, {
      type: "state.not-modified",
      requestId: 2,
      floor: "cnc",
      version: 7,
      refresh: "pending",
      atMs: 2_000,
    })

    expect(hinted).toMatchObject({
      data,
      payload: "current",
      refetchPending: true,
      request: "canonical-state",
    })
    expect(dashboardRequestDescriptor(hinted, 2)).toEqual({
      floor: "cnc",
      knownVersion: 7,
      requestId: 2,
    })
    expect(overlapping).toBe(refetching)
    expect(unchanged).toMatchObject({
      data,
      inFlight: null,
      payload: "current",
      refresh: "pending",
      request: "settled",
      version: 7,
    })
    expect(unchanged.data).toBe(data)
  })

  it("keeps same-floor content stale through disconnect, reconnect, and refetch failure", () => {
    const data = { rows: ["CNC-1"] }
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(
        createDashboardDeliveryState<typeof data>("cnc"),
        {
          type: "request.started",
          requestId: 1,
          floor: "cnc",
        }
      ),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "complete",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const disconnected = dashboardDeliveryReducer(loaded, {
      type: "connection.lost",
    })
    const reconnected = dashboardDeliveryReducer(disconnected, {
      type: "connection.opened",
    })
    const refetching = dashboardDeliveryReducer(reconnected, {
      type: "request.started",
      requestId: 2,
      floor: "cnc",
    })
    const failed = dashboardDeliveryReducer(refetching, {
      type: "request.failed",
      requestId: 2,
      floor: "cnc",
      message: "Canonical dashboard unavailable",
      atMs: 3_000,
    })

    expect(disconnected).toMatchObject({
      connection: "retrying",
      data,
      payload: "stale",
    })
    expect(reconnected).toMatchObject({
      connection: "live",
      data,
      refetchPending: true,
      request: "canonical-state",
    })
    expect(failed).toMatchObject({
      data,
      inFlight: null,
      lastError: "Canonical dashboard unavailable",
      payload: "stale",
      request: "settled",
      safetyDeadlineMs: 63_000,
    })
  })

  it("keeps content visible through durable refresh progress and failure", () => {
    const data = { rows: ["CNC-1"] }
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(
        createDashboardDeliveryState<typeof data>("cnc"),
        {
          type: "request.started",
          requestId: 1,
          floor: "cnc",
        }
      ),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "complete",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const requested = dashboardDeliveryReducer(loaded, {
      type: "refresh.requested",
    })
    const running = dashboardDeliveryReducer(requested, {
      type: "refresh.running",
    })
    const failed = dashboardDeliveryReducer(running, {
      type: "refresh.failed",
      message: "Worker exhausted retries",
    })

    expect(requested).toMatchObject({
      data,
      payload: "current",
      refresh: "pending",
      request: "canonical-state",
    })
    expect(running).toMatchObject({ data, refresh: "running" })
    expect(failed).toMatchObject({
      data,
      lastError: "Worker exhausted retries",
      payload: "stale",
      refresh: "failed",
      request: "settled",
    })
  })

  it("clears floor-owned state and discards late responses from the prior floor", () => {
    const data = { rows: ["CNC-1"] }
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(
        createDashboardDeliveryState<typeof data>("cnc"),
        {
          type: "request.started",
          requestId: 1,
          floor: "cnc",
        }
      ),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "partial",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const refetching = dashboardDeliveryReducer(
      dashboardDeliveryReducer(loaded, { type: "hint.received" }),
      { type: "request.started", requestId: 2, floor: "cnc" }
    )
    const switched = dashboardDeliveryReducer(refetching, {
      type: "floor.changed",
      floor: "forging",
    })
    const late = dashboardDeliveryReducer(switched, {
      type: "state.changed",
      requestId: 2,
      floor: "cnc",
      data: { rows: ["LATE-CNC"] },
      version: 8,
      coverage: "complete",
      refresh: "idle",
      atMs: 2_000,
    })

    expect(switched).toMatchObject({
      coverage: "complete",
      data: null,
      floor: "forging",
      inFlight: null,
      lastError: null,
      payload: "none",
      refresh: "idle",
      request: "initial",
      version: null,
    })
    expect(late).toBe(switched)
  })

  it("rejects a regressive same-floor version and requires a full canonical refetch", () => {
    const data = { rows: ["CNC-1"] }
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(
        createDashboardDeliveryState<typeof data>("cnc"),
        {
          type: "request.started",
          requestId: 1,
          floor: "cnc",
        }
      ),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "complete",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const refetching = dashboardDeliveryReducer(
      dashboardDeliveryReducer(loaded, { type: "hint.received" }),
      { type: "request.started", requestId: 2, floor: "cnc" }
    )
    const regressive = dashboardDeliveryReducer(refetching, {
      type: "state.changed",
      requestId: 2,
      floor: "cnc",
      data: { rows: ["OLD-CNC"] },
      version: 6,
      coverage: "complete",
      refresh: "idle",
      atMs: 2_000,
    })

    expect(regressive).toMatchObject({
      data,
      inFlight: null,
      payload: "stale",
      refetchPending: true,
      request: "canonical-state",
      suppressKnownVersion: true,
      version: 7,
    })
  })

  it("pauses timers while hidden and refetches immediately when visible and overdue", () => {
    const data = { rows: ["CNC-1"] }
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(
        createDashboardDeliveryState<typeof data>("cnc"),
        {
          type: "request.started",
          requestId: 1,
          floor: "cnc",
        }
      ),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "complete",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const hidden = dashboardDeliveryReducer(loaded, {
      type: "visibility.changed",
      visibility: "hidden",
      atMs: 30_000,
    })
    const hiddenDue = dashboardDeliveryReducer(hidden, {
      type: "safety.due",
      atMs: 61_000,
    })
    const visible = dashboardDeliveryReducer(hiddenDue, {
      type: "visibility.changed",
      visibility: "visible",
      atMs: 62_000,
    })

    expect(dashboardDeliveryPollDelay(loaded, 1_000)).toBe(60_000)
    expect(dashboardDeliveryPollDelay(hidden, 30_000)).toBeNull()
    expect(hiddenDue).toBe(hidden)
    expect(visible).toMatchObject({
      data,
      refetchPending: true,
      request: "canonical-state",
      visibility: "visible",
    })
    expect(dashboardDeliveryPollDelay(visible, 62_000)).toBe(0)
  })

  it("exposes retry for a blocking initial error without inventing a known version", () => {
    const loading = dashboardDeliveryReducer(
      createDashboardDeliveryState<{ rows: string[] }>("forging"),
      { type: "request.started", requestId: 1, floor: "forging" }
    )
    const failed = dashboardDeliveryReducer(loading, {
      type: "request.failed",
      requestId: 1,
      floor: "forging",
      message: "Dashboard data could not be loaded",
      atMs: 1_000,
    })
    const retrying = dashboardDeliveryReducer(failed, {
      type: "retry.requested",
    })

    expect(failed).toMatchObject({
      data: null,
      lastError: "Dashboard data could not be loaded",
      payload: "none",
      request: "error",
    })
    expect(retrying).toMatchObject({ lastError: null, request: "initial" })
    expect(dashboardRequestDescriptor(retrying, 2)).toEqual({
      floor: "forging",
      knownVersion: null,
      requestId: 2,
    })
  })

  it("retries an invalid unchanged response without the retained known version", () => {
    const data = { rows: ["CNC-1"] }
    const loaded = dashboardDeliveryReducer(
      dashboardDeliveryReducer(
        createDashboardDeliveryState<typeof data>("cnc"),
        {
          type: "request.started",
          requestId: 1,
          floor: "cnc",
        }
      ),
      {
        type: "state.changed",
        requestId: 1,
        floor: "cnc",
        data,
        version: 7,
        coverage: "complete",
        refresh: "idle",
        atMs: 1_000,
      }
    )
    const refetching = dashboardDeliveryReducer(
      dashboardDeliveryReducer(loaded, { type: "hint.received" }),
      { type: "request.started", requestId: 2, floor: "cnc" }
    )
    const invalid = dashboardDeliveryReducer(refetching, {
      type: "state.not-modified",
      requestId: 2,
      floor: "cnc",
      version: 8,
      refresh: "idle",
      atMs: 2_000,
    })

    expect(invalid).toMatchObject({
      data,
      payload: "stale",
      request: "canonical-state",
      suppressKnownVersion: true,
      version: 7,
    })
    expect(dashboardRequestDescriptor(invalid, 3)).toEqual({
      floor: "cnc",
      knownVersion: null,
      requestId: 3,
    })
  })
})

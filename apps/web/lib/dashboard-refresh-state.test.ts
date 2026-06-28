import { describe, expect, it } from "vitest";

import {
  beginDashboardRefreshRun,
  dashboardRefreshStatus,
  finishDashboardRefreshRun,
  requestDashboardRefresh,
} from "./dashboard-refresh-state";

describe("dashboard refresh state", () => {
  it("coalesces repeated planning refresh requests into one scheduled run", () => {
    const first = requestDashboardRefresh(null, 100);
    expect(first.shouldSchedule).toBe(true);
    expect(first.state.status).toBe("queued");
    expect(first.state.requestedAtMs).toBe(100);

    const second = requestDashboardRefresh(first.state, 200);
    expect(second.shouldSchedule).toBe(false);
    expect(second.state.status).toBe("queued");
    expect(second.state.requestedAtMs).toBe(200);
  });

  it("queues one follow-up run when data changes during a refresh", () => {
    const queued = requestDashboardRefresh(null, 100).state;
    const started = beginDashboardRefreshRun(queued, 150);
    expect(started.shouldRun).toBe(true);

    const changedDuringRun = requestDashboardRefresh(started.state!, 200);
    expect(changedDuringRun.shouldSchedule).toBe(false);
    expect(changedDuringRun.state.status).toBe("running");

    const finished = finishDashboardRefreshRun(changedDuringRun.state, started.runRequestedAtMs!, 300, null);
    expect(finished.shouldSchedule).toBe(true);
    expect(finished.state.status).toBe("queued");
    expect(finished.state.requestedAtMs).toBe(200);
  });

  it("returns to idle when a run covers the latest requested data", () => {
    const queued = requestDashboardRefresh(null, 100).state;
    const started = beginDashboardRefreshRun(queued, 150);
    const finished = finishDashboardRefreshRun(started.state!, started.runRequestedAtMs!, 300, null);

    expect(finished.shouldSchedule).toBe(false);
    expect(finished.state.status).toBe("idle");
    expect(finished.state.completedAtMs).toBe(300);
    expect(finished.state.lastError).toBeUndefined();
  });

  it("summarizes refresh state for public status responses", () => {
    expect(dashboardRefreshStatus(null)).toEqual({
      status: "idle",
      isRefreshing: false,
    });

    expect(dashboardRefreshStatus({
      status: "queued",
      requestedAtMs: 100,
      scheduledAtMs: 100,
    })).toEqual({
      status: "queued",
      isRefreshing: true,
      requestedAtMs: 100,
      scheduledAtMs: 100,
    });

    expect(dashboardRefreshStatus({
      status: "failed",
      requestedAtMs: 100,
      completedAtMs: 200,
      lastError: "Planning refresh failed.",
    })).toEqual({
      status: "failed",
      isRefreshing: false,
      requestedAtMs: 100,
      completedAtMs: 200,
      lastError: "Planning refresh failed.",
    });
  });
});

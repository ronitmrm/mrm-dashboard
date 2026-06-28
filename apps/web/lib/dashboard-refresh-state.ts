export type DashboardRefreshStatus = "idle" | "queued" | "running" | "failed";

export type DashboardRefreshState = {
  status: DashboardRefreshStatus;
  requestedAtMs: number;
  scheduledAtMs?: number;
  startedAtMs?: number;
  runRequestedAtMs?: number;
  completedAtMs?: number;
  lastError?: string;
};

export type DashboardRefreshStatusSummary = {
  status: DashboardRefreshStatus;
  isRefreshing: boolean;
  requestedAtMs?: number;
  scheduledAtMs?: number;
  startedAtMs?: number;
  completedAtMs?: number;
  lastError?: string;
};

export function dashboardRefreshStatus(current: DashboardRefreshState | null): DashboardRefreshStatusSummary {
  if (!current) {
    return {
      status: "idle",
      isRefreshing: false,
    };
  }

  return {
    status: current.status,
    isRefreshing: current.status === "queued" || current.status === "running",
    requestedAtMs: current.requestedAtMs,
    scheduledAtMs: current.scheduledAtMs,
    startedAtMs: current.startedAtMs,
    completedAtMs: current.completedAtMs,
    lastError: current.lastError,
  };
}

export function requestDashboardRefresh(
  current: DashboardRefreshState | null,
  requestedAtMs: number,
) {
  if (!current || current.status === "idle" || current.status === "failed") {
    return {
      shouldSchedule: true,
      state: {
        status: "queued" as const,
        requestedAtMs,
        scheduledAtMs: requestedAtMs,
      },
    };
  }

  return {
    shouldSchedule: false,
    state: {
      ...current,
      requestedAtMs,
      lastError: undefined,
    },
  };
}

export function beginDashboardRefreshRun(
  current: DashboardRefreshState | null,
  startedAtMs: number,
) {
  if (!current || current.status !== "queued") {
    return {
      shouldRun: false,
      state: current,
      runRequestedAtMs: undefined,
    };
  }

  return {
    shouldRun: true,
    runRequestedAtMs: current.requestedAtMs,
    state: {
      ...current,
      status: "running" as const,
      startedAtMs,
      runRequestedAtMs: current.requestedAtMs,
    },
  };
}

export function finishDashboardRefreshRun(
  current: DashboardRefreshState,
  runRequestedAtMs: number,
  completedAtMs: number,
  error: string | null,
) {
  const dataChangedDuringRun = current.requestedAtMs > runRequestedAtMs;
  if (dataChangedDuringRun) {
    return {
      shouldSchedule: true,
      state: {
        ...current,
        status: "queued" as const,
        scheduledAtMs: completedAtMs,
        completedAtMs,
        lastError: error ?? undefined,
      },
    };
  }

  return {
    shouldSchedule: false,
    state: {
      ...current,
      status: error ? ("failed" as const) : ("idle" as const),
      completedAtMs,
      lastError: error ?? undefined,
    },
  };
}

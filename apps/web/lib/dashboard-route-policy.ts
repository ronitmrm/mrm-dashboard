export const maxDashboardRequestBytes = 10 * 1024 * 1024

export class DashboardRequestPolicyError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export function enforceDashboardRequestSize(contentLength: string | null) {
  if (contentLength === null) return
  const bytes = Number(contentLength)
  if (Number.isFinite(bytes) && bytes > maxDashboardRequestBytes) {
    throw new DashboardRequestPolicyError(413, "Request body is too large")
  }
}

export function dashboardErrorResponse(error: unknown, status: number) {
  return {
    error:
      status >= 400 && status < 500 && error instanceof Error
        ? error.message
        : "Request failed",
    status,
  }
}

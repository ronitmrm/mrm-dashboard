export const maxDashboardRequestBytes = 10 * 1024 * 1024
export const maxDashboardProxyRequestBytes = 11 * 1024 * 1024

const dataMutationCapabilities = [
  "hr.employees.write",
  "maintenance.definitions.manage",
  "maintenance.schedules.manage",
  "maintenance.tasks.write",
  "operations.attendance.write",
  "operations.production.write",
  "operations.shop_floor.write",
  "operations.training.write",
  "quality.first_piece.write",
  "quality.hourly.write",
  "quality.parameters.manage",
  "quality.setup_checklist.write",
] as const

const mutationCapabilitiesByPath: Record<string, readonly string[]> = {
  attendance: ["operations.attendance.write"],
  "data-entry": dataMutationCapabilities,
  "data-import": dataMutationCapabilities,
  "dispatch-approval": ["operations.dispatch.write"],
  "job-card-delivery-target": ["planning.override.write"],
  "machine-constraint": ["planning.constraint.write"],
  "mark-complete": ["operations.shop_floor.write"],
  "plan-override": ["planning.override.write"],
  "planner-priority": ["planning.priority.write"],
  reschedule: ["planning.override.write"],
  "reverse-entry": ["operations.corrections.write"],
  "route-change": ["planning.route_change.write"],
  "route-selection": ["operations.route_selection.write"],
  training: ["operations.training.write"],
}

export function dashboardMutationCapabilities(path: string) {
  return mutationCapabilitiesByPath[path]
}

export class DashboardRequestPolicyError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export function requiredDashboardText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) {
    throw new DashboardRequestPolicyError(400, `${label} is required.`)
  }
  return text
}

export function enforceDashboardRequestSize(
  contentLength: string | null,
  maxBytes = maxDashboardRequestBytes
) {
  if (contentLength === null) return
  const bytes = Number(contentLength)
  if (Number.isFinite(bytes) && bytes > maxBytes) {
    throw new DashboardRequestPolicyError(413, "Request body is too large")
  }
}

export async function readDashboardJsonBody(
  request: Pick<Request, "body" | "headers">,
  maxBytes = maxDashboardRequestBytes
) {
  enforceDashboardRequestSize(request.headers.get("content-length"), maxBytes)
  if (!request.body) return {}

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      throw new DashboardRequestPolicyError(413, "Request body is too large")
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return {}
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

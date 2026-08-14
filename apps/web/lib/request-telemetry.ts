import { randomUUID } from "node:crypto"

const requestIds = new WeakMap<Request, string>()

export function telemetryRequestId(request: Request) {
  const existing = requestIds.get(request)
  if (existing) return existing
  const requestId = randomUUID()
  requestIds.set(request, requestId)
  return requestId
}

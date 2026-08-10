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

export async function readDashboardJsonBody(
  request: Pick<Request, "body" | "headers">,
  maxBytes = maxDashboardRequestBytes
) {
  const contentLength = request.headers.get("content-length")
  if (contentLength !== null) {
    const declaredBytes = Number(contentLength)
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new DashboardRequestPolicyError(413, "Request body is too large")
    }
  }
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

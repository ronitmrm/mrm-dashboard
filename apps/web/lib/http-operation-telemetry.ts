import {
  recordHttpBytes,
  withPerformanceOperation,
  type TelemetryRuntime,
  type TelemetrySink,
} from "@workspace/observability"

import { telemetryRequestId } from "./request-telemetry"

async function bodyByteLength(message: Request | Response) {
  try {
    const contentLengthHeader = message.headers.get("content-length")
    if (contentLengthHeader !== null) {
      const contentLength = Number(contentLengthHeader)
      if (Number.isSafeInteger(contentLength) && contentLength >= 0) {
        return contentLength
      }
    }
    return (await message.clone().arrayBuffer()).byteLength
  } catch {
    return 0
  }
}

export async function withHttpPerformanceOperation(
  {
    operation,
    request,
    runtime,
    sink,
    subsystem,
  }: {
    operation: string
    request: Request
    runtime?: TelemetryRuntime
    sink?: TelemetrySink
    subsystem: string
  },
  execute: () => Promise<Response>
) {
  const requestBytes = await bodyByteLength(request)
  return withPerformanceOperation(
    {
      operation,
      requestId: telemetryRequestId(request),
      runtime,
      sink,
      subsystem,
    },
    async () => {
      recordHttpBytes({ requestBytes, responseBytes: 0 })
      const response = await execute()
      recordHttpBytes({
        requestBytes: 0,
        responseBytes: await bodyByteLength(response),
      })
      return response
    }
  )
}

import { subscribeRedisInvalidations } from "@workspace/runtime"
import type { NextRequest } from "next/server"

import { readAuthEnvironment } from "@/lib/auth/auth"
import {
  authorizePostgresDashboardEvents,
  DashboardReadError,
} from "@/lib/postgres-dashboard-read-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const encoder = new TextEncoder()

export async function GET(request: NextRequest) {
  let organizationId: string
  try {
    organizationId = (await authorizePostgresDashboardEvents(request))
      .organizationId
  } catch (error) {
    if (error instanceof DashboardReadError) {
      return Response.json({ error: error.message }, { status: error.status })
    }
    throw error
  }

  const redisUrl = readAuthEnvironment().redisUrl
  let cleanup: () => Promise<void> = async () => undefined
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: string) => {
        if (!closed) controller.enqueue(encoder.encode(value))
      }
      send("retry: 3000\n\n")
      const heartbeat = setInterval(() => send(": heartbeat\n\n"), 20_000)
      let unsubscribe: () => Promise<void> = async () => undefined
      cleanup = async () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        await unsubscribe()
        try {
          controller.close()
        } catch {
          // The consumer may already have cancelled the stream.
        }
      }
      request.signal.addEventListener("abort", () => void cleanup(), {
        once: true,
      })

      if (redisUrl) {
        unsubscribe = await subscribeRedisInvalidations(
          redisUrl,
          (invalidation) => {
            if (
              invalidation.organizationId !== organizationId ||
              invalidation.topic !== "dashboard.read_model.updated"
            ) {
              return
            }
            send(
              `event: dashboard-version\ndata: ${JSON.stringify({
                version: invalidation.version,
              })}\n\n`
            )
          }
        )
        if (closed) await unsubscribe()
      }
    },
    async cancel() {
      await cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  })
}

import { createClient } from "redis"

import type { Invalidation } from "./redis-acceleration"

const invalidationChannel = "mrm:invalidations"

type Listener = (invalidation: Invalidation) => void
type Hub = {
  client: ReturnType<typeof createClient>
  listeners: Set<Listener>
  ready: Promise<void>
}

const hubs = new Map<string, Hub>()

function parsedInvalidation(payload: string): Invalidation | undefined {
  try {
    const value = JSON.parse(payload) as Partial<Invalidation>
    if (typeof value.topic !== "string") return undefined
    return value as Invalidation
  } catch {
    return undefined
  }
}

function createHub(redisUrl: string) {
  const listeners = new Set<Listener>()
  const client = createClient({
    socket: { connectTimeout: 500, reconnectStrategy: false },
    url: redisUrl,
  })
  client.on("error", () => undefined)
  const hub: Hub = {
    client,
    listeners,
    ready: Promise.resolve(),
  }
  hub.ready = client.connect().then(async () => {
    await client.subscribe(invalidationChannel, (payload) => {
      const invalidation = parsedInvalidation(payload)
      if (!invalidation) return
      for (const listener of [...listeners]) listener(invalidation)
    })
  })
  hubs.set(redisUrl, hub)
  return hub
}

export async function subscribeRedisInvalidations(
  redisUrl: string,
  listener: Listener
) {
  const hub = hubs.get(redisUrl) ?? createHub(redisUrl)
  try {
    await hub.ready
  } catch {
    if (hubs.get(redisUrl) === hub) hubs.delete(redisUrl)
    await hub.client.close().catch(() => undefined)
    return async () => undefined
  }
  hub.listeners.add(listener)
  let subscribed = true

  return async () => {
    if (!subscribed) return
    subscribed = false
    hub.listeners.delete(listener)
    if (hub.listeners.size > 0 || hubs.get(redisUrl) !== hub) return
    hubs.delete(redisUrl)
    await hub.client.unsubscribe(invalidationChannel).catch(() => undefined)
    await hub.client.close().catch(() => undefined)
  }
}

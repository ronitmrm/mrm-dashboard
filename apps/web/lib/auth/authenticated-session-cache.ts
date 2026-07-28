import { createHash } from "node:crypto"

import { getAuth } from "./auth"

type AuthenticatedSessionCacheOptions<Input, Session> = {
  key?: (input: Input) => string
  load: (input: Input) => Promise<Session>
  now?: () => number
  ttlMs?: number
}

type SessionEntry<Session> = {
  expiresAt: number
  session: Promise<Session>
  token: symbol
}

export function createAuthenticatedSessionCache<Input, Session>({
  key = (input) => String(input),
  load,
  now = Date.now,
  ttlMs = 60_000,
}: AuthenticatedSessionCacheOptions<Input, Session>) {
  const entries = new Map<string, SessionEntry<Session>>()

  function get(input: Input) {
    const cacheKey = key(input)
    const current = entries.get(cacheKey)
    if (current && current.expiresAt > now()) return current.session

    const token = Symbol(cacheKey)
    const session = load(input).catch((error) => {
      if (entries.get(cacheKey)?.token === token) entries.delete(cacheKey)
      throw error
    })
    entries.set(cacheKey, {
      expiresAt: now() + ttlMs,
      session,
      token,
    })
    return session
  }

  return { get }
}

const authenticatedSessions = createAuthenticatedSessionCache({
  key(requestHeaders: Headers) {
    return createHash("sha256")
      .update(requestHeaders.get("cookie") ?? "")
      .digest("base64url")
  },
  load(requestHeaders: Headers) {
    return getAuth().api.getSession({ headers: requestHeaders })
  },
})

export function getCachedAuthenticatedSession(requestHeaders: Headers) {
  return authenticatedSessions.get(requestHeaders)
}

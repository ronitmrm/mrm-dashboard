type AuthorizationGrantCacheOptions = {
  load: (userId: string) => Promise<readonly string[]>
  now?: () => number
  ttlMs?: number
}

type CacheEntry = {
  expiresAt: number
  grants: Promise<ReadonlySet<string>>
  token: symbol
}

export function createAuthorizationGrantCache({
  load,
  now = Date.now,
  ttlMs = 60_000,
}: AuthorizationGrantCacheOptions) {
  const entries = new Map<string, CacheEntry>()

  function get(userId: string) {
    const current = entries.get(userId)
    if (current && current.expiresAt > now()) {
      return current.grants
    }

    const token = Symbol(userId)
    const grants = load(userId)
      .then((capabilities) => new Set(capabilities))
      .catch((error) => {
        if (entries.get(userId)?.token === token) entries.delete(userId)
        throw error
      })
    const entry = {
      expiresAt: now() + ttlMs,
      grants,
      token,
    }
    entries.set(userId, entry)
    return grants
  }

  return {
    get,
    invalidate(userId: string) {
      entries.delete(userId)
    },
  }
}

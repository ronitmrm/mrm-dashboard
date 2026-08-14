type ProcessingListener = () => void

const listeners = new Set<ProcessingListener>()
let activeRequests = 0

export function beginSoftwareProcessing() {
  activeRequests += 1
  emitProcessingChange()
  let finished = false
  return () => {
    if (finished) return
    finished = true
    activeRequests = Math.max(0, activeRequests - 1)
    emitProcessingChange()
  }
}

export function createSoftwareProcessingFetch(originalFetch: typeof fetch): typeof fetch {
  return async (...args) => {
    if (!isMutatingSoftwareRequest(args[0], args[1])) {
      return originalFetch(...args)
    }
    const finish = beginSoftwareProcessing()
    try {
      return await originalFetch(...args)
    } finally {
      finish()
    }
  }
}

export function isMutatingSoftwareRequest(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase()
  return !["GET", "HEAD", "OPTIONS"].includes(method)
}

export function softwareProcessingSnapshot() {
  return activeRequests > 0
}

export function subscribeToSoftwareProcessing(listener: ProcessingListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emitProcessingChange() {
  for (const listener of listeners) listener()
}

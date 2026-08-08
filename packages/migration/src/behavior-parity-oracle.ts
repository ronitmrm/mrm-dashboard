import { createHash } from "node:crypto"

export type BehaviorSnapshot =
  | null
  | boolean
  | number
  | string
  | readonly BehaviorSnapshot[]
  | { readonly [key: string]: BehaviorSnapshot }

export type BehaviorFingerprintVersion = "v1"

export type BehaviorFingerprint = {
  version: BehaviorFingerprintVersion
  digest: string
  normalized: BehaviorSnapshot
}

export type BehaviorCapture = {
  version: BehaviorFingerprintVersion
  observable: BehaviorSnapshot
  volatile?: {
    generatedIdentifiers?: BehaviorSnapshot
    timestamps?: BehaviorSnapshot
    providerPlanCosts?: BehaviorSnapshot
    performanceMetadata?: BehaviorSnapshot
  }
}

function isRecord(value: BehaviorSnapshot): value is {
  readonly [key: string]: BehaviorSnapshot
} {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalize(value: BehaviorSnapshot): BehaviorSnapshot {
  if (Array.isArray(value)) {
    return value.map(normalize)
  }
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, normalize(entry)])
  )
}

export function normalizeBehaviorSnapshot(
  capture: BehaviorCapture
): BehaviorSnapshot {
  return normalize({ version: capture.version, observable: capture.observable })
}

export function createBehaviorFingerprint(
  capture: BehaviorCapture
): BehaviorFingerprint {
  const normalized = normalizeBehaviorSnapshot(capture)
  if (!isRecord(normalized) || normalized.version !== "v1") {
    throw new Error("A behavior-parity snapshot must use version v1")
  }
  return {
    version: normalized.version,
    digest: createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex"),
    normalized,
  }
}

import { randomUUID } from "node:crypto"

import { createAuthorizationRepository } from "@workspace/db"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { cache } from "react"

import { getWebPostgresPool } from "../postgres-runtime"
import {
  getOrCreateAuthorizationRequestTelemetry,
  type AuthorizationTelemetryHandle,
} from "./authorization-request-telemetry"
import { getAuth } from "./auth"
import { safeReturnPath } from "./navigation"

const readAuthorizationRequestTelemetry = cache(() => {
  return getOrCreateAuthorizationRequestTelemetry(
    { requestId: randomUUID() },
    after
  )
})

const readAuthenticatedSession = cache(async () => {
  const { telemetry } = readAuthorizationRequestTelemetry()
  telemetry.setOutcome("error")
  telemetry.recordSessionRead()
  return getAuth().api.getSession({ headers: await headers() })
})

const readGrantedCapabilitySet = cache(async (userId: string) => {
  const { telemetry } = readAuthorizationRequestTelemetry()
  telemetry.setOutcome("error")
  telemetry.recordGrantRead()
  const authorization = createAuthorizationRepository({
    pool: getWebPostgresPool(),
  })
  const capabilities = await authorization.listAllGrantedCapabilities(userId)
  return new Set(capabilities)
})

export async function requireCapability(
  capability: string,
  returnPath: string
) {
  const authorizationTelemetry = readAuthorizationRequestTelemetry()
  const { telemetry } = authorizationTelemetry
  try {
    const session = await authenticatedSession(returnPath, telemetry)
    const granted = await readGrantedCapabilitySet(session.user.id)
    if (!granted.has(capability)) {
      telemetry.setOutcome("unauthorized")
      redirect("/unauthorized")
    }

    telemetry.setOutcome("allowed")
    return session
  } finally {
    authorizationTelemetry.finish()
  }
}

async function authenticatedSession(
  returnPath: string,
  telemetry: AuthorizationTelemetryHandle["telemetry"]
) {
  const session = await readAuthenticatedSession()

  if (!session) {
    telemetry.setOutcome("unauthenticated")
    const next = encodeURIComponent(safeReturnPath(returnPath))
    redirect(`/sign-in?next=${next}`)
  }

  telemetry.setOutcome("allowed")
  return session
}

export async function requireAuthenticatedSession(returnPath: string) {
  const authorizationTelemetry = readAuthorizationRequestTelemetry()
  try {
    return await authenticatedSession(
      returnPath,
      authorizationTelemetry.telemetry
    )
  } finally {
    authorizationTelemetry.finish()
  }
}

export async function listGrantedCapabilities(
  userId: string,
  capabilities: readonly string[]
) {
  const authorizationTelemetry = readAuthorizationRequestTelemetry()
  const { telemetry } = authorizationTelemetry
  try {
    const granted = await readGrantedCapabilitySet(userId)
    telemetry.setOutcome("allowed")
    return capabilities.filter((capability) => granted.has(capability))
  } finally {
    authorizationTelemetry.finish()
  }
}

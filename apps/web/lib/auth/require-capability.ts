import { createAuthorizationRepository } from "@workspace/db"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { getWebPostgresPool } from "../postgres-runtime"
import { getAuth } from "./auth"
import { safeReturnPath } from "./navigation"

const readAuthenticatedSession = cache(async () =>
  getAuth().api.getSession({ headers: await headers() })
)

const readGrantedCapabilitySet = cache(async (userId: string) => {
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
  const session = await requireAuthenticatedSession(returnPath)
  const granted = await readGrantedCapabilitySet(session.user.id)
  if (!granted.has(capability)) {
    redirect("/unauthorized")
  }

  return session
}

export async function requireAuthenticatedSession(returnPath: string) {
  const session = await readAuthenticatedSession()

  if (!session) {
    const next = encodeURIComponent(safeReturnPath(returnPath))
    redirect(`/sign-in?next=${next}`)
  }

  return session
}

export async function listGrantedCapabilities(
  userId: string,
  capabilities: readonly string[]
) {
  const granted = await readGrantedCapabilitySet(userId)
  return capabilities.filter((capability) => granted.has(capability))
}

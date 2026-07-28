import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { getCachedAuthenticatedSession } from "./authenticated-session-cache"
import { getAuthorizationGrants } from "./authorization-grants"
import { safeReturnPath } from "./navigation"

const getAuthenticatedSession = cache(async () =>
  getCachedAuthenticatedSession(await headers())
)

export async function requireCapability(
  capability: string,
  returnPath: string
) {
  const session = await requireAuthenticatedSession(returnPath)
  const grantedCapabilities = await getAuthorizationGrants(session.user.id)
  if (!grantedCapabilities.has(capability)) {
    redirect("/unauthorized")
  }

  return session
}

export async function requireAuthenticatedSession(returnPath: string) {
  const session = await getAuthenticatedSession()

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
  const grantedCapabilities = await getAuthorizationGrants(userId)
  return capabilities.filter((capability) =>
    grantedCapabilities.has(capability)
  )
}

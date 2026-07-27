import { createAuthorizationRepository } from "@workspace/db"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

import { getAuth, readAuthEnvironment } from "./auth"
import { safeReturnPath } from "./navigation"

const getAuthenticatedSession = cache(async () =>
  getAuth().api.getSession({
    headers: await headers(),
  })
)

export async function requireCapability(
  capability: string,
  returnPath: string
) {
  const session = await requireAuthenticatedSession(returnPath)

  const authorization = createAuthorizationRepository({
    connectionString: readAuthEnvironment().connectionString,
  })

  try {
    const allowed = await authorization.hasCapability(
      session.user.id,
      capability
    )
    if (!allowed) {
      redirect("/unauthorized")
    }
  } finally {
    await authorization.close()
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
  const authorization = createAuthorizationRepository({
    connectionString: readAuthEnvironment().connectionString,
  })

  try {
    return await authorization.listGrantedCapabilities(userId, capabilities)
  } finally {
    await authorization.close()
  }
}

import { createAuthorizationRepository } from "@workspace/db"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getAuth, readAuthEnvironment } from "./auth"
import { safeReturnPath } from "./navigation"

export async function requireCapability(
  capability: string,
  returnPath: string
) {
  const session = await getAuth().api.getSession({
    headers: await headers(),
  })

  if (!session) {
    const next = encodeURIComponent(safeReturnPath(returnPath))
    redirect(`/sign-in?next=${next}`)
  }

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

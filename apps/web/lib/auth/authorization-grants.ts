import { createAuthorizationRepository } from "@workspace/db"

import { readAuthEnvironment } from "./auth"
import { createAuthorizationGrantCache } from "./authorization-grant-cache"

const authorizationGrants = createAuthorizationGrantCache({
  async load(userId) {
    const authorization = createAuthorizationRepository({
      connectionString: readAuthEnvironment().connectionString,
    })

    try {
      return await authorization.listAllGrantedCapabilities(userId)
    } finally {
      await authorization.close()
    }
  },
})

export function getAuthorizationGrants(userId: string) {
  return authorizationGrants.get(userId)
}

export function invalidateAuthorizationGrants(userId: string) {
  authorizationGrants.invalidate(userId)
}

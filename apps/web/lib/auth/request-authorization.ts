import { createAuthorizationRepository } from "@workspace/db"

import { getWebPostgresPool } from "../postgres-runtime"
import {
  memoizeAuthorizationRequestRead,
  type AuthorizationTelemetryHandle,
} from "./authorization-request-telemetry"
import { getAuth } from "./auth"

export function readRequestAuthenticatedSession(
  requestHeaders: Headers,
  telemetry: AuthorizationTelemetryHandle["telemetry"]
) {
  return memoizeAuthorizationRequestRead("session", async () => {
    telemetry.setOutcome("error")
    telemetry.recordSessionRead()
    return getAuth().api.getSession({ headers: requestHeaders })
  })
}

export function readRequestGrantedCapabilitySet(
  userId: string,
  telemetry: AuthorizationTelemetryHandle["telemetry"]
) {
  return memoizeAuthorizationRequestRead(`grants:${userId}`, async () => {
    telemetry.setOutcome("error")
    telemetry.recordGrantRead()
    const authorization = createAuthorizationRepository({
      pool: getWebPostgresPool(),
    })
    const capabilities = await authorization.listAllGrantedCapabilities(userId)
    return new Set(capabilities)
  })
}

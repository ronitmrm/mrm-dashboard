import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "./require-capability"
import { productionPageCapabilities } from "./production-capabilities"
import { productionFloorPageCapabilities } from "./production-floor-capabilities"

const legacyProductionRead = "operations.dashboard.read"
const pageCapabilities = [
  ...Object.values(productionPageCapabilities),
  ...Object.values(productionFloorPageCapabilities).flatMap(Object.values),
]

export async function requireProductionPage(
  capability: string,
  returnPath: string
) {
  const session = await requireAuthenticatedSession(returnPath)
  const granted = await listGrantedCapabilities(session.user.id, [
    legacyProductionRead,
    ...pageCapabilities,
  ])
  if (granted.includes(capability)) return session
  if (capability.startsWith("operations.floors.")) {
    return requireCapability(capability, returnPath)
  }
  const hasGranularPage = pageCapabilities.some((key) => granted.includes(key))
  if (!hasGranularPage && granted.includes(legacyProductionRead)) return session
  return requireCapability(capability, returnPath)
}

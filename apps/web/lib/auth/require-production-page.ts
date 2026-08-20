import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "./require-capability"
import { productionPageCapabilities } from "./production-capabilities"

const legacyProductionRead = "operations.dashboard.read"
const pageCapabilities = Object.values(productionPageCapabilities)

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
  const hasGranularPage = pageCapabilities.some((key) => granted.includes(key))
  if (!hasGranularPage && granted.includes(legacyProductionRead)) return session
  return requireCapability(capability, returnPath)
}

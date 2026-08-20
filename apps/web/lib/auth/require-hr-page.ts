import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
  requireCapability,
} from "./require-capability"
import { hrMasterNavigation, hrNavigation } from "../unified-navigation"

const legacyRecruitmentRead = "hr.recruitment.read"
const granularHrCapabilities = [...hrMasterNavigation, ...hrNavigation]
  .map(({ requiredCapability }) => requiredCapability)
  .filter((key) => key !== "hr.employees.read")

export async function requireHrPage(capability: string, returnPath: string) {
  const session = await requireAuthenticatedSession(returnPath)
  const granted = await listGrantedCapabilities(session.user.id, [
    legacyRecruitmentRead,
    ...granularHrCapabilities,
    "hr.employees.read",
  ])
  if (granted.includes(capability)) return session
  const hasGranularHrPage = granularHrCapabilities.some((key) =>
    granted.includes(key)
  )
  if (
    capability !== "hr.employees.read" &&
    !hasGranularHrPage &&
    granted.includes(legacyRecruitmentRead)
  ) {
    return session
  }
  return requireCapability(capability, returnPath)
}

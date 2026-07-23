import { MrmplDashboard } from "@/components/mrmpl-dashboard"
import { requireCapability } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"

export default async function Page() {
  const session = await requireCapability("operations.dashboard.read", "/")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)

  return (
    <MrmplDashboard
      navigationAccess={navigationAccess}
      user={{ email: session.user.email, name: session.user.name }}
    />
  )
}

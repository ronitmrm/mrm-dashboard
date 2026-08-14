import type { ReactNode } from "react"

import { ProductionShell } from "@/components/commercial/commercial-shell"
import { requireCapability } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await requireCapability(
    "operations.dashboard.read",
    "/dashboard"
  )
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)

  return (
    <ProductionShell
      navigationAccess={navigationAccess}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </ProductionShell>
  )
}

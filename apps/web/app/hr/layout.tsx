import type { ReactNode } from "react"

import { CommercialShell } from "@/components/commercial/commercial-shell"
import { requireCapability } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"

export const dynamic = "force-dynamic"

export default async function HrLayout({ children }: { children: ReactNode }) {
  const session = await requireCapability("hr.recruitment.read", "/hr")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)

  return (
    <CommercialShell
      navigationAccess={navigationAccess}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </CommercialShell>
  )
}

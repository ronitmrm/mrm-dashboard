import type { ReactNode } from "react"

import { CommercialShell } from "@/components/commercial/commercial-shell"
import { commercialNavigationAccess } from "@/lib/auth/commercial-capabilities"
import {
  listGrantedCapabilities,
  requireAuthenticatedSession,
} from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function CommercialLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await requireAuthenticatedSession("/commercial")
  const grantedCapabilities = new Set(
    await listGrantedCapabilities(session.user.id, [
      ...new Set(
        commercialNavigationAccess.map(([, capability]) => capability)
      ),
    ])
  )
  const accessibleHrefs = commercialNavigationAccess
    .filter(([, capability]) => grantedCapabilities.has(capability))
    .map(([href]) => href)

  return (
    <CommercialShell
      accessibleHrefs={accessibleHrefs}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </CommercialShell>
  )
}

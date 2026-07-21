import type { ReactNode } from "react"

import { CommercialShell } from "@/components/commercial/commercial-shell"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function AdministrationLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await requireCapability(
    "administration.roles.manage",
    "/administration/access"
  )

  return (
    <CommercialShell
      accessibleHrefs={[]}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </CommercialShell>
  )
}

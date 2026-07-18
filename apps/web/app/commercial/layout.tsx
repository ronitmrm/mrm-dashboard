import type { ReactNode } from "react"

import { CommercialShell } from "@/components/commercial/commercial-shell"
import { requireCapability } from "@/lib/auth/require-capability"

export const dynamic = "force-dynamic"

export default async function CommercialLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await requireCapability(
    "pricing.dashboard.read",
    "/commercial"
  )

  return (
    <CommercialShell
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </CommercialShell>
  )
}

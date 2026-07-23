import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { CommercialShell } from "@/components/commercial/commercial-shell"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"

export const dynamic = "force-dynamic"

export default async function HrLayout({ children }: { children: ReactNode }) {
  const session = await requireAuthenticatedSession("/hr")
  const navigationAccess = await getUnifiedNavigationAccess(session.user.id)
  if (!navigationAccess.hrHrefs.length) {
    redirect("/unauthorized")
  }

  return (
    <CommercialShell
      navigationAccess={navigationAccess}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </CommercialShell>
  )
}

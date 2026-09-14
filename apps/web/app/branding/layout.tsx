import type { ReactNode } from "react"
import { CommercialShell } from "@/components/commercial/commercial-shell"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
export const dynamic = "force-dynamic"
export default async function BrandingLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await requireAuthenticatedSession("/branding")
  return (
    <CommercialShell
      navigationAccess={await getUnifiedNavigationAccess(session.user.id)}
      user={{ email: session.user.email, name: session.user.name }}
    >
      {children}
    </CommercialShell>
  )
}

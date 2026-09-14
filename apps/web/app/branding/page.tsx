import { redirect } from "next/navigation"
import { requireAuthenticatedSession } from "@/lib/auth/require-capability"
import { getUnifiedNavigationAccess } from "@/lib/auth/unified-navigation-access"
export default async function BrandingPage() {
  const session = await requireAuthenticatedSession("/branding")
  const access = await getUnifiedNavigationAccess(session.user.id)
  redirect(access.brandingHrefs?.[0] ?? "/unauthorized")
}
